const express  = require("express")
const router = express.Router()
const { getClientAccount, saveDebt, saveDeliver, deleteDebt, editDebt } = require("../../controllers/Clients/clients.controller.js")

const multer = require("multer")

const storage = multer.memoryStorage()
const upload = multer({ storage });

router.get("/get-client-account", getClientAccount)
router.post("/save-debt", upload.none(), saveDebt)
router.post("/save-deliver", upload.none(), saveDeliver)
router.delete("/delete-debt/:debtId", deleteDebt)
router.put("/edit-debt/:debtId", upload.none(), editDebt)

module.exports = router