const clientDb = require("../../databaseConnect.js")
const dayjs = require("dayjs")

const getClientAccount = async (req, res) => {
    const { branchId, clientId } = req.query

    if (!branchId || !clientId) {
        return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." });
    }

    const getQuery1 = `SELECT * FROM deudas WHERE cliente_id = $1 AND sucursal_id = $2`;
    const getQuery2 = `SELECT * FROM entregas WHERE cliente_id = $1 AND sucursal_id = $2`;
    const getDescriptionsQuery = `
        SELECT id, texto 
        FROM descripciones_deudas 
        WHERE id = ANY($1::int[])
    `;

    const getAdministradoresQuery = `
        SELECT nombre_usuario,id FROM administradores WHERE id = ANY($1::int[])
    `
    const getUsersQuery = `
        SELECT user_name,id FROM usuarios_asociados WHERE id = ANY($1::int[])
    `

    let client;
    try {
        client = await clientDb.connect();

        const [deudasResult, entregasResult] = await Promise.all([
            client.query(getQuery1, [clientId, branchId]),
            client.query(getQuery2, [clientId, branchId])
        ]);

        const deudas = deudasResult.rows;
        const entregas = entregasResult.rows;

        const totalDeudas = deudas.reduce((acc, deuda) => {
            return acc + parseFloat(deuda.monto_total)
        }, 0)
        const totalEntregas = entregas.reduce((acc, entrega) => {
            console.log(entrega)
            return acc + parseFloat(entrega.monto)
        }, 0)

        const subTotal = parseFloat(totalDeudas - totalEntregas).toLocaleString("es-AR", { style: "currency", "currency": "ARS" })


        if (deudas.length > 0) {
            const descripcionIds = deudas.map(deuda => deuda.descripcion_id).filter(Boolean);
            const adminsIDs = deudas.map(deuda => deuda.administrador_id).filter(Boolean);
            const usersIDs = deudas.map(deuda => deuda.user_id).filter(Boolean);

            const [descriptionsResult, administradoresResult, usuariosResult] = await Promise.all([
                client.query(getDescriptionsQuery, [descripcionIds]),
                client.query(getAdministradoresQuery, [adminsIDs]),
                client.query(getUsersQuery, [usersIDs])
            ]);

            const descriptionsMap = descriptionsResult.rows.reduce((map, desc) => {
                map[desc.id] = desc.texto;
                return map;
            }, {});

            const administradoresMap = administradoresResult.rows.reduce((map, admin) => {
                map[admin.id] = admin.nombre_usuario;
                return map
            }, {})

            const usuariosMap = usuariosResult.rows.reduce((map, user) => {
                map[user.id] = user.user_name;
                return map
            }, {})



            deudas.forEach(deuda => {
                deuda.descripcion = descriptionsMap[deuda.descripcion_id] || null;
                if (deuda.administrador_id) deuda.responsable = administradoresMap[parseInt(deuda.administrador_id)] || null;
                if (deuda.user_id) deuda.responsable = usuariosMap[parseInt(deuda.user_id)] || null;

            });
            console.log(subTotal)
            return res.status(200).json({
                msg: "Cliente obtenido!",
                debts: deudas,
                delivers: entregas,
                totalAccount: subTotal
            });
        }

        return res.status(404).json({
            msg: "Este cliente no tiene deudas o una cuenta asociada a esta sucursal."
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });
    } finally {
        if (client) client.release();
    }
}

const saveDebt = async (req, res) => {
    const { clientID, branchID, adminID, userID, productDetails, productsArray, debtDate, debtAmount } = req.body
    if (!productsArray || !debtDate || !debtAmount || !clientID || !branchID) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })
    const query1 = `INSERT INTO descripciones_deudas(texto) VALUES ($1) RETURNING id`
    const query2 = `INSERT INTO deudas
    (cliente_id, sucursal_id, administrador_id, user_id, descripcion_id, detalle_productos, fecha_compra, vencimiento, monto_total)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) `

    let client;
    try {
        client = await clientDb.connect()
        await client.query("BEGIN")
        const response = await client.query(query1, [productDetails || "Sin descripción"])

        if (response.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrió un error inesperado al intentar guardar la deuda" })
        }

        const descriptionID = response.rows[0].id
        const response2 = await client.query(query2, [clientID,
            branchID,
            adminID && adminID.trim() !== "" ? adminID : null,
            userID && userID.trim() !== "" ? userID : null,
            descriptionID,
            productsArray,
            debtDate,
            dayjs(debtDate).add(1, "month"),
            debtAmount
        ])

        if (response2.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrido un error inesperado al intentar guardar la deuda" })
        }

        await client.query("COMMIT")
        return res.status(200).json({ msg: `Deuda guardada exitosamente, próximo vencimiento el ${dayjs(debtDate).add(1, "month").format("DD/MM/YYYY")}` })
    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });
    }
}

const saveDeliver = async (req, res) => {
    const { clientID, branchID, adminID, userID, deliverDate, deliverAmount } = req.body
    if (!clientID || !branchID || !deliverAmount || !deliverDate) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })
console.log(clientID, branchID, adminID, userID, deliverDate, deliverAmount)
    const query1 = `INSERT INTO entregas(cliente_id, sucursal_id, administrador_id, user_id, fecha, monto) VALUES ($1, $2, $3, $4, $5, $6)`
    const query2 = `UPDATE deudas SET vencido = $1 WHERE cliente_id = $2 AND sucursal_id = $3`
    let client;
    try {
        client = await clientDb.connect()
        await client.query("BEGIN")
        const response = await client.query(query1,
            [
                clientID,
                branchID,
                adminID && adminID.trim() !== "" ? adminID : null,
                userID && userID.trim() !== "" ? userID : null,
                deliverDate,
                deliverAmount
            ])
            console.log(response)
        if (response.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrido un error inesperado al intentar guardar la entrega" })
        }

        await client.query(query2, [false, clientID, branchID])
        
        await client.query("COMMIT")
        return res.status(200).json({ msg: "Entrega guardada exitosamente" })
    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });
    } finally {
        if (client) client.release()
    }
}

const deleteDebt = async (req, res) => {
    const { debtId } = req.params
    console.log(debtId)
    if (!debtId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })

    let client = await clientDb.connect()
    try {
        await client.query("BEGIN")
        const response = await client.query(`DELETE FROM deudas WHERE id = $1`, [debtId])
        if (response.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrido un error inesperado al intentar eliminar la deuda" })
        }
        await client.query("COMMIT")
        return res.status(200).json({ msg: "Deuda eliminada exitosamente" })
    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });
    } finally {
        if (client) {
            client.release()
        }
    }
};

const editDebt = async(req,res) => {
    console.log("Valores recibidos")
    const { debtId } = req.params
    const { productDetails, productsArray, debtDate, debtAmount, oldDescriptionId } = req.body
    if (!productsArray || !debtDate || !debtAmount || !debtId || !oldDescriptionId) return res.status(400).json({ msg: "El servidor no recibió correctamente algunos datos." })
        const query1 = `UPDATE descripciones_deudas SET texto = $1 WHERE id = $2`

        const query2 = `
        UPDATE deudas 
        SET 
            detalle_productos = $1, 
            fecha_compra = $2, 
            vencimiento = $3, 
            monto_total = $4 
        WHERE 
            id = $5;
    `;
    let client;
    try {
        client = await clientDb.connect()
        await client.query("BEGIN")
        const response = await client.query(query1, [productDetails || "Sin descripción", oldDescriptionId])

        if (response.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrió un error inesperado al intentar guardar la deuda" })
        }

        const response2 = await client.query(query2, [
            productsArray,
            debtDate,
            dayjs(debtDate).add(1, "month"),
            debtAmount,
            debtId
        ])

        if (response2.rowCount === 0) {
            await client.query("ROLLBACK")
            return res.status(400).json({ msg: "Ocurrido un error inesperado al intentar guardar la deuda" })
        }

        await client.query("COMMIT")
        return res.status(200).json({ msg: `Deuda guardada exitosamente, próximo vencimiento el ${dayjs(debtDate).add(1, "month").format("DD/MM/YYYY")}` })
    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({
            msg: "Error interno del servidor. Por favor, intente nuevamente más tarde."
        });
    }
}

module.exports = {
    getClientAccount,
    saveDebt,
    saveDeliver,
    deleteDebt,
    editDebt
}
