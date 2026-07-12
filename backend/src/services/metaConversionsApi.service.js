const axios = require("axios");

const { env } = require("../config");
const { buildMetaUserData, compactMetaObject } = require("../utils/metaConversionsApi");

const META_GRAPH_API_BASE_URL = "https://graph.facebook.com";

const metaCapiClient = axios.create({
  baseURL: META_GRAPH_API_BASE_URL,
  timeout: 20_000,
  headers: {
    "Content-Type": "application/json",
  },
});

const logMetaCapi = (message, detail = null) => {
  if (detail !== null && detail !== undefined) {
    console.info(`[Meta CAPI] ${message}`, detail);
    return;
  }

  console.info(`[Meta CAPI] ${message}`);
};

const isMetaCapiPurchaseEnabled = () =>
  Boolean(env.metaCapiEnabled && env.metaCapiPixelId && env.metaCapiAccessToken);

const getMetaPurchaseTracking = (order = {}) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  return shipping?.metaTracking && typeof shipping.metaTracking === "object"
    ? shipping.metaTracking
    : {};
};

const buildMetaPurchaseEventId = (order = {}) => {
  const tracking = getMetaPurchaseTracking(order);
  return (
    String(tracking.purchaseEventId || "").trim() ||
    String(order?.metaPurchaseEventId || "").trim() ||
    (order?.id ? `meta_purchase_${order.id}` : "")
  );
};

const getOrderItems = (order = {}) => (Array.isArray(order?.items) ? order.items : []);

const getOrderCurrency = (order = {}) =>
  String(order?.totals?.currency || order?.currency || getOrderItems(order)[0]?.currency || "INR").trim() || "INR";

const getOrderValue = (order = {}) => {
  const totalsValue = Number(order?.totals?.total ?? order?.total ?? order?.amount);
  if (Number.isFinite(totalsValue) && totalsValue >= 0) {
    return totalsValue;
  }

  return getOrderItems(order).reduce((sum, item) => {
    const price = Number(item?.price ?? item?.unitPrice ?? item?.amount ?? 0);
    const quantity = Math.max(1, Number(item?.quantity || 1));
    return sum + (Number.isFinite(price) ? price : 0) * quantity;
  }, 0);
};

const buildMetaContents = (order = {}) =>
  getOrderItems(order).map((item, index) =>
    compactMetaObject({
      id:
        String(
          item?.sku ||
            item?.productId ||
            item?.variantId ||
            item?.id ||
            item?.slug ||
            `line-${index + 1}`,
        ).trim() || `line-${index + 1}`,
      quantity: Math.max(1, Number(item?.quantity || 1)),
      item_price: Number(item?.price ?? item?.unitPrice ?? item?.amount ?? 0) || 0,
    }),
  );

const buildMetaPurchasePayload = (order = {}) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const eventId = buildMetaPurchaseEventId(order);
  const contents = buildMetaContents(order);
  const userData = buildMetaUserData({
    email: shipping.email || null,
    phone: shipping.phone || null,
    country: shipping.country || "India",
  });

  return compactMetaObject({
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId || undefined,
    action_source: "website",
    event_source_url: env.frontendUrl ? `${String(env.frontendUrl).replace(/\/+$/, "")}/checkout/success` : undefined,
    user_data: userData,
    custom_data: compactMetaObject({
      currency: getOrderCurrency(order),
      value: getOrderValue(order),
      order_id: String(order?.id || order?.number || "").trim() || undefined,
      content_type: "product",
      content_ids: contents.map((item) => item.id).filter(Boolean),
      contents,
      num_items: contents.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0),
    }),
  });
};

const buildMetaTrackingPatch = (order = {}, updates = {}) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const currentTracking = getMetaPurchaseTracking(order);

  return {
    ...shipping,
    metaTracking: compactMetaObject({
      ...currentTracking,
      purchaseEventId: buildMetaPurchaseEventId(order) || undefined,
      ...updates,
    }),
  };
};

const sendPurchaseEvent = async (order = {}) => {
  const eventId = buildMetaPurchaseEventId(order);

  if (!eventId) {
    return {
      enabled: false,
      skipped: true,
      reason: "missing_event_id",
      eventId: null,
      shippingPatch: buildMetaTrackingPatch(order, {
        capiPurchaseStatus: "skipped",
        capiPurchaseReason: "missing_event_id",
      }),
      payload: null,
    };
  }

  const existingTracking = getMetaPurchaseTracking(order);
  if (existingTracking.capiPurchaseSentAt) {
    return {
      enabled: isMetaCapiPurchaseEnabled(),
      skipped: true,
      reason: "already_sent",
      eventId,
      shippingPatch: buildMetaTrackingPatch(order, {
        capiPurchaseStatus: "sent",
      }),
      payload: null,
    };
  }

  if (!isMetaCapiPurchaseEnabled()) {
    return {
      enabled: false,
      skipped: true,
      reason: "disabled",
      eventId,
      shippingPatch: buildMetaTrackingPatch(order, {
        capiPurchaseStatus: "disabled",
        capiPurchaseReason: "meta_capi_not_configured",
      }),
      payload: null,
    };
  }

  const payload = {
    data: [buildMetaPurchasePayload(order)],
  };

  if (env.metaCapiTestEventCode) {
    payload.test_event_code = env.metaCapiTestEventCode;
  }

  try {
    const response = await metaCapiClient.post(
      `/${env.metaCapiApiVersion}/${encodeURIComponent(env.metaCapiPixelId)}/events`,
      payload,
      {
        params: {
          access_token: env.metaCapiAccessToken,
        },
      },
    );

    logMetaCapi("Purchase sent", {
      eventId,
      pixelId: env.metaCapiPixelId,
      eventsReceived: response?.data?.events_received ?? null,
    });

    return {
      enabled: true,
      skipped: false,
      reason: null,
      eventId,
      payload,
      response: response?.data || null,
      shippingPatch: buildMetaTrackingPatch(order, {
        capiPurchaseStatus: "sent",
        capiPurchaseSentAt: new Date().toISOString(),
        capiPurchaseReason: null,
        capiPurchaseError: null,
      }),
    };
  } catch (error) {
    const responsePayload = error?.response?.data || null;
    logMetaCapi("Purchase failed", {
      eventId,
      status: error?.response?.status || null,
      response: responsePayload,
    });

    return {
      enabled: true,
      skipped: true,
      reason: "request_failed",
      eventId,
      payload,
      response: responsePayload,
      shippingPatch: buildMetaTrackingPatch(order, {
        capiPurchaseStatus: "failed",
        capiPurchaseReason: "request_failed",
        capiPurchaseError:
          responsePayload?.error?.message ||
          error?.message ||
          "Unable to send Meta Conversions API purchase event.",
      }),
    };
  }
};

module.exports = {
  buildMetaPurchaseEventId,
  buildMetaPurchasePayload,
  isMetaCapiPurchaseEnabled,
  sendPurchaseEvent,
};
