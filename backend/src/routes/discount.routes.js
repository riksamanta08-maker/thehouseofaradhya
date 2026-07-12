const express = require("express");

const discountController = require("../controllers/discount.controller");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

router.post("/verify", discountController.verifyDiscount);

router.get("/", protect, requireRole("ADMIN"), discountController.listDiscounts);
router.post("/", protect, requireRole("ADMIN"), discountController.createDiscount);
router.patch("/:id", protect, requireRole("ADMIN"), discountController.updateDiscount);
router.delete("/:id", protect, requireRole("ADMIN"), discountController.deleteDiscount);

module.exports = router;
