const crypto = require("crypto");
const criptoJs = require("crypto-js")

require ("dotenv").config()
const secretKey = process.env.secret_pass_key
function decrypt(string) {
    const bytes = criptoJs.AES.decrypt(string, secretKey)
    const decryptedDni = bytes.toString(Crypto.enc.Utf8)
    return decryptedDni
}

function decryptDeterministic(encryptedData) {
    const decipher = crypto.createDecipheriv("aes-256-ecb", Buffer.from(secretKey), null); 
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

module.exports = {
    decrypt,
    decryptDeterministic
}