const { DiscountType } = require('@prisma/client');

const roundMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
};

const toMoney = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return roundMoney(number);
};

const normalizeDiscountCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase();

const isDiscountLive = (discount, now = new Date()) => {
  if (!discount?.isActive) return false;
  const startsAt = discount.startsAt ? new Date(discount.startsAt) : null;
  const endsAt = discount.endsAt ? new Date(discount.endsAt) : null;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
};

const calculateDiscountAmount = (discount, subtotal) => {
  const amountSubtotal = toMoney(subtotal, 0);
  if (!discount || amountSubtotal <= 0) return 0;

  const minSubtotal = toMoney(discount.minSubtotal, 0);
  if (minSubtotal > 0 && amountSubtotal < minSubtotal) return 0;

  const type = String(discount.type || '').toUpperCase();
  const rawValue = toMoney(discount.value, 0);
  if (rawValue <= 0) return 0;

  let amount = 0;
  if (type === DiscountType.FLAT) {
    amount = rawValue;
  } else if (type === DiscountType.PERCENTAGE) {
    amount = (amountSubtotal * rawValue) / 100;
  }

  const maxDiscount = toMoney(discount.maxDiscount, 0);
  if (maxDiscount > 0) {
    amount = Math.min(amount, maxDiscount);
  }

  return Math.max(0, Math.min(roundMoney(amount), amountSubtotal));
};

const sanitizeDiscount = (discount) => {
  if (!discount) return null;
  return {
    id: discount.id,
    code: discount.code,
    name: discount.name || null,
    description: discount.description || null,
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
    startsAt: discount.startsAt || null,
    endsAt: discount.endsAt || null,
    isActive: Boolean(discount.isActive),
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt,
  };
};

module.exports = {
  roundMoney,
  toMoney,
  normalizeDiscountCode,
  isDiscountLive,
  calculateDiscountAmount,
  sanitizeDiscount,
};
