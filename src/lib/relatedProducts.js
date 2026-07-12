import { toProductCard } from './api';

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const buildProductSearchText = (product) =>
  normalizeText([
    product?.title,
    product?.vendor,
    product?.productType,
    ...(Array.isArray(product?.tags) ? product.tags : []),
    ...(Array.isArray(product?.collections)
      ? product.collections.flatMap((collection) => [collection?.handle, collection?.title])
      : []),
  ].join(' '));

const scoreProduct = (product, match = {}) => {
  const text = buildProductSearchText(product);
  const tokens = Array.isArray(match?.tokens) ? match.tokens : [];
  const normalizedTokens = tokens.map(normalizeText).filter(Boolean);
  const tokenHits = normalizedTokens.reduce(
    (count, token) => (text.includes(token) ? count + 1 : count),
    0,
  );

  if (Number.isFinite(match?.maxPrice) && Number(product?.price) > match.maxPrice) {
    return tokenHits ? tokenHits : -1;
  }

  return tokenHits + (product?.availableForSale ? 1 : 0);
};

export const selectRelatedProducts = (products, match = {}, limit = 6) => {
  const items = Array.isArray(products) ? products : [];
  if (!items.length) return [];

  const scored = items
    .map((product) => ({
      product,
      score: scoreProduct(product, match),
      price: Number(product?.price) || 0,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.price - right.price;
    });

  const strictBudgetMatches = Number.isFinite(match?.maxPrice)
    ? scored.filter((entry) => entry.price > 0 && entry.price <= match.maxPrice && entry.score >= 0)
    : [];
  const tokenMatches = scored.filter((entry) => entry.score > 0);
  const fallback = scored.filter((entry) => entry.score >= 0);

  const pool = strictBudgetMatches.length >= limit
    ? strictBudgetMatches
    : tokenMatches.length >= limit
      ? tokenMatches
      : fallback;

  return pool.slice(0, limit).map((entry) => toProductCard(entry.product)).filter(Boolean);
};
