const { OrderStatus } = require("@prisma/client");
const { z } = require("zod");

const { env } = require("../config");
const { getPrisma } = require("../db/prismaClient");
const orderShippingService = require("../services/orderShipping.service");
const { roundMoney, toMoney } = require("../utils/discounts");
const { getFastrrConfig, isFastrrConfigured, postToFastrr } = require("../utils/fastrr");
const { sendError, sendSuccess } = require("../utils/response");

const DEFAULT_SIZE_TOKENS = new Set(["default", "default title", "title"]);

const shippingSchema = z
  .object({
    fullName: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().min(1),
    address: z.string().trim().min(1),
    city: z.string().trim().min(1),
    postalCode: z.string().trim().min(1),
  })
  .passthrough();

const numericVariantIdSchema = z
  .union([
    z.number().int().positive(),
    z.string().trim().regex(/^\d+$/, "Variant ID must be provided as a numerical value."),
  ])
  .transform((value) => String(value).trim());

const orderItemSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform((value) => String(value ?? "").trim())
    .refine(Boolean, "Variant ID is required."),
  sku: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
  currency: z.string().trim().optional().nullable(),
  quantity: z.number().int().min(1),
  size: z.string().trim().optional().nullable(),
});

const checkoutTotalsSchema = z.object({
  subtotal: z.number().nonnegative(),
  shippingFee: z.number().nonnegative().optional(),
  paymentFee: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
  discountCode: z.string().trim().nullable().optional(),
  total: z.number().nonnegative(),
  currency: z.string().trim().optional(),
});

const createCheckoutSessionSchema = z.object({
  redirectUrl: z.string().trim().url().optional(),
  order: z.object({
    paymentMethod: z.string().trim().optional().nullable(),
    totals: checkoutTotalsSchema,
    shipping: shippingSchema,
    items: z.array(orderItemSchema).min(1),
  }),
});

const lookupCheckoutStatusSchema = z.object({
  orderId: z.string().trim().min(1),
  refresh: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") return value;
      if (value === undefined) return true;
      return !["0", "false", "no"].includes(String(value).trim().toLowerCase());
    }),
});

const orderWebhookSchema = z.object({
  order_id: z.string().trim().min(1),
  cart_data: z
    .object({
      items: z
        .array(
          z.object({
            variant_id: numericVariantIdSchema,
            quantity: z.number().int().min(1),
          }),
        )
        .optional(),
    })
    .optional(),
  status: z.string().trim().optional().nullable(),
  payment_type: z.string().trim().optional().nullable(),
  payment_status: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  shipping_plan: z.string().trim().optional().nullable(),
  redirect_url: z.string().trim().optional().nullable(),
  rto_prediction: z.string().trim().optional().nullable(),
  edd: z.string().trim().optional().nullable(),
  coupon_codes: z.array(z.string()).optional().nullable(),
  coupon_discount: z.number().optional().nullable(),
  prepaid_discount: z.number().optional().nullable(),
  total_discount: z.number().optional().nullable(),
  cod_charges: z.number().optional().nullable(),
  subtotal_price: z.number().optional().nullable(),
  total_amount_payable: z.number().optional().nullable(),
  platform_order_id: z.string().trim().optional().nullable(),
  source: z.string().trim().optional().nullable(),
  shipping_address: z.record(z.any()).optional().nullable(),
  billing_address: z.record(z.any()).optional().nullable(),
});

const sanitizeOrder = (order) => {
  if (!order) return null;
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totals: order.totals,
    shipping: order.shipping,
    items: order.items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    userId: order.userId,
  };
};

const normalizeToken = (value) => String(value ?? "").trim().toLowerCase();

const normalizePage = (value) => {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page <= 1) return 0;
  return page - 1;
};

const createOrderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}`;

const getDisplaySize = (variant) => {
  const optionValues =
    variant?.optionValues && typeof variant.optionValues === "object"
      ? variant.optionValues
      : {};

  for (const [key, value] of Object.entries(optionValues)) {
    if (normalizeToken(key).includes("size")) {
      const candidate = String(value ?? "").trim();
      if (candidate && !DEFAULT_SIZE_TOKENS.has(normalizeToken(candidate))) {
        return candidate;
      }
    }
  }

  const title = String(variant?.title || "").trim();
  if (title && !DEFAULT_SIZE_TOKENS.has(normalizeToken(title))) {
    return title;
  }

  return null;
};

const getRedirectUrl = (req, payload) => {
  const configured = payload?.redirectUrl || getFastrrConfig().redirectUrl || env.frontendUrl;
  const fallbackOrigin = String(req.headers.origin || "").trim();
  const base = String(configured || fallbackOrigin || "").trim().replace(/\/+$/, "");
  if (!base) {
    const error = new Error(
      "Unable to determine the Shiprocket return URL. Configure FRONTEND_URL or SHIPROCKET_FASTRR_REDIRECT_URL.",
    );
    error.status = 500;
    throw error;
  }

  const redirectTarget = base.includes("/checkout/payment")
    ? base
    : `${base}/checkout/payment`;

  const parsed = new URL(redirectTarget);
  parsed.searchParams.set("shiprocket", "1");
  return parsed.toString();
};

const normalizeExternalVariantId = (value) => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : "";
};

const toExternalVariantBigInt = (value) => {
  const normalized = normalizeExternalVariantId(value);
  return normalized ? BigInt(normalized) : null;
};

const toExternalVariantNumber = (value, context = "Variant ID") => {
  const normalized = normalizeExternalVariantId(
    typeof value === "bigint" ? value.toString() : value,
  );
  if (!normalized) {
    const error = new Error(`${context} must be provided as a numerical value.`);
    error.status = 400;
    throw error;
  }

  const numericValue = Number(normalized);
  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    const error = new Error(`${context} must be a safe positive integer.`);
    error.status = 500;
    throw error;
  }

  return numericValue;
};

const resolveCheckoutItemsForFastrr = async (prisma, items = []) => {
  const requestedItems = Array.isArray(items) ? items : [];
  if (!requestedItems.length) return [];

  const internalVariantIds = [];
  const externalVariantIds = [];

  requestedItems.forEach((item) => {
    const rawId = String(item?.id ?? "").trim();
    if (!rawId) return;

    const externalVariantId = toExternalVariantBigInt(rawId);
    if (externalVariantId !== null) {
      externalVariantIds.push(externalVariantId);
      return;
    }

    internalVariantIds.push(rawId);
  });

  const variantLookupFilters = [];
  if (internalVariantIds.length) {
    variantLookupFilters.push({ id: { in: internalVariantIds } });
  }
  if (externalVariantIds.length) {
    variantLookupFilters.push({ externalNumericId: { in: externalVariantIds } });
  }

  const variants = variantLookupFilters.length
    ? await prisma.productVariant.findMany({
        where: {
          OR: variantLookupFilters,
        },
        select: {
          id: true,
          externalNumericId: true,
        },
      })
    : [];

  const variantsByInternalId = new Map(variants.map((variant) => [variant.id, variant]));
  const variantsByExternalId = new Map(
    variants.map((variant) => [variant.externalNumericId.toString(), variant]),
  );

  return requestedItems.map((item, index) => {
    const rawId = String(item?.id ?? "").trim();
    const normalizedExternalVariantId = normalizeExternalVariantId(rawId);
    const variant =
      variantsByInternalId.get(rawId) ||
      (normalizedExternalVariantId
        ? variantsByExternalId.get(normalizedExternalVariantId)
        : null);

    if (!variant) {
      const error = new Error(`Unable to resolve Variant ID for item ${index + 1}.`);
      error.status = 400;
      throw error;
    }

    return {
      ...item,
      id: variant.id,
      externalVariantId: toExternalVariantNumber(
        variant.externalNumericId,
        `Variant ID for item ${index + 1}`,
      ),
    };
  });
};

const buildFastrrProductPayload = (product) => {
  const productImage = product?.media?.[0]?.url || null;

  return {
    id: product.id,
    title: product.title,
    body_html: product.descriptionHtml || "",
    vendor: product.vendor || "",
    product_type: product.productType || "",
    created_at: product.createdAt,
    handle: product.handle,
    updated_at: product.updatedAt,
    tags: Array.isArray(product.tags) ? product.tags.join(", ") : "",
    status: String(product.status || "DRAFT").toLowerCase(),
    variants: (Array.isArray(product.variants) ? product.variants : []).map((variant) => ({
      id: toExternalVariantNumber(
        variant.externalNumericId,
        `Variant ID for ${variant.title || product.title || "product variant"}`,
      ),
      title: variant.title || product.title,
      price: String(toMoney(variant.price, 0).toFixed(2)),
      sku: variant.sku || "",
      created_at: variant.createdAt,
      updated_at: variant.updatedAt,
      taxable: variant.taxable !== false,
      image: {
        src: variant.image?.url || productImage || "",
      },
      weight: toMoney(variant.weight, 0),
      weight_unit: normalizeToken(variant.weightUnit) || "",
    })),
    image: {
      src: productImage || "",
    },
  };
};

const buildFastrrCollectionPayload = (collection) => ({
  id: collection.id,
  updated_at: collection.updatedAt,
  body_html: collection.descriptionHtml || "",
  handle: collection.handle,
  image: {
    src: collection.imageUrl || "",
  },
  title: collection.title,
  created_at: collection.createdAt,
});

const findOrderByFastrrOrderId = async (prisma, orderId, userId) =>
  prisma.order.findFirst({
    where: {
      ...(userId ? { userId } : {}),
      shipping: {
        path: ["fastrrOrderId"],
        equals: orderId,
      },
    },
  });

const deriveStatusFromFastrr = (details, existingStatus = null) => {
  const remoteStatus = String(details?.status || "").trim().toUpperCase();
  const paymentType = String(details?.payment_type || "").trim().toUpperCase();
  const paymentStatus = String(details?.payment_status || "").trim().toUpperCase();

  if (existingStatus === OrderStatus.FULFILLED) {
    return OrderStatus.FULFILLED;
  }
  if (remoteStatus === "FAILED") {
    return OrderStatus.CANCELLED;
  }
  if (remoteStatus === "SUCCESS" && paymentType === "PREPAID" && paymentStatus === "SUCCESS") {
    return OrderStatus.PAID;
  }
  if (remoteStatus === "SUCCESS" && paymentStatus === "SUCCESS") {
    return OrderStatus.PAID;
  }
  return OrderStatus.PENDING;
};

const derivePaymentMethod = (details, transactions = [], fallback = "SHIPROCKET_FASTRR") => {
  const firstPayment = (Array.isArray(transactions) ? transactions : []).find(Boolean) || null;
  if (firstPayment?.payment_method) {
    return String(firstPayment.payment_method).trim().toUpperCase();
  }

  const paymentType = String(details?.payment_type || "").trim().toUpperCase();
  if (paymentType === "CASH_ON_DELIVERY") return "COD";
  if (paymentType === "PREPAID") return "PREPAID";
  return fallback;
};

const hydrateItemsFromCartData = async (prisma, cartDataItems = [], existingItems = []) => {
  if (Array.isArray(existingItems) && existingItems.length) {
    return existingItems;
  }

  const requestedItems = Array.isArray(cartDataItems) ? cartDataItems : [];
  const variantIds = requestedItems
    .map((item) => normalizeExternalVariantId(item?.variant_id))
    .filter(Boolean);

  if (!variantIds.length) return [];

  const variants = await prisma.productVariant.findMany({
    where: { externalNumericId: { in: variantIds.map((variantId) => BigInt(variantId)) } },
    include: {
      product: {
        select: { id: true, title: true, vendor: true },
      },
    },
  });
  const variantMap = new Map(
    variants.map((variant) => [variant.externalNumericId.toString(), variant]),
  );

  return requestedItems.map((entry, index) => {
    const variantId = normalizeExternalVariantId(entry?.variant_id);
    const variant = variantMap.get(variantId);
    const quantity = Math.max(1, Number(entry?.quantity || 1));
    return {
      id: variant?.id || `line-${index + 1}`,
      externalVariantId: variantId || null,
      sku: variant?.sku || null,
      name: variant?.product?.title || variant?.title || `Item ${index + 1}`,
      price: toMoney(variant?.price, 0),
      currency: "INR",
      quantity,
      size: getDisplaySize(variant),
      vendor: variant?.product?.vendor || "",
    };
  });
};

const mergeShippingDetails = (existingShipping = {}, details = {}, transactions = []) => {
  const shippingAddress =
    details?.shipping_address && typeof details.shipping_address === "object"
      ? details.shipping_address
      : {};
  const billingAddress =
    details?.billing_address && typeof details.billing_address === "object"
      ? details.billing_address
      : {};
  const addressLine = [shippingAddress.line1, shippingAddress.line2].filter(Boolean).join(", ");
  const fullName = [shippingAddress.first_name, shippingAddress.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ...existingShipping,
    fullName: fullName || existingShipping.fullName || "",
    email: shippingAddress.email || details.email || existingShipping.email || "",
    phone: shippingAddress.phone || details.phone || existingShipping.phone || "",
    address: addressLine || existingShipping.address || "",
    city: shippingAddress.city || existingShipping.city || "",
    postalCode: shippingAddress.pincode || existingShipping.postalCode || "",
    state: shippingAddress.state || existingShipping.state || "",
    country: shippingAddress.country || existingShipping.country || "",
    landmark: shippingAddress.landmark || existingShipping.landmark || "",
    billingAddress:
      Object.keys(billingAddress).length > 0 ? billingAddress : existingShipping.billingAddress || null,
    redirectUrl: details.redirect_url || existingShipping.redirectUrl || "",
    estimatedDelivery: details.edd || existingShipping.estimatedDelivery || "",
    fastrrOrderId: details.order_id || existingShipping.fastrrOrderId || "",
    fastrrPlatformOrderId:
      details.platform_order_id || existingShipping.fastrrPlatformOrderId || "",
    fastrrStatus: details.status || existingShipping.fastrrStatus || "",
    fastrrSource: details.source || existingShipping.fastrrSource || "",
    fastrrShippingPlan: details.shipping_plan || existingShipping.fastrrShippingPlan || "",
    fastrrRtoPrediction:
      details.rto_prediction || existingShipping.fastrrRtoPrediction || "",
    fastrrCouponCodes:
      Array.isArray(details.coupon_codes) ? details.coupon_codes : existingShipping.fastrrCouponCodes || [],
    fastrrPayments: Array.isArray(transactions) ? transactions : existingShipping.fastrrPayments || [],
    fastrrLastSyncedAt: new Date().toISOString(),
    source: "SHIPROCKET_FASTRR",
  };
};

const mergeTotalsFromFastrr = (existingTotals = {}, details = {}, transactions = []) => {
  const payments = Array.isArray(transactions) ? transactions : [];
  const successfulPayments = payments.filter(
    (payment) => normalizeToken(payment?.payment_status) === "success",
  );
  const amountReceived = roundMoney(
    successfulPayments.reduce(
      (sum, payment) => sum + toMoney(payment?.amount_received ?? payment?.amount, 0),
      0,
    ),
  );
  const totalAmount = toMoney(
    details?.total_amount_payable ?? existingTotals.total ?? existingTotals.subtotal,
    0,
  );
  const discountAmount = toMoney(
    details?.total_discount ?? existingTotals.discountAmount,
    0,
  );
  const subtotal = toMoney(details?.subtotal_price ?? existingTotals.subtotal, 0);
  const paymentFee = toMoney(details?.cod_charges ?? existingTotals.paymentFee, 0);
  const dueOnDelivery = Math.max(totalAmount - amountReceived, 0);
  const confirmedPayment = successfulPayments[0] || null;

  return {
    ...existingTotals,
    subtotal,
    shippingFee: toMoney(existingTotals.shippingFee, 0),
    paymentFee,
    discountAmount,
    discountCode: existingTotals.discountCode || null,
    total: totalAmount,
    currency: String(existingTotals.currency || "INR").trim().toUpperCase() || "INR",
    paidAmount: amountReceived,
    payableNow: amountReceived,
    dueOnDelivery,
    paymentConfirmedAt:
      confirmedPayment?.created_at || existingTotals.paymentConfirmedAt || null,
    fastrrStatus: details?.status || existingTotals.fastrrStatus || "",
    fastrrPaymentStatus: details?.payment_status || existingTotals.fastrrPaymentStatus || "",
    fastrrPaymentType: details?.payment_type || existingTotals.fastrrPaymentType || "",
    fastrrCouponDiscount: toMoney(
      details?.coupon_discount ?? existingTotals.fastrrCouponDiscount,
      0,
    ),
    fastrrPrepaidDiscount: toMoney(
      details?.prepaid_discount ?? existingTotals.fastrrPrepaidDiscount,
      0,
    ),
    fastrrLastSyncedAt: new Date().toISOString(),
  };
};

const syncFastrrOrder = async (prisma, order) => {
  const existingShipping =
    order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const orderId = String(existingShipping?.fastrrOrderId || "").trim();

  if (!orderId || !isFastrrConfigured()) {
    return order;
  }

  const timestamp = new Date().toISOString();
  const detailsResponse = await postToFastrr("/api/v1/custom-platform-order/details", {
    order_id: orderId,
    timestamp,
  });
  let payments = [];

  try {
    const transactionsResponse = await postToFastrr(
      "/api/v1/custom-platform-order/details/transactions",
      {
        order_id: orderId,
        timestamp,
      },
    );
    payments = Array.isArray(transactionsResponse?.result?.payments)
      ? transactionsResponse.result.payments
      : [];
  } catch {
    payments = Array.isArray(existingShipping?.fastrrPayments)
      ? existingShipping.fastrrPayments
      : [];
  }

  const details = detailsResponse?.result || {};
  const nextShipping = mergeShippingDetails(existingShipping, details, payments);
  const nextTotals = mergeTotalsFromFastrr(order?.totals || {}, details, payments);
  const nextStatus = deriveStatusFromFastrr(details, order?.status);
  const nextPaymentMethod = derivePaymentMethod(details, payments, order?.paymentMethod);

  let updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      paymentMethod: nextPaymentMethod,
      shipping: nextShipping,
      totals: nextTotals,
    },
  });

  if (orderShippingService.shouldCreateShipmentForOrder(updated)) {
    try {
      const shipment = await orderShippingService.createShiprocketShipmentForOrder(updated);
      if (shipment?.shippingPatch) {
        updated = await prisma.order.update({
          where: { id: order.id },
          data: {
            shipping: shipment.shippingPatch,
          },
        });
      }
    } catch (error) {
      console.error(
        `[Shiprocket] Unable to provision shipment for Fastrr order ${updated?.number || updated?.id}:`,
        error?.message || error,
      );
    }
  }

  return updated;
};

exports.getFastrrPublicConfig = async (_req, res) => {
  const config = getFastrrConfig();
  return sendSuccess(res, {
    configured: isFastrrConfigured(),
    environment: config.environment,
    scriptUrl: config.scriptUrl,
    styleUrl: config.styleUrl,
  });
};

exports.listCatalogProducts = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const page = normalizePage(req.query?.page);
    const limit = Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 12, 1), 100);
    const skip = page * limit;
    const where = { status: "ACTIVE" };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          descriptionHtml: true,
          vendor: true,
          productType: true,
          createdAt: true,
          handle: true,
          updatedAt: true,
          tags: true,
          status: true,
          media: {
            where: { type: "IMAGE" },
            select: { url: true },
            orderBy: { position: "asc" },
            take: 1,
          },
          variants: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              externalNumericId: true,
              title: true,
              price: true,
              sku: true,
              createdAt: true,
              updatedAt: true,
              taxable: true,
              weight: true,
              weightUnit: true,
              image: { select: { url: true } },
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return res.status(200).json({
      data: {
        total,
        products: products.map(buildFastrrProductPayload),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.listCollectionProducts = async (req, res, next) => {
  try {
    const collectionId = String(req.query?.collection_id || "").trim();
    if (!collectionId) {
      return sendError(res, 400, "collection_id is required.");
    }

    const prisma = await getPrisma();
    const page = normalizePage(req.query?.page);
    const limit = Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 12, 1), 100);
    const skip = page * limit;
    const where = {
      status: "ACTIVE",
      collections: {
        some: { collectionId },
      },
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          descriptionHtml: true,
          vendor: true,
          productType: true,
          createdAt: true,
          handle: true,
          updatedAt: true,
          tags: true,
          status: true,
          media: {
            where: { type: "IMAGE" },
            select: { url: true },
            orderBy: { position: "asc" },
            take: 1,
          },
          variants: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              externalNumericId: true,
              title: true,
              price: true,
              sku: true,
              createdAt: true,
              updatedAt: true,
              taxable: true,
              weight: true,
              weightUnit: true,
              image: { select: { url: true } },
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return res.status(200).json({
      data: {
        total,
        products: products.map(buildFastrrProductPayload),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.listCollections = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const page = normalizePage(req.query?.page);
    const limit = Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 12, 1), 100);
    const skip = page * limit;

    const [collections, total] = await Promise.all([
      prisma.collection.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          handle: true,
          descriptionHtml: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.collection.count(),
    ]);

    return res.status(200).json({
      data: {
        total,
        collections: collections.map(buildFastrrCollectionPayload),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.createCheckoutSession = async (req, res, next) => {
  try {
    if (!isFastrrConfigured()) {
      return sendError(
        res,
        500,
        "Shiprocket Fastrr is not configured on the server.",
      );
    }

    const payload = createCheckoutSessionSchema.parse(req.body || {});
    const prisma = await getPrisma();
    const resolvedItems = await resolveCheckoutItemsForFastrr(prisma, payload.order.items);
    const redirectUrl = getRedirectUrl(req, payload);
    const fastrrPayload = {
      cart_data: {
        items: resolvedItems.map((item) => ({
          variant_id: item.externalVariantId,
          quantity: Number(item.quantity || 1),
        })),
      },
      redirect_url: redirectUrl,
      timestamp: new Date().toISOString(),
    };

    const session = await postToFastrr("/api/v1/access-token/checkout", fastrrPayload);
    const externalOrderId = String(session?.result?.data?.order_id || "").trim();

    if (!externalOrderId) {
      return sendError(res, 502, "Shiprocket did not return an order ID.");
    }

    const existing = await findOrderByFastrrOrderId(prisma, externalOrderId, req.user.id);
    const normalizedTotals = {
      subtotal: roundMoney(toMoney(payload.order.totals.subtotal, 0)),
      shippingFee: roundMoney(toMoney(payload.order.totals.shippingFee, 0)),
      paymentFee: roundMoney(toMoney(payload.order.totals.paymentFee, 0)),
      discountAmount: roundMoney(toMoney(payload.order.totals.discountAmount, 0)),
      discountCode: payload.order.totals.discountCode || null,
      total: roundMoney(toMoney(payload.order.totals.total, 0)),
      currency:
        String(payload.order.totals.currency || "INR").trim().toUpperCase() || "INR",
      paidAmount: 0,
      payableNow: 0,
      dueOnDelivery: roundMoney(toMoney(payload.order.totals.total, 0)),
      fastrrStatus: "INITIATED",
    };
    const normalizedShipping = {
      ...(payload.order.shipping || {}),
      fastrrOrderId: externalOrderId,
      fastrrStatus: "INITIATED",
      redirectUrl,
      source: "SHIPROCKET_FASTRR",
      preferredPaymentMethod: payload.order.paymentMethod || null,
      fastrrCheckoutCreatedAt: new Date().toISOString(),
    };

    const order = existing
      ? await prisma.order.update({
          where: { id: existing.id },
          data: {
            status: OrderStatus.PENDING,
            paymentMethod: "SHIPROCKET_FASTRR",
            totals: normalizedTotals,
            shipping: normalizedShipping,
            items: resolvedItems,
          },
        })
      : await prisma.order.create({
          data: {
            number: createOrderNumber(),
            userId: req.user.id,
            status: OrderStatus.PENDING,
            paymentMethod: "SHIPROCKET_FASTRR",
            totals: normalizedTotals,
            shipping: normalizedShipping,
            items: resolvedItems,
          },
        });

    return sendSuccess(res, {
      token: session?.result?.token || null,
      expiresAt: session?.result?.expires_at || null,
      externalOrderId,
      redirectUrl,
      localOrder: sanitizeOrder(order),
      scriptUrl: getFastrrConfig().scriptUrl,
      styleUrl: getFastrrConfig().styleUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload.");
    }
    if (error?.status) {
      return sendError(
        res,
        error.status,
        error.message || "Unable to create Shiprocket checkout session.",
        error.payload || null,
      );
    }
    return next(error);
  }
};

exports.getCheckoutStatus = async (req, res, next) => {
  try {
    const payload = lookupCheckoutStatusSchema.parse({
      orderId: req.query?.orderId || req.query?.oid,
      refresh: req.query?.refresh,
    });
    const prisma = await getPrisma();
    const order = await findOrderByFastrrOrderId(prisma, payload.orderId, req.user.id);

    if (!order) {
      return sendError(res, 404, "No Shiprocket checkout order found for this account.");
    }

    const synced = payload.refresh ? await syncFastrrOrder(prisma, order) : order;
    return sendSuccess(res, sanitizeOrder(synced));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid request.");
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Unable to fetch order status.");
    }
    return next(error);
  }
};

exports.handleOrderWebhook = async (req, res, next) => {
  try {
    const payload = orderWebhookSchema.parse(req.body || {});
    const prisma = await getPrisma();
    const externalOrderId = payload.order_id;
    const existing = await findOrderByFastrrOrderId(prisma, externalOrderId, null);
    const existingItems = Array.isArray(existing?.items) ? existing.items : [];
    const hydratedItems = await hydrateItemsFromCartData(
      prisma,
      payload?.cart_data?.items || [],
      existingItems,
    );

    const detailsLikePayload = {
      ...payload,
      order_id: externalOrderId,
    };
    const nextStatus = deriveStatusFromFastrr(detailsLikePayload, existing?.status);
    const nextShipping = mergeShippingDetails(existing?.shipping || {}, detailsLikePayload, []);
    const nextTotals = mergeTotalsFromFastrr(existing?.totals || {}, detailsLikePayload, []);
    const nextPaymentMethod = derivePaymentMethod(detailsLikePayload, [], existing?.paymentMethod);

    let order = null;

    if (existing) {
      order = await prisma.order.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          paymentMethod: nextPaymentMethod,
          shipping: nextShipping,
          totals: nextTotals,
          items: hydratedItems.length ? hydratedItems : existing.items,
        },
      });
    } else {
      order = await prisma.order.create({
        data: {
          number: createOrderNumber(),
          status: nextStatus,
          paymentMethod: nextPaymentMethod,
          totals: nextTotals,
          shipping: nextShipping,
          items: hydratedItems,
        },
      });
    }

    if (orderShippingService.shouldCreateShipmentForOrder(order)) {
      try {
        const shipment = await orderShippingService.createShiprocketShipmentForOrder(order);
        if (shipment?.shippingPatch) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              shipping: shipment.shippingPatch,
            },
          });
        }
      } catch (error) {
        console.error(
          `[Shiprocket] Unable to provision shipment from Fastrr webhook for ${order?.number || order?.id}:`,
          error?.message || error,
        );
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(200).json({
        ok: false,
        message: error.errors[0]?.message || "Invalid webhook payload.",
      });
    }
    return next(error);
  }
};
