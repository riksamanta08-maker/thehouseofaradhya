const crypto = require("node:crypto");

const STAGING_API_BASE_URL = "https://fastrr-api-dev.pickrr.com";
const PRODUCTION_API_BASE_URL = "https://checkout-api.shiprocket.com";
const STAGING_UI_BASE_URL = "https://customcheckoutfastrr.netlify.app";
const PRODUCTION_UI_BASE_URL = "https://checkout-ui.shiprocket.com";

const readEnvValue = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const getFastrrEnvironment = () => {
  const raw = readEnvValue("SHIPROCKET_FASTRR_ENV", "FASTRR_ENV");
  return raw.toLowerCase() === "staging" ? "staging" : "production";
};

const getFastrrConfig = () => {
  const environment = getFastrrEnvironment();
  const defaultApiBaseUrl =
    environment === "staging" ? STAGING_API_BASE_URL : PRODUCTION_API_BASE_URL;
  const defaultUiBaseUrl =
    environment === "staging" ? STAGING_UI_BASE_URL : PRODUCTION_UI_BASE_URL;

  const apiBaseUrl = readEnvValue(
    "SHIPROCKET_FASTRR_API_BASE_URL",
    "FASTRR_API_BASE_URL",
  ) || defaultApiBaseUrl;
  const uiBaseUrl = readEnvValue(
    "SHIPROCKET_FASTRR_UI_BASE_URL",
    "FASTRR_UI_BASE_URL",
  ) || defaultUiBaseUrl;
  const apiKey = readEnvValue("SHIPROCKET_FASTRR_API_KEY", "FASTRR_API_KEY");
  const apiSecret = readEnvValue(
    "SHIPROCKET_FASTRR_API_SECRET",
    "FASTRR_API_SECRET",
  );
  const redirectUrl = readEnvValue(
    "SHIPROCKET_FASTRR_REDIRECT_URL",
    "FASTRR_REDIRECT_URL",
  );

  return {
    environment,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    uiBaseUrl: uiBaseUrl.replace(/\/+$/, ""),
    apiKey,
    apiSecret,
    redirectUrl,
    scriptUrl: `${uiBaseUrl.replace(/\/+$/, "")}/assets/js/channels/shopify.js`,
    styleUrl: `${uiBaseUrl.replace(/\/+$/, "")}/assets/styles/shopify.css`,
  };
};

const isFastrrConfigured = () => {
  const config = getFastrrConfig();
  return Boolean(config.apiKey && config.apiSecret);
};

const signPayload = (rawBody, secret) =>
  crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

const parseFastrrResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const createSignedHeaders = (rawBody, config = getFastrrConfig()) => ({
  "Content-Type": "application/json",
  "X-Api-Key": config.apiKey,
  "X-Api-HMAC-SHA256": signPayload(rawBody, config.apiSecret),
});

const postToFastrr = async (path, payload, config = getFastrrConfig()) => {
  if (!config.apiKey || !config.apiSecret) {
    const error = new Error("Shiprocket Fastrr is not configured.");
    error.status = 500;
    throw error;
  }

  const rawBody = JSON.stringify(payload || {});
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: createSignedHeaders(rawBody, config),
    body: rawBody,
  });
  const data = await parseFastrrResponse(response);

  if (!response.ok || data?.ok === false) {
    const error = new Error(
      data?.error?.message ||
        data?.error ||
        data?.message ||
        data?.raw ||
        "Shiprocket Fastrr request failed.",
    );
    error.status = response.ok ? 502 : response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

module.exports = {
  getFastrrConfig,
  isFastrrConfigured,
  postToFastrr,
  parseFastrrResponse,
  signPayload,
};
