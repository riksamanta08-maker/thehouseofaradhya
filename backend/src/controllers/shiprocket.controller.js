const { env } = require("../config");
const shiprocketService = require("../services/shiprocket.service");
const { sendError, sendSuccess } = require("../utils/response");
const {
  createShiprocketOrderSchema,
  serviceabilityQuerySchema,
  trackingQuerySchema,
} = require("../validators/shiprocket.validator");

const formatValidationDetails = (issues = []) =>
  issues.map((issue) => ({
    field: issue.path?.join(".") || "root",
    message: issue.message,
  }));

const parseRequest = (schema, payload, res) => {
  const parsed = schema.safeParse(payload);

  if (parsed.success) return parsed.data;

  sendError(res, 400, "Validation failed.", formatValidationDetails(parsed.error.issues));
  return null;
};

const handleShiprocketError = (res, error, fallbackMessage) => {
  if (error?.status >= 500) {
    console.error("[Shiprocket]", error);
  }

  return sendError(
    res,
    error?.status || 500,
    error?.message || fallbackMessage,
    error?.details || null,
  );
};

exports.authenticate = async (_req, res) => {
  try {
    const data = await shiprocketService.getAuthStatus();
    return sendSuccess(res, data, null, "Shiprocket authentication is ready.");
  } catch (error) {
    return handleShiprocketError(res, error, "Unable to authenticate Shiprocket.");
  }
};

exports.createOrder = async (req, res) => {
  const parsedBody = parseRequest(createShiprocketOrderSchema, req.body, res);
  if (!parsedBody) return undefined;

  try {
    const data = await shiprocketService.createOrder(parsedBody);
    return sendSuccess(res, data, null, "Shiprocket order created successfully.");
  } catch (error) {
    return handleShiprocketError(res, error, "Unable to create Shiprocket order.");
  }
};

exports.trackShipment = async (req, res) => {
  const parsedQuery = parseRequest(
    trackingQuerySchema,
    {
      awb: req.query?.awb,
      orderId: req.query?.order_id || req.query?.orderId,
    },
    res,
  );
  if (!parsedQuery) return undefined;

  try {
    const data = await shiprocketService.trackShipment(parsedQuery);
    return sendSuccess(res, data, null, "Tracking details fetched successfully.");
  } catch (error) {
    return handleShiprocketError(res, error, "Unable to fetch tracking details.");
  }
};

exports.checkServiceability = async (req, res) => {
  const parsedQuery = parseRequest(
    serviceabilityQuerySchema,
    {
      pickupPostcode:
        req.query?.pickup_postcode ||
        req.query?.pickupPostcode ||
        env.shiprocketPickupPincode,
      deliveryPostcode: req.query?.delivery_postcode || req.query?.deliveryPostcode,
      weight: req.query?.weight,
      cod: req.query?.cod,
    },
    res,
  );
  if (!parsedQuery) return undefined;

  try {
    const data = await shiprocketService.checkServiceability(parsedQuery);
    return sendSuccess(res, data, null, "Serviceability fetched successfully.");
  } catch (error) {
    return handleShiprocketError(res, error, "Unable to fetch serviceability.");
  }
};

exports.proxyShiprocket = async (req, res) => {
  const awb = String(req.query?.awb || "").trim();
  const orderId = String(req.query?.order_id || req.query?.orderId || "").trim();

  if (awb || orderId) {
    return exports.trackShipment(req, res);
  }

  return exports.checkServiceability(req, res);
};
