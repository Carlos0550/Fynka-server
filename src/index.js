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

const { v4: uuidv4 } = require('uuid');
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault("America/Argentina/Buenos_Aires")
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.text())
app.use(cors({
    origin: "*"
}))

const storage = multer.memoryStorage()
const upload = multer({ storage });

const PORT = process.env.PORT || 4000;

app.get("/", (req, res) => {
    res.status(200).send("SERVIDOR ON")
});

const verifyPass = async (psw, hash) => {
    return bcryptjs.compare(psw, hash)
}

app.post("/create-user", upload.none(), async (req, res) => {
    const { email, username, psw } = req.body
    const saltRounds = 10

    if (!email || !username || !psw) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, verifica que todo esté en orden." })
    if (psw.length > 15) return res.status(400).json({ msg: "La contraseña no puede ser mayor a 15 caractéres." })

    const client = await clientDb.connect()
    const findAdminQuery = `
        SELECT * FROM usuarios WHERE email = $1
    `

    const insertQuery = `
        INSERT INTO usuarios(email, nombre_usuario, contrasena, administrador, empleado) VALUES($1,$2,$3,$4,$5) RETURNING *
    `
    const insertQuery1 = `
        INSERT INTO sucursales(nombre, administrador_id) VALUES ($1, $2)
    `

    try {
        await client.query("BEGIN")
        const result = await client.query(findAdminQuery, [email])

        if (result.rowCount > 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "El nombre de usuario o correo ya está usado." })
        }

        const hashedPassword = await bcryptjs.hash(psw, saltRounds)

        const result1 = await client.query(insertQuery, [email, username, hashedPassword, true, false])

        if (result1.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(500).json({ msg: "Ocurrió un error inesperado, por favor intente nuevamente." })
        }
        const nombreSucursal = `Sucursal-${uuidv4()}`
        const administrador_id = result1.rows[0].id
        const result2 = await client.query(insertQuery1, [nombreSucursal, administrador_id])

        if (result2.rowCount === 0) {
            await client.query("ROLLBACK")

            return res.status(400).json({ msg: "Ocurrió un error inesperado al crear su usuario, por favor intente nuevamente." })
        }
        await client.query("COMMIT")
        return res.status(200).json({ msg: "Empresa registrada correctamente." })

    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({ msg: "Error interno del servidor, espere unos segundos e intente nuevamente." })
    } finally {
        client.release()
    }

});

app.post("/login-user", upload.none(), async (req, res) => {
    const { email, psw } = req.body

    if ((!email) && !psw) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, verifica que todo esté en orden." })

    const getQuery1 = `
        SELECT id, contrasena, empleado, administrador FROM usuarios WHERE email = $1;
    `

    const updateQuery = `
        UPDATE usuarios SET fecha_inicio_sesion = $1, fecha_reestablecer_autenticacion = $2, autenticado = $3 WHERE id = $4 RETURNING *
    `
    const client = await clientDb.connect()

    try {
        await client.query("BEGIN")
        const response1 = await client.query(getQuery1, [email])
        if (response1.rowCount === 0) return res.status(404).json({ msg: "El usuario no existe en nuestros registros." })

        const userPassword = response1.rows[0].contrasena
        const userId = response1.rows[0].id

        const today = dayjs()
        const tomorrow = dayjs().add(1, "day")

        const isPswMatch = await verifyPass(psw, userPassword)

        if (!isPswMatch) {
            await client.query("ROLLBACK")
            return res.status(401).json({ msg: "La contraseña introducida no es correcta." })
        }

        const response2 = await client.query(updateQuery, [today, tomorrow, true, userId])

        if (response2.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrió algo inesperado al iniciar sesión, espere unos segundos e intente nuevamente." })
        }
        const { contrasena, fecha_inicio_sesion, fecha_reestablecer_autenticacion, ...valuesToReturn } = response2.rows[0]
        await client.query("COMMIT")
        return res.status(200).json({ msg: "Bienvenido a Fynka", usrData: valuesToReturn })

    } catch (error) {
        await client.query("ROLLBACK")
        console.log(error)
        return res.status(500).json({ msg: error.message || "Error interno del servidor, espere unos segundos e intente nuevamente." })
    } finally {
        client.release()
    }
});

app.get("/verifyAuthUser", async (req, res) => {
    const { email } = req.query
    console.log("VERIFICANDO USUARIO")
    if (!email) return res.status(400).json({ msg: "El servidor no pudo validar su sesión" })

    const client = await clientDb.connect()
    const query1 = `SELECT * FROM usuarios WHERE email = $1`
    try {
        const response = await client.query(query1, [email])
        if (response.rowCount === 0) return res.status(400).json({ msg: "El servidor no pudo encontrar su usuario, por favor inicie sesión nuevamente." })
        const auth = response.rows[0].autenticado

        if (!auth) return res.status(401).json({ msg: "Su sesión caducó, por favor inicie sesión nuevamente." })
        return res.status(200).json({ usrData: response.rows[0] })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ msg: "Error interno del servidor, espere unos segundos e intente nuevamente." })
    } finally {
        client.release()
    }
});

app.get("/get-user_info", async (req, res) => {
    const { userID } = req.query

    if (!userID) return res.status(400).json({ msg: "El servidor no recibió correctamente algún dato" })
    const client = await clientDb.connect()

    const query1 = `SELECT * FROM usuarios WHERE id = $1`
    try {
        const response = await client.query(query1, [userID])
        console.log(userID)
        console.log(response.rows)
        if (response.rowCount === 0) return res.status(404).json({ msg: "Deberá completar su perfil para hacer uso del sistema." })
        return res.status(200).json({ usrInfo: response.rows[0] })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ msg: "Error interno del servidor, espere unos segundos e intente nuevamente." })
    } finally {
        client.release()
    }
});

cron.schedule("*/30 * * * *", async () => {
    const query1 = `UPDATE usuarios SET autenticado = false WHERE DATE(fecha_reestablecer_autenticacion) = $1`
    const client = await clientDb.connect()
    try {
        await client.query("BEGIN")
        await client.query(query1, [dayjs().format("YYYY-MM-DD")])
        await client.query("COMMIT")
        console.log("TAREAS CRON FINALIZADAS SIN PROBLEMAS")
    } catch (error) {
        await client.query("ROLLBACK")
        console.log(error)
        console.log(error.message)
    } finally {
        client.release()
    }
});


app.post("/save-branch", upload.single(), async (req, res) => {
    const { branchName, branchAddress, branchInfo, editing, userid } = req.body
    if (!branchName || !branchInfo || !branchAddress || !userid) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, por favor intente nuevamente" })

    let queryIfEditing = "UPDATE sucursales SET nombre = $1, direccion = $2, descripcion = $3 WHERE administrador_id = $4"
    let queryIfNotEditing = "INSERT INTO sucursales(nombre, direccion, descripcion, administrador_id) VALUES($1,$2,$3,$4)"

    const isEditing = editing === "true" || editing === true;

    const client = await clientDb.connect()
    console.log(isEditing)
    try {
        if (!isEditing) {
            const result = await client.query(queryIfNotEditing, [branchName, branchAddress, branchInfo, userid])
            if (result.rowCount === 0) return res.status().json({ msg: "Ocurrió algo insesperado y no se pudo crear la sucursal, intente nuevamente más tarde." })
            return res.status(200).json({ msg: "Sucursal Creada." })
        } else {
            return res.status(501).json({ msg: "Funcionalidad de edición aún no implementada." });
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ msg: "Error interno del servidor, espere unos segundos e intente nuevamente." })
    }finally{
        client.release()
    }
});

app.get("/get-branches/:administrador_id", async (req, res) => {
    const { administrador_id } = req.params; 
    if (!administrador_id) {
        return res.status(400).json({ msg: "El servidor no recibió el ID del administrador. Por favor, intente nuevamente." });
    }

    const getQuery = "SELECT * FROM sucursales WHERE administrador_id = $1";
    const client = await clientDb.connect();

    try {
        const response = await client.query(getQuery, [administrador_id]);
        if (response.rowCount === 0) {
            return res.status(404).json({ msg: "Aún no hay sucursales registradas para este usuario." });
        }

        return res.status(200).json({ sucursales: response.rows });
    } catch (error) {
        console.error("Error al obtener sucursales:", error);
        return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." });
    } finally {
        client.release();
    }
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})







