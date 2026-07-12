const express = require("express");

const orderController = require("../controllers/order.controller");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.post("/checkout-debug", orderController.logCheckoutDebug);
router.post("/create-order", protect, orderController.createCheckoutOrder);
router.get("/track/:awb", orderController.trackShipmentByAwb);

module.exports = router;
