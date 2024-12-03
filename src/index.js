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
const sendEmail = require("./utils/SendEmails/NodeSender.js")
const {encrypt, encryptDeterministic} = require("./utils/Encriptacion/encrypt.js")
const {decrypt, decryptDeterministic} = require("./utils/Encriptacion/decrypt.js")


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

app.post("/create-administrator", upload.none(), async (req, res) => {
    const { email, username, psw, userdni } = req.body;
    const saltRounds = 10;

    if (!email || !username || !psw || !userdni) {
        return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, verifica que todo esté en orden." });
    }
    if (psw.length > 25) {
        return res.status(400).json({ msg: "La contraseña no puede ser mayor a 25 caracteres." });
    }

    const client = await clientDb.connect();
    
    const findAdminQuery = `
        SELECT * FROM administradores WHERE email = $1
    `;
    
    const insertQuery = `
        INSERT INTO administradores(email, nombre_usuario, contrasena, dni, sucursal_id) VALUES($1,$2,$3,$4,$5) RETURNING *
    `;
    
    const insertQuery1 = `
        INSERT INTO sucursales(nombre) VALUES ($1) RETURNING id
    `;
    
    const updateSucursalQuery = `
        UPDATE sucursales SET administrador_id = $1 WHERE id = $2
    `;

    try {
        await client.query("BEGIN");

        const result = await client.query(findAdminQuery, [email]);
        if (result.rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ msg: "El nombre de usuario o correo ya está en uso." });
        }

        const hashedPassword = await bcryptjs.hash(psw, saltRounds);
        const encrypted_dni = encrypt(userdni)
        const encriptedEmail = encryptDeterministic(email)

        const nombreSucursal = `Sucursal-${uuidv4()}`;
        const resultSucursal = await client.query(insertQuery1, [nombreSucursal]);
        if (resultSucursal.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(500).json({ msg: "Ocurrió un error inesperado al crear la sucursal, por favor intente nuevamente." });
        }

        const sucursalId = resultSucursal.rows[0].id;

        const resultAdmin = await client.query(insertQuery, [encriptedEmail, username, hashedPassword, encrypted_dni, sucursalId]);
        if (resultAdmin.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(500).json({ msg: "Ocurrió un error inesperado al crear el administrador, por favor intente nuevamente." });
        }

        const administradorId = resultAdmin.rows[0].id;

        const resultUpdateSucursal = await client.query(updateSucursalQuery, [administradorId, sucursalId]);
        if (resultUpdateSucursal.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(500).json({ msg: "Ocurrió un error inesperado al asociar el administrador a la sucursal, por favor intente nuevamente." });
        }

        const subject = `Bienvenido a FynkApp, ${resultAdmin.rows[0].nombre_usuario}`;
        const message = `
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Datos de Autenticación</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f9f9f9;
              margin: 0;
              padding: 0;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 8px;
              padding: 20px;
              box-sizing: border-box;
            }
            h1 {
              color: #333;
              text-align: center;
              font-size: 24px;
            }
            .message {
              color: #555;
              font-size: 16px;
              line-height: 1.5;
            }
            .info {
              margin-top: 20px;
              padding: 10px;
              background-color: #f4f4f4;
              border-radius: 5px;
              font-size: 16px;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 14px;
              color: #888;
            }
            .footer a {
              color: #0066cc;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Datos de Autenticación de Usuario</h1>
            <p class="message">Bienvenido a FynkApp, has sido registrado como administrador en la sucursal:</p>
            <p class="message">Por favor, no comparta estos datos con nadie.</p>
            <div class="info">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Contraseña:</strong> ${psw}</p>
            </div>

            

            <div class="footer">
              <p>Si no ha solicitado este registro, por favor contacte con el administrador.</p>
              <p><a href="#">Soporte</a> | <a href="#">Términos y condiciones</a></p>
            </div>
          </div>
        </body>
        </html>
        `;

        const resultSendEmail = await sendEmail(email, subject, message);
        if (!resultSendEmail) {
            await client.query("ROLLBACK");
            return res.status(500).json({ msg: "Ocurrió un error inesperado al enviar el correo, por favor intente nuevamente." });
        }

        await client.query("COMMIT");
        return res.status(200).json({ msg: "Administrador y sucursal registrados correctamente." });

    } catch (error) {
        console.log(error);
        await client.query("ROLLBACK");
        return res.status(500).json({ msg: "Error interno del servidor, espere unos segundos e intente nuevamente." });
    } finally {
        client.release();
    }
});

app.post("/login-user", upload.none(), async (req, res) => {
    const { email, psw } = req.body

    if ((!email) && !psw) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, verifica que todo esté en orden." })

    const getQuery1 = `
        SELECT * FROM administradores WHERE email = $1;
    `

    const updateQuery = `
        UPDATE administradores SET fecha_inicio_sesion = $1, fecha_reestablecer_autenticacion = $2, autenticado = $3 WHERE id = $4 RETURNING *
    `
    const client = await clientDb.connect()

    try {
        await client.query("BEGIN")
        const encryptEmailToVerification = encryptDeterministic(email)

        const response1 = await client.query(getQuery1, [encryptEmailToVerification])
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
    if (!email) return res.status(400).json({ msg: "El servidor no pudo validar su sesión" })

    const client = await clientDb.connect()
    const query1 = `SELECT * FROM administradores WHERE email = $1`
    try {
        const response = await client.query(query1, [email])
        if (response.rowCount === 0) return res.status(404).json({ msg: "El servidor no pudo encontrar su usuario, por favor inicie sesión nuevamente." })
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

    const query1 = `SELECT * FROM administradores WHERE id = $1`
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
    const query1 = `UPDATE administradores SET autenticado = false WHERE DATE(fecha_reestablecer_autenticacion) = $1`
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

    let queryIfEditing = "UPDATE sucursales SET nombre = $1, direccion = $2, descripcion = $3 WHERE administrador_id = $4 AND id = $5"
    let queryIfNotEditing = "INSERT INTO sucursales(nombre, direccion, descripcion, administrador_id) VALUES($1,$2,$3,$4)"

    const isEditing = editing === "true" || editing === true;

    const client = await clientDb.connect()
    console.log(isEditing)
    try {
        if (!isEditing) {
            const result = await client.query(queryIfNotEditing, [branchName, branchAddress, branchInfo || "", userid])
            if (result.rowCount === 0) return res.status().json({ msg: "Ocurrió algo insesperado y no se pudo crear la sucursal, intente nuevamente más tarde." })
            return res.status(200).json({ msg: "Sucursal Creada." })
        } else {
            const { branchId } = req.body
            if (!branchId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, por favor intente nuevamente" })
            const result = await client.query(queryIfEditing, [branchName, branchAddress, branchInfo || "", userid, branchId])
            if (result.rows === 0) return res.status(404).json({ msg: "Al parecer, esa sucursal no existe, recargue esta sección e intente nuevamente." })
            return res.status(200).json({ msg: "Sucursal Actualizada" })

        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ msg: "Error interno del servidor, espere unos segundos e intente nuevamente." })
    } finally {
        client.release()
    }
});

app.get("/get-branches/:administrador_id", async (req, res) => {
    const { administrador_id } = req.params;
    if (!administrador_id) {
        return res.status(400).json({ msg: "El servidor no recibió el ID del administrador. Por favor, intente nuevamente." });
    }

    const getQuery = "SELECT * FROM sucursales WHERE administrador_id = $1 ORDER BY id ASC";
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

app.delete("/delete-branch/:branchId", async (req, res) => {
    const { branchId } = req.params
    if (!branchId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, por favor intente en unos segundos" })

    const deleteQuerey = `
        WITH check_conditions AS (
        SELECT 
            (SELECT COUNT(*) FROM entregas WHERE sucursal_id = $1) AS entregas_count,
            (SELECT COUNT(*) FROM deudas WHERE sucursal_id = $1) AS deudas_count,
            (SELECT COUNT(*) FROM clientes WHERE sucursal_id = $1) AS clients_count
        )
        DELETE FROM sucursales
        WHERE id = $1
        AND (SELECT entregas_count FROM check_conditions) = 0
        AND (SELECT clients_count FROM check_conditions) = 0
        AND (SELECT deudas_count FROM check_conditions) = 0;
    `
    const client = await clientDb.connect()
    try {
        const result = await client.query(deleteQuerey, [branchId])
        if (result.rowCount > 0) return res.status(200).json({ msg: "Sucursal eliminada" })
        return res.status(400).json({ msg: "Esta sucursal tiene asignada uno o más clientes/deudas/entregas, no es posible eliminar" })

    } catch (error) {
        console.error(error);
        return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." });
    } finally {
        client.release();
    }
})

app.get("/get-clients", async (re, res) => {
    const query1 = `SELECT * FROM clientes ORDER BY id ASC`

    const client = await clientDb.connect()
    try {
        const response = await client.query(query1)
        if (response.rowCount === 0) return res.status(404).json({ msg: "La lista de clientes está vacía" })
        const otherValues = response.rows.map(({ email, dni, ...rest })=>{
            return rest;
        })
        return res.status(200).json({ msg: "Lista de clientes obtenida!", clients: otherValues })
    } catch (error) {
        console.error(error);
        return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." });
    } finally {
        client.release();
    }
});

app.post("/save-client", upload.none(), async (req, res) => {
    const { clientName, clientAddress, clientEmail, clientDni, editing, clientId } = req.body;
    const { branchId } = req.query

    if (!clientName || !clientDni || !branchId) {
        return res.status(400).json({
            msg: "El servidor no recibió correctamente algunos datos, por favor intente nuevamente."
        });
    }

    const query1 = `INSERT INTO clientes(nombre, email, direccion, dni) VALUES($1, $2, $3, $4)`;
    const query2 = `UPDATE clientes SET nombre = $1, email = $2, direccion = $3, DNI = $4 WHERE id = $5`

    let client;
    let isEditing = editing === "true"
    try {
        client = await clientDb.connect();

        if (!isEditing) {
            await client.query("BEGIN");
            const encryptedDni = encrypt(clientDni)
            const hashedEmail = clientEmail ?  encryptDeterministic(clientEmail) : ""
            const response = await client.query(query1, [
                clientName,
                hashedEmail || "",
                clientAddress || "",
                encryptedDni
            ]);
            
            if (response.rowCount === 0) {
                await client.query("ROLLBACK")
                return res.status(400).json({
                    msg: "Ocurrió un error inesperado y no se pudo guardar el cliente"
                });
            }
            if (clientEmail !== "undefined" && clientEmail !== ""){
                const getBranch = await client.query(`SELECT * FROM sucursales WHERE id = $1`, [branchId])
                const branchName = getBranch.rows[0].nombre
                const subject = `Bienvenido a FynkApp – Automación de Deudas en ${branchName}`
                const message = `
                    <html lang="es">
                    <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Bienvenido a nuestro Sistema de Automatización de Deudas</title>
                    <style>
                        body {
                        font-family: Arial, sans-serif;
                        background-color: #f9f9f9;
                        margin: 0;
                        padding: 0;
                        }
                        .container {
                        width: 100%;
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        padding: 20px;
                        box-sizing: border-box;
                        }
                        h1 {
                        color: #333;
                        text-align: center;
                        font-size: 24px;
                        }
                        .message {
                        color: #555;
                        font-size: 16px;
                        line-height: 1.5;
                        }
                        .info {
                        margin-top: 20px;
                        padding: 10px;
                        background-color: #f4f4f4;
                        border-radius: 5px;
                        font-size: 16px;
                        }
                        .footer {
                        margin-top: 30px;
                        text-align: center;
                        font-size: 14px;
                        color: #888;
                        }
                        .footer a {
                        color: #0066cc;
                        text-decoration: none;
                        }
                    </style>
                    </head>
                    <body>
                    <div class="container">
                        <h1>¡Bienvenido a nuestro Sistema de Automatización de Deudas!</h1>
                        <p class="message">Hola <strong>${clientName}</strong>,</p>
                        <p class="message">¡Gracias por proporcionar tu correo electrónico y registrarte con nosotros!</p>
                        
                        <p class="message">Este es un sistema de automatización de deudas, y te notificaremos a través de este medio sobre el estado de tu cuenta en <strong>${branchName}</strong>.</p>

                        <p class="message">Nos alegra contar contigo, y te aseguramos que mantendremos la información de tu cuenta al día para que puedas revisarla de manera fácil y segura.</p>

                        <div class="footer">
                        <p>Si tienes alguna duda o necesitas más información, no dudes en contactarnos.</p>
                        <p><a href="#">Soporte</a> | <a href="#">No quiero recibir correos</a></p>
                        </div>
                    </div>
                    </body>
                    </html>
                    `;
                    const resultSendEmail = await sendEmail(clientEmail, subject, message)
                    if (!resultSendEmail) {
                        await client.query("ROLLBACK");
                        return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." });
                    }
            }
            await client.query("COMMIT");
            return res.status(200).json({ msg: "Cliente creado!" });
        } else {
            if (!clientId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos, por favor intente en unos segundos" })
            await client.query("BEGIN");
            const response = await client.query(query2, [
                clientName,
                clientEmail !== "undefined" ? clientEmail : "",
                clientAddress !== "undefined" ? clientAddress : "",
                clientDni,
                clientId
            ])
            
            if (response.rowCount > 0) {
                await client.query("COMMIT")
                return res.status(200).json({ msg: "Datos del cliente actualizados." })
            }
            await client.query("ROLLBACK")
            return res.status(404).json({ msg: "El cliente no fue encontrado, intente actualizar la lista de clientes." })
        }

    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
            return res.status(409).json({ msg: "El cliente ya existe." });
        }

        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });

    } finally {
        if (client) client.release();
    }
});

app.delete("/delete-client/:clientID", async (req, res) => {
    const { clientID } = req.params

    if (!clientID) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })

    //Ṕor el momento solo eliminar de la tabla clientes
    //Mas delante cuando se implemente las deudas y entregas, eliminar tambien eso desde aca
    const query1 = `DELETE FROM clientes WHERE id = $1`
    let client;

    try {
        client = await clientDb.connect()
        const result = await client.query(query1, [clientID])
        if (result.rowCount > 0) return res.status(200).json({ msg: "Cliente eliminado junto con todos sus registros." })
        return res.status(404).json({ msg: "El cliente no fue encontrado, intente actualizar la lista de clientes." })
    } catch (error) {
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });

    } finally {
        if (client) client.release();
    }
});

app.get("/get-users/:admID", async (req, res) => {
    const { admID } = req.params
    if (!admID) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })

    const query1 = `SELECT * FROM usuarios_asociados WHERE administrador_id = $1`

    let client
    try {
        client = await clientDb.connect()

        const users = await client.query(query1, [admID])

        if (users.rowCount === 0) return res.status(404).json({ msg: "No tiene usuarios asociados" })

        return res.status(200).json({ msg: "Usuarios obtenidos!", users: users.rows })
    } catch (error) {

        console.log(error)
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });

    } finally {
        if (client) client.release();
    }
});

app.post("/create-associate-user", upload.none(), async (req, res) => {

    const { userDni, userName, userEmail, userPsw, adminId } = req.body
    console.log(userDni, userName, userEmail, userPsw, adminId)
    if (!userDni || !userName || !userEmail || !userPsw) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })

    const query = `INSERT INTO usuarios_asociados (dni, user_name, email, contrasena, administrador_id) VALUES ($1, $2, $3, $4, $5)`
    const securepsw = bcryptjs.hashSync(userPsw, 10)


    let client
    try {
        client = await clientDb.connect()
        await client.query("BEGIN")
        const result = await client.query(query, [userDni, userName, userEmail, securepsw, adminId])
        if (result.rowCount > 0) {

            const subject = "Datos de acceso a FynkApp"
            const message = `
            <html lang="es">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Datos de Autenticación</title>
            <style>
                body {
                font-family: Arial, sans-serif;
                background-color: #f9f9f9;
                margin: 0;
                padding: 0;
                }
                .container {
                width: 100%;
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 8px;
                padding: 20px;
                box-sizing: border-box;
                }
                h1 {
                color: #333;
                text-align: center;
                font-size: 24px;
                }
                .message {
                color: #555;
                font-size: 16px;
                line-height: 1.5;
                }
                .info {
                margin-top: 20px;
                padding: 10px;
                background-color: #f4f4f4;
                border-radius: 5px;
                font-size: 16px;
                }
                .footer {
                margin-top: 30px;
                text-align: center;
                font-size: 14px;
                color: #888;
                }
                .footer a {
                color: #0066cc;
                text-decoration: none;
                }
            </style>
            </head>
            <body>
            <div class="container">
                <h1>Datos de Autenticación de Usuario</h1>
                <p class="message">Un administrador ha agregado su usuario con los siguientes datos:</p>
                
                <div class="info">
                <p><strong>Nombre:</strong> ${userName}</p>
                <p><strong>Email:</strong> ${userEmail}</p>
                <p><strong>Contraseña:</strong> ${userPsw}</p>
                </div>

                <p class="message">Por favor, no comparta estos datos con nadie.</p>

                <div class="footer">
                <p>Si no ha solicitado este registro, por favor contacte con el administrador.</p>
                <p><a href="#">Soporte</a> | <a href="#">Términos y condiciones</a></p>
                </div>
            </div>
            </body>
            </html>`
            const responseSendingEmail = await sendEmail(userEmail, subject, message)
            if (!responseSendingEmail) {
                await client.query("ROLLBACK")
                return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." })
            }
            await client.query("COMMIT")
            return res.status(200).json({ msg: "Usuario creado!" })
        }
        await client.query("ROLLBACK")
        return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." })
    } catch (error) {
        console.log(error)
        if (error.code === "23505") {
            return res.status(409).json({ msg: "Los datos proporcionados ya pertencen a otro usuario." });
        }
        await client.query("ROLLBACK")
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });

    } finally {
        if (client) client.release();
    }
});

app.put("/assign-branch", async (req, res) => {
    const { branchId, userId } = req.query
    if (!branchId || !userId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })

    const query = `UPDATE usuarios_asociados SET sucursal_id = $1 WHERE id = $2`

    let client
    try {
        client = await clientDb.connect()
        await client.query("BEGIN")
        const result = await client.query(query, [branchId, userId])
        if (result.rowCount > 0) {
            await client.query("COMMIT")
            return res.status(200).json({ msg: "Sucursal asignada!" })
        }
        await client.query("ROLLBACK")
        return res.status(500).json({ msg: "Error interno del servidor. Por favor, intente nuevamente más tarde." })
    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });

    } finally {
        if (client) client.release();
    }
});

app.get("/get-client-account", async(req,res)=>{
    const { branchId, clientId } = req.query

    if(!branchId || !clientId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })
    const getQuery1 = `SELECT * FROM deudas WHERE cliente_id = $1 AND sucursal_id = $2`
    const getQuery2 = `SELECT * FROM entregas WHERE cliente_id = $1 AND sucursal_id = $2`
    let client
    try {
        client = await clientDb.connect()
        const [deudas, entregas] = await Promise.all([
            client.query(getQuery1, [clientId, branchId]),
            client.query(getQuery2, [clientId, branchId])
        ])
        if (deudas.rowCount > 0) {
            return res.status(200).json({ msg: "Cliente obtenido!", debts: deudas.rows, delivers: entregas.rows })
        }
        return res.status(404).json({ msg: "Este cliente no tiene deudas o una cuenta asociada a esta sucursal." })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        })
    }finally{
        if(client) client.release()
    }
    
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})







