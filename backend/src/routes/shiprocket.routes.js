const express = require("express");

const shiprocketController = require("../controllers/shiprocket.controller");

const router = express.Router();

router.post("/auth", shiprocketController.authenticate);
router.post("/orders", shiprocketController.createOrder);
router.get("/", shiprocketController.proxyShiprocket);
router.get("/track", shiprocketController.trackShipment);
router.get("/serviceability", shiprocketController.checkServiceability);

module.exports = router;
