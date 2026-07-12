const axios = require("axios");

const { env } = require("../config");

const SHIPROCKET_API_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
const SHIPROCKET_TOKEN_TTL_MS = 10 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const AUTH_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

const shiprocketClient = axios.create({
  baseURL: SHIPROCKET_API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

let tokenCache = {
  token: null,
  expiresAt: 0,
  refreshedAt: 0,
  refreshPromise: null,
  source: null,
  authFailure: null,
};

const createAppError = (message, status = 500, details = null) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
};

const logShiprocket = (label, details) => {
  if (details === undefined) {
    console.info(`[Shiprocket] ${label}`);
    return;
  }
  console.info(`[Shiprocket] ${label}`, details);
};

const logShiprocketError = (label, details) => {
  if (details === undefined) {
    console.error(`[Shiprocket] ${label}`);
    return;
  }
  console.error(`[Shiprocket] ${label}`, details);
};

const compactObject = (value = {}) =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null && entry !== "",
    ),
  );

const normalizeLookupToken = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const hasStaticToken = () => Boolean(String(env.shiprocketToken || "").trim());

const hasCredentialPair = () =>
  Boolean(String(env.shiprocketEmail || "").trim() && String(env.shiprocketPassword || "").trim());

const ensureShiprocketCredentials = () => {
  if (hasStaticToken() || hasCredentialPair()) return;
  logShiprocketError("Missing credentials", {
    hasEmail: Boolean(String(env.shiprocketEmail || "").trim()),
    hasPassword: Boolean(String(env.shiprocketPassword || "").trim()),
    hasToken: false,
  });
  throw createAppError(
    "Shiprocket credentials are missing. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in Vercel production env vars, or provide SHIPROCKET_TOKEN as a fallback.",
    500,
  );
};

const validateRequiredConfig = () => {
  ensureShiprocketCredentials();
  // Note: SHIPROCKET_PICKUP_LOCATION is now optional — if missing, createOrder
  // will auto-resolve the first active pickup location from Shiprocket's API.
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitName = (fullName = "") => {
  const trimmed = String(fullName || "").trim();
  if (!trimmed) return { firstName: "Customer", lastName: "" };

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts.shift() || "Customer",
    lastName: parts.join(" "),
  };
};

const pad = (value) => String(value).padStart(2, "0");

const formatShiprocketDate = (value) => {
  const candidate = value ? new Date(value) : new Date();
  const date = Number.isNaN(candidate.getTime()) ? new Date() : candidate;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const decodeJwtExpiry = (token) => {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));

    return typeof decoded?.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
};

const hydrateTokenCache = (token, source) => {
  const trimmedToken = String(token || "").trim();
  const expiresAt = decodeJwtExpiry(trimmedToken) || Date.now() + SHIPROCKET_TOKEN_TTL_MS;

  tokenCache = {
    token: trimmedToken,
    expiresAt,
    refreshedAt: Date.now(),
    refreshPromise: null,
    source,
    authFailure: null,
  };

  return tokenCache;
};

const hasFreshToken = () =>
  Boolean(tokenCache.token) &&
  Number.isFinite(tokenCache.expiresAt) &&
  Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS;

const extractShiprocketErrorDetails = (payload) =>
  payload?.errors || payload?.data || payload?.message || payload || null;

const buildErrorText = (error) =>
  [
    error?.message,
    typeof error?.details === "string" ? error.details : null,
    Array.isArray(error?.details) ? error.details.join(" ") : null,
    error?.details && typeof error.details === "object" ? JSON.stringify(error.details) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const isShiprocketAuthFailure = (error) => {
  const text = buildErrorText(error);
  return (
    error?.status === 401 ||
    error?.status === 403 ||
    text.includes("invalid email") ||
    text.includes("invalid password") ||
    text.includes("too many failed") ||
    text.includes("user blocked")
  );
};

const cacheAuthFailure = (error) => {
  if (!isShiprocketAuthFailure(error)) return;

  tokenCache.authFailure = {
    message: error.message || "Shiprocket authentication failed.",
    status: error.status || 403,
    details: error.details || null,
    retryAt: Date.now() + AUTH_FAILURE_COOLDOWN_MS,
  };
};

const throwCachedAuthFailureIfActive = () => {
  const failure = tokenCache.authFailure;
  if (!failure) return;

  if (Date.now() >= failure.retryAt) {
    tokenCache.authFailure = null;
    return;
  }

  const retryAt = new Date(failure.retryAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
  });

  throw createAppError(
    `${failure.message} Shiprocket login is paused until ${retryAt} to avoid extending the account lock.`,
    failure.status,
    failure.details,
  );
};

const mapShiprocketError = (error, fallbackMessage = "Shiprocket request failed.") => {
  if (error?.status && !error?.isAxiosError && !error?.response) return error;

  const statusCode = error?.response?.status;
  const payload = error?.response?.data;
  const message =
    payload?.message ||
    payload?.error?.message ||
    error?.message ||
    fallbackMessage;
  const details = extractShiprocketErrorDetails(payload) || error?.code || null;
  const responseMessage =
    typeof details === "string"
      ? details
      : details && typeof details === "object"
        ? details.message || details.error || details.title || null
        : null;
  const finalMessage =
    responseMessage && responseMessage !== "[object Object]"
      ? responseMessage
      : message;

  let mappedStatus = 502;
  if (statusCode === 400 || statusCode === 422) mappedStatus = 400;
  if (statusCode === 401 || statusCode === 403) mappedStatus = statusCode;
  if (statusCode === 404) mappedStatus = 404;
  if (statusCode === 408) mappedStatus = 504;

  if (statusCode === 400 || statusCode === 422) {
    logShiprocketError("API validation error", {
      statusCode,
      message: finalMessage,
      details,
    });
  }

  if (isPickupLocationError({ message, details })) {
    logShiprocketError("Invalid pickup location", {
      pickupLocation: env.shiprocketPickupLocation || null,
      message: finalMessage,
      details,
    });
  }

  if (statusCode === 401 || statusCode === 403) {
    logShiprocketError("API authorization error", {
      statusCode,
      message: finalMessage,
      details,
    });
  }

  return createAppError(finalMessage, mappedStatus, details);
};

const authenticate = async ({ forceRefresh = false } = {}) => {
  ensureShiprocketCredentials();
  throwCachedAuthFailureIfActive();

  if (hasCredentialPair()) {
    if (!forceRefresh && hasFreshToken() && tokenCache.source === "login") {
      return {
        token: tokenCache.token,
        expiresAt: tokenCache.expiresAt,
        refreshedAt: tokenCache.refreshedAt,
        source: tokenCache.source,
      };
    }
  } else if (hasStaticToken()) {
    const configuredToken = String(env.shiprocketToken || "").trim();
    const configuredExpiry = decodeJwtExpiry(configuredToken);
    const staticTokenExpired =
      Number.isFinite(configuredExpiry) &&
      Date.now() >= configuredExpiry - TOKEN_REFRESH_BUFFER_MS;
    const configuredTokenChanged = tokenCache.token !== configuredToken;

    if (!forceRefresh && !staticTokenExpired) {
      if (configuredTokenChanged || !hasFreshToken() || tokenCache.source !== "static-token") {
        return hydrateTokenCache(configuredToken, "static-token");
      }

      return {
        token: tokenCache.token,
        expiresAt: tokenCache.expiresAt,
        refreshedAt: tokenCache.refreshedAt,
        source: tokenCache.source,
      };
    }

    if (!hasCredentialPair()) {
      if (staticTokenExpired) {
        logShiprocketError("Static token appears expired and no email/password fallback is configured");
      }
      return hydrateTokenCache(configuredToken, "static-token");
    }
  }

  if (!forceRefresh && hasFreshToken() && (!hasCredentialPair() || tokenCache.source === "login")) {
    return {
      token: tokenCache.token,
      expiresAt: tokenCache.expiresAt,
      refreshedAt: tokenCache.refreshedAt,
      source: tokenCache.source,
    };
  }

  if (tokenCache.refreshPromise) {
    await tokenCache.refreshPromise;
    return {
      token: tokenCache.token,
      expiresAt: tokenCache.expiresAt,
      refreshedAt: tokenCache.refreshedAt,
      source: tokenCache.source,
    };
  }

  const refreshPromise = shiprocketClient
    .post("/auth/login", {
      email: env.shiprocketEmail,
      password: env.shiprocketPassword,
    })
    .then((response) => {
      const token = response.data?.token;
      if (!token) {
        throw createAppError(
          "Shiprocket authentication succeeded but no token was returned.",
          502,
          response.data,
        );
      }

      hydrateTokenCache(token, "login");
      logShiprocket("Authenticated with email/password", {
        expiresAt: tokenCache.expiresAt,
      });

      return tokenCache;
    })
    .catch((error) => {
      const mappedError = mapShiprocketError(error, "Shiprocket authentication failed.");
      tokenCache = {
        token: null,
        expiresAt: 0,
        refreshedAt: 0,
        refreshPromise: null,
        source: null,
        authFailure: tokenCache.authFailure,
      };
      cacheAuthFailure(mappedError);
      throw mappedError;
    })
    .finally(() => {
      tokenCache.refreshPromise = null;
    });

  tokenCache.refreshPromise = refreshPromise;
  await refreshPromise;

  return {
    token: tokenCache.token,
    expiresAt: tokenCache.expiresAt,
    refreshedAt: tokenCache.refreshedAt,
    source: tokenCache.source,
  };
};

const requestWithAuth = async (config, { retryUnauthorized = true } = {}) => {
  const auth = await authenticate();

  try {
    return await shiprocketClient({
      ...config,
      headers: {
        ...(config?.headers || {}),
        Authorization: `Bearer ${auth.token}`,
      },
    });
  } catch (error) {
    if (retryUnauthorized && error?.response?.status === 401) {
      const freshAuth = await authenticate({ forceRefresh: true });
      try {
        return await shiprocketClient({
          ...config,
          headers: {
            ...(config?.headers || {}),
            Authorization: `Bearer ${freshAuth.token}`,
          },
        });
      } catch (retryError) {
        throw mapShiprocketError(retryError, "Shiprocket request failed.");
      }
    }

    throw mapShiprocketError(error, "Shiprocket request failed.");
  }
};

const getOrderItems = (input) => {
  const source =
    Array.isArray(input?.items) && input.items.length
      ? input.items
      : input?.item
        ? [input.item]
        : [];

  return source.map((item, index) =>
    compactObject({
      name: item.name,
      sku: item.sku || `SKU-${index + 1}`,
      units: Math.max(1, Number(item.quantity || 1)),
      selling_price: Number(toNumber(item.price, 0).toFixed(2)),
      discount: Number(toNumber(item.discount, 0).toFixed(2)),
      tax: Number(toNumber(item.tax, 0).toFixed(2)),
      hsn: item.hsn !== undefined ? String(item.hsn) : undefined,
    }),
  );
};

const buildCreateOrderPayload = (input) => {
  const { customer = {}, package: packageDetails = {} } = input || {};
  const { firstName, lastName } = splitName(customer.name);
  const orderItems = getOrderItems(input);
  const totalDiscount = orderItems.reduce(
    (sum, item) => sum + toNumber(item.discount, 0),
    0,
  );
  const subTotal = orderItems.reduce(
    (sum, item) =>
      sum + toNumber(item.selling_price, 0) * Math.max(1, toNumber(item.units, 1)),
    0,
  );

  return {
    order_id: input.orderId || `WEB-${Date.now()}`,
    order_date: formatShiprocketDate(input.orderDate),
    pickup_location: input.pickupLocation || env.shiprocketPickupLocation || undefined,
    comment: input.notes || undefined,
    billing_customer_name: firstName,
    billing_last_name: lastName || firstName,
    billing_address: customer.address,
    billing_address_2: customer.address2 || undefined,
    billing_city: customer.city,
    billing_pincode: customer.pincode,
    billing_state: customer.state,
    billing_country: customer.country || env.shiprocketDefaultCountry,
    billing_email: customer.email,
    billing_phone: customer.phone,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: input.paymentMethod || "Prepaid",
    shipping_charges: 0,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: Number(totalDiscount.toFixed(2)),
    sub_total: Number(subTotal.toFixed(2)),
    length: toNumber(packageDetails.length, env.shiprocketDefaultLength),
    breadth: toNumber(packageDetails.breadth, env.shiprocketDefaultBreadth),
    height: toNumber(packageDetails.height, env.shiprocketDefaultHeight),
    weight: toNumber(packageDetails.weight, env.shiprocketDefaultWeight),
  };
};

const getPickupLocationEntries = async () => {
  const response = await requestWithAuth({
    url: "/settings/company/pickup",
    method: "GET",
  });

  const data = response.data?.data || response.data || {};
  const rawEntries = Array.isArray(data?.shipping_address)
    ? data.shipping_address
    : Array.isArray(data)
      ? data
      : [];

  return rawEntries
    .map((entry) => ({
      pickupLocation:
        String(entry?.pickup_location || entry?.pickupLocation || entry?.warehouse_name || "")
          .trim() || null,
      addressId: entry?.id || entry?.pickup_address_id || null,
      isDefault: Boolean(entry?.is_default || entry?.default || entry?.pickup_default),
      raw: entry,
    }))
    .filter((entry) => entry.pickupLocation);
};

const resolvePickupLocation = async (requestedPickupLocation) => {
  const requested = String(requestedPickupLocation || "").trim();
  if (!requested) {
    return {
      pickupLocation: null,
      source: "default",
    };
  }

  const entries = await getPickupLocationEntries();
  if (!entries.length) {
    return {
      pickupLocation: null,
      source: "default",
    };
  }

  const requestedToken = normalizeLookupToken(requested);
  const exactMatch = entries.find(
    (entry) => normalizeLookupToken(entry.pickupLocation) === requestedToken,
  );
  if (exactMatch) {
    return {
      pickupLocation: exactMatch.pickupLocation,
      source: "exact",
    };
  }

  const partialMatch = entries.find((entry) => {
    const entryToken = normalizeLookupToken(entry.pickupLocation);
    return (
      entryToken.includes(requestedToken) ||
      requestedToken.includes(entryToken)
    );
  });
  if (partialMatch) {
    return {
      pickupLocation: partialMatch.pickupLocation,
      source: "partial",
    };
  }

  const defaultEntry = entries.find((entry) => entry.isDefault) || entries[0];
  return {
    pickupLocation: defaultEntry?.pickupLocation || null,
    source: defaultEntry?.isDefault ? "default" : "first",
  };
};

const isPickupLocationError = (error) => {
  const haystack = [
    error?.message,
    typeof error?.details === "string" ? error.details : null,
    Array.isArray(error?.details) ? error.details.join(" ") : null,
    typeof error?.details === "object" ? JSON.stringify(error.details) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes("pickup");
};

const createOrderRequest = async (payload) => {
  const response = await requestWithAuth({
    url: "/orders/create/adhoc",
    method: "POST",
    data: compactObject(payload),
  });

  return {
    summary: {
      localOrderId: payload.order_id,
      shiprocketOrderId:
        response.data?.order_id || response.data?.orderId || response.data?.data?.order_id || null,
      shipmentId:
        response.data?.shipment_id ||
        response.data?.shipmentId ||
        response.data?.data?.shipment_id ||
        null,
      awbCode: response.data?.awb_code || response.data?.data?.awb_code || null,
      status: response.data?.status || response.data?.message || "Order created",
      pickupLocation: payload.pickup_location || null,
    },
    raw: response.data,
  };
};

const normalizeAssignedAwbResponse = (payload = {}) => {
  const source = payload?.response?.data || payload?.data || payload || {};

  return {
    summary: {
      shiprocketOrderId:
        source?.order_id || payload?.order_id || payload?.orderId || null,
      shipmentId:
        source?.shipment_id || payload?.shipment_id || payload?.shipmentId || null,
      awbCode: source?.awb_code || payload?.awb_code || null,
      courierName: source?.courier_name || payload?.courier_name || null,
      courierCompanyId:
        source?.courier_company_id || payload?.courier_company_id || null,
      status:
        Number(payload?.awb_assign_status || 0) === 1 ? "AWB Assigned" : "Assignment pending",
    },
    raw: payload,
  };
};

const normalizeOrderRecord = (entry = {}) => {
  const shipment = Array.isArray(entry?.shipments) ? entry.shipments[0] || {} : {};

  return {
    shiprocketOrderId: entry?.id || null,
    channelOrderId: entry?.channel_order_id || null,
    status: entry?.status || null,
    shipmentId: shipment?.id || null,
    awbCode: shipment?.awb || null,
    courierName: shipment?.courier || null,
    pickupScheduledDate: shipment?.pickup_scheduled_date || null,
    pickupTokenNumber: shipment?.pickup_token_number || null,
    manifestGenerated: Array.isArray(entry?.activities)
      ? entry.activities.includes("MANIFEST_GENERATED")
      : false,
    raw: entry,
  };
};

const normalizePickupResponse = (payload = {}) => {
  const source = payload?.response || payload?.data || payload || {};

  return {
    summary: {
      pickupStatus: Number(payload?.pickup_status ?? source?.pickup_status ?? 0) || 0,
      pickupScheduledDate:
        source?.pickup_scheduled_date || source?.pickup_date || payload?.pickup_scheduled_date || null,
      pickupTokenNumber:
        source?.pickup_token_number || payload?.pickup_token_number || null,
      status: source?.status ?? payload?.status ?? null,
      message: source?.data || payload?.message || null,
    },
    raw: payload,
  };
};

const normalizeManifestResponse = (payload = {}) => ({
  summary: {
    status: Number(payload?.status ?? 0) || 0,
    manifestUrl: payload?.manifest_url || null,
    message: payload?.message || null,
  },
  raw: payload,
});

const normalizeCancelOrderResponse = (payload = {}, orderIds = []) => ({
  summary: {
    orderIds,
    status: payload?.status || payload?.message || "Cancellation requested",
    message: payload?.message || payload?.data || null,
  },
  raw: payload,
});

const searchOrders = async ({ search }) => {
  const response = await requestWithAuth({
    url: "/orders",
    method: "GET",
    params: compactObject({
      search,
      per_page: 20,
      sort: "DESC",
      sort_by: "id",
    }),
  });

  const source = Array.isArray(response.data?.data) ? response.data.data : [];
  return source.map(normalizeOrderRecord);
};

const normalizeTrackingActivities = (payload = {}) => {
  const trackingData = payload?.tracking_data || payload?.data || payload || {};
  const activitiesSource = Array.isArray(trackingData?.shipment_track_activities)
    ? trackingData.shipment_track_activities
    : Array.isArray(trackingData?.shipment_track)
      ? trackingData.shipment_track
      : [];

  return activitiesSource
    .map((activity) =>
      compactObject({
        status:
          activity?.activity ||
          activity?.status ||
          activity?.current_status ||
          activity?.["sr-status"] ||
          undefined,
        location:
          activity?.location ||
          activity?.city ||
          activity?.["sr-status-location"] ||
          undefined,
        date:
          activity?.date ||
          activity?.activity_date ||
          activity?.["sr-status-date"] ||
          activity?.created_at ||
          undefined,
        details:
          activity?.["sr-status-label"] ||
          activity?.remarks ||
          activity?.description ||
          undefined,
      }),
    )
    .filter(
      (activity) =>
        activity.status || activity.location || activity.date || activity.details,
    );
};

const normalizeTrackingResponse = (payload, lookup = {}) => {
  const trackingData = payload?.tracking_data || payload?.data || payload || {};
  const primaryTrack = Array.isArray(trackingData?.shipment_track)
    ? trackingData.shipment_track[0]
    : null;
  const activities = normalizeTrackingActivities(payload);

  return {
    lookup: {
      awb: lookup.awb || primaryTrack?.awb_code || trackingData?.awb || null,
      orderId: lookup.orderId || trackingData?.order_id || null,
    },
    summary: {
      status:
        trackingData?.track_status ||
        activities[0]?.status ||
        primaryTrack?.current_status ||
        payload?.message ||
        "Tracking received",
      courierName: primaryTrack?.courier_name || trackingData?.courier_name || null,
      estimatedDeliveryDate: primaryTrack?.edd || trackingData?.etd || null,
      deliveredAt: primaryTrack?.delivered_date || trackingData?.delivered_date || null,
      origin: primaryTrack?.origin || null,
      destination: primaryTrack?.destination || null,
    },
    activities,
    raw: payload,
  };
};

const getAuthStatus = async () => {
  const auth = await authenticate();

  return {
    authenticated: Boolean(auth.token),
    expiresAt: auth.expiresAt,
    refreshedAt: auth.refreshedAt,
    source: auth.source,
    pickupLocation: env.shiprocketPickupLocation,
  };
};

const createOrder = async (input) => {
  validateRequiredConfig();

  // Auto-resolve only when no pickup is configured. If the business configured
  // a pickup location, never silently fall back to another warehouse.
  const configuredPickup = String(env.shiprocketPickupLocation || "").trim();
  let resolvedPickupLocation = configuredPickup || null;

  if (!resolvedPickupLocation) {
    logShiprocket("SHIPROCKET_PICKUP_LOCATION not set — auto-resolving from Shiprocket API");
    const resolved = await resolvePickupLocation("").catch(() => ({ pickupLocation: null, source: "default" }));
    resolvedPickupLocation = resolved.pickupLocation || null;
    logShiprocket("Auto-resolved pickup location", { pickupLocation: resolvedPickupLocation, source: resolved.source });
  }

  const payload = buildCreateOrderPayload({
    ...input,
    pickupLocation: resolvedPickupLocation || input.pickupLocation || undefined,
  });

  try {
    return await createOrderRequest(payload);
  } catch (error) {
    if (!isPickupLocationError(error)) {
      throw error;
    }

    if (configuredPickup) {
      throw createAppError(
        `Shiprocket rejected configured pickup location "${configuredPickup}". Create or rename the pickup address in Shiprocket to exactly match SHIPROCKET_PICKUP_LOCATION.`,
        400,
        error?.details || error?.message || null,
      );
    }

    // Pickup location rejected by Shiprocket — try to resolve a valid one
    logShiprocket("Pickup location rejected, re-resolving from Shiprocket API");
    const fallback = await resolvePickupLocation(payload.pickup_location).catch(
      () => ({
        pickupLocation: null,
        source: "default",
      }),
    );

    const retryPayload = {
      ...payload,
      pickup_location: fallback.pickupLocation || undefined,
    };

    return createOrderRequest(retryPayload);
  }
};

const trackShipment = async ({ awb, orderId }) => {
  const trackingPath = awb
    ? `/courier/track/awb/${encodeURIComponent(awb)}`
    : `/courier/track/order/${encodeURIComponent(orderId)}`;

  const response = await requestWithAuth({
    url: trackingPath,
    method: "GET",
  });

  return normalizeTrackingResponse(response.data, { awb, orderId });
};

const checkServiceability = async ({
  pickupPostcode,
  deliveryPostcode,
  weight,
  cod,
  length,
  breadth,
  height,
  declaredValue,
}) => {
  const response = await requestWithAuth({
    url: "/courier/serviceability/",
    method: "GET",
    params: {
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      weight,
      cod,
      length,
      breadth,
      height,
      declared_value: declaredValue,
    },
  });

  return response.data;
};

const assignAwb = async ({ shipmentId, courierId, status }) => {
  const response = await requestWithAuth({
    url: "/courier/assign/awb",
    method: "POST",
    data: compactObject({
      shipment_id: shipmentId,
      courier_id: courierId,
      status,
    }),
  });

  return normalizeAssignedAwbResponse(response.data);
};

const generatePickup = async ({ shipmentId, status, pickupDate }) => {
  const response = await requestWithAuth({
    url: "/courier/generate/pickup",
    method: "POST",
    data: compactObject({
      shipment_id: [Number(shipmentId)],
      status,
      pickup_date: pickupDate ? [pickupDate] : undefined,
    }),
  });

  return normalizePickupResponse(response.data);
};

const generateManifest = async ({ shipmentId }) => {
  const response = await requestWithAuth({
    url: "/manifests/generate",
    method: "POST",
    data: {
      shipment_id: [Number(shipmentId)],
    },
  });

  return normalizeManifestResponse(response.data);
};

const cancelOrder = async ({ orderIds }) => {
  validateRequiredConfig();
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!ids.length) {
    throw createAppError("Shiprocket order ID is required to cancel an order.", 400);
  }

  const response = await requestWithAuth({
    url: "/orders/cancel",
    method: "POST",
    data: {
      ids,
    },
  });

  return normalizeCancelOrderResponse(response.data, ids);
};

module.exports = {
  validateRequiredConfig,
  getAuthStatus,
  createOrder,
  searchOrders,
  trackShipment,
  checkServiceability,
  assignAwb,
  generatePickup,
  generateManifest,
  cancelOrder,
};
