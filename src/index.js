const clientDb = require("./databaseConnect.js")
const express = require("express")
const cors = require("cors")
const app = express();
const multer = require("multer");
const cron = require("node-cron")
const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc.js")
const timezone = require("dayjs/plugin/timezone.js");
const bcryptjs = require("bcryptjs")
const jwt = require("jsonwebtoken");
dayjs.extend(utc)
dayjs.extend(timezone)
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.text())
app.use(cors())

const storage = multer.memoryStorage()
const upload = multer({ storage });

const PORT = process.env.PORT || 4000;

app.get("/", (req, res) => {
    res.status(200).send("SERVIDOR ON")
});

const verifyPass = async(psw, hash) =>{
    return bcryptjs.compare(psw, hash)
}

app.post("/create-business",upload.none(), async(req,res)=> {
    const {email,username,psw} = req.body
    const saltRounds = 10

    if(!email || !username || !psw) return res.status(400).json({msg: "El servidor no recibió correctamente algunos datos, verifica que todo esté en orden."})
    if(psw.length > 15) return res.status(400).json({msg:"La contraseña no puede ser mayor a 15 caractéres."})
        
    const client = await clientDb.connect()
    const insertQuery = `
        INSERT INTO credenciales(email, nombre_usuario, contrasena) VALUES($1,$2,$3)
    `
    try {
        const hashedPassword = await bcryptjs.hash(psw, saltRounds)
        const result = await client.query(insertQuery,[email,username,hashedPassword])
        if(result.rowCount === 0) return res.status(500).json({msg: "Ocurrió un error inesperado, por favor intente nuevamente."})
        return res.status(200).json({msg: "Empresa registrada correctamente."})
        
    } catch (error) {
        console.log(error)
        return res.status(500).json({msg: "Error interno del servidor, espere unos segundos e intente nuevamente."})
    }finally{
        client.release()
    }
    
});

app.post("/login-user", upload.none(), async(req,res)=>{
    const {email,username,psw} = req.body

    if((!email || !username) && !psw) return res.status(400).json({msg: "El servidor no recibió correctamente algunos datos, verifica que todo esté en orden."})
    
    const getQuery = `
        SELECT * FROM credenciales WHERE nombre_usuario = $1 OR email = $2;
    `
    const client = await clientDb.connect()

    try {
        const response1 = await client.query(getQuery,[username, email])
        if(response1.rowCount === 0) return res.status(404).json({msg: "El usuario no existe en nuestros registros."})
        
        const userPassword = response1.rows[0].contrasena
        console.log(userPassword)

        const isPswMatch = await verifyPass(psw, userPassword)

        console.log(isPswMatch)
        if(isPswMatch) return res.status(200).json({msg: "Bienvenido a Fynka"})
        return res.status(401).json({msg: "La contraseña introducida no es correcta."})

    } catch (error) {
        console.log(error)
        return res.status(500).json({msg: "Error interno del servidor, espere unos segundos e intente nuevamente."})
    }finally{
        client.release()
    }
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})







