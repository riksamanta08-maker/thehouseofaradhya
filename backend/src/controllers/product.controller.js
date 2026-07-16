const { z } = require('zod');

const { getPrisma } = require('../db/prismaClient');
const { sendSuccess, sendError } = require('../utils/response');

const MEDIA_TYPES = ['IMAGE', 'VIDEO', 'MODEL_3D', 'EXTERNAL_VIDEO'];
const INVENTORY_POLICIES = ['DENY', 'CONTINUE'];
const WEIGHT_UNITS = ['GRAMS', 'KILOGRAMS', 'OUNCES', 'POUNDS'];
const PRODUCT_STATUS = ['ACTIVE', 'DRAFT', 'ARCHIVED'];
const APPAREL_TYPES = ['TOP', 'BOTTOM', 'SHOES', 'ACCESSORY', 'OTHER'];
const METAFIELD_SETS = ['CATEGORY', 'PRODUCT'];
const HOMEPAGE_SECTION_META = {
  featured: {
    enabledKey: 'homepage_featured',
    orderKey: 'homepage_featured_order',
    titleKey: 'homepage_featured_title',
  },
  bestSeller: {
    enabledKey: 'homepage_best_seller',
    orderKey: 'homepage_best_seller_order',
    titleKey: 'homepage_best_seller_title',
  },
};

const mediaSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional().nullable(),
  type: z.enum(MEDIA_TYPES).optional(),
  position: z.number().int().optional(),
});

const optionSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
});

const metafieldSchema = z.object({
  namespace: z.string().min(1),
  key: z.string().min(1),
  type: z.string().min(1),
  value: z.any(),
  description: z.string().optional(),
  set: z.enum(METAFIELD_SETS).optional(),
});

const variantSchema = z.object({
  title: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().optional(),
  compareAtPrice: z.number().optional(),
  costPerItem: z.number().optional(),
  unitPrice: z.number().optional(),
  unitPriceMeasurement: z.any().optional(),
  taxable: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  inventoryPolicy: z.enum(INVENTORY_POLICIES).optional(),
  requiresShipping: z.boolean().optional(),
  weight: z.number().optional(),
  weightUnit: z.enum(WEIGHT_UNITS).optional(),
  originCountryCode: z.string().optional(),
  hsCode: z.string().optional(),
  optionValues: z.record(z.string()).optional(),
  imageUrl: z.string().optional(),
  inventory: z
    .object({
      location: z.string().optional(),
      available: z.number().int().optional(),
    })
    .optional(),
  metafields: z.array(metafieldSchema).optional(),
});

const productSchema = z.object({
  title: z.string().min(1),
  handle: z.string().min(1),
  descriptionHtml: z.string().optional(),
  status: z.enum(PRODUCT_STATUS).optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  category: z.string().optional(),
  categoryTaxonomyId: z.string().optional(),
  apparelType: z.enum(APPAREL_TYPES).optional(),
  templateSuffix: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  subscriptionsEnabled: z.boolean().optional(),
  publishedAt: z.coerce.date().optional(),
  collections: z.array(z.string().min(1)).optional(),
  collectionHandles: z.array(z.string().min(1)).optional(),
  media: z.array(mediaSchema).optional(),
  options: z.array(optionSchema).optional(),
  variants: z.array(variantSchema).optional(),
  metafields: z.array(metafieldSchema).optional(),
});

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const toBoolean = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return ['true', 'yes', '1', 'y'].includes(normalized);
};

const slugify = (value) => {
  if (!value) return undefined;
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const normalizeTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeMedia = (media, fallback = []) => {
  if (!media) return fallback;
  if (Array.isArray(media)) {
    return media
      .map((item, index) => {
        if (!item) return null;
        if (typeof item === 'string') {
          return { url: item, position: index };
        }
        return {
          url: item.url ?? item.src ?? item.id ?? '',
          alt: item.alt ?? item.altText ?? null,
          type: item.type && MEDIA_TYPES.includes(item.type) ? item.type : undefined,
          position: item.position ?? index,
        };
      })
      .filter((item) => item?.url);
  }
  return fallback;
};
const normalizeOptions = (options) => {
  if (!Array.isArray(options)) return undefined;
  if (options.length === 0) return [];
  const out = options
    .map((option) => {
      if (!option) return null;
      const name = String(option.name ?? '').trim();
      const values = Array.isArray(option.values)
        ? option.values.map((value) => String(value).trim()).filter(Boolean)
        : typeof option.values === 'string'
          ? option.values.split(',').map((value) => value.trim()).filter(Boolean)
          : [];
      if (!name || values.length === 0) return null;
      return { name, values };
    })
    .filter(Boolean);
  return out.length ? out : undefined;
};

const normalizeVariants = (variants) => {
  if (!Array.isArray(variants)) return undefined;
  if (variants.length === 0) return [];
  const out = variants
    .map((variant) => {
      if (!variant) return null;
      const optionValues = variant.optionValues ?? variant.options ?? {};
      const normalizedOptionValues = {};
      if (Array.isArray(optionValues)) {
        optionValues.forEach((entry) => {
          if (!entry?.name) return;
          normalizedOptionValues[String(entry.name)] = String(entry.value ?? '');
        });
      } else if (optionValues && typeof optionValues === 'object') {
        Object.entries(optionValues).forEach(([key, value]) => {
          if (!key) return;
          normalizedOptionValues[String(key)] = String(value ?? '');
        });
      }

      return {
        title: variant.title ? String(variant.title) : undefined,
        sku: variant.sku ? String(variant.sku) : undefined,
        barcode: variant.barcode ? String(variant.barcode) : undefined,
        price: toNumber(variant.price),
        compareAtPrice: toNumber(variant.compareAtPrice),
        costPerItem: toNumber(variant.costPerItem),
        unitPrice: toNumber(variant.unitPrice),
        unitPriceMeasurement: variant.unitPriceMeasurement,
        taxable: toBoolean(variant.taxable),
        trackInventory: toBoolean(variant.trackInventory),
        inventoryPolicy: (() => {
          if (!variant.inventoryPolicy) return undefined;
          const policy = String(variant.inventoryPolicy).toUpperCase();
          return INVENTORY_POLICIES.includes(policy) ? policy : undefined;
        })(),
        requiresShipping: toBoolean(variant.requiresShipping),
        weight: toNumber(variant.weight),
        weightUnit: (() => {
          if (!variant.weightUnit) return undefined;
          const unit = String(variant.weightUnit).toUpperCase();
          return WEIGHT_UNITS.includes(unit) ? unit : undefined;
        })(),
        originCountryCode: variant.originCountryCode
          ? String(variant.originCountryCode)
          : undefined,
        hsCode: variant.hsCode ? String(variant.hsCode) : undefined,
        optionValues: Object.keys(normalizedOptionValues).length
          ? normalizedOptionValues
          : undefined,
        imageUrl: variant.imageUrl ?? variant.image ?? undefined,
        inventory: variant.inventory
          ? {
            location: variant.inventory.location
              ? String(variant.inventory.location)
              : undefined,
            available: toNumber(variant.inventory.available),
          }
          : undefined,
        metafields: Array.isArray(variant.metafields)
          ? variant.metafields
            .map((field) => ({
              namespace: String(field?.namespace || ''),
              key: String(field?.key || ''),
              type: String(field?.type || ''),
              value: field?.value ?? null,
              description: field?.description,
            }))
            .filter((field) => field.namespace && field.key && field.type)
          : undefined,
      };
    })
    .filter(Boolean);
  return out.length ? out : undefined;
};

const deriveOptionsFromVariants = (variants) => {
  if (!Array.isArray(variants) || !variants.length) return undefined;
  const optionMap = new Map();
  variants.forEach((variant) => {
    const values = variant.optionValues || {};
    Object.entries(values).forEach(([name, value]) => {
      if (!name) return;
      if (!optionMap.has(name)) {
        optionMap.set(name, new Set());
      }
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        optionMap.get(name).add(String(value));
      }
    });
  });
  if (optionMap.size === 0) return undefined;
  return Array.from(optionMap.entries()).map(([name, values], index) => ({
    name,
    values: Array.from(values),
    position: index + 1,
  }));
};

const normalizeProductInput = (raw = {}, { partial = false } = {}) => {
  const normalized = { ...raw };

  if (raw.title !== undefined) normalized.title = String(raw.title).trim();
  if (raw.handle !== undefined) {
    normalized.handle = String(raw.handle).trim() || slugify(raw.title);
  } else if (!partial && raw.title) {
    normalized.handle = slugify(raw.title);
  }

  if (raw.descriptionHtml !== undefined) {
    normalized.descriptionHtml = String(raw.descriptionHtml);
  } else if (raw.description !== undefined) {
    normalized.descriptionHtml = String(raw.description);
  }

  if (raw.status !== undefined) {
    const status = String(raw.status).toUpperCase();
    if (PRODUCT_STATUS.includes(status)) normalized.status = status;
  }

  if (raw.vendor !== undefined) normalized.vendor = String(raw.vendor).trim();
  if (raw.productType !== undefined) normalized.productType = String(raw.productType).trim();
  if (raw.category !== undefined) normalized.category = String(raw.category).trim();
  if (raw.categoryTaxonomyId !== undefined) {
    normalized.categoryTaxonomyId = String(raw.categoryTaxonomyId).trim();
  }
  if (raw.apparelType !== undefined) {
    const type = String(raw.apparelType).toUpperCase();
    if (APPAREL_TYPES.includes(type)) normalized.apparelType = type;
  }
  if (raw.templateSuffix !== undefined) normalized.templateSuffix = String(raw.templateSuffix).trim();
  if (raw.subscriptionsEnabled !== undefined) {
    normalized.subscriptionsEnabled = Boolean(raw.subscriptionsEnabled);
  }
  if (raw.publishedAt !== undefined) {
    normalized.publishedAt = raw.publishedAt;
  }

  if (raw.tags !== undefined) normalized.tags = normalizeTags(raw.tags);

  if (raw.collections !== undefined) {
    normalized.collections = Array.isArray(raw.collections)
      ? raw.collections.map((id) => String(id)).filter(Boolean)
      : normalizeTags(raw.collections);
  }

  if (raw.collectionHandles !== undefined) {
    normalized.collectionHandles = Array.isArray(raw.collectionHandles)
      ? raw.collectionHandles.map((id) => String(id)).filter(Boolean)
      : normalizeTags(raw.collectionHandles);
  }

  if (raw.media !== undefined || raw.images !== undefined) {
    normalized.media = normalizeMedia(raw.media ?? raw.images);
  }

  const options = normalizeOptions(raw.options);
  if (options) normalized.options = options;

  const variants = normalizeVariants(raw.variants ?? raw.variantList);
  if (variants) normalized.variants = variants;

  if (!normalized.options && normalized.variants) {
    const derived = deriveOptionsFromVariants(normalized.variants);
    if (derived) normalized.options = derived.map(({ name, values }) => ({ name, values }));
  }

  if (Array.isArray(raw.metafields)) {
    normalized.metafields = raw.metafields
      .map((field) => ({
        namespace: String(field?.namespace || ''),
        key: String(field?.key || ''),
        type: String(field?.type || ''),
        value: field?.value ?? null,
        description: field?.description,
        set: field?.set && METAFIELD_SETS.includes(String(field.set)) ? String(field.set) : undefined,
      }))
      .filter((field) => field.namespace && field.key && field.type);
  }

  return normalized;
};

const parseProductInput = (raw, { partial = false } = {}) => {
  const normalized = normalizeProductInput(raw, { partial });
  const schema = partial ? productSchema.partial() : productSchema;
  return schema.parse(normalized);
};

const variantSafeSelect = {
  id: true,
  externalNumericId: true,
  productId: true,
  title: true,
  position: true,
  sku: true,
  barcode: true,
  price: true,
  compareAtPrice: true,
  costPerItem: true,
  unitPrice: true,
  unitPriceMeasurement: true,
  taxable: true,
  trackInventory: true,
  inventoryPolicy: true,
  requiresShipping: true,
  weight: true,
  weightUnit: true,
  originCountryCode: true,
  hsCode: true,
  optionValues: true,
  imageId: true,
  createdAt: true,
  updatedAt: true,
  inventoryLevels: { include: { location: true } },
  image: true,
  metafields: true,
};

const productInclude = {
  collections: {
    include: { collection: true },
    orderBy: { position: 'asc' },
  },
  media: true,
  options: true,
  variants: {
    select: variantSafeSelect,
    orderBy: { position: 'asc' },
  },
  metafields: true,
  reviews: {
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    include: {
      media: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  _count: {
    select: {
      reviews: { where: { status: 'PUBLISHED' } },
    },
  },
};

const productListSelect = {
  id: true,
  externalNumericId: true,
  handle: true,
  title: true,
  status: true,
  vendor: true,
  productType: true,
  category: true,
  apparelType: true,
  tags: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  metafields: {
    select: {
      namespace: true,
      key: true,
      type: true,
      value: true,
    },
  },
  collections: {
    select: {
      collection: {
        select: {
          id: true,
          handle: true,
          title: true,
          rules: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  },
  media: {
    where: { type: 'IMAGE' },
    select: {
      url: true,
      alt: true,
      type: true,
      position: true,
    },
    orderBy: { position: 'asc' },
    take: 2,
  },
  variants: {
    select: {
      id: true,
      externalNumericId: true,
      title: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      trackInventory: true,
      optionValues: true,
      position: true,
    },
    orderBy: { position: 'asc' },
    take: 2,
  },
  _count: {
    select: {
      media: true,
    },
  },
};

const productCompactSelect = {
  id: true,
  externalNumericId: true,
  handle: true,
  title: true,
  status: true,
  vendor: true,
  productType: true,
  category: true,
  apparelType: true,
  tags: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  metafields: {
    select: {
      namespace: true,
      key: true,
      type: true,
      value: true,
    },
  },
  collections: {
    select: {
      collection: {
        select: {
          id: true,
          handle: true,
          title: true,
          rules: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  },
  media: {
    where: { type: 'IMAGE' },
    select: {
      url: true,
      alt: true,
      type: true,
      position: true,
    },
    orderBy: { position: 'asc' },
  },
  options: {
    select: {
      name: true,
      values: true,
      position: true,
    },
    orderBy: { position: 'asc' },
  },
  variants: {
    select: {
      id: true,
      externalNumericId: true,
      title: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      trackInventory: true,
      inventoryPolicy: true,
      optionValues: true,
      position: true,
      inventoryLevels: {
        select: {
          available: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  },
  _count: {
    select: {
      media: true,
    },
  },
};

const productCompactWithMetafieldsSelect = {
  ...productCompactSelect,
  metafields: {
    select: {
      namespace: true,
      key: true,
      type: true,
      value: true,
    },
  },
};

const productDetailSelect = {
  ...productCompactWithMetafieldsSelect,
  descriptionHtml: true,
  media: {
    select: {
      url: true,
      alt: true,
      type: true,
      position: true,
    },
    orderBy: { position: 'asc' },
  },
  reviews: {
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      status: true,
      createdAt: true,
      media: {
        select: {
          id: true,
          url: true,
          createdAt: true,
        },
      },
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  _count: {
    select: {
      media: true,
      reviews: { where: { status: 'PUBLISHED' } },
    },
  },
};

const toDecimalString = (value) =>
  value !== undefined && value !== null ? value.toString() : null;

const toSafeInteger = (value, label) => {
  if (value === undefined || value === null) return null;
  const numericValue = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return numericValue;
};

const mapCollections = (product) =>
  Array.isArray(product.collections)
    ? product.collections.map((entry) => entry.collection).filter(Boolean)
    : [];

const toVariantResponse = (variant, productNumericId = null) => {
  if (!variant || typeof variant !== 'object') return variant;
  const { externalNumericId, ...rest } = variant;
  const variantNumericId = toSafeInteger(
    externalNumericId,
    `Numeric variant ID for ${variant.title || variant.id || 'variant'}`,
  );

  return {
    ...rest,
    externalNumericId: variantNumericId,
    product_id: productNumericId,
    variant_id: variantNumericId,
  };
};

const toProductResponse = (product) => {
  if (!product) return product;
  const { externalNumericId, variants, ...rest } = product;
  const productNumericId = toSafeInteger(
    externalNumericId,
    `Numeric product ID for ${product.title || product.id || 'product'}`,
  );
  const publishedReviews = Array.isArray(product.reviews)
    ? product.reviews.filter((review) => review.status === 'PUBLISHED' || !review.status)
    : [];

  const countValue = product._count?.reviews;
  const reviewCount =
    typeof countValue === 'number'
      ? countValue
      : Array.isArray(product.reviews)
        ? product.reviews.length
        : 0;

  const averageRating =
    publishedReviews.length > 0
      ? Number(
        (
          publishedReviews.reduce((total, current) => total + current.rating, 0) /
          publishedReviews.length
        ).toFixed(2)
      )
      : 0;

  return {
  ...rest,
  externalNumericId: productNumericId,
  product_id: productNumericId,

  featuredImage: product.media?.[0]
    ? {
        url: product.media[0].url,
        alt: product.media[0].alt,
      }
    : null,

  images: Array.isArray(product.media)
    ? product.media.map((m) => ({
        url: m.url,
        alt: m.alt,
      }))
    : [],

  img: product.media?.[0]?.url || null,

  variants: Array.isArray(variants)
    ? variants.map((variant) => toVariantResponse(variant, productNumericId))
    : variants,

  collections: mapCollections(product),
  averageRating,
  reviewCount,
};
};

const normalizeMetaToken = (value) => String(value ?? '').trim().toLowerCase();

const readHomepageMetafield = (product, key) => {
  const metafields = Array.isArray(product?.metafields) ? product.metafields : [];
  return (
    metafields.find(
      (field) =>
        normalizeMetaToken(field?.namespace) === 'custom' &&
        normalizeMetaToken(field?.key) === normalizeMetaToken(key),
    ) ?? null
  );
};

const readHomepageBoolean = (product, key) => {
  const field = readHomepageMetafield(product, key);
  const value = field?.value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const token = normalizeMetaToken(value);
  return ['true', '1', 'yes', 'y', 'on'].includes(token);
};

const readHomepageOrder = (product, key) => {
  const field = readHomepageMetafield(product, key);
  const raw = field?.value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Number(String(raw ?? '').trim());
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const sortHomepageSectionProducts = (products, sectionConfig) =>
  [...products].sort((left, right) => {
    const orderDiff =
      readHomepageOrder(left, sectionConfig.orderKey) -
      readHomepageOrder(right, sectionConfig.orderKey);
    if (orderDiff !== 0) return orderDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

const readHomepageSectionTitle = (products, sectionConfig) => {
  for (const product of products) {
    const field = readHomepageMetafield(product, sectionConfig.titleKey);
    const value = String(field?.value ?? '').trim();
    if (value) return value;
  }
  return '';
};

const HEAVY_WRITE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
};

const ensureLocation = async (tx, name, cache = null) => {
  const normalizedName = String(name ?? '').trim();
  if (!normalizedName) return null;

  if (cache?.has(normalizedName)) {
    return cache.get(normalizedName);
  }

  const existing = await tx.location.findFirst({ where: { name: normalizedName } });
  if (existing) {
    if (cache) cache.set(normalizedName, existing);
    return existing;
  }

  const created = await tx.location.create({ data: { name: normalizedName } });
  if (cache) cache.set(normalizedName, created);
  return created;
};

const resolveCollectionIds = async (tx, payload) => {
  const ids = Array.isArray(payload.collections) ? payload.collections : [];
  const handles = Array.isArray(payload.collectionHandles) ? payload.collectionHandles : [];
  if (!handles.length) return ids;
  const found = await tx.collection.findMany({
    where: { handle: { in: handles } },
    select: { id: true },
  });
  return Array.from(new Set([...ids, ...found.map((item) => item.id)]));
};

const buildVariantTitle = (variant, optionOrder) => {
  if (variant.title) return variant.title;
  if (!variant.optionValues || !optionOrder?.length) return 'Default';
  const parts = optionOrder
    .map((opt) => variant.optionValues[opt.name])
    .filter((value) => value && String(value).trim() !== '');
  return parts.length ? parts.join(' / ') : 'Default';
};
/* ── Lightweight in-memory cache for public product lists ── */
const productListCache = new Map();
const PRODUCT_CACHE_TTL = 0;
const PRODUCT_CACHE_MAX = 50;

const getCachedOrFetch = async (cacheKey, fetcher) => {
  if (!PRODUCT_CACHE_TTL) return fetcher();
  const cached = productListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) productListCache.delete(cacheKey);
  const value = await fetcher();
  if (productListCache.size >= PRODUCT_CACHE_MAX) {
    const oldest = productListCache.keys().next().value;
    productListCache.delete(oldest);
  }
  productListCache.set(cacheKey, { value, expiresAt: Date.now() + PRODUCT_CACHE_TTL });
  return value;
};

exports.listProducts = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const {
      q,
      search,
      category,
      minPrice,
      maxPrice,
      page,
      limit,
      handles,
      include,
      homepageSection,
    } = req.query;
    const searchValue = String(search ?? q ?? '').trim();
    const categoryValue = String(category ?? '').trim();
    const handleList = String(handles ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const take = Math.min(Number.parseInt(limit, 10) || 24, 200);
    const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
    const skip = (pageNumber - 1) * take;

    const filters = [];

    if (handleList.length) {
      filters.push({ handle: { in: handleList } });
    }

    if (searchValue) {
      filters.push({
        OR: [
          { title: { contains: searchValue } },
          { handle: { contains: searchValue } },
          { descriptionHtml: { contains: searchValue } },
          { vendor: { contains: searchValue } },
          { productType: { contains: searchValue } },
        ],
      });
    }

    if (categoryValue) {
      const categoryValueSpaces = categoryValue.replace(/-/g, ' ');
      const categoryValueDashes = categoryValue.replace(/\s+/g, '-');
      filters.push({
        OR: [
          { title: { contains: categoryValue } },
          { title: { contains: categoryValueSpaces } },
          { descriptionHtml: { contains: categoryValue } },
          { productType: { contains: categoryValue } },
          { productType: { contains: categoryValueSpaces } },
          { category: { contains: categoryValue } },
          { category: { contains: categoryValueSpaces } },
          { tags: { array_contains: categoryValue } },
          { tags: { array_contains: categoryValueSpaces } },
          { tags: { array_contains: categoryValueDashes } },
          {
            collections: {
              some: {
                collection: {
                  OR: [
                    { handle: { contains: categoryValue } },
                    { handle: { contains: categoryValueSpaces } },
                    { title: { contains: categoryValue } },
                    { title: { contains: categoryValueSpaces } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    const priceFilter = {};
    const minValue = toNumber(minPrice);
    const maxValue = toNumber(maxPrice);
    if (minValue !== undefined) priceFilter.gte = minValue;
    if (maxValue !== undefined) priceFilter.lte = maxValue;
    if (Object.keys(priceFilter).length) {
      filters.push({ variants: { some: { price: priceFilter } } });
    }

    const isAdminRoute = String(req.baseUrl || '').includes('/api/admin');
    if (!isAdminRoute) {
      filters.push({ status: 'ACTIVE' });
    }
    const where = filters.length ? { AND: filters } : undefined;
    const includeMode = String(include ?? '').toLowerCase();
    const homepageSectionValue = String(homepageSection ?? '').trim();
    const homepageSectionConfig = HOMEPAGE_SECTION_META[homepageSectionValue] ?? null;
    const includeRelations =
      includeMode === 'full'
        ? { include: productInclude }
        : homepageSectionConfig
          ? { select: productCompactWithMetafieldsSelect }
        : includeMode === 'compact'
          ? { select: productCompactSelect }
          : { select: productListSelect };

    const skipCount = String(req.query?.skipCount ?? '').toLowerCase() === 'true';

    let total;
    let products;

    const isPublicGet = !isAdminRoute && !req.headers?.authorization;
    const cacheKey = isPublicGet
      ? `products:${JSON.stringify({ where, take, skip, includeMode, skipCount, homepageSection: homepageSectionValue })}`
      : null;

    const fetchData = async () => {
      if (homepageSectionConfig) {
        const rows = await prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...includeRelations,
          take: 200,
        });
        const sectionRows = sortHomepageSectionProducts(
          rows.filter((product) =>
            readHomepageBoolean(product, homepageSectionConfig.enabledKey),
          ),
          homepageSectionConfig,
        );
        const sectionHandles = new Set(sectionRows.map((product) => product.handle));
        const fallbackRows = rows.filter((product) => !sectionHandles.has(product.handle));
        const homepageRows = [...sectionRows, ...fallbackRows];
        const pagedRows = homepageRows.slice(skip, skip + take);
        return {
          products: pagedRows,
          total: homepageRows.length,
          sectionTitle: readHomepageSectionTitle(sectionRows, homepageSectionConfig),
        };
      }
      if (skipCount) {
        const rows = await prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...includeRelations,
          take,
          skip,
        });
        return { products: rows, total: -1 };
      }
      const [rows, count] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...includeRelations,
          take,
          skip,
        }),
        prisma.product.count({ where }),
      ]);
      return { products: rows, total: count };
    };

    const result = cacheKey
      ? await getCachedOrFetch(cacheKey, fetchData)
      : await fetchData();
    products = result.products;
    total = result.total;
    const responseMeta = {
      total,
      page: pageNumber,
      limit: take,
    };
    if (homepageSectionConfig && result.sectionTitle) {
      responseMeta.sectionTitle = result.sectionTitle;
    }

    if (!isAdminRoute) {
      res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    }
    const mapped = products.map(toProductResponse);
    if (process.env.NODE_ENV !== 'production' && categoryValue) {
      console.log('[API] listProducts category', {
        category: categoryValue,
        include: includeMode || 'default',
        total,
        returned: mapped.length,
        sampleHandles: mapped.slice(0, 5).map((item) => item.handle),
      });
    }
    return sendSuccess(res, mapped, responseMeta);
  } catch (error) {
    return next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const identifier = req.params.id;

    // Detect whether identifier is a cuid (id) or a handle to avoid double query
    const isCuid = /^c[a-z0-9]{20,30}$/.test(identifier);
    const where = isCuid ? { id: identifier } : { handle: identifier };

    let product = await prisma.product.findUnique({
      where,
      select: productDetailSelect,
    });

    // Fallback: if cuid lookup failed, try by handle (rare edge case)
    if (!product && isCuid) {
      product = await prisma.product.findUnique({
        where: { handle: identifier },
        select: productDetailSelect,
      });
    }

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    if (!req.headers?.authorization) {
      if (product.status !== 'ACTIVE') {
        return sendError(res, 404, 'Product not found');
      }
      res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    }
    return sendSuccess(res, toProductResponse(product));
  } catch (error) {
    return next(error);
  }
};

const createProductRelations = async (tx, productId, payload) => {
  try {
    console.log('[createProductRelations] START');

    // 1. Collections
    try {
      console.log('[createProductRelations] Resolving collection IDs');
      const collectionIds = await resolveCollectionIds(tx, payload);
      if (collectionIds.length) {
        console.log('[createProductRelations] Creating collections:', collectionIds.length);
        await tx.productCollection.createMany({
          data: collectionIds.map((collectionId, index) => ({
            productId,
            collectionId,
            position: index + 1,
          })),
        });
      }
    } catch (e) {
      console.error('[createProductRelations] Collection error:', e);
      throw new Error(`Collection creation failed: ${e.message}`);
    }

    // 2. Media
    try {
      if (payload.media?.length) {
        console.log('[createProductRelations] Creating media:', payload.media.length);
        await tx.productMedia.createMany({
          data: payload.media.map((media, index) => ({
            productId,
            url: media.url,
            alt: media.alt ?? null,
            type: media.type ?? 'IMAGE',
            position: media.position ?? index,
          })),
        });
      }
    } catch (e) {
      console.error('[createProductRelations] Media error:', e);
      throw new Error(`Media creation failed: ${e.message}`);
    }

    // 3. Options
    let optionOrder = [];
    try {
      if (payload.options?.length) {
        console.log('[createProductRelations] Creating options:', payload.options.length);
        await tx.productOption.createMany({
          data: payload.options.map((option, index) => ({
            productId,
            name: option.name,
            values: option.values,
            position: index + 1,
          })),
        });
        optionOrder = payload.options;
      }
    } catch (e) {
      console.error('[createProductRelations] Option error:', e);
      throw new Error(`Option creation failed: ${e.message}`);
    }

    // Resolve media map for variants
    let mediaByUrl = new Map();
    try {
      const mediaRecords = payload.media?.length
        ? await tx.productMedia.findMany({ where: { productId } })
        : [];
      mediaByUrl = new Map(mediaRecords.map((record) => [record.url, record.id]));
    } catch (e) {
      console.error('[createProductRelations] Media fetch error:', e);
      // Non-fatal, just log
    }

    // 4. Variants
    try {
      if (payload.variants?.length) {
        console.log('[createProductRelations] Creating variants:', payload.variants.length);
        const locationCache = new Map();
        for (const [index, variant] of payload.variants.entries()) {
          const imageId = variant.imageUrl ? mediaByUrl.get(variant.imageUrl) : null;

          let created;
          try {
            const data = {
              productId,
              title: buildVariantTitle(variant, optionOrder),
              position: index + 1,
              sku: variant.sku ?? null,
              barcode: variant.barcode ?? null,
              price: toDecimalString(variant.price),
              compareAtPrice: toDecimalString(variant.compareAtPrice),
              costPerItem: toDecimalString(variant.costPerItem),
              unitPrice: toDecimalString(variant.unitPrice),
              unitPriceMeasurement: variant.unitPriceMeasurement ?? null,
              taxable: variant.taxable ?? true,
              trackInventory: variant.trackInventory ?? true,
              inventoryPolicy: variant.inventoryPolicy ?? 'DENY',
              requiresShipping: variant.requiresShipping ?? true,
              weight: toDecimalString(variant.weight),
              weightUnit: variant.weightUnit ?? null,
              originCountryCode: variant.originCountryCode ?? null,
              hsCode: variant.hsCode ?? null,
              optionValues: variant.optionValues ?? null,
              imageId: imageId ?? null,
            };
            console.log('[createProductRelations] Creating variant with data:', JSON.stringify(data, null, 2));
            created = await tx.productVariant.create({ 
              data,
              select: { id: true }
            });
          } catch (error) {
            console.error('[createProductRelations] Variant creation failed for variant:', JSON.stringify(variant, null, 2));
            console.error('[createProductRelations] Prisma error details:', error);
            throw error;
          }

          if (variant.inventory?.available !== undefined && variant.trackInventory !== false) {
            const locationName = variant.inventory.location || 'Default';
            const location = await ensureLocation(tx, locationName, locationCache);
            if (location) {
              await tx.inventoryLevel.create({
                data: {
                  variantId: created.id,
                  locationId: location.id,
                  available: variant.inventory.available ?? 0,
                  onHand: variant.inventory.available ?? 0,
                  committed: 0,
                  unavailable: 0,
                },
              });
            }
          }

          if (variant.metafields?.length) {
            await tx.variantMetafield.createMany({
              data: variant.metafields.map((field) => ({
                variantId: created.id,
                namespace: field.namespace,
                key: field.key,
                type: field.type,
                value: field.value,
                description: field.description ?? null,
              })),
            });
          }
        }
      }
    } catch (e) {
      console.error('[createProductRelations] Variant error:', e);
      throw new Error(`Variant creation failed: ${e.message}`);
    }

    // 5. Metafields
    try {
      if (payload.metafields?.length) {
        console.log('[createProductRelations] Creating metafields:', payload.metafields.length);
        await tx.productMetafield.createMany({
          data: payload.metafields.map((field) => ({
            productId,
            namespace: field.namespace,
            key: field.key,
            type: field.type,
            value: field.value,
            description: field.description ?? null,
            set: field.set ?? 'PRODUCT',
          })),
        });
      }
    } catch (e) {
      console.error('[createProductRelations] Metafield error:', e);
      throw new Error(`Metafield creation failed: ${e.message}`);
    }

    console.log('[createProductRelations] DONE');
  } catch (error) {
    console.error('[createProductRelations] Fatal error:', error);
    throw error; // Re-throw to be caught by updateProduct
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const payload = parseProductInput(req.body);
    const prisma = await getPrisma();

    const productId = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title: payload.title,
          handle: payload.handle,
          descriptionHtml: payload.descriptionHtml,
          status: payload.status ?? 'DRAFT',
          vendor: payload.vendor,
          productType: payload.productType,
          category: payload.category,
          categoryTaxonomyId: payload.categoryTaxonomyId,
          apparelType: payload.apparelType,
          templateSuffix: payload.templateSuffix,
          tags: payload.tags ?? [],
          subscriptionsEnabled: payload.subscriptionsEnabled ?? false,
          publishedAt: payload.publishedAt ?? null,
        },
      });

      await createProductRelations(tx, created.id, payload);
      return created.id;
    }, HEAVY_WRITE_TRANSACTION_OPTIONS);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });
    if (!product) {
      return sendError(res, 500, 'Product was created but could not be reloaded');
    }

    res.status(201);
    return sendSuccess(res, toProductResponse(product));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Product handle already exists');
    }
    return next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    console.log('[updateProduct] START for id:', req.params.id);
    const payload = parseProductInput(req.body, { partial: true });
    console.log('[updateProduct] Parsed payload keys:', Object.keys(payload));
    const prisma = await getPrisma();

    const productId = await prisma.$transaction(async (tx) => {
      console.log('[updateProduct] Step 1: Updating product base fields');
      const updated = await tx.product.update({
        where: { id: req.params.id },
        data: {
          title: payload.title,
          handle: payload.handle,
          descriptionHtml: payload.descriptionHtml,
          status: payload.status,
          vendor: payload.vendor,
          productType: payload.productType,
          category: payload.category,
          categoryTaxonomyId: payload.categoryTaxonomyId,
          apparelType: payload.apparelType,
          templateSuffix: payload.templateSuffix,
          tags: payload.tags,
          subscriptionsEnabled: payload.subscriptionsEnabled,
          publishedAt: payload.publishedAt ?? undefined,
        },
      });
      console.log('[updateProduct] Step 1 done. Product id:', updated.id);

      if (payload.collections || payload.collectionHandles) {
        console.log('[updateProduct] Step 2: Deleting old ProductCollection records');
        await tx.productCollection.deleteMany({ where: { productId: updated.id } });
        console.log('[updateProduct] Step 2 done');
      }

      if (payload.variants) {
        console.log('[updateProduct] Step 3: Deleting old variants, count:', payload.variants.length);
        await tx.productVariant.deleteMany({ where: { productId: updated.id } });
        console.log('[updateProduct] Step 3 done');
      }

      if (payload.options) {
        console.log('[updateProduct] Step 4: Deleting old ProductOption records, count:', payload.options.length);
        await tx.productOption.deleteMany({ where: { productId: updated.id } });
        console.log('[updateProduct] Step 4 done');
      }

      if (payload.media) {
        console.log('[updateProduct] Step 5: Deleting old ProductMedia records, count:', payload.media.length);
        if (!payload.variants) {
          await tx.productVariant.updateMany({
            where: { productId: updated.id },
            data: { imageId: null },
          });
        }
        await tx.productMedia.deleteMany({ where: { productId: updated.id } });
        console.log('[updateProduct] Step 5 done');
      }

      if (payload.metafields) {
        console.log('[updateProduct] Step 6: Deleting old metafields, count:', payload.metafields.length);
        await tx.productMetafield.deleteMany({ where: { productId: updated.id } });
        console.log('[updateProduct] Step 6 done');
      }

      console.log('[updateProduct] Step 7: Creating product relations');
      await createProductRelations(tx, updated.id, payload);
      console.log('[updateProduct] Step 7 done');
      return updated.id;
    }, HEAVY_WRITE_TRANSACTION_OPTIONS);

    console.log('[updateProduct] Step 8: Fetching final product');
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    console.log('[updateProduct] Step 8 done');

    console.log('[updateProduct] Transaction complete, sending response');
    return sendSuccess(res, toProductResponse(product));

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2025') {
      return sendError(res, 404, 'Product not found');
    }
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Product handle already exists');
    }
    if (error.code === 'P2003') {
      console.error('[updateProduct] Foreign key constraint failed:', error.meta);
      return sendError(res, 400, `Invalid reference: ${error.meta?.field_name || 'unknown field'}`);
    }
    console.error('[updateProduct] Error:', error.message, error.code, error.stack);
    return sendError(res, 500, `Update failed: ${error.message || 'Unknown server error'}`, {
      stack: error.stack,
      code: error.code,
      meta: error.meta,
    });
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    await prisma.product.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 404, 'Product not found');
    }
    return next(error);
  }
};
const parseCsv = (text) => {
  const rows = [];
  let current = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      current.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      current.push(value);
      if (current.some((cell) => cell.trim() !== '')) {
        rows.push(current);
      }
      current = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length || current.length) {
    current.push(value);
    if (current.some((cell) => cell.trim() !== '')) {
      rows.push(current);
    }
  }

  return rows;
};

const parseCsvBoolean = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', '1', 'y'].includes(normalized)) return true;
  if (['false', 'no', '0', 'n'].includes(normalized)) return false;
  return null;
};

const normalizeImportedImageUrl = (value) => {
  const raw = String(value ?? '').trim().replace(/^"+|"+$/g, '');
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
};

const splitCsvImageCell = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split('|')
    .flatMap((part) => String(part).split('\n'))
    .map((part) => normalizeImportedImageUrl(part))
    .filter(Boolean);
};

const hasVariantData = (variant) => {
  if (!variant || typeof variant !== 'object') return false;
  const primitives = [
    variant.sku,
    variant.barcode,
    variant.price,
    variant.compareAtPrice,
    variant.costPerItem,
    variant.taxable,
    variant.trackInventory,
    variant.inventoryPolicy,
    variant.requiresShipping,
    variant.weight,
    variant.weightUnit,
    variant.originCountryCode,
    variant.hsCode,
    variant.imageUrl,
  ];
  if (
    primitives.some((value) => value !== undefined && value !== null && String(value).trim() !== '')
  ) {
    return true;
  }
  if (variant.optionValues && Object.keys(variant.optionValues).length) {
    return true;
  }
  if (
    variant.inventory &&
    (
      variant.inventory.available !== undefined ||
      (variant.inventory.location && String(variant.inventory.location).trim() !== '')
    )
  ) {
    return true;
  }
  return false;
};

const parseCsvProducts = (text) => {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim());
  const dataRows = rows.slice(1);

  const headerIndex = new Map();
  header.forEach((key, index) => {
    const normalized = String(key || '').trim().toLowerCase();
    if (!normalized || headerIndex.has(normalized)) return;
    headerIndex.set(normalized, index);
  });

  const get = (row, keys) => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    let fallback = '';

    for (const key of keyList) {
      const normalized = String(key || '').trim().toLowerCase();
      if (!normalized) continue;
      const index = headerIndex.get(normalized);
      if (index === undefined) continue;
      const value = row[index] ?? '';
      const stringValue = String(value);
      if (!fallback) fallback = stringValue;
      if (stringValue.trim() !== '') return stringValue;
    }

    return fallback;
  };

  const productsByHandle = new Map();

  dataRows.forEach((row) => {
    const handle = String(get(row, ['Handle']) || '').trim();
    const title = String(get(row, ['Title']) || '').trim();
    if (!handle && !title) return;

    const productKey = handle || slugify(title) || title;
    if (!productsByHandle.has(productKey)) {
      const statusRaw = String(get(row, ['Status']) || '').trim().toUpperCase();
      const published = parseCsvBoolean(get(row, ['Published']));
      const status = PRODUCT_STATUS.includes(statusRaw)
        ? statusRaw
        : published === true
          ? 'ACTIVE'
          : 'DRAFT';

      productsByHandle.set(productKey, {
        handle: handle || slugify(title) || title,
        title: title || handle,
        status,
        vendor: String(get(row, ['Vendor']) || '').trim() || undefined,
        productType: String(get(row, ['ProductType', 'Type']) || '').trim() || undefined,
        apparelType: String(get(row, ['ApparelType']) || '').trim() || undefined,
        category: String(get(row, ['Category', 'Product Category']) || '').trim() || undefined,
        tags: normalizeTags(get(row, ['Tags'])),
        descriptionHtml: String(get(row, ['DescriptionHtml', 'Body (HTML)', 'Body HTML']) || '').trim() || undefined,
        collectionHandles: String(get(row, ['Collections', 'Collection']) || '')
          .split('|')
          .flatMap((chunk) => chunk.split(','))
          .map((value) => value.trim())
          .filter(Boolean),
        media: [],
        options: [],
        variants: [],
      });
    }

    const product = productsByHandle.get(productKey);
    if (!product.title && title) {
      product.title = title;
    }

    const imageCell = get(row, ['Image Srcs', 'Image Src', 'Image URL', 'Image Url']);
    splitCsvImageCell(imageCell).forEach((url) => product.media.push({ url }));

    const variantImageUrl = normalizeImportedImageUrl(
      get(row, ['Variant Image', 'Variant Image URL', 'Variant Image Url']),
    );
    if (variantImageUrl) {
      product.media.push({ url: variantImageUrl });
    }

    const optionNames = [
      String(get(row, ['Option1 Name']) || '').trim(),
      String(get(row, ['Option2 Name']) || '').trim(),
      String(get(row, ['Option3 Name']) || '').trim(),
    ];
    const optionValues = [
      String(get(row, ['Option1 Value']) || '').trim(),
      String(get(row, ['Option2 Value']) || '').trim(),
      String(get(row, ['Option3 Value']) || '').trim(),
    ];

    const optionValueMap = {};
    optionNames.forEach((name, index) => {
      if (name && optionValues[index]) {
        optionValueMap[name] = optionValues[index];
      }
    });

    const variant = {
      sku: String(get(row, ['Variant SKU', 'SKU']) || '').trim() || undefined,
      barcode: String(get(row, ['Variant Barcode', 'Barcode']) || '').trim() || undefined,
      price: toNumber(get(row, ['Variant Price'])),
      compareAtPrice: toNumber(get(row, ['Variant CompareAtPrice', 'Variant Compare At Price'])),
      costPerItem: toNumber(get(row, ['Variant Cost', 'Cost per item'])),
      taxable: toBoolean(get(row, ['Variant Taxable', 'Taxable'])),
      trackInventory: toBoolean(get(row, ['Variant TrackInventory'])),
      inventoryPolicy: String(get(row, ['Variant InventoryPolicy', 'Variant Inventory Policy']) || '').trim() || undefined,
      requiresShipping: toBoolean(get(row, ['Variant RequiresShipping', 'Variant Requires Shipping'])),
      weight: toNumber(get(row, ['Variant Weight'])),
      weightUnit: String(get(row, ['Variant WeightUnit', 'Variant Weight Unit']) || '').trim() || undefined,
      originCountryCode: String(get(row, ['Variant OriginCountry', 'Variant Origin Country']) || '').trim() || undefined,
      hsCode: String(get(row, ['Variant HSCode', 'Variant HS Code']) || '').trim() || undefined,
      imageUrl: variantImageUrl || undefined,
      inventory: {
        available: toNumber(get(row, ['Variant Inventory Available', 'Variant Inventory Qty'])),
        location: String(get(row, ['Variant Inventory Location']) || '').trim() || undefined,
      },
      optionValues: Object.keys(optionValueMap).length ? optionValueMap : undefined,
    };

    if (hasVariantData(variant)) {
      product.variants.push(variant);
    }
  });

  productsByHandle.forEach((product) => {
    const seenMedia = new Set();
    product.media = product.media
      .map((item) => ({
        ...item,
        url: normalizeImportedImageUrl(item?.url),
      }))
      .filter((item) => {
        if (!item.url || seenMedia.has(item.url)) return false;
        seenMedia.add(item.url);
        return true;
      });

    const optionMap = new Map();
    product.variants.forEach((variant) => {
      const values = variant.optionValues || {};
      Object.entries(values).forEach(([name, value]) => {
        if (!optionMap.has(name)) {
          optionMap.set(name, new Set());
        }
        if (value) optionMap.get(name).add(value);
      });
    });
    if (optionMap.size) {
      product.options = Array.from(optionMap.entries()).map(([name, values]) => ({
        name,
        values: Array.from(values),
      }));
    }
  });

  return Array.from(productsByHandle.values());
};

const normalizeBulkItem = (item) => parseProductInput(item);

exports.bulkImportProducts = async (req, res, next) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: 'Provide an array of products under "items".' });
  }

  const prisma = await getPrisma();
  const summary = { created: 0, updated: 0, failed: 0, results: [] };

  for (const rawItem of items) {
    try {
      const payload = normalizeBulkItem(rawItem);
      const existing = await prisma.product.findUnique({ where: { handle: payload.handle } });

      if (existing) {
        await prisma.productCollection.deleteMany({ where: { productId: existing.id } });
        await prisma.productMedia.deleteMany({ where: { productId: existing.id } });
        await prisma.productOption.deleteMany({ where: { productId: existing.id } });
        await prisma.inventoryLevel.deleteMany({ where: { variant: { productId: existing.id } } });
        await prisma.productVariant.deleteMany({ where: { productId: existing.id } });
        await prisma.productMetafield.deleteMany({ where: { productId: existing.id } });

        await prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: existing.id },
            data: {
              title: payload.title,
              handle: payload.handle,
              descriptionHtml: payload.descriptionHtml,
              status: payload.status ?? 'DRAFT',
              vendor: payload.vendor,
              productType: payload.productType,
              category: payload.category,
              categoryTaxonomyId: payload.categoryTaxonomyId,
              apparelType: payload.apparelType,
              templateSuffix: payload.templateSuffix,
              tags: payload.tags ?? [],
              subscriptionsEnabled: payload.subscriptionsEnabled ?? false,
              publishedAt: payload.publishedAt ?? null,
            },
          });
          await createProductRelations(tx, existing.id, payload);
        }, HEAVY_WRITE_TRANSACTION_OPTIONS);

        summary.updated += 1;
        summary.results.push({ handle: payload.handle, status: 'updated' });
      } else {
        await prisma.$transaction(async (tx) => {
          const created = await tx.product.create({
            data: {
              title: payload.title,
              handle: payload.handle,
              descriptionHtml: payload.descriptionHtml,
              status: payload.status ?? 'DRAFT',
              vendor: payload.vendor,
              productType: payload.productType,
              category: payload.category,
              categoryTaxonomyId: payload.categoryTaxonomyId,
              apparelType: payload.apparelType,
              templateSuffix: payload.templateSuffix,
              tags: payload.tags ?? [],
              subscriptionsEnabled: payload.subscriptionsEnabled ?? false,
              publishedAt: payload.publishedAt ?? null,
            },
          });
          await createProductRelations(tx, created.id, payload);
        }, HEAVY_WRITE_TRANSACTION_OPTIONS);
        summary.created += 1;
        summary.results.push({ handle: payload.handle, status: 'created' });
      }
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        handle: rawItem?.handle ?? rawItem?.title ?? 'unknown',
        status: 'failed',
        message: error.message || 'Unable to import product',
      });
    }
  }

  return res.status(200).json(summary);
};

exports.importProductsCsv = async (req, res, next) => {
  try {
    const csvText = req.body?.csv || '';
    if (!csvText) {
      return res.status(400).json({ message: 'CSV payload is required.' });
    }
    const items = parseCsvProducts(String(csvText));
    if (!items.length) {
      return res.status(400).json({ message: 'CSV contained no valid rows.' });
    }
    req.body = { items };
    return exports.bulkImportProducts(req, res, next);
  } catch (error) {
    return next(error);
  }
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

exports.exportProducts = async (_req, res, next) => {
  try {
    const prisma = await getPrisma();
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: productInclude,
    });

    const headers = [
      'Handle',
      'Title',
      'Status',
      'Vendor',
      'ProductType',
      'ApparelType',
      'Category',
      'Tags',
      'DescriptionHtml',
      'Collections',
      'Option1 Name',
      'Option1 Value',
      'Option2 Name',
      'Option2 Value',
      'Option3 Name',
      'Option3 Value',
      'Variant SKU',
      'Variant Barcode',
      'Variant Price',
      'Variant CompareAtPrice',
      'Variant Cost',
      'Variant Taxable',
      'Variant TrackInventory',
      'Variant InventoryPolicy',
      'Variant RequiresShipping',
      'Variant Weight',
      'Variant WeightUnit',
      'Variant OriginCountry',
      'Variant HSCode',
      'Variant Image',
      'Variant Inventory Available',
      'Variant Inventory Location',
      'Image Srcs',
    ];

    const rows = [];

    products.forEach((product) => {
      const collections = mapCollections(product);
      const collectionHandles = collections.map((col) => col.handle).filter(Boolean).join('|');
      const tags = Array.isArray(product.tags) ? product.tags.join(', ') : '';
      const images = Array.isArray(product.media)
        ? product.media.map((media) => media.url).filter(Boolean).join('|')
        : '';

      const options = Array.isArray(product.options) ? product.options : [];
      const optionNames = options.map((opt) => opt.name);

      const variants =
        Array.isArray(product.variants) && product.variants.length
          ? product.variants
          : [
            {
              title: 'Default',
              price: null,
              optionValues: {},
              inventoryLevels: [],
            },
          ];

      variants.forEach((variant) => {
        const optionValues = variant.optionValues || {};
        const optionPairs = optionNames.map((name) => optionValues[name] || '');
        while (optionPairs.length < 3) optionPairs.push('');

        const inventoryLevels = Array.isArray(variant.inventoryLevels) ? variant.inventoryLevels : [];
        const inventoryAvailable = inventoryLevels.reduce(
          (sum, level) => sum + (Number(level.available) || 0),
          0,
        );
        const primaryLocation = inventoryLevels[0]?.location?.name || '';

        rows.push([
          product.handle,
          product.title,
          product.status,
          product.vendor ?? '',
          product.productType ?? '',
          product.apparelType ?? '',
          product.category ?? '',
          tags,
          product.descriptionHtml ?? '',
          collectionHandles,
          optionNames[0] ?? '',
          optionPairs[0] ?? '',
          optionNames[1] ?? '',
          optionPairs[1] ?? '',
          optionNames[2] ?? '',
          optionPairs[2] ?? '',
          variant.sku ?? '',
          variant.barcode ?? '',
          variant.price ?? '',
          variant.compareAtPrice ?? '',
          variant.costPerItem ?? '',
          variant.taxable ?? '',
          variant.trackInventory ?? '',
          variant.inventoryPolicy ?? '',
          variant.requiresShipping ?? '',
          variant.weight ?? '',
          variant.weightUnit ?? '',
          variant.originCountryCode ?? '',
          variant.hsCode ?? '',
          variant.image?.url ?? '',
          inventoryAvailable,
          primaryLocation,
          images,
        ]);
      });
    });

    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    return next(error);
  }
};
