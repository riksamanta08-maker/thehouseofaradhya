const { env } = require("../config");
const shiprocketService = require("./shiprocket.service");

const createAppError = (message, status = 500, details = null) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
};

const compactObject = (value = {}) =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null && entry !== "",
    ),
  );

const toMoney = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeToken = (value) => String(value ?? "").trim().toUpperCase();

const normalizePaymentToken = (value) =>
  normalizeToken(value).replace(/[\s_-]+/g, "");

const stripNonDigits = (value) => String(value ?? "").replace(/\D+/g, "");

const normalizeIndianPhone = (value) => {
  const digits = stripNonDigits(value);
  if (digits.length <= 10) return digits;
  return digits.slice(-10);
};

const logShiprocket = (label, payload) => {
  if (payload === undefined) {
    console.info(`[Shiprocket] ${label}`);
    return;
  }

  console.info(`[Shiprocket] ${label}`, payload);
};

const withShippingPatch = (error, shippingPatch) => {
  const nextError = error?.status ? error : createAppError(error?.message || "Shiprocket provisioning failed.");
  nextError.shippingPatch = shippingPatch;
  return nextError;
};

const getExistingShiprocketRefs = (shipping = {}) => ({
  shiprocketOrderId: String(
    shipping?.shiprocketOrderId || shipping?.shiprocket_order_id || shipping?.order_id || "",
  ).trim(),
  shipmentId: String(
    shipping?.shiprocketShipmentId || shipping?.shipment_id || shipping?.shipmentId || "",
  ).trim(),
  awbCode: String(
    shipping?.awbCode || shipping?.awb_code || shipping?.awb || shipping?.trackingNumber || "",
  ).trim(),
  courierName: String(shipping?.courierName || shipping?.courier_name || "").trim(),
  shiprocketStatus: String(
    shipping?.shiprocketStatus || shipping?.shipment_status || shipping?.shipmentStatus || "",
  ).trim(),
  pickupStatus: String(
    shipping?.shiprocketPickupStatus || shipping?.pickup_status || shipping?.pickupStatus || "",
  ).trim(),
  manifestUrl: String(shipping?.shiprocketManifestUrl || shipping?.manifest_url || "").trim(),
});

const hasExistingShipment = (shipping = {}) => {
  const refs = getExistingShiprocketRefs(shipping);
  return Boolean(refs.shiprocketOrderId || refs.shipmentId || refs.awbCode);
};

const hasAssignedAwb = (shipping = {}) => Boolean(getExistingShiprocketRefs(shipping).awbCode);

const isCodPaymentMethod = (value) => {
  const normalized = normalizePaymentToken(value);
  return normalized === "COD" || normalized === "CASHONDELIVERY";
};

const isCodOrder = (order = {}) => isCodPaymentMethod(order?.paymentMethod);

const shouldCreateShipmentForOrder = (order = {}) => {
  if (!order) return false;
  if (hasAssignedAwb(order.shipping || {})) return false;

  const status = normalizeToken(order?.status);
  if (status === "PAID") return true;
  if (status === "PENDING" && isCodOrder(order)) return true;
  return false;
};

const getOrderReference = (order = {}) => {
  const primary = String(order?.number || order?.id || "").trim();
  if (!primary) {
    throw createAppError("Order reference is missing for shipment creation.", 400);
  }
  return primary.slice(0, 64);
};

const getCustomerPayload = (order = {}) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const customer = {
    name: String(shipping.fullName || "").trim(),
    email: String(shipping.email || "").trim(),
    phone: normalizeIndianPhone(shipping.phone),
    address: String(shipping.address || "").trim(),
    city: String(shipping.city || "").trim(),
    state: String(shipping.state || "").trim(),
    pincode: stripNonDigits(shipping.postalCode).slice(0, 6),
    country: String(shipping.country || env.shiprocketDefaultCountry || "India").trim(),
  };

  if (
    !customer.name ||
    !customer.email ||
    customer.phone.length < 10 ||
    !customer.address ||
    !customer.city ||
    !customer.state ||
    customer.pincode.length !== 6
  ) {
    throw createAppError(
      "Order shipping details are incomplete. Name, email, phone, address, city, state, and a valid 6-digit pincode are required.",
      400,
    );
  }

  return customer;
};

const buildLineItemName = (item = {}, index = 0) => {
  const base = String(item?.name || "").trim() || `Item ${index + 1}`;
  const size = String(item?.size || "").trim();
  return size ? `${base} (${size})` : base;
};

const roundMoney = (value) => Math.round((toMoney(value, 0) + Number.EPSILON) * 100) / 100;

const getItemsPayload = async (order = {}) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) {
    throw createAppError("At least one item is required to create a shipment.", 400);
  }

  const totals = order?.totals && typeof order.totals === "object" ? order.totals : {};
  const originalSubtotal = roundMoney(
    items.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item?.quantity || 1));
      return sum + Math.max(toMoney(item?.price, 0), 0) * quantity;
    }, 0),
  );
  const discountAmount = Math.min(
    Math.max(toMoney(totals.discountAmount, 0), 0),
    originalSubtotal,
  );
  const discountedSubtotal = roundMoney(Math.max(originalSubtotal - discountAmount, 0));
  let allocatedTotal = 0;

  return items.map((item, index) => {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const originalLineTotal = roundMoney(Math.max(toMoney(item?.price, 0), 0) * quantity);
    const isLast = index === items.length - 1;
    const lineTotal =
      discountAmount > 0
        ? isLast
          ? roundMoney(discountedSubtotal - allocatedTotal)
          : roundMoney((originalLineTotal / Math.max(originalSubtotal, 1)) * discountedSubtotal)
        : originalLineTotal;
    allocatedTotal = roundMoney(allocatedTotal + lineTotal);
    const unitPrice = quantity > 0 ? roundMoney(lineTotal / quantity) : lineTotal;
    return compactObject({
      name: buildLineItemName(item, index),
      sku: String(item?.sku || item?.id || "").trim() || undefined,
      price: Math.max(unitPrice, 0.01),
      quantity,
    });
  });
};

const getPackagePayload = (order = {}) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const packageDetails =
    shipping.package && typeof shipping.package === "object" ? shipping.package : {};

  return {
    weight: toPositiveNumber(packageDetails.weight, env.shiprocketDefaultWeight),
    length: toPositiveNumber(packageDetails.length, env.shiprocketDefaultLength),
    breadth: toPositiveNumber(packageDetails.breadth, env.shiprocketDefaultBreadth),
    height: toPositiveNumber(packageDetails.height, env.shiprocketDefaultHeight),
  };
};

const buildCreateOrderInput = async (order = {}, { notes } = {}) => ({
  orderId: getOrderReference(order),
  orderDate: order?.createdAt || new Date().toISOString(),
  pickupLocation: env.shiprocketPickupLocation,
  paymentMethod: isCodOrder(order) ? "COD" : "Prepaid",
  customer: getCustomerPayload(order),
  items: await getItemsPayload(order),
  package: getPackagePayload(order),
  notes: notes || undefined,
});

const recoverExistingShiprocketShipment = async (order, shipping = {}) => {
  const reference = getOrderReference(order);
  const candidates = await shiprocketService.searchOrders({ search: reference });
  const exactMatch = candidates.find(
    (entry) => String(entry?.channelOrderId || "").trim() === reference,
  );

  if (!exactMatch) return null;

  logShiprocket(`Recovered existing Shiprocket order for ${order?.number || order?.id}`, {
    shiprocketOrderId: exactMatch.shiprocketOrderId,
    shipmentId: exactMatch.shipmentId,
    awbCode: exactMatch.awbCode,
    status: exactMatch.status,
  });

  const shipment = {
    summary: {
      shiprocketOrderId:
        String(exactMatch.shiprocketOrderId || "").trim() || null,
      shipmentId: String(exactMatch.shipmentId || "").trim() || null,
      awbCode: String(exactMatch.awbCode || "").trim() || null,
      status: String(exactMatch.status || "").trim() || null,
    },
    raw: exactMatch.raw,
  };

  const assigned = exactMatch.awbCode
    ? {
        summary: {
          shiprocketOrderId:
            String(exactMatch.shiprocketOrderId || "").trim() || null,
          shipmentId: String(exactMatch.shipmentId || "").trim() || null,
          awbCode: String(exactMatch.awbCode || "").trim() || null,
          courierName: String(exactMatch.courierName || "").trim() || null,
          courierCompanyId: null,
          status: "AWB Assigned",
        },
        raw: exactMatch.raw,
      }
    : null;

  const pickup =
    exactMatch.pickupScheduledDate || exactMatch.pickupTokenNumber
      ? {
          summary: {
            pickupStatus: 1,
            pickupScheduledDate: exactMatch.pickupScheduledDate || null,
            pickupTokenNumber: exactMatch.pickupTokenNumber || null,
            status: exactMatch.pickupScheduledDate ? "Pickup Requested" : null,
          },
          raw: exactMatch.raw,
        }
      : null;

  const manifest = exactMatch.manifestGenerated
    ? {
        summary: {
          status: 1,
          manifestUrl: String(shipping?.shiprocketManifestUrl || shipping?.manifest_url || "").trim() || null,
          message: "Manifest already generated",
        },
        raw: exactMatch.raw,
      }
    : null;

  return {
    shipment,
    assigned,
    pickup,
    manifest,
  };
};

const recoverExistingShiprocketShipmentSafely = async (order, shipping = {}, phase = "pre-create") => {
  try {
    return await recoverExistingShiprocketShipment(order, shipping);
  } catch (error) {
    logShiprocket(`Existing order recovery skipped for ${order?.number || order?.id}`, {
      phase,
      status: error?.status || null,
      message: error?.message || null,
    });
    return null;
  }
};

const normalizeServiceabilityResponse = (payload) => payload?.data || payload || {};

const parseEtdScore = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
};

const summarizeCourier = (courier = {}) => ({
  courier_company_id: Number(courier?.courier_company_id || 0) || null,
  courier_name: courier?.courier_name || null,
  rate: toMoney(courier?.rate ?? courier?.freight_charge, null),
  etd:
    courier?.etd ||
    courier?.estimated_delivery_days ||
    courier?.delivery_days ||
    courier?.etd_hours ||
    null,
  rating: toMoney(courier?.rating, null),
});

const extractCourierOptions = (payload) => {
  const source = normalizeServiceabilityResponse(payload);
  const companies = Array.isArray(source.available_courier_companies)
    ? source.available_courier_companies
    : [];

  return companies.filter(
    (company) =>
      Number(company?.blocked || 0) !== 1 &&
      Number(company?.courier_company_id || 0) > 0,
  );
};

const chooseBestCourier = (payload) => {
  const companies = extractCourierOptions(payload);

  if (!companies.length) {
    throw createAppError("No serviceable courier is available for this pincode.", 400, payload);
  }

  return [...companies].sort((left, right) => {
    const leftRate = toMoney(left?.rate ?? left?.freight_charge, Number.MAX_SAFE_INTEGER);
    const rightRate = toMoney(right?.rate ?? right?.freight_charge, Number.MAX_SAFE_INTEGER);
    if (leftRate !== rightRate) return leftRate - rightRate;

    const leftEtd = parseEtdScore(
      left?.etd ?? left?.estimated_delivery_days ?? left?.delivery_days ?? left?.etd_hours,
    );
    const rightEtd = parseEtdScore(
      right?.etd ?? right?.estimated_delivery_days ?? right?.delivery_days ?? right?.etd_hours,
    );
    if (leftEtd !== rightEtd) return leftEtd - rightEtd;

    const leftRating = toMoney(left?.rating, 0);
    const rightRating = toMoney(right?.rating, 0);
    return rightRating - leftRating;
  })[0];
};

const buildTrackingUrl = (awbCode) => {
  const awb = String(awbCode || "").trim();
  const frontendBase = String(env.frontendUrl || "").trim().replace(/\/+$/, "");
  if (!awb || !frontendBase) return "";
  return `${frontendBase}/track/${encodeURIComponent(awb)}`;
};

const buildExistingShipmentSummary = (refs = {}) => ({
  summary: {
    shiprocketOrderId: refs.shiprocketOrderId || null,
    shipmentId: refs.shipmentId || null,
    awbCode: refs.awbCode || null,
    status:
      refs.shiprocketStatus ||
      (refs.awbCode ? "AWB Assigned" : refs.shipmentId ? "NEW" : refs.shiprocketOrderId ? "Order Synced" : null),
  },
  raw: null,
});

const buildShipmentPatch = (shipping = {}, context = {}) => {
  const shipment = context.shipment || {};
  const assigned = context.assigned || {};
  const pickup = context.pickup || {};
  const manifest = context.manifest || {};
  const tracking = context.tracking || {};
  const courier = context.courier || {};
  const fallbackRefs = getExistingShiprocketRefs(shipping);
  const lookup = tracking?.lookup || {};
  const trackingSummary = tracking?.summary || {};
  const assignedData = assigned?.summary || {};
  const shipmentSummary = shipment?.summary || {};
  const awbCode =
    String(
      assignedData.awbCode ||
        shipmentSummary.awbCode ||
        lookup.awb ||
        fallbackRefs.awbCode,
    ).trim() || null;
  const shiprocketOrderId =
    String(
      assignedData.shiprocketOrderId ||
        shipmentSummary.shiprocketOrderId ||
        fallbackRefs.shiprocketOrderId,
    ).trim() || null;
  const shipmentId =
    String(
      assignedData.shipmentId ||
        shipmentSummary.shipmentId ||
        fallbackRefs.shipmentId,
    ).trim() || null;
  const courierName =
    String(
      assignedData.courierName ||
        trackingSummary.courierName ||
        courier?.courier_name ||
        fallbackRefs.courierName,
    ).trim() || null;
  const shipmentStatus =
    String(
      trackingSummary.status ||
        assignedData.status ||
        shipmentSummary.status ||
        fallbackRefs.shiprocketStatus ||
        (awbCode ? "AWB Assigned" : shipmentId ? "NEW" : ""),
    ).trim() || null;
  const pickupSummary = pickup?.summary || {};
  const manifestSummary = manifest?.summary || {};
  const pickupStatus =
    String(
      pickupSummary.pickupStatus ??
        pickupSummary.status ??
        fallbackRefs.pickupStatus,
    ).trim() || null;
  const manifestUrl =
    String(manifestSummary.manifestUrl || fallbackRefs.manifestUrl || "").trim() || null;

  return compactObject({
    ...shipping,
    shiprocketOrderId,
    shiprocket_order_id: shiprocketOrderId,
    order_id: shiprocketOrderId,
    shiprocketShipmentId: shipmentId,
    shipment_id: shipmentId,
    shipmentId,
    awbCode,
    awb_code: awbCode,
    awb: awbCode,
    trackingNumber: awbCode,
    courierName,
    courier_name: courierName,
    trackingUrl: buildTrackingUrl(awbCode) || shipping.trackingUrl || null,
    estimatedDelivery:
      String(
        trackingSummary.estimatedDeliveryDate || courier?.etd || shipping.estimatedDelivery || "",
      ).trim() || null,
    shiprocketCourierId:
      Number(courier?.courier_company_id || shipping.shiprocketCourierId || 0) || null,
    shiprocketRate: toMoney(courier?.rate ?? courier?.freight_charge, null),
    shiprocketStatus: shipmentStatus,
    shipmentStatus,
    shipment_status: shipmentStatus,
    shiprocketPickupStatus: pickupStatus,
    pickupStatus,
    pickup_status: pickupStatus,
    shiprocketPickupTokenNumber:
      String(pickupSummary.pickupTokenNumber || shipping.shiprocketPickupTokenNumber || "").trim() ||
      null,
    shiprocketPickupScheduledDate:
      String(
        pickupSummary.pickupScheduledDate || shipping.shiprocketPickupScheduledDate || "",
      ).trim() || null,
    shiprocketManifestUrl: manifestUrl,
    manifest_url: manifestUrl,
    shiprocketLastSyncedAt: new Date().toISOString(),
    shiprocketProvisioningError: null,
    source: "SHIPROCKET",
  });
};

const ensureShiprocketOrderForOrder = async (order, { allowExisting = false, notes } = {}) => {
  shiprocketService.validateRequiredConfig();
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const existingRefs = getExistingShiprocketRefs(shipping);
  const hasExistingRefs = Boolean(
    existingRefs.shiprocketOrderId || existingRefs.shipmentId || existingRefs.awbCode,
  );

  if (hasExistingRefs && !allowExisting) {
    const shipment = buildExistingShipmentSummary(existingRefs);

    return {
      created: false,
      alreadyExists: true,
      shipment,
      shippingPatch: buildShipmentPatch(shipping, { shipment }),
    };
  }

  if (!shouldCreateShipmentForOrder(order) && !allowExisting) {
    throw createAppError(
      "This order is not ready for Shiprocket yet. Create the Shiprocket order after payment success or for a COD order.",
      400,
    );
  }

  if (existingRefs.shipmentId) {
    const shipment = buildExistingShipmentSummary(existingRefs);

    return {
      created: false,
      alreadyExists: true,
      shipment,
      shippingPatch: buildShipmentPatch(shipping, { shipment }),
    };
  }

  const recovered = await recoverExistingShiprocketShipmentSafely(order, shipping);
  if (recovered?.shipment) {
    return {
      created: false,
      alreadyExists: true,
      shipment: recovered.shipment,
      assigned: recovered.assigned || null,
      pickup: recovered.pickup || null,
      manifest: recovered.manifest || null,
      shippingPatch: buildShipmentPatch(shipping, recovered),
    };
  }

  const input = await buildCreateOrderInput(order, { notes });

  try {
    const shipment = await shiprocketService.createOrder(input);
    logShiprocket(`Shiprocket order synced for ${order?.number || order?.id}`, shipment?.summary || null);

    return {
      created: true,
      alreadyExists: false,
      shipment,
      shippingPatch: buildShipmentPatch(shipping, { shipment }),
    };
  } catch (error) {
    const recoveredAfterFailure = await recoverExistingShiprocketShipmentSafely(
      order,
      shipping,
      "after-create-failure",
    );

    if (recoveredAfterFailure?.shipment) {
      logShiprocket(
        `Recovered Shiprocket order after create failure for ${order?.number || order?.id}`,
        recoveredAfterFailure.shipment?.summary || null,
      );

      return {
        created: false,
        alreadyExists: true,
        shipment: recoveredAfterFailure.shipment,
        assigned: recoveredAfterFailure.assigned || null,
        pickup: recoveredAfterFailure.pickup || null,
        manifest: recoveredAfterFailure.manifest || null,
        shippingPatch: buildShipmentPatch(shipping, recoveredAfterFailure),
      };
    }

    const shipment = hasExistingRefs ? buildExistingShipmentSummary(existingRefs) : null;
    throw withShippingPatch(error, buildShipmentPatch(shipping, { shipment }));
  }
};

const createShiprocketShipmentForOrder = async (order, { allowExisting = false } = {}) => {
  shiprocketService.validateRequiredConfig();
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const existingRefs = getExistingShiprocketRefs(shipping);

  if (hasAssignedAwb(shipping) && !allowExisting) {
    return {
      created: false,
      alreadyExists: true,
      shipment: {
        summary: {
          shiprocketOrderId: existingRefs.shiprocketOrderId || null,
          shipmentId: existingRefs.shipmentId || null,
          awbCode: existingRefs.awbCode || null,
          status: existingRefs.shiprocketStatus || "AWB Assigned",
        },
      },
      shippingPatch: buildShipmentPatch(shipping, {}),
    };
  }

  if (!shouldCreateShipmentForOrder(order) && !allowExisting) {
    throw createAppError(
      "This order is not ready for shipment yet. Create the shipment after payment success or for a COD order.",
      400,
    );
  }

  const input = await buildCreateOrderInput(order);
  let shipment = existingRefs.shipmentId
    ? {
        summary: {
          shiprocketOrderId: existingRefs.shiprocketOrderId || null,
          shipmentId: existingRefs.shipmentId || null,
          awbCode: existingRefs.awbCode || null,
          status: existingRefs.shiprocketStatus || "NEW",
        },
        raw: null,
      }
    : null;
  let courier = null;
  let assigned = null;
  let pickup = null;
  let manifest = null;
  let tracking = null;
  let partialPatch = buildShipmentPatch(shipping, { shipment });

  try {
    if (!shipment && !existingRefs.shiprocketOrderId) {
      const recovered = await recoverExistingShiprocketShipmentSafely(order, shipping);
      if (recovered?.shipment) {
        shipment = recovered.shipment;
        assigned = recovered.assigned;
        pickup = recovered.pickup;
        manifest = recovered.manifest;
        partialPatch = buildShipmentPatch(shipping, {
          shipment,
          assigned,
          pickup,
          manifest,
        });
      }
    }

    if (!shipment) {
      shipment = await shiprocketService.createOrder(input);
      logShiprocket(`Order created for ${order?.number || order?.id}`, shipment?.summary || null);
      partialPatch = buildShipmentPatch(shipping, { shipment });
    } else {
      logShiprocket(`Resuming existing Shiprocket shipment for ${order?.number || order?.id}`, {
        shiprocketOrderId: existingRefs.shiprocketOrderId || null,
        shipmentId: existingRefs.shipmentId || null,
      });
    }

    const shipmentId = String(shipment?.summary?.shipmentId || "").trim();
    if (!shipmentId) {
      throw createAppError(
        "Shiprocket created the order but did not return a shipment ID.",
        502,
        shipment?.raw || shipment,
      );
    }

    const declaredValue = input.items.reduce(
      (sum, item) => sum + toMoney(item.price, 0) * Math.max(1, Number(item.quantity || 1)),
      0,
    );

    const serviceability = await shiprocketService.checkServiceability({
      pickupPostcode: env.shiprocketPickupPincode,
      deliveryPostcode: input.customer.pincode,
      weight: input.package.weight,
      cod: input.paymentMethod === "COD" ? 1 : 0,
      length: input.package.length,
      breadth: input.package.breadth,
      height: input.package.height,
      declaredValue,
    });

    const courierOptions = extractCourierOptions(serviceability).map(summarizeCourier);
    logShiprocket(`Courier options for ${order?.number || order?.id}`, courierOptions);

    courier = chooseBestCourier(serviceability);
    logShiprocket(`Selected courier for ${order?.number || order?.id}`, summarizeCourier(courier));

    if (existingRefs.awbCode) {
      assigned = {
        summary: {
          shiprocketOrderId:
            shipment?.summary?.shiprocketOrderId || existingRefs.shiprocketOrderId || null,
          shipmentId,
          awbCode: existingRefs.awbCode,
          courierName: existingRefs.courierName || courier?.courier_name || null,
          courierCompanyId: courier?.courier_company_id || null,
          status: existingRefs.shiprocketStatus || "AWB Assigned",
        },
        raw: null,
      };
      logShiprocket(`Skipping AWB generation for ${order?.number || order?.id}; AWB already exists`, {
        awbCode: existingRefs.awbCode,
      });
    } else {
      assigned = await shiprocketService.assignAwb({
        shipmentId,
        courierId: courier.courier_company_id,
      });
      logShiprocket(`AWB generation result for ${order?.number || order?.id}`, assigned?.summary || null);
    }

    const pickupAlreadyRequested = Boolean(
      String(existingRefs.pickupStatus || "").trim() &&
        String(existingRefs.pickupStatus || "").trim() !== "0",
    );

    if (pickupAlreadyRequested) {
      logShiprocket(`Skipping pickup request for ${order?.number || order?.id}; pickup already exists`, {
        pickupStatus: existingRefs.pickupStatus,
      });
    } else {
      pickup = await shiprocketService.generatePickup({
        shipmentId,
      });
      logShiprocket(`Pickup generation result for ${order?.number || order?.id}`, pickup?.summary || null);
    }

    const manifestAlreadyGenerated = Boolean(existingRefs.manifestUrl);
    if (manifestAlreadyGenerated) {
      logShiprocket(`Skipping manifest generation for ${order?.number || order?.id}; manifest already exists`, {
        manifestUrl: existingRefs.manifestUrl,
      });
    } else {
      manifest = await shiprocketService.generateManifest({
        shipmentId,
      });
      logShiprocket(`Manifest generation result for ${order?.number || order?.id}`, manifest?.summary || null);
    }

    const awbCode =
      String(
        assigned?.summary?.awbCode || shipment?.summary?.awbCode || existingRefs.awbCode || "",
      ).trim() || null;

    try {
      tracking = awbCode
        ? await shiprocketService.trackShipment({ awb: awbCode })
        : await shiprocketService.trackShipment({
            orderId: String(
              assigned?.summary?.shiprocketOrderId ||
                shipment?.summary?.shiprocketOrderId ||
                existingRefs.shiprocketOrderId ||
                "",
            ).trim(),
          });
    } catch (trackingError) {
      logShiprocket(`Tracking fetch skipped for ${order?.number || order?.id}`, trackingError?.message || trackingError);
      tracking = null;
    }

    const shippingPatch = buildShipmentPatch(shipping, {
      shipment,
      assigned,
      pickup,
      manifest,
      tracking,
      courier,
    });

    return {
      created: !existingRefs.shipmentId,
      alreadyExists: false,
      shipment,
      assigned,
      pickup,
      manifest,
      tracking,
      courier,
      shippingPatch,
    };
  } catch (error) {
    partialPatch = buildShipmentPatch(shipping, {
      shipment,
      assigned,
      pickup,
      manifest,
      tracking,
      courier,
    });

    throw withShippingPatch(error, partialPatch);
  }
};

const refreshShiprocketTrackingForOrder = async (order = {}) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const refs = getExistingShiprocketRefs(shipping);
  const awb = refs.awbCode || null;
  const orderId = refs.shiprocketOrderId || null;

  if (!awb && !orderId) {
    throw createAppError(
      "This order does not have a Shiprocket AWB or Shiprocket order ID yet.",
      400,
    );
  }

  const tracking = await shiprocketService.trackShipment({ awb, orderId });

  return {
    tracking,
    shippingPatch: buildShipmentPatch(shipping, {
      tracking,
    }),
  };
};

const cancelShiprocketOrderForOrder = async (order = {}, { reason, comments } = {}) => {
  shiprocketService.validateRequiredConfig();
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const refs = getExistingShiprocketRefs(shipping);
  const shiprocketOrderId = refs.shiprocketOrderId || null;

  if (!shiprocketOrderId) {
    throw createAppError("This order does not have a Shiprocket order ID yet.", 400);
  }

  const cancellation = await shiprocketService.cancelOrder({
    orderIds: [shiprocketOrderId],
    reason,
    comments,
  });

  return {
    cancellation,
    shippingPatch: compactObject({
      ...shipping,
      shiprocketStatus: "Cancelled",
      shipmentStatus: "Cancelled",
      shipment_status: "Cancelled",
      shiprocketCancellationSync: {
        status: "SYNCED",
        shiprocketOrderId,
        reason: reason || null,
        comments: comments || null,
        message: cancellation?.summary?.message || cancellation?.summary?.status || null,
        syncedAt: new Date().toISOString(),
      },
      shiprocketLastSyncedAt: new Date().toISOString(),
      shiprocketProvisioningError: null,
      source: "SHIPROCKET",
    }),
  };
};

module.exports = {
  hasExistingShipment,
  isCodOrder,
  shouldCreateShipmentForOrder,
  ensureShiprocketOrderForOrder,
  createShiprocketShipmentForOrder,
  refreshShiprocketTrackingForOrder,
  cancelShiprocketOrderForOrder,
};
