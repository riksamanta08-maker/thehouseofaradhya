const express = require("express");

const fastrrController = require("../controllers/fastrr.controller");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.get("/config", fastrrController.getFastrrPublicConfig);
router.get("/products", fastrrController.listCatalogProducts);
router.get("/collection-products", fastrrController.listCollectionProducts);
router.get("/collections", fastrrController.listCollections);
router.post("/checkout-session", protect, fastrrController.createCheckoutSession);
router.get("/checkout-status", protect, fastrrController.getCheckoutStatus);
router.post("/webhooks/order", fastrrController.handleOrderWebhook);

module.exports = router;
