const express = require("express");

const orderController = require("../controllers/order.controller");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

router.post("/track", orderController.trackOrder);
router.post("/razorpay/order", protect, orderController.createRazorpayOrder);
router.post("/razorpay/confirm", protect, orderController.confirmRazorpayCheckout);
router.post("/", protect, orderController.createOrder);
router.post("/:id/cancel", protect, orderController.cancelOrder);
router.post("/:id/return", protect, orderController.createReturnRequest);
router.post("/:id/exchange", protect, orderController.createExchangeRequest);
router.get("/requests/my", protect, orderController.listMyOrderRequests);
router.get("/my", protect, orderController.getMyOrders);
router.get("/", protect, requireRole("ADMIN"), orderController.listOrders);
router.post(
  "/:id/shiprocket/order",
  protect,
  requireRole("ADMIN"),
  orderController.createShiprocketOrder,
);
router.post(
  "/:id/shiprocket",
  protect,
  requireRole("ADMIN"),
  orderController.createShiprocketShipment,
);
router.post(
  "/:id/shiprocket/track",
  protect,
  requireRole("ADMIN"),
  orderController.refreshShiprocketTracking,
);
router.patch("/:id", protect, requireRole("ADMIN"), orderController.updateOrder);

module.exports = router;
