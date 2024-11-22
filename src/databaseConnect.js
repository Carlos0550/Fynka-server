require("dotenv").config()
const { Pool } = require("pg")

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

(async () => {
    try {
        console.log("Conectando...");
        const client = await pool.connect();
        console.log("Database connected");
        client.release(); 
        console.log("Database connection released");
    } catch (error) {
        console.log("Error al conectar a la base de datos", error);
    }
})();

module.exports = pool