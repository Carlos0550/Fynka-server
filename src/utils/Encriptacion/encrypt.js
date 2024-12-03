const crypto = require("crypto");
const criptoJs = require("crypto-js")
require ("dotenv").config()
const secretKey = process.env.secret_pass_key

function encrypt(string) {
    const encryptedDni = criptoJs.AES.encrypt(string, secretKey).toString()
    console.log("DNI encriptado: ",encryptedDni)
    return encryptedDni
}


function encryptDeterministic(data) {
    const hash = crypto.createHash("sha256"); // SHA-256 es un algoritmo determinista
    hash.update(data + secretKey); // Concatenamos el dato con la clave secreta
    return hash.digest("hex"); // Devuelve el hash como una cadena hexadecimal
}

module.exports = {
    encrypt,
    encryptDeterministic
}