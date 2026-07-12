const { z } = require("zod");
const { DiscountType } = require("@prisma/client");

const { getPrisma } = require("../db/prismaClient");
const { sendSuccess, sendError } = require("../utils/response");
const {
  normalizeDiscountCode,
  toMoney,
  isDiscountLive,
  calculateDiscountAmount,
  sanitizeDiscount,
  roundMoney,
} = require("../utils/discounts");

const numericField = (schema) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }, schema);

const optionalDateField = z.union([z.string(), z.date()]).optional().nullable();

const createDiscountSchema = z
  .object({
    code: z.string().trim().min(2).max(64),
    name: z.string().trim().max(120).optional().nullable(),
    description: z.string().trim().max(600).optional().nullable(),
    type: z.nativeEnum(DiscountType),
    value: numericField(z.number().positive()),
    minSubtotal: numericField(z.number().nonnegative()).optional().nullable(),
    maxDiscount: numericField(z.number().positive()).optional().nullable(),
    startsAt: optionalDateField,
    endsAt: optionalDateField,
    isActive: z.boolean().optional(),
  })
  .superRefine((payload, ctx) => {
    const type = String(payload.type || "").toUpperCase();
    const value = toMoney(payload.value, 0);
    if (type === DiscountType.PERCENTAGE && value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percentage discounts cannot be greater than 100.",
      });
    }
  });

const updateDiscountSchema = z
  .object({
    code: z.string().trim().min(2).max(64).optional(),
    name: z.string().trim().max(120).optional().nullable(),
    description: z.string().trim().max(600).optional().nullable(),
    type: z.nativeEnum(DiscountType).optional(),
    value: numericField(z.number().positive()).optional(),
    minSubtotal: numericField(z.number().nonnegative()).optional().nullable(),
    maxDiscount: numericField(z.number().positive()).optional().nullable(),
    startsAt: optionalDateField,
    endsAt: optionalDateField,
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "No updates provided.",
  });

const verifyDiscountSchema = z.object({
  code: z.string().trim().min(2).max(64),
  subtotal: numericField(z.number().nonnegative()),
  currency: z.string().trim().max(8).optional(),
});

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const parseDateOrNull = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} is invalid.`);
    error.status = 400;
    throw error;
  }
  return date;
};

const buildCreateData = (payload) => {
  const startsAt = parseDateOrNull(payload.startsAt, "startsAt");
  const endsAt = parseDateOrNull(payload.endsAt, "endsAt");
  if (startsAt && endsAt && startsAt > endsAt) {
    const error = new Error("endsAt must be after startsAt.");
    error.status = 400;
    throw error;
  }

  const type = String(payload.type || "").toUpperCase();
  const value = toMoney(payload.value, 0);
  const minSubtotal =
    payload.minSubtotal === undefined || payload.minSubtotal === null
      ? null
      : toMoney(payload.minSubtotal, 0);
  const maxDiscount =
    payload.maxDiscount === undefined || payload.maxDiscount === null
      ? null
      : toMoney(payload.maxDiscount, 0);

  return {
    code: normalizeDiscountCode(payload.code),
    name: payload.name ? String(payload.name).trim() : null,
    description: payload.description ? String(payload.description).trim() : null,
    type,
    value,
    minSubtotal,
    maxDiscount: type === DiscountType.FLAT ? null : maxDiscount,
    startsAt,
    endsAt,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  };
};

const buildUpdateData = (payload, existing) => {
  const type = String(payload.type || existing.type || "").toUpperCase();
  const value = hasOwn(payload, "value")
    ? toMoney(payload.value, 0)
    : toMoney(existing.value, 0);
  if (type === DiscountType.PERCENTAGE && value > 100) {
    const error = new Error("Percentage discounts cannot be greater than 100.");
    error.status = 400;
    throw error;
  }

  const startsAt = hasOwn(payload, "startsAt")
    ? parseDateOrNull(payload.startsAt, "startsAt")
    : existing.startsAt || null;
  const endsAt = hasOwn(payload, "endsAt")
    ? parseDateOrNull(payload.endsAt, "endsAt")
    : existing.endsAt || null;
  if (startsAt && endsAt && startsAt > endsAt) {
    const error = new Error("endsAt must be after startsAt.");
    error.status = 400;
    throw error;
  }

  const data = {
    type,
    value,
    startsAt,
    endsAt,
  };

  if (hasOwn(payload, "code")) {
    data.code = normalizeDiscountCode(payload.code);
  }
  if (hasOwn(payload, "name")) {
    data.name = payload.name ? String(payload.name).trim() : null;
  }
  if (hasOwn(payload, "description")) {
    data.description = payload.description ? String(payload.description).trim() : null;
  }
  if (hasOwn(payload, "minSubtotal")) {
    data.minSubtotal =
      payload.minSubtotal === undefined || payload.minSubtotal === null
        ? null
        : toMoney(payload.minSubtotal, 0);
  }
  if (hasOwn(payload, "maxDiscount")) {
    data.maxDiscount =
      payload.maxDiscount === undefined || payload.maxDiscount === null
        ? null
        : toMoney(payload.maxDiscount, 0);
  }
  if (hasOwn(payload, "isActive")) {
    data.isActive = Boolean(payload.isActive);
  }

  if (type === DiscountType.FLAT) {
    data.maxDiscount = null;
  }

  return data;
};

exports.verifyDiscount = async (req, res, next) => {
  try {
    const payload = verifyDiscountSchema.parse(req.body || {});
    const prisma = await getPrisma();
    const code = normalizeDiscountCode(payload.code);

    const discount = await prisma.discount.findUnique({ where: { code } });
    if (!discount) {
      return sendError(res, 404, "Discount code not found.");
    }
    if (!isDiscountLive(discount)) {
      return sendError(res, 400, "Discount code is inactive or expired.");
    }

    const subtotal = toMoney(payload.subtotal, 0);
    const amount = calculateDiscountAmount(discount, subtotal);
    if (amount <= 0) {
      if (discount.minSubtotal) {
        return sendError(
          res,
          400,
          `Order subtotal must be at least ${toMoney(discount.minSubtotal, 0)} to use this code.`,
        );
      }
      return sendError(res, 400, "Discount is not applicable for this cart.");
    }

    return sendSuccess(res, {
      ...sanitizeDiscount(discount),
      amount,
      subtotal,
      discountedSubtotal: roundMoney(Math.max(subtotal - amount, 0)),
      currency: payload.currency || "INR",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload.");
    }
    return next(error);
  }
};

exports.listDiscounts = async (_req, res, next) => {
  try {
    const prisma = await getPrisma();
    const discounts = await prisma.discount.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return sendSuccess(res, discounts.map(sanitizeDiscount));
  } catch (error) {
    return next(error);
  }
};

exports.createDiscount = async (req, res, next) => {
  try {
    const payload = createDiscountSchema.parse(req.body || {});
    const prisma = await getPrisma();
    const data = buildCreateData(payload);
    const discount = await prisma.discount.create({ data });
    res.status(201);
    return sendSuccess(res, sanitizeDiscount(discount));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload.");
    }
    if (error?.code === "P2002") {
      return sendError(res, 409, "A discount with that code already exists.");
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Invalid payload.");
    }
    return next(error);
  }
};

exports.updateDiscount = async (req, res, next) => {
  try {
    const payload = updateDiscountSchema.parse(req.body || {});
    const prisma = await getPrisma();
    const existing = await prisma.discount.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return sendError(res, 404, "Discount not found.");
    }

    const data = buildUpdateData(payload, existing);
    const discount = await prisma.discount.update({
      where: { id: req.params.id },
      data,
    });

    return sendSuccess(res, sanitizeDiscount(discount));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || "Invalid payload.");
    }
    if (error?.code === "P2002") {
      return sendError(res, 409, "A discount with that code already exists.");
    }
    if (error?.code === "P2025") {
      return sendError(res, 404, "Discount not found.");
    }
    if (error?.status) {
      return sendError(res, error.status, error.message || "Invalid payload.");
    }
    return next(error);
  }
};

exports.deleteDiscount = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    await prisma.discount.delete({
      where: { id: req.params.id },
    });
    return sendSuccess(res, { deleted: true });
  } catch (error) {
    if (error?.code === "P2025") {
      return sendError(res, 404, "Discount not found.");
    }
    return next(error);
  }
};
