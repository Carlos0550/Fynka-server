const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
const sendEmail = async (email, subject, message) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: subject,
            text: message
        })
        console.log(info)
        console.log('Email enviado:', info.response);
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports = sendEmail