const crypto = require("node:crypto");
const { z } = require("zod");

const { getPrisma } = require("../db/prismaClient");
const { OrderStatus, OrderRequestType } = require("@prisma/client");
const { sendSuccess, sendError } = require("../utils/response");
const orderShippingService = require("../services/orderShipping.service");
const metaConversionsApiService = require("../services/metaConversionsApi.service");
const razorpayService = require("../services/razorpay.service");
const shiprocketService = require("../services/shiprocket.service");
const {
  roundMoney,
  toMoney,
  normalizeDiscountCode,
  isDiscountLive,
  calculateDiscountAmount,
} = require("../utils/discounts");

const PAYMENT_FEES = {
  COD: 0,
};

const shippingSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  trackingNumber: z.string().optional(),
  awb: z.string().optional(),
  awbCode: z.string().optional(),
  courierName: z.string().optional(),
  trackingUrl: z.string().optional(),
  shiprocketOrderId: z.string().optional(),
  estimatedDelivery: z.string().optional(),
}).passthrough();

const checkoutShippingSchema = shippingSchema.extend({
  phone: z.string().trim().min(10),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Postal code must be a valid 6-digit pincode."),
});

const discountInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    code: z.string().min(2).max(64).optional(),
  })
  .refine((value) => value.id || value.code, {
    message: "Discount id or code is required.",
  });

const createOrderSchema = z.object({
  paymentMethod: z.string().max(64).optional(),
  totals: z.object({
    subtotal: z.number().nonnegative(),
    shippingFee: z.number().nonnegative(),
    paymentFee: z.number().nonnegative().optional(),
    discountAmount: z.number().nonnegative().optional(),
    discountCode: z.string().max(64).nullable().optional(),
    total: z.number().nonnegative(),
    currency: z.string().optional(),
  }),
  shipping: shippingSchema,
  items: z
    .array(
      z.object({
        id: z.union([z.string(), z.number().int()]).optional(),
        product_id: z.number().int().positive().nullable().optional(),
        variant_id: z.number().int().positive().nullable().optional(),
        productId: z.union([z.string(), z.number().int()]).nullable().optional(),
        variantId: z.union([z.string(), z.number().int()]).nullable().optional(),
        externalProductId: z.number().int().positive().nullable().optional(),
        externalVariantId: z.number().int().positive().nullable().optional(),
        sku: z.string().optional(),
        name: z.string().min(1),
        price: z.number().nonnegative(),
        currency: z.string().optional(),
        quantity: z.number().int().min(1),
        image: z.string().optional(),
      })
    )
    .min(1),
  discount: discountInputSchema.optional().nullable(),
});

const createCheckoutOrderSchema = z.object({
  order: createOrderSchema.extend({
    shipping: checkoutShippingSchema,
  }),
  payment: z
    .object({
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1),
    })
    .optional(),
});

const updateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  shipping: shippingSchema.partial().optional(),
});

const orderActionSchema = z.object({
  items: z.array(z.string().min(1)).min(1, "Select at least one item"),
  reason: z.string().trim().min(2, "Reason is required").max(200),
  comments: z.string().trim().max(1000).optional(),
  attachments: z.array(z.string().trim().min(1)).max(6).optional(),
});

const returnExchangeSchema = orderActionSchema.extend({
  bankDetails: z
    .object({
      accountName: z.string().trim().min(1, "Account holder name is required"),
      accountNumber: z.string().trim().min(4, "Account number is required"),
      ifsc: z.string().trim().min(4, "IFSC code is required"),
      bankName: z.string().trim().min(1, "Bank name is required"),
    })
    .optional(),
  exchangePreference: z
    .object({
      productName: z.string().trim().optional(),
      productHandle: z.string().trim().optional(),
      size: z.string().trim().optional(),
      color: z.string().trim().optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .optional(),
});

const createRazorpayOrderSchema = z.object({
  amount: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  receipt: z.string().max(64).optional(),
  notes: z.record(z.string()).optional(),
  order: createOrderSchema.optional(),
}).refine((payload) => payload.amount || payload.order, {
  message: "amount or order is required",
});

const confirmRazorpayCheckoutSchema = z.object({
  payment: z.object({
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
  order: createOrderSchema,
});

const sanitizeOrder = (order) => {
  if (!order) return null;
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const metaTracking =
    shipping?.metaTracking && typeof shipping.metaTracking === "object"
      ? shipping.metaTracking
      : null;

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totals: order.totals,
    shipping,
    items: order.items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    userId: order.userId,
    metaTracking,
    metaPurchaseEventId: metaTracking?.purchaseEventId || null,
  };
};

const pickOrderItemImage = (item = {}) => {
  const direct =
    item.image ||
    item.imageUrl ||
    item.thumbnail ||
    item.featuredImage?.url ||
    "";
  if (direct) return String(direct).trim();
  if (!Array.isArray(item.images)) return "";
  const first = item.images.find(Boolean);
  if (!first) return "";
  return String(typeof first === "string" ? first : first.url || first.src || "").trim();
};

const hydrateOrderItemImages = async (prisma, order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const missingItems = items.filter((item) => !pickOrderItemImage(item));
  if (!missingItems.length) return order;

  const variantFilters = [];
  missingItems.forEach((item) => {
    const sku = String(item?.sku || "").trim();
    if (sku) variantFilters.push({ sku });

    [item?.variantId, item?.id].forEach((value) => {
      const id = String(value || "").trim();
      if (id && !/^\d+$/.test(id)) variantFilters.push({ id });
    });

    [item?.variant_id, item?.externalVariantId, item?.variantId].forEach((value) => {
      const externalNumericId = toBigIntId(value);
      if (externalNumericId) variantFilters.push({ externalNumericId });
    });
  });

  if (!variantFilters.length) return order;

  const variants = await prisma.productVariant.findMany({
    where: { OR: variantFilters },
    select: {
      id: true,
      sku: true,
      externalNumericId: true,
      image: { select: { url: true } },
      product: {
        select: {
          media: {
            where: { type: "IMAGE" },
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true },
          },
        },
      },
    },
  });

  const byKey = new Map();
  variants.forEach((variant) => {
    const image = variant.image?.url || variant.product?.media?.[0]?.url || "";
    if (!image) return;
    [variant.id, variant.sku, variant.externalNumericId?.toString()]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .forEach((key) => byKey.set(key, image));
  });

  const hydratedItems = items.map((item) => {
    if (pickOrderItemImage(item)) return item;
    const keys = [
      item?.variantId,
      item?.id,
      item?.sku,
      item?.variant_id,
      item?.externalVariantId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const image = keys.map((key) => byKey.get(key)).find(Boolean);
    return image ? { ...item, image } : item;
  });

  return { ...order, items: hydratedItems };
};

const hydrateOrderImages = async (prisma, orderOrOrders) => {
  if (Array.isArray(orderOrOrders)) {
    return Promise.all(orderOrOrders.map((order) => hydrateOrderItemImages(prisma, order)));
  }
  return hydrateOrderItemImages(prisma, orderOrOrders);
};

const sanitizeOrderRequest = (request) => {
  if (!request) return null;
  return {
    id: request.id,
    orderId: request.orderId,
    userId: request.userId,
    type: request.type,
    status: request.status,
    items: request.items,
    reason: request.reason,
    comments: request.comments,
    attachments: request.attachments,
    bankDetails: request.bankDetails,
    exchangePreference: request.exchangePreference || null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    resolvedAt: request.resolvedAt,
  };
};

const toOrderLines = (order) => {
  const source = Array.isArray(order?.items) ? order.items : [];
  return source.map((item, index) => ({
    lineId:
      String(item?.id || "").trim() ||
      String(item?.sku || "").trim() ||
      `line-${index + 1}`,
    item,
  }));
};

const getRequestedLines = (order, selectedIds = []) => {
  const lines = toOrderLines(order);
  const normalizedTargets = Array.from(
    new Set(
      (Array.isArray(selectedIds) ? selectedIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  const selected = lines.filter((line) => normalizedTargets.includes(line.lineId));
  const unknownIds = normalizedTargets.filter(
    (target) => !selected.some((line) => line.lineId === target),
  );

  return { selected, unknownIds };
};

const findMyOrder = async (prisma, userId, orderId) =>
  prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
    },
  });

const createOrderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}`;

const normalizePaymentMethod = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase();

const normalizePaymentMethodToken = (value = "") =>
  normalizePaymentMethod(value).replace(/[\s_-]+/g, "");

const isCodPaymentMethod = (value = "") => {
  const token = normalizePaymentMethodToken(value);
  return token === "COD" || token === "CASHONDELIVERY";
};

const getStoredPaymentMethod = (value = "") => {
  if (isCodPaymentMethod(value)) return "COD";
  const normalized = normalizePaymentMethod(value);
  return normalized || "PREPAID";
};

const calculateSubtotalFromItems = (items = []) =>
  roundMoney(
    (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const price = toMoney(item?.price, 0);
      const quantity = Math.max(1, Number(item?.quantity || 0));
      return sum + price * quantity;
    }, 0),
  );

const calculateShippingFee = () => 0;

const calculatePaymentFee = (paymentMethod) =>
  toMoney(PAYMENT_FEES[normalizePaymentMethod(paymentMethod)] || 0, 0);

const getPaymentBreakdown = (paymentMethod, total) => {
  const normalizedMethod = isCodPaymentMethod(paymentMethod) ? "COD" : normalizePaymentMethod(paymentMethod);
  const normalizedTotal = roundMoney(Math.max(toMoney(total, 0), 0));

  if (normalizedMethod === "COD") {
    return {
      advanceRequired: false,
      advanceAmount: 0,
      payableNow: 0,
      dueOnDelivery: normalizedTotal,
    };
  }

  return {
    advanceRequired: false,
    advanceAmount: 0,
    payableNow: normalizedTotal,
    dueOnDelivery: 0,
  };
};

const buildDiscountSnapshot = (discount, amount) => ({
  id: discount.id,
  code: discount.code,
  name: discount.name || null,
  type: discount.type,
  value: toMoney(discount.value, 0),
  minSubtotal:
    discount.minSubtotal === null || discount.minSubtotal === undefined
      ? null
      : toMoney(discount.minSubtotal, 0),
  maxDiscount:
    discount.maxDiscount === null || discount.maxDiscount === undefined
      ? null
      : toMoney(discount.maxDiscount, 0),
  amount: toMoney(amount, 0),
});

const resolveAppliedDiscount = async (prisma, discountInput, subtotal) => {
  if (!discountInput || typeof discountInput !== "object") {
    return { discountAmount: 0, discount: null };
  }

  const requestedId = String(discountInput.id || "").trim();
  const requestedCode = normalizeDiscountCode(discountInput.code);
  if (!requestedId && !requestedCode) {
    return { discountAmount: 0, discount: null };
  }

  let discount = null;
  if (requestedId) {
    discount = await prisma.discount.findUnique({ where: { id: requestedId } });
  }
  if (!discount && requestedCode) {
    discount = await prisma.discount.findUnique({ where: { code: requestedCode } });
  }

  if (!discount) {
    const error = new Error("Discount code is invalid.");
    error.status = 400;
    throw error;
  }
  if (requestedCode && requestedCode !== discount.code) {
    const error = new Error("Discount code does not match this discount.");
    error.status = 400;
    throw error;
  }
  if (!isDiscountLive(discount)) {
    const error = new Error("Discount code is inactive or expired.");
    error.status = 400;
    throw error;
  }

  const discountAmount = calculateDiscountAmount(discount, subtotal);
  if (discountAmount <= 0) {
    const minSubtotal = toMoney(discount.minSubtotal, 0);
    const error = new Error(
      minSubtotal > 0
        ? `Order subtotal must be at least ${minSubtotal} to use this code.`
        : "Discount is not applicable for this order.",
    );
    error.status = 400;
    throw error;
  }

  return {
    discountAmount,
    discount: buildDiscountSnapshot(discount, discountAmount),
  };
};

const calculateCanonicalTotals = async (prisma, payload) => {
  const subtotal = calculateSubtotalFromItems(payload.items);
  const shippingFee = calculateShippingFee(subtotal);
  const paymentFee = calculatePaymentFee(payload.paymentMethod);
  const { discountAmount, discount } = await resolveAppliedDiscount(
    prisma,
    payload.discount,
    subtotal,
  );
  const total = roundMoney(Math.max(subtotal + shippingFee + paymentFee - discountAmount, 0));

  return {
    subtotal,
    shippingFee,
    paymentFee,
    discountAmount,
    discountCode: discount?.code || null,
    total,
    ...getPaymentBreakdown(payload.paymentMethod, total),
    currency:
      String(payload?.totals?.currency || payload?.items?.[0]?.currency || "INR")
        .trim()
        .toUpperCase() || "INR",
    discount,
  };
};

const verifyRazorpaySignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature, keySecret }) => {
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(razorpaySignature || ""));

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const formatProvisioningError = (error) => {
  const message = String(error?.message || "Unable to create Shiprocket order.").trim();
  const details = error?.details;
  if (!details) return message;

  if (typeof details === "string") {
    return `${message}: ${details}`;
  }

  try {
    return `${message}: ${JSON.stringify(details)}`;
  } catch {
    return message;
  }
};

const logOrderCreationEvent = (label, payload = {}) => {
  console.info(`[Order Creation] ${label}`, payload);
};

const toPositiveInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};

const toBigIntId = (value) => {
  const numeric = toPositiveInteger(value);
  return numeric ? BigInt(numeric) : null;
};

const getVariantLookup = (item = {}) => {
  const stringIds = [
    item.variantId,
    item.variant_id,
    item.externalVariantId,
    item.id,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const numericIds = [
    item.variant_id,
    item.externalVariantId,
    item.variantId,
  ]
    .map(toBigIntId)
    .filter(Boolean);
  const sku = String(item.sku || '').trim();

  return { stringIds, numericIds, sku };
};

const findVariantForOrderItem = async (tx, item) => {
  const lookup = getVariantLookup(item);
  const or = [];

  lookup.stringIds.forEach((id) => {
    or.push({ id });
  });
  lookup.numericIds.forEach((externalNumericId) => {
    or.push({ externalNumericId });
  });
  if (lookup.sku) {
    or.push({ sku: lookup.sku });
  }

  if (!or.length) return null;

  return tx.productVariant.findFirst({
    where: { OR: or },
    select: {
      id: true,
      title: true,
      sku: true,
      trackInventory: true,
      inventoryPolicy: true,
      inventoryLevels: {
        select: {
          id: true,
          available: true,
          onHand: true,
          locationId: true,
        },
        orderBy: { updatedAt: 'asc' },
      },
    },
  });
};

const decrementInventoryForOrderItems = async (tx, items = []) => {
  const quantitiesByVariant = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const variant = await findVariantForOrderItem(tx, item);
    if (!variant || variant.trackInventory === false) continue;

    const current = quantitiesByVariant.get(variant.id) || { variant, quantity: 0 };
    current.quantity += quantity;
    quantitiesByVariant.set(variant.id, current);
  }

  for (const { variant, quantity } of quantitiesByVariant.values()) {
    let levels = Array.isArray(variant.inventoryLevels) ? [...variant.inventoryLevels] : [];

    if (!levels.length) {
      const error = new Error(`Insufficient stock for ${variant.sku || variant.title || 'selected item'}.`);
      error.status = 409;
      throw error;
    }

    const availableTotal = levels.reduce((sum, level) => sum + Math.max(0, Number(level.available || 0)), 0);
    if (availableTotal < quantity) {
      const error = new Error(`Only ${availableTotal} left for ${variant.sku || variant.title || 'selected item'}.`);
      error.status = 409;
      throw error;
    }

    let remaining = quantity;
    for (const level of levels) {
      if (remaining <= 0) break;
      const available = Number(level.available || 0);
      const decrement = Math.min(available, remaining);
      if (decrement <= 0) continue;
      remaining -= decrement;
      await tx.inventoryLevel.update({
        where: { id: level.id },
        data: {
          available: { decrement },
          onHand: { decrement },
        },
      });
    }
  }
};

const envSafeStack = (error) =>
  process.env.NODE_ENV === "production" ? undefined : error?.stack || undefined;

const buildShiprocketErrorLog = (error) => ({
  status: error?.status || null,
  message: error?.message || null,
  details: error?.details || null,
  shippingPatch: error?.shippingPatch || null,
  stack: envSafeStack(error),
});

const tryProvisionShiprocketShipment = async (prisma, order) => {
  if (!orderShippingService.shouldCreateShipmentForOrder(order)) {
    logOrderCreationEvent("Shiprocket provisioning skipped", {
      orderId: order?.id || null,
      orderNumber: order?.number || null,
      status: order?.status || null,
      paymentMethod: order?.paymentMethod || null,
    });
    return order;
  }

  try {
    logOrderCreationEvent("Shiprocket provisioning started", {
      orderId: order?.id || null,
      orderNumber: order?.number || null,
      status: order?.status || null,
      paymentMethod: order?.paymentMethod || null,
    });
    const result = await orderShippingService.ensureShiprocketOrderForOrder(order);
    if (!result?.shippingPatch) return order;

    logOrderCreationEvent("Shiprocket provisioning completed", {
      orderId: order?.id || null,
      orderNumber: order?.number || null,
      shiprocketOrderId: result?.shipment?.summary?.shiprocketOrderId || null,
      shipmentId: result?.shipment?.summary?.shipmentId || null,
      awbCode: result?.shipment?.summary?.awbCode || null,
      alreadyExists: Boolean(result?.alreadyExists),
    });

    return prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: result.shippingPatch,
      },
    });
  } catch (error) {
    const provisioningError = formatProvisioningError(error);
    console.error(
      `[Shiprocket] Unable to provision shipment for order ${order?.number || order?.id}:`,
      {
        provisioningError,
        ...buildShiprocketErrorLog(error),
      },
    );
    try {
      return await prisma.order.update({
        where: { id: order.id },
        data: {
          shipping: {
            ...(order.shipping || {}),
            ...(error?.shippingPatch && typeof error.shippingPatch === "object"
              ? error.shippingPatch
              : {}),
            shiprocketStatus: "Shipment Pending",
            shiprocketProvisioningError: provisioningError,
            shiprocketLastSyncedAt: new Date().toISOString(),
          },
        },
      });
    } catch {
      return order;
    }
  }
};

const buildOrderRequestShiprocketNotes = (request = {}) => {
  const requestType = String(request?.type || "REQUEST").toUpperCase();
  const lines = [`${requestType} REQUEST`];

  if (request?.id) lines.push(`Request ID: ${request.id}`);
  if (request?.reason) lines.push(`Reason: ${request.reason}`);

  const items = Array.isArray(request?.items) ? request.items : [];
  const itemNames = items
    .map((item) => String(item?.name || item?.title || item?.sku || item?.id || "").trim())
    .filter(Boolean);
  if (itemNames.length) lines.push(`Items: ${itemNames.join(", ")}`);

  const preference =
    request?.exchangePreference && typeof request.exchangePreference === "object"
      ? request.exchangePreference
      : null;
  if (preference) {
    const preferenceParts = [
      preference.productName ? `Product: ${preference.productName}` : "",
      preference.size ? `Size: ${preference.size}` : "",
      preference.color ? `Color: ${preference.color}` : "",
      preference.notes ? `Notes: ${preference.notes}` : "",
    ].filter(Boolean);
    if (preferenceParts.length) lines.push(`Exchange preference: ${preferenceParts.join("; ")}`);
  }

  if (request?.comments) lines.push(`Customer comments: ${request.comments}`);
  return lines.join("\n").slice(0, 900);
};

const buildRequestSyncPatch = (shipping = {}, request = {}, status, extra = {}) => ({
  ...(shipping && typeof shipping === "object" ? shipping : {}),
  shiprocketRequestSync: {
    requestId: request?.id || null,
    type: request?.type || null,
    status,
    reason: request?.reason || null,
    items: Array.isArray(request?.items)
      ? request.items.map((item) => item?.name || item?.title || item?.sku || item?.id || "Item")
      : [],
    syncedAt: new Date().toISOString(),
    ...extra,
  },
});

const syncOrderRequestWithShiprocket = async (prisma, order, request) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const hasShiprocketRefs = orderShippingService.hasExistingShipment(shipping);
  const canCreateShiprocketOrder = orderShippingService.shouldCreateShipmentForOrder(order);

  if (!hasShiprocketRefs && !canCreateShiprocketOrder) {
    const pendingPatch = buildRequestSyncPatch(shipping, request, "PENDING", {
      message:
        "No Shiprocket order is linked yet. Create/sync Shiprocket from admin when the request is reviewed.",
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { shipping: pendingPatch },
    });

    return { status: "PENDING", shippingPatch: pendingPatch };
  }

  try {
    const result = await orderShippingService.ensureShiprocketOrderForOrder(order, {
      notes: buildOrderRequestShiprocketNotes(request),
    });
    const nextShipping = {
      ...(result?.shippingPatch || shipping),
      shiprocketRequestSync: buildRequestSyncPatch(
        result?.shippingPatch || shipping,
        request,
        "SYNCED",
        {
          shiprocketOrderId: result?.shipment?.summary?.shiprocketOrderId || null,
          shipmentId: result?.shipment?.summary?.shipmentId || null,
          awbCode: result?.shipment?.summary?.awbCode || null,
          alreadyExists: Boolean(result?.alreadyExists),
        },
      ).shiprocketRequestSync,
    };

    await prisma.order.update({
      where: { id: order.id },
      data: { shipping: nextShipping },
    });

    return { status: "SYNCED", shippingPatch: nextShipping };
  } catch (error) {
    const failedPatch = buildRequestSyncPatch(shipping, request, "FAILED", {
      message: formatProvisioningError(error),
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: {
          ...failedPatch,
          ...(error?.shippingPatch && typeof error.shippingPatch === "object"
            ? error.shippingPatch
            : {}),
          shiprocketRequestSync: failedPatch.shiprocketRequestSync,
        },
      },
    });

    console.error(`[Shiprocket] Unable to sync order request ${request?.id || ""}:`, {
      ...buildShiprocketErrorLog(error),
      requestId: request?.id || null,
      orderId: order?.id || null,
    });

    return { status: "FAILED", error };
  }
};

const syncCancellationWithShiprocket = async (prisma, order, request) => {
  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const shiprocketOrderId = String(
    shipping?.shiprocketOrderId || shipping?.shiprocket_order_id || shipping?.order_id || "",
  ).trim();

  if (!shiprocketOrderId) {
    return prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: {
          ...shipping,
          shiprocketCancellationSync: {
            status: "PENDING",
            requestId: request?.id || null,
            message: "No Shiprocket order ID is linked yet.",
            syncedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  try {
    const result = await orderShippingService.cancelShiprocketOrderForOrder(order, {
      reason: request?.reason,
      comments: request?.comments,
    });

    if (!result?.shippingPatch) return order;

    return prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: {
          ...result.shippingPatch,
          shiprocketCancellationSync: {
            ...(result.shippingPatch.shiprocketCancellationSync || {}),
            requestId: request?.id || null,
          },
        },
      },
    });
  } catch (error) {
    const cancellationError = formatProvisioningError(error);
    console.error(
      `[Shiprocket] Unable to cancel Shiprocket order ${shiprocketOrderId} for ${order?.number || order?.id}:`,
      {
        cancellationError,
        ...buildShiprocketErrorLog(error),
      },
    );

    return prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: {
          ...shipping,
          ...(error?.shippingPatch && typeof error.shippingPatch === "object"
            ? error.shippingPatch
            : {}),
          shiprocketCancellationSync: {
            status: "FAILED",
            requestId: request?.id || null,
            shiprocketOrderId,
            message: cancellationError,
            syncedAt: new Date().toISOString(),
          },
          shiprocketLastSyncedAt: new Date().toISOString(),
        },
      },
    });
  }
};

const trySendMetaPurchaseEvent = async (prisma, order) => {
  try {
    const result = await metaConversionsApiService.sendPurchaseEvent(order);
    if (!result?.shippingPatch) {
      return {
        order,
        metaCapi: result || null,
      };
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: result.shippingPatch,
      },
    });

    return {
      order: updated,
      metaCapi: result,
    };
  } catch (error) {
    console.error("[Meta CAPI] Unexpected purchase send error:", error);
    return {
      order,
      metaCapi: {
        enabled: metaConversionsApiService.isMetaCapiPurchaseEnabled(),
        skipped: true,
        reason: "unexpected_error",
        eventId: metaConversionsApiService.buildMetaPurchaseEventId(order),
      },
    };
  }
};

exports.createOrder = async (req, res, next) => {
  try {
    const payload = createOrderSchema.parse(req.body);
    logOrderCreationEvent("POST /api/orders received", {
      userId: req.user?.id || null,
      paymentMethod: payload.paymentMethod || null,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      total: payload?.totals?.total ?? null,
      currency: payload?.totals?.currency || null,
    });

    const prisma = await getPrisma();
    const canonicalTotals = await calculateCanonicalTotals(prisma, payload);
    const normalizedMethod = isCodPaymentMethod(payload.paymentMethod) ? "COD" : normalizePaymentMethod(payload.paymentMethod);
    const storedPaymentMethod = getStoredPaymentMethod(payload.paymentMethod);

    const order = await prisma.$transaction(async (tx) => {
      await decrementInventoryForOrderItems(tx, payload.items);
      return tx.order.create({
        data: {
          number: createOrderNumber(),
          status: normalizedMethod === "COD" ? OrderStatus.PENDING : OrderStatus.PAID,
          paymentMethod: storedPaymentMethod,
          totals: {
            ...canonicalTotals,
            paidAmount: normalizedMethod === "COD" ? 0 : canonicalTotals.total,
            paymentConfirmedAt:
              normalizedMethod === "COD" ? null : new Date().toISOString(),
          },
          shipping: payload.shipping,
          items: payload.items,
          userId: req.user?.id,
        },
      });
    });

    logOrderCreationEvent("Order row created from /api/orders", {
      orderId: order.id,
      orderNumber: order.number,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: order?.totals?.total ?? null,
    });

    const orderWithShipment = await tryProvisionShiprocketShipment(prisma, order);
    const orderWithImages = await hydrateOrderImages(prisma, orderWithShipment);

    res.status(201);
    return sendSuccess(res, sanitizeOrder(orderWithImages));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    const message = String(error?.message || "");
    const isCancelledEnumMismatch =
      message.includes("invalid input value for enum") &&
      message.includes("CANCELLED");
    if (isCancelledEnumMismatch) {
      return sendError(
        res,
        503,
        "Order cancellation is unavailable until the database migration is applied.",
      );
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Invalid payload");
    }
    return next(error);
  }
};

exports.createRazorpayOrder = async (req, res, next) => {
  try {
    const creds = razorpayService.getRazorpayCreds();
    if (!creds) {
      return sendError(res, 500, "Razorpay is not configured.");
    }

    const payload = createRazorpayOrderSchema.parse(req.body || {});
    let amount = payload.amount;
    let currency = (payload.currency || "INR").toUpperCase();
    let canonicalTotals = null;

    if (payload.order) {
      const prisma = await getPrisma();
      canonicalTotals = await calculateCanonicalTotals(prisma, payload.order);
      amount = Math.round(toMoney(canonicalTotals.payableNow, 0) * 100);
      currency = canonicalTotals.currency || currency;
    }

    if (!amount || amount <= 0) {
      return sendError(res, 400, "Order amount must be greater than zero.");
    }

    const notes = { ...(payload.notes || {}) };
    if (canonicalTotals?.discountCode) {
      notes.discountCode = canonicalTotals.discountCode;
    }
    if (canonicalTotals?.discountAmount > 0) {
      notes.discountAmount = String(canonicalTotals.discountAmount);
    }
    if (canonicalTotals?.total > 0) {
      notes.computedTotal = String(canonicalTotals.total);
    }
    if (canonicalTotals?.advanceRequired) {
      notes.advanceAmount = String(canonicalTotals.advanceAmount);
      notes.dueOnDelivery = String(canonicalTotals.dueOnDelivery);
    }

    const razorpayResult = await razorpayService.createOrder({
      amount,
      currency,
      receipt: payload.receipt || `rcpt_${Date.now()}`,
      notes,
    });

    return sendSuccess(res, {
      keyId: razorpayResult.keyId,
      order: razorpayResult.order,
      pricing: canonicalTotals,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Invalid payload");
    }
    return next(error);
  }
};

exports.confirmRazorpayCheckout = async (req, res, next) => {
  try {
    const creds = razorpayService.getRazorpayCreds();
    if (!creds) {
      return sendError(res, 500, "Razorpay is not configured.");
    }

    const payload = confirmRazorpayCheckoutSchema.parse(req.body || {});
    const { payment, order } = payload;

    const isValid = verifyRazorpaySignature({
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpaySignature: payment.razorpaySignature,
      keySecret: creds.keySecret,
    });

    if (!isValid) {
      return sendError(res, 400, "Payment signature verification failed.");
    }

    const prisma = await getPrisma();
    const canonicalTotals = await calculateCanonicalTotals(prisma, order);
    const normalizedMethod = isCodPaymentMethod(order.paymentMethod) ? "COD" : normalizePaymentMethod(order.paymentMethod);
    const paidAmount =
      normalizedMethod === "COD" ? canonicalTotals.payableNow : canonicalTotals.total;
    const created = await prisma.$transaction(async (tx) => {
      await decrementInventoryForOrderItems(tx, order.items);
      return tx.order.create({
        data: {
          number: createOrderNumber(),
          status: normalizedMethod === "COD" ? OrderStatus.PENDING : OrderStatus.PAID,
          paymentMethod: normalizedMethod === "COD" ? "COD" : getStoredPaymentMethod(order.paymentMethod || "RAZORPAY"),
          totals: {
            ...canonicalTotals,
            paidAmount,
            paymentConfirmedAt: new Date().toISOString(),
          },
          shipping: {
            ...(order.shipping || {}),
            paymentId: payment.razorpayPaymentId,
            paymentOrderId: payment.razorpayOrderId,
            paymentGateway: "RAZORPAY",
            paymentCaptureType: normalizedMethod === "COD" ? "ADVANCE" : "FULL",
          },
          items: order.items,
          userId: req.user?.id,
        },
      });
    });
    const orderWithShipment = await tryProvisionShiprocketShipment(prisma, created);
    const orderWithImages = await hydrateOrderImages(prisma, orderWithShipment);

    return sendSuccess(res, sanitizeOrder(orderWithImages));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Invalid payload");
    }
    return next(error);
  }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    const ordersWithImages = await hydrateOrderImages(prisma, orders);
    return sendSuccess(res, ordersWithImages.map(sanitizeOrder));
  } catch (error) {
    return next(error);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const payload = orderActionSchema.parse(req.body || {});
    const prisma = await getPrisma();

    const order = await findMyOrder(prisma, req.user.id, req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }
    if (order.status === OrderStatus.CANCELLED) {
      return sendError(res, 400, "Order is already cancelled.");
    }
    if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
      return sendError(res, 400, "Only pending or paid orders can be cancelled.");
    }

    const { selected, unknownIds } = getRequestedLines(order, payload.items);
    if (unknownIds.length) {
      return sendError(res, 400, "One or more selected items do not belong to this order.");
    }

    const normalizedSelectedItems = selected.map((entry) => ({
      id: entry.lineId,
      ...entry.item,
    }));

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          shipping: {
            ...(order.shipping || {}),
            cancellation: {
              reason: payload.reason,
              comments: payload.comments || "",
              cancelledAt: new Date().toISOString(),
              cancelledByUserId: req.user.id,
            },
          },
        },
      });

      const request = await tx.orderRequest.create({
        data: {
          orderId: order.id,
          userId: req.user.id,
          type: OrderRequestType.CANCEL,
          status: "APPROVED",
          items: normalizedSelectedItems,
          reason: payload.reason,
          comments: payload.comments || null,
          attachments: payload.attachments || [],
          resolvedAt: new Date(),
        },
      });

      return { updatedOrder, request };
    });

    const updatedOrder = await syncCancellationWithShiprocket(
      prisma,
      result.updatedOrder,
      result.request,
    );

    return sendSuccess(res, {
      order: sanitizeOrder(updatedOrder),
      request: sanitizeOrderRequest(result.request),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    return next(error);
  }
};

const createOrderRequest = async (req, res, next, type) => {
  try {
    const payload = returnExchangeSchema.parse(req.body || {});
    const prisma = await getPrisma();
    const order = await findMyOrder(prisma, req.user.id, req.params.id);

    if (!order) {
      return sendError(res, 404, "Order not found");
    }
    if (order.status === OrderStatus.CANCELLED) {
      return sendError(res, 400, "Cannot create a request for a cancelled order.");
    }
    if (![OrderStatus.FULFILLED, OrderStatus.PAID, OrderStatus.PENDING].includes(order.status)) {
      return sendError(res, 400, "Return or exchange is not available for this order status.");
    }

    const { selected, unknownIds } = getRequestedLines(order, payload.items);
    if (unknownIds.length) {
      return sendError(res, 400, "One or more selected items do not belong to this order.");
    }

    const normalizedSelectedItems = selected.map((entry) => ({
      id: entry.lineId,
      ...entry.item,
    }));

    const request = await prisma.orderRequest.create({
      data: {
        orderId: order.id,
        userId: req.user.id,
        type,
        status: "REQUESTED",
        items: normalizedSelectedItems,
        reason: payload.reason,
        comments: payload.comments || null,
        attachments: payload.attachments || [],
        bankDetails: payload.bankDetails || null,
        exchangePreference: payload.exchangePreference || null,
      },
    });

    await syncOrderRequestWithShiprocket(prisma, order, request);

    return sendSuccess(res, sanitizeOrderRequest(request));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    return next(error);
  }
};

exports.createReturnRequest = async (req, res, next) =>
  createOrderRequest(req, res, next, OrderRequestType.RETURN);

exports.createExchangeRequest = async (req, res, next) =>
  createOrderRequest(req, res, next, OrderRequestType.EXCHANGE);

exports.listMyOrderRequests = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const requests = await prisma.orderRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, requests.map(sanitizeOrderRequest));
  } catch (error) {
    return next(error);
  }
};

exports.listOrders = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const take = Math.min(Number.parseInt(req.query?.limit, 10) || 50, 200);
    const pageNumber = Math.max(Number.parseInt(req.query?.page, 10) || 1, 1);
    const skip = (pageNumber - 1) * take;
    const statusToken = String(req.query?.status || "").trim().toUpperCase();
    const searchToken = String(req.query?.search || "").trim();

    const where = {};
    if (statusToken && Object.values(OrderStatus).includes(statusToken)) {
      where.status = statusToken;
    }
    if (searchToken) {
      where.OR = [
        {
          number: {
            contains: searchToken,
          },
        },
        {
          user: {
            is: {
              email: {
                contains: searchToken,
              },
            },
          },
        },
        {
          user: {
            is: {
              name: {
                contains: searchToken,
              },
            },
          },
        },
      ];
    }

    const [orders, total, totalFiltered] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          requests: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              type: true,
              status: true,
              items: true,
              reason: true,
              comments: true,
              exchangePreference: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.order.count(),
      prisma.order.count({ where }),
    ]);

    // Summary counts use full table (lightweight count queries)
    const [pending, paid, fulfilled, requestedOrderRequests] = await Promise.all([
      prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      prisma.order.count({ where: { status: OrderStatus.PAID } }),
      prisma.order.count({ where: { status: OrderStatus.FULFILLED } }),
      prisma.orderRequest.count({ where: { status: "REQUESTED" } }),
    ]);

    let cancelled = 0;
    try {
      cancelled = await prisma.order.count({ where: { status: OrderStatus.CANCELLED } });
    } catch (error) {
      const message = String(error?.message || "");
      const isEnumMismatch =
        message.includes("invalid input value for enum") &&
        message.includes("CANCELLED");
      if (!isEnumMismatch) {
        throw error;
      }
    }

    const summary = {
      total,
      filteredTotal: totalFiltered,
      pending,
      paid,
      fulfilled,
      cancelled,
      requestedOrderRequests,
      // Revenue is computed from the current page only (for true total, use a dedicated analytics endpoint)
      revenue: orders.reduce((acc, o) => acc + (Number(o.totals?.total) || 0), 0),
    };

    return sendSuccess(res, {
      items: orders.map((order) => ({
        ...sanitizeOrder(order),
        customer: order.user ? { id: order.user.id, name: order.user.name, email: order.user.email } : null,
        requests: Array.isArray(order.requests) ? order.requests : [],
      })),
      summary,
    }, { total: totalFiltered, page: pageNumber, limit: take });
  } catch (error) {
    return next(error);
  }
};

exports.updateOrder = async (req, res, next) => {
  try {
    const updates = updateOrderSchema.parse(req.body);
    if (!updates.status && !updates.shipping) {
      return sendError(res, 400, "No updates provided");
    }
    const prisma = await getPrisma();
    let nextShipping = undefined;

    if (updates.shipping) {
      const existing = await prisma.order.findUnique({
        where: { id: req.params.id },
        select: { shipping: true },
      });
      if (!existing) {
        return sendError(res, 404, "Order not found");
      }
      const currentShipping =
        existing.shipping && typeof existing.shipping === "object"
          ? existing.shipping
          : {};
      nextShipping = {
        ...currentShipping,
        ...updates.shipping,
      };
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status: updates.status,
        shipping: nextShipping,
      },
    });

    const orderWithShipment = await tryProvisionShiprocketShipment(prisma, order);
    return sendSuccess(res, sanitizeOrder(orderWithShipment));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    if (error.code === "P2025") {
      return sendError(res, 404, "Order not found");
    }
    return next(error);
  }
};

exports.createShiprocketShipment = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
    });

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    const result = await orderShippingService.createShiprocketShipmentForOrder(order);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: result.shippingPatch,
      },
    });

    return sendSuccess(
      res,
      {
        order: sanitizeOrder(updated),
        shipment: result.shipment || null,
        tracking: result.tracking || null,
        alreadyExists: Boolean(result.alreadyExists),
      },
      null,
      result.alreadyExists
        ? "Shiprocket shipment already exists for this order."
        : "Shiprocket shipment created successfully.",
    );
  } catch (error) {
    if (error?.status) {
      return sendError(res, error.status, error.message || "Unable to create Shiprocket shipment.");
    }
    return next(error);
  }
};

exports.createShiprocketOrder = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const [order, exchangeRequests] = await Promise.all([
      prisma.order.findUnique({ where: { id: req.params.id } }),
      prisma.orderRequest.findMany({
        where: { orderId: req.params.id, type: "EXCHANGE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { exchangePreference: true, reason: true },
      }),
    ]);

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    // Build exchange preference note for Shiprocket comment field
    let exchangeNotes;
    const latestExchange = exchangeRequests[0];
    if (latestExchange) {
      const pref = latestExchange.exchangePreference;
      const parts = ["EXCHANGE REQUEST"];
      if (latestExchange.reason) parts.push(`Reason: ${latestExchange.reason}`);
      if (pref && typeof pref === "object") {
        if (pref.productName) parts.push(`Wants: ${pref.productName}`);
        if (pref.size) parts.push(`Size: ${pref.size}`);
        if (pref.color) parts.push(`Color: ${pref.color}`);
        if (pref.notes) parts.push(`Notes: ${pref.notes}`);
      }
      exchangeNotes = parts.join(" | ");
    }

    const result = await orderShippingService.ensureShiprocketOrderForOrder(order, {
      notes: exchangeNotes,
    });
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: result.shippingPatch,
      },
    });

    return sendSuccess(
      res,
      {
        order: sanitizeOrder(updated),
        shipment: result.shipment || null,
        alreadyExists: Boolean(result.alreadyExists),
      },
      null,
      result.alreadyExists
        ? "Shiprocket order already exists."
        : "Shiprocket order created successfully.",
    );
  } catch (error) {
    const provisioningError = formatProvisioningError(error);
    try {
      const prisma = await getPrisma();
      const existing = await prisma.order.findUnique({
        where: { id: req.params.id },
      });
      if (existing) {
        await prisma.order.update({
          where: { id: existing.id },
          data: {
            shipping: {
              ...(existing.shipping || {}),
              ...(error?.shippingPatch && typeof error.shippingPatch === "object"
                ? error.shippingPatch
                : {}),
              shiprocketStatus: "Order Sync Failed",
              shiprocketProvisioningError: provisioningError,
              shiprocketLastSyncedAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch {
      // Keep the original Shiprocket error as the response.
    }

    if (error?.status) {
      return sendError(res, error.status, provisioningError || "Unable to create Shiprocket order.");
    }
    return next(error);
  }
};

exports.logCheckoutDebug = async (req, res) => {
  const logInfo = {
    timestamp: new Date().toISOString(),
    host: req.get('host'),
    path: req.originalUrl,
    env: process.env.NODE_ENV || 'development'
  };
  console.log(`[ROUTE LOG] POST /api/checkout-debug`, logInfo);

  const body = req.body && typeof req.body === "object" ? req.body : {};
  console.info("[Checkout Debug]", {
    stage: body.stage || "unknown",
    paymentMethod: body.paymentMethod || null,
    isAuthenticated: Boolean(body.isAuthenticated),
    hasToken: Boolean(body.hasToken),
    hasDraft: Boolean(body.hasDraft),
    itemCount: Number(body.itemCount || 0),
    total: body.total ?? null,
    details: body.details || null,
    url: body.url || null,
    userAgent: req.get("user-agent") || null,
  });

  return sendSuccess(res, { ok: true });
};

exports.createCheckoutOrder = async (req, res, next) => {
  try {
    const logInfo = {
      timestamp: new Date().toISOString(),
      host: req.get('host'),
      path: req.originalUrl,
      env: process.env.NODE_ENV || 'development'
    };
    console.log(`[ROUTE LOG] POST /api/create-order`, logInfo);

    const payload = createCheckoutOrderSchema.parse(req.body || {});
    const orderInput = payload.order;
    const normalizedMethod = normalizePaymentMethod(orderInput.paymentMethod || "PREPAID");
    logOrderCreationEvent("POST /api/create-order received", {
      userId: req.user?.id || null,
      paymentMethod: normalizedMethod,
      hasPayment: Boolean(payload.payment),
      itemCount: Array.isArray(orderInput.items) ? orderInput.items.length : 0,
      total: orderInput?.totals?.total ?? null,
      currency: orderInput?.totals?.currency || null,
    });

    if (normalizedMethod !== "COD") {
      const creds = razorpayService.getRazorpayCreds();
      if (!creds) {
        return sendError(res, 500, "Razorpay is not configured.");
      }
      if (!payload.payment) {
        return sendError(res, 400, "Razorpay payment details are required for prepaid orders.");
      }

      const isValid = verifyRazorpaySignature({
        razorpayOrderId: payload.payment.razorpayOrderId,
        razorpayPaymentId: payload.payment.razorpayPaymentId,
        razorpaySignature: payload.payment.razorpaySignature,
        keySecret: creds.keySecret,
      });

      if (!isValid) {
        return sendError(res, 400, "Payment signature verification failed.");
      }
    }

    const prisma = await getPrisma();
    const canonicalTotals = await calculateCanonicalTotals(prisma, orderInput);
    const isCod = normalizedMethod === "COD";

    const created = await prisma.$transaction(async (tx) => {
      await decrementInventoryForOrderItems(tx, orderInput.items);
      return tx.order.create({
        data: {
          number: createOrderNumber(),
          status: isCod ? OrderStatus.PENDING : OrderStatus.PAID,
          paymentMethod: isCod ? "COD" : "PREPAID",
          totals: {
            ...canonicalTotals,
            paidAmount: isCod ? 0 : canonicalTotals.total,
            paymentConfirmedAt: isCod ? null : new Date().toISOString(),
          },
          shipping: {
            ...(orderInput.shipping || {}),
            paymentGateway: isCod ? null : "RAZORPAY",
            paymentId: payload.payment?.razorpayPaymentId || null,
            paymentOrderId: payload.payment?.razorpayOrderId || null,
            paymentCaptureType: isCod ? null : "FULL",
          },
          items: orderInput.items,
          userId: req.user?.id,
        },
      });
    });

    logOrderCreationEvent("Order row created from /api/create-order", {
      orderId: created.id,
      orderNumber: created.number,
      status: created.status,
      paymentMethod: created.paymentMethod,
      total: created?.totals?.total ?? null,
    });

    const orderWithShipment = await tryProvisionShiprocketShipment(prisma, created);
    const orderWithImages = await hydrateOrderImages(prisma, orderWithShipment);
    const { order: orderWithMetaTracking, metaCapi } = await trySendMetaPurchaseEvent(
      prisma,
      orderWithImages,
    );

    return sendSuccess(
      res,
      sanitizeOrder(orderWithMetaTracking),
      {
        metaCapi: metaCapi
          ? {
              enabled: Boolean(metaCapi.enabled),
              skipped: Boolean(metaCapi.skipped),
              reason: metaCapi.reason || null,
              eventId: metaCapi.eventId || null,
            }
          : null,
      },
      "Order created successfully.",
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Unable to create order.");
    }
    return next(error);
  }
};

exports.refreshShiprocketTracking = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
    });

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    const result = await orderShippingService.refreshShiprocketTrackingForOrder(order);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        shipping: result.shippingPatch,
      },
    });

    return sendSuccess(
      res,
      {
        order: sanitizeOrder(updated),
        tracking: result.tracking,
      },
      null,
      "Shiprocket tracking refreshed successfully.",
    );
  } catch (error) {
    if (error?.status) {
      return sendError(res, error.status, error.message || "Unable to refresh Shiprocket tracking.");
    }
    return next(error);
  }
};

exports.trackShipmentByAwb = async (req, res, next) => {
  try {
    const awb = String(req.params?.awb || "").trim();
    if (!awb) {
      return sendError(res, 400, "AWB is required.");
    }

    const tracking = await shiprocketService.trackShipment({ awb });
    return sendSuccess(res, tracking);
  } catch (error) {
    if (error?.status) {
      return sendError(res, error.status, error.message || "Unable to fetch shipment tracking.");
    }
    return next(error);
  }
};

const trackSchema = z
  .object({
    orderId: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .refine((payload) => payload.email || payload.phone, {
    message: "Email or phone is required",
  });

const normalizeOrderNumber = (value = "") => {
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.startsWith("#")) return raw.slice(1);
  return raw;
};

exports.trackOrder = async (req, res, next) => {
  try {
    const payload = trackSchema.parse(req.body);
    const prisma = await getPrisma();

    const normalizedOrder = normalizeOrderNumber(payload.orderId);

    const order = await prisma.order.findFirst({
      where: {
        number: normalizedOrder,
      },
    });

    if (!order) {
      return sendError(res, 404, "No order found for those details.");
    }

    const shipping = order.shipping || {};
    const emailMatches =
      !payload.email || String(shipping.email || "").toLowerCase() === payload.email.toLowerCase();
    const phoneMatches =
      !payload.phone || String(shipping.phone || "").replace(/[^\d+]/g, "") ===
      String(payload.phone || "").replace(/[^\d+]/g, "");

    if (payload.email && !emailMatches) {
      return sendError(res, 404, "No order found for those details.");
    }
    if (payload.phone && !phoneMatches) {
      return sendError(res, 404, "No order found for those details.");
    }

    return sendSuccess(res, sanitizeOrder(order));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload");
    }
    return next(error);
  }
};
