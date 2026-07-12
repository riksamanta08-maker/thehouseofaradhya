const axios = require("axios");

const createAppError = (message, status = 500, details = null) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
};

const getRazorpayCreds = () => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
};

const razorpayClient = axios.create({
  baseURL: "https://api.razorpay.com/v1",
  timeout: 20_000,
  headers: {
    "Content-Type": "application/json",
  },
});

const createOrder = async ({ amount, currency, receipt, notes }) => {
  const creds = getRazorpayCreds();
  if (!creds) {
    throw createAppError("Razorpay is not configured.", 500);
  }

  try {
    const response = await razorpayClient.post(
      "/orders",
      {
        amount,
        currency,
        receipt,
        notes,
      },
      {
        auth: {
          username: creds.keyId,
          password: creds.keySecret,
        },
      },
    );

    return {
      keyId: creds.keyId,
      order: response.data,
    };
  } catch (error) {
    const payload = error?.response?.data || null;
    throw createAppError(
      payload?.error?.description || payload?.error?.reason || payload?.message || "Unable to create Razorpay order.",
      error?.response?.status || 502,
      payload,
    );
  }
};

module.exports = {
  getRazorpayCreds,
  createOrder,
};
