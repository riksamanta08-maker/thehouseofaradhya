const resolveApiBase = () => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

const API_BASE = resolveApiBase();
const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

export const getApiBaseUrl = () => API_URL;

const DEFAULT_LOCALE = import.meta.env.VITE_LOCALE || 'en-IN';
const DEFAULT_CURRENCY = import.meta.env.VITE_CURRENCY || 'INR';

const buildQuery = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') {
          query.append(key, entry);
        }
      });
      return;
    }
    query.append(key, value);
  });
  const search = query.toString();
  return search ? `?${search}` : '';
};

const parseResponse = async (response) => {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const unwrap = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  if (Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }
  return payload;
};

const detectPayloadKind = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const snippet = value.trim().slice(0, 64).toLowerCase();
    if (snippet.startsWith('<!doctype') || snippet.startsWith('<html')) {
      return 'html';
    }
    return 'text';
  }
  return typeof value;
};

const extractArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.products)) return value.products;
  if (Array.isArray(value.collections)) return value.collections;
  if (Array.isArray(value.results)) return value.results;
  return null;
};

const extractList = (payload, label) => {
  const unwrapped = unwrap(payload);
  const primary = extractArray(unwrapped);
  if (primary) return primary;

  const fallback = extractArray(payload);
  if (fallback) return fallback;

  if (unwrapped === null || unwrapped === undefined) return [];

  const kind = detectPayloadKind(unwrapped);
  if (kind === 'html') {
    throw new Error(
      `Unexpected HTML while loading ${label}. Check your Vercel API routing for /api/*.`,
    );
  }

  throw new Error(`Unexpected response format while loading ${label}.`);
};

const inflightRequests = new Map();
const responseCache = new Map();
const RESPONSE_CACHE_TTL = 30 * 60_000;
const RESPONSE_CACHE_PREFIX = 'aradhya:api-cache:';

const getBrowserCache = (cacheKey) => {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(`${RESPONSE_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached || cached.expiresAt <= Date.now()) {
      window.localStorage.removeItem(`${RESPONSE_CACHE_PREFIX}${cacheKey}`);
      return null;
    }

    return cached.payload;
  } catch {
    return null;
  }
};

const setBrowserCache = (cacheKey, payload) => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.setItem(
      `${RESPONSE_CACHE_PREFIX}${cacheKey}`,
      JSON.stringify({
        payload,
        expiresAt: Date.now() + RESPONSE_CACHE_TTL,
      }),
    );
  } catch {
    // Storage can be unavailable or full; in-memory cache still handles this tab.
  }
};

const shouldCacheRequest = (path, method, body, cache) => {
  if (String(method || 'GET').toUpperCase() !== 'GET' || body !== undefined || cache === 'no-store') {
    return false;
  }
  if (String(path || '').startsWith('/products') || String(path || '').startsWith('/collections')) {
    return false;
  }
  return true;
};

const request = async (
  path,
  { method = 'GET', headers = {}, body, keepalive = false, cache } = {},
) => {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const options = { method, headers: { ...headers } };
  if (keepalive) options.keepalive = true;
  if (cache) options.cache = cache;

  if (body !== undefined) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }

  const methodUpper = String(method || 'GET').toUpperCase();
  const cacheKey = shouldCacheRequest(path, methodUpper, body, cache)
    ? `${url}|auth:${options.headers.Authorization || ''}`
    : null;

  if (cacheKey && !options.headers.Authorization) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`%c[API] ✅ CACHE HIT %c${methodUpper} ${url}`, 'color:#22c55e;font-weight:bold', 'color:#6b7280');
      return cached.payload;
    }
    if (cached) responseCache.delete(cacheKey);

    const browserCached = getBrowserCache(cacheKey);
    if (browserCached !== null) {
      responseCache.set(cacheKey, {
        payload: browserCached,
        expiresAt: Date.now() + RESPONSE_CACHE_TTL,
      });
      return browserCached;
    }
  }

  if (cacheKey && inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const _reqStart = performance.now();
  console.log(`%c[API] ⏳ START  %c${methodUpper} ${url}`, 'color:#3b82f6;font-weight:bold', 'color:#6b7280');

  const pending = fetch(url, options)
    .then(parseResponse)
    .then((payload) => {
      const _dur = (performance.now() - _reqStart).toFixed(0);
      console.log(`%c[API] ✅ DONE   %c${methodUpper} ${url} %c(${_dur}ms)`, 'color:#22c55e;font-weight:bold', 'color:#6b7280', _dur > 1000 ? 'color:#ef4444;font-weight:bold' : 'color:#f59e0b;font-weight:bold');
      if (cacheKey && !options.headers.Authorization) {
        responseCache.set(cacheKey, {
          payload,
          expiresAt: Date.now() + RESPONSE_CACHE_TTL,
        });
        setBrowserCache(cacheKey, payload);
      }
      return payload;
    })
    .catch((err) => {
      const _dur = (performance.now() - _reqStart).toFixed(0);
      console.log(`%c[API] ❌ FAIL   %c${methodUpper} ${url} %c(${_dur}ms) %c${err.message}`, 'color:#ef4444;font-weight:bold', 'color:#6b7280', 'color:#ef4444', 'color:#ef4444');
      throw err;
    })
    .finally(() => {
      if (cacheKey) inflightRequests.delete(cacheKey);
    });

  if (cacheKey) inflightRequests.set(cacheKey, pending);
  return pending;
};

const requestWithAuth = (path, token, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return request(path, { ...options, headers });
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeStringArray = (value) => {
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

export const normaliseTokenValue = (value) =>
  value?.toString().trim().toLowerCase() ?? '';

const SIZE_OPTION_TOKENS = [
  'size',
  'waist',
  'inseam',
  'length',
  'shoe',
  'foot',
];
const SIZE_PLACEHOLDER_TOKENS = new Set([
  'default',
  'default title',
  'title',
  'n/a',
  'na',
  '-',
  '--',
]);

export const isSizeOptionName = (name) => {
  const token = normaliseTokenValue(name);
  if (!token) return false;
  return SIZE_OPTION_TOKENS.some((part) => token.includes(part));
};

const isPlaceholderSizeValue = (value) => {
  const token = normaliseTokenValue(value);
  if (!token) return true;
  return SIZE_PLACEHOLDER_TOKENS.has(token);
};

const normalizeImage = (image, fallbackAlt = '') => {
  const rawUrl =
    typeof image === 'string'
      ? image
      : image?.url ?? image?.src ?? image?.secure_url ?? image?.imageUrl ?? '';
  const url = String(rawUrl || '').trim();
  if (!url) return null;
  return {
    url,
    alt: image?.alt || image?.altText || fallbackAlt || '',
  };
};

const normalizeCollection = (collection) => {
  if (!collection) return null;
  const image = collection.imageUrl
    ? { url: collection.imageUrl, alt: collection.title }
    : null;
  const rules =
    collection.rules && typeof collection.rules === 'object'
      ? collection.rules
      : null;
  const products = Array.isArray(collection.products)
    ? collection.products
      .map((entry) => entry?.product || entry)
      .map((product) => {
        if (!product?.id) return null;
        return {
          id: product.id,
          title: product.title || '',
          handle: product.handle || '',
          status: product.status || '',
          vendor: product.vendor || '',
        };
      })
      .filter(Boolean)
    : [];
  return {
    id: collection.id,
    handle: collection.handle,
    title: collection.title,
    description: collection.descriptionHtml || '',
    image,
    parentId: collection.parentId ?? null,
    count: collection._count?.products ?? null,
    rules,
    products,
  };
};

const buildPriceRange = (prices, currencyCode) => {
  if (!prices.length) {
    return {
      minVariantPrice: { amount: 0, currencyCode },
      maxVariantPrice: { amount: 0, currencyCode },
    };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    minVariantPrice: { amount: min, currencyCode },
    maxVariantPrice: { amount: max, currencyCode },
  };
};

const extractBundleHandles = (value) => {
  if (!value) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return extractBundleHandles(JSON.parse(trimmed));
    } catch {
      return normalizeStringArray(trimmed.replace(/\|/g, ','));
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractBundleHandles(entry));
  }

  if (typeof value === 'object') {
    const directHandle = value.handle ?? value.slug ?? value.productHandle ?? value.product_handle;
    if (directHandle) {
      return [String(directHandle).trim()];
    }

    return [
      ...extractBundleHandles(value.items),
      ...extractBundleHandles(value.products),
      ...extractBundleHandles(value.handles),
      ...extractBundleHandles(value.value),
    ];
  }

  return [];
};

const deriveComboHandles = (product) => {
  const metafields = Array.isArray(product?.metafields) ? product.metafields : [];
  const bundleFields = metafields.filter((field) => {
    const namespace = normaliseTokenValue(field?.namespace);
    const key = normaliseTokenValue(field?.key);
    return (
      namespace === 'custom' &&
      (key === 'combo_items' || key === 'bundle_items')
    );
  });
  if (!bundleFields.length) return [];

  const collected = bundleFields.flatMap((field) => extractBundleHandles(field?.value));

  return Array.from(
    new Set(
      collected
        .map((item) => String(item ?? '').trim())
        .filter(Boolean),
    ),
  );
};

const mapProduct = (product) => {
  if (!product) return null;

  const mediaItems = [
    ...(Array.isArray(product.media) ? product.media : []),
    ...(Array.isArray(product.images) ? product.images : []),
  ];
  const images = mediaItems
    .filter((media) => !media.type || media.type === 'IMAGE')
    .map((img) => normalizeImage(img, product.title))
    .filter(Boolean);

  const featuredImage =
    normalizeImage(product.featuredImage, product.title) ??
    normalizeImage(product.image, product.title) ??
    normalizeImage(product.imageUrl, product.title) ??
    images[0] ??
    null;
  const allImages = Array.from(
    new Map(
      [featuredImage, ...images]
        .filter(Boolean)
        .map((image) => [image.url, image]),
    ).values(),
  );
  const tags = normalizeStringArray(product.tags);
  const currencyCode = DEFAULT_CURRENCY;

  const options = Array.isArray(product.options)
    ? product.options.map((option) => ({
      name: option.name,
      values: option.values ?? [],
    }))
    : [];

  const variants = Array.isArray(product.variants)
    ? product.variants.map((variant) => {
      const hasInventoryLevels = Object.prototype.hasOwnProperty.call(
        variant || {},
        'inventoryLevels',
      );
      const inventoryLevels = hasInventoryLevels && Array.isArray(variant.inventoryLevels)
        ? variant.inventoryLevels
        : [];
      const tracksInventory = variant.trackInventory !== false;
      const quantityAvailable = hasInventoryLevels
        ? inventoryLevels.reduce(
          (sum, level) => sum + (Number(level?.available) || 0),
          0,
        )
        : tracksInventory
          ? 0
          : null;
      const availableForSale =
        !tracksInventory || quantityAvailable === null || quantityAvailable > 0;

      const selectedOptions = variant.optionValues
        ? Object.entries(variant.optionValues).map(([name, value]) => ({
          name,
          value,
        }))
        : [];

      const compareAtPrice = variant.compareAtPrice
        ? {
          amount: toNumber(variant.compareAtPrice, 0),
          currencyCode,
        }
        : null;

      return {
        id: variant.id,
        externalNumericId: variant.externalNumericId ?? variant.variant_id ?? null,
        variant_id: variant.variant_id ?? variant.externalNumericId ?? null,
        product_id: variant.product_id ?? product.product_id ?? product.externalNumericId ?? null,
        title: variant.title,
        availableForSale,
        sku: variant.sku ?? null,
        quantityAvailable,
        price: toNumber(variant.price, 0),
        currencyCode,
        compareAtPrice,
        selectedOptions,
      };
    })
    : [];

  const prices = variants
    .map((variant) => toNumber(variant.price, 0))
    .filter((value) => Number.isFinite(value));

  const price = prices.length ? Math.min(...prices) : 0;
  const priceRange = buildPriceRange(prices, currencyCode);

  const collections = Array.isArray(product.collections)
    ? product.collections.map(normalizeCollection).filter(Boolean)
    : [];

  const publishedReviews = Array.isArray(product.reviews) ? product.reviews : [];
  const reviewsList = publishedReviews.map((review) => ({
    author: review.user?.name || review.user?.email || 'Customer',
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    date: review.createdAt,
  }));

  const reviewCount =
    product.reviewCount ??
    product._count?.reviews ??
    (Array.isArray(reviewsList) ? reviewsList.length : 0);
  const averageRating = product.averageRating ?? null;

  const reviewsJson =
    reviewsList && reviewsList.length
      ? JSON.stringify({ reviews: reviewsList, averageRating, reviewCount })
      : averageRating != null || reviewCount
        ? JSON.stringify({ averageRating, reviewCount })
        : null;

  const optionValues = {};
  options.forEach((option) => {
    if (!option?.name) return;
    optionValues[option.name.toLowerCase()] = option.values ?? [];
  });

  const totalInventory = variants.reduce(
    (sum, variant) => sum + (Number.isFinite(variant.quantityAvailable) ? variant.quantityAvailable : 0),
    0,
  );

  return {
    id: product.id,
    externalNumericId: product.externalNumericId ?? product.product_id ?? null,
    product_id: product.product_id ?? product.externalNumericId ?? null,
    handle: product.handle,
    title: product.title,
    vendor: product.vendor || '',
    productType: product.productType || '',
    description: product.descriptionHtml || '',
    descriptionHtml: product.descriptionHtml || '',
    tags,
    featuredImage,
    images: allImages,
    price,
    currencyCode,
    priceRange,
    variants,
    options,
    optionValues,
    collections,
    metafields: product.metafields || [],
    reviewsJson,
    comboItems: [],
    seo: null,
    availableForSale: variants.length
      ? variants.some((variant) => variant.availableForSale)
      : true,
    totalInventory,
  };
};

export function formatMoney(
  amount,
  currencyCode = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
) {
  const value = toNumber(amount, 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode || DEFAULT_CURRENCY,
      currencyDisplay: 'symbol',
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currencyCode || DEFAULT_CURRENCY} ${value.toFixed(2)}`;
  }
}


export const extractOptionValues = (product, optionName) => {
  if (!product?.options?.length) return [];
  const target = optionName?.toLowerCase();
  const option = product.options.find(
    (opt) => opt?.name?.toLowerCase() === target,
  );
  return option?.values ?? [];
};

export const extractSizeOptions = (product) => {
  const options = Array.isArray(product?.options) ? product.options : [];
  const normalizeOptionsList = (values) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value) => !isPlaceholderSizeValue(value))
      .filter((value) => {
        const token = normaliseTokenValue(value);
        if (!token || seen.has(token)) return false;
        seen.add(token);
        return true;
      });
  };

  const exact = normalizeOptionsList(extractOptionValues(product, 'Size'));
  if (exact.length) return exact;

  const namedOption = options.find((opt) => isSizeOptionName(opt?.name));
  const fromNamedOption = normalizeOptionsList(namedOption?.values || []);
  if (fromNamedOption.length) return fromNamedOption;

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const fromVariantOptions = normalizeOptionsList(
    variants.flatMap((variant) =>
      Array.isArray(variant?.selectedOptions)
        ? variant.selectedOptions
          .filter((option) => isSizeOptionName(option?.name))
          .map((option) => option?.value)
        : [],
    ),
  );
  if (fromVariantOptions.length) return fromVariantOptions;

  const fromOptionValues = normalizeOptionsList(
    variants.flatMap((variant) => {
      const values = variant?.optionValues;
      if (!values || typeof values !== 'object') return [];
      return Object.entries(values)
        .filter(([name]) => isSizeOptionName(name))
        .map(([, value]) => value);
    }),
  );
  if (fromOptionValues.length) return fromOptionValues;

  // Last fallback for malformed imports where only variant title has size.
  return normalizeOptionsList(
    variants
      .map((variant) => String(variant?.title || '').trim())
      .filter((value) => value && !value.includes('/')),
  );
};

export function findVariantForSize(product, size) {
  const variants = product?.variants ?? [];
  if (!variants.length) return null;

  if (!size) {
    return variants[0] ?? null;
  }

  const target = normaliseTokenValue(size);

  const matchByOption = variants.find((variant) =>
    variant.selectedOptions?.some(
      (option) =>
        isSizeOptionName(option?.name) &&
        normaliseTokenValue(option?.value) === target,
    ),
  );

  if (matchByOption) return matchByOption;

  return (
    variants.find((variant) => {
      const title = normaliseTokenValue(variant?.title);
      if (title && title === target) return true;
      const tokens =
        variant?.title
          ?.toLowerCase()
          ?.split('/')
          ?.map((token) => token.trim()) ?? [];
      return tokens.includes(target);
    }) ?? variants[0]
  );
}

export const getProductImageUrl = (product) =>
  product?.featuredImage?.url ?? product?.images?.[0]?.url ?? '';

export function toProductCard(product) {
  if (!product) return null;
  const image =
    product.featuredImage?.url ?? product.images?.[0]?.url ?? undefined;
  const imageList = Array.from(
    new Set(
      [image, ...(product.images || []).map((img) => img?.url)]
        .map((url) => (url ? String(url).trim() : ''))
        .filter(Boolean),
    ),
  );
  const secondaryImage = imageList.find((url) => url !== image) ?? null;
  const currency = product.currencyCode || DEFAULT_CURRENCY;
  return {
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    price: formatMoney(product.price, currency),
    img: image,
    images: imageList,
    hoverImg: secondaryImage,
    badge: product.tags?.includes('new') ? 'New' : undefined,
    href: `/product/${product.handle}`,
  };
}

export const fetchAllProducts = async (limit = 100, page = 1) => {
  const payload = await request(`/products${buildQuery({ limit, page, include: 'compact', skipCount: 'true' })}`);
  const items = extractList(payload, 'products');
  return items.map(mapProduct).filter(Boolean);
};

export const fetchHomepageProducts = async (section, limit = 4) => {
  if (!section) return [];
  const payload = await request(
    `/products${buildQuery({
      homepageSection: section,
      limit,
      include: 'compact',
      skipCount: 'true',
    })}`,
  );
  const items = extractList(payload, `${section} homepage products`);
  return {
    items: items.map(mapProduct).filter(Boolean),
    title:
      payload?.meta?.sectionTitle ??
      payload?.data?.meta?.sectionTitle ??
      '',
  };
};

export const fetchProductsPage = async ({
  limit = 40,
  page = 1,
  search,
  category,
  handles,
} = {}) => {
  const payload = await request(
    `/products${buildQuery({ limit, page, search, category, handles, include: 'compact' })}`,
  );
  const items = extractList(payload, 'products');
  const unwrapped = unwrap(payload);
  const meta =
    payload?.meta ??
    payload?.data?.meta ??
    (unwrapped && typeof unwrapped === 'object' ? unwrapped.meta : null) ??
    null;
  return {
    items: items.map(mapProduct).filter(Boolean),
    meta,
  };
};

export const fetchCollections = async (limit = 8) => {
  const payload = await request(`/collections${buildQuery({ limit })}`);
  const items = extractList(payload, 'collections');
  return items.map(normalizeCollection).filter(Boolean);
};

const COLLECTION_PRODUCT_LIMIT = 200;

export const fetchCollectionByHandle = async (handle) => {
  if (!handle) return null;

  const payload = await request(
    `/collections/slug/${encodeURIComponent(handle)}${buildQuery({ include: 'compact' })}`,
  );

  const collection = normalizeCollection(unwrap(payload));

  const products = Array.isArray(collection?.products)
  ? collection.products.map(mapProduct).filter(Boolean)
  : [];

  return {
    ...collection,
    products,
  };
};
export const fetchProductsFromCollection = async (handle, limit = COLLECTION_PRODUCT_LIMIT) => {
  if (!handle) return [];
  const payload = await request(
    `/products${buildQuery({ category: handle, limit, include: 'compact' })}`,
  );
  const items = extractList(payload, `products for collection "${handle}"`);
  return items.map(mapProduct).filter(Boolean);
};

export const searchProducts = async (query, limit = 20) => {
  if (!query) return [];
  const payload = await request(
    `/products${buildQuery({ search: query, limit, include: 'compact' })}`,
  );
  const items = extractList(payload, 'search results');
  return items.map(mapProduct).filter(Boolean);
};

const fetchProductsByHandles = async (handles) => {
  if (!handles?.length) return [];
  const payload = await request(
    `/products${buildQuery({
      handles: handles.join(','),
      limit: handles.length,
      include: 'compact',
    })}`,
  );
  const items = extractList(payload, 'products by handle');
  const orderByHandle = new Map(
    handles.map((handle, index) => [normaliseTokenValue(handle), index]),
  );
  return items
    .map(mapProduct)
    .filter(Boolean)
    .sort((left, right) => {
      const leftOrder = orderByHandle.get(normaliseTokenValue(left?.handle));
      const rightOrder = orderByHandle.get(normaliseTokenValue(right?.handle));
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    });
};

export const fetchProductByHandle = async (handle) => {
  if (!handle) return null;
  const payload = await request(`/products/${encodeURIComponent(handle)}`);
  const raw = unwrap(payload);
  if (!raw) return null;
  const mapped = mapProduct(raw);

  const comboHandles = deriveComboHandles(raw);
  if (comboHandles.length) {
    const comboProducts = await fetchProductsByHandles(comboHandles);
    mapped.comboItems = comboProducts;
  }

  return mapped;
};

export const fetchProductRaw = async (id, token = null) => {
  if (!id) return null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const payload = await request(`/products/${encodeURIComponent(id)}`, {
    headers,
    cache: 'no-store',
  });
  return unwrap(payload);
};

export const signUp = async ({ email, password, name }) => {
  const payload = await request('/users/signup', {
    method: 'POST',
    body: { email, password, name },
  });
  return unwrap(payload);
};

export const signIn = async ({ email, password }) => {
  const payload = await request('/users/signin', {
    method: 'POST',
    body: { email, password },
  });
  return unwrap(payload);
};

export const signInWithGoogle = async ({ idToken, name }) => {
  const payload = await request('/users/google', {
    method: 'POST',
    body: { idToken, name },
  });
  return unwrap(payload);
};

export const signInWithFirebasePhone = async ({ idToken, name }) => {
  const payload = await request('/users/firebase-phone', {
    method: 'POST',
    body: { idToken, name },
  });
  return unwrap(payload);
};

export const fetchProfile = async (token) => {
  const payload = await requestWithAuth('/users/me', token);
  return unwrap(payload);
};

export const updateProfile = async (token, data) =>
  unwrap(
    await requestWithAuth('/users/me', token, {
      method: 'PATCH',
      body: data,
    }),
  );

export const updatePassword = async (token, data) =>
  unwrap(
    await requestWithAuth('/users/me/password', token, {
      method: 'PATCH',
      body: data,
    }),
  );

export const fetchMyOrders = async (token) => {
  const payload = await requestWithAuth('/orders/my', token);
  return unwrap(payload) || [];
};

export const cancelOrder = async (token, orderId, data) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}/cancel`, token, {
      method: 'POST',
      body: data,
    }),
  );

export const requestOrderReturn = async (token, orderId, data) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}/return`, token, {
      method: 'POST',
      body: data,
    }),
  );

export const requestOrderExchange = async (token, orderId, data) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}/exchange`, token, {
      method: 'POST',
      body: data,
    }),
  );

export const fetchMyOrderRequests = async (token) => {
  const payload = await requestWithAuth('/orders/requests/my', token);
  return unwrap(payload) || [];
};

export const createOrder = async (token, data) =>
  unwrap(
    await requestWithAuth('/orders', token, {
      method: 'POST',
      body: data,
    }),
  );

export const createRazorpayOrder = async (token, data) =>
  unwrap(
    await requestWithAuth('/orders/razorpay/order', token, {
      method: 'POST',
      body: data,
    }),
  );

export const confirmRazorpayCheckout = async (token, data) =>
  unwrap(
    await requestWithAuth('/orders/razorpay/confirm', token, {
      method: 'POST',
      body: data,
    }),
  );

export const createCheckoutOrder = async (token, data) =>
  unwrap(
    await requestWithAuth('/create-order', token, {
      method: 'POST',
      body: data,
    }),
  );

export const logCheckoutDebug = async (data) =>
  unwrap(
    await request('/checkout-debug', {
      method: 'POST',
      body: data,
      keepalive: true,
    }),
  );

export const fetchShipmentTracking = async (awb) =>
  unwrap(await request(`/track/${encodeURIComponent(awb)}`));

export const fetchFastrrConfig = async () =>
  unwrap(await request('/fastrr/config'));

export const createFastrrCheckoutSession = async (token, data) =>
  unwrap(
    await requestWithAuth('/fastrr/checkout-session', token, {
      method: 'POST',
      body: data,
    }),
  );

export const fetchFastrrCheckoutStatus = async (token, params = {}) =>
  unwrap(
    await requestWithAuth(`/fastrr/checkout-status${buildQuery(params)}`, token, {
      method: 'GET',
    }),
  );

export const verifyDiscountCode = async ({ code, subtotal, currency }) =>
  unwrap(
    await request('/discounts/verify', {
      method: 'POST',
      body: { code, subtotal, currency },
    }),
  );

export const trackOrder = async ({ orderId, email, phone }) => {
  const payload = await request('/orders/track', {
    method: 'POST',
    body: { orderId, email, phone },
  });
  return unwrap(payload);
};

export const fetchReviews = async (params = {}) => {
  const payload = await request(`/reviews${buildQuery(params)}`);
  const response = unwrap(payload) || {};
  return {
    items: Array.isArray(response.items) ? response.items : [],
    meta: response.meta || {},
  };
};

export const adminFetchReviews = async (token, params = {}) => {
  const payload = await requestWithAuth(`/reviews/manage${buildQuery(params)}`, token);
  const response = unwrap(payload) || {};
  return {
    items: Array.isArray(response.items) ? response.items : [],
    meta: response.meta || {},
  };
};

export const submitReview = async (token, data) =>
  unwrap(
    await requestWithAuth('/reviews', token, {
      method: 'POST',
      body: data,
    }),
  );

export const updateReview = async (token, reviewId, data) =>
  unwrap(
    await requestWithAuth(`/reviews/${encodeURIComponent(reviewId)}`, token, {
      method: 'PUT',
      body: data,
    }),
  );

export const deleteReview = async (token, reviewId) =>
  requestWithAuth(`/reviews/${encodeURIComponent(reviewId)}`, token, {
    method: 'DELETE',
  });

export const adminLogin = async ({ email, password }) => {
  const payload = await request('/admin/login', {
    method: 'POST',
    body: { email, password },
  });
  return unwrap(payload);
};

export const fetchSiteSettings = async () =>
  unwrap(await request('/admin/site-settings'));

export const adminFetchSiteSettings = async (token) =>
  unwrap(await requestWithAuth('/admin/site-settings', token, { cache: 'no-store' }));

export const adminFetchOwnerSiteSettings = async (token) =>
  unwrap(await requestWithAuth('/admin/owner/site-settings', token, { cache: 'no-store' }));

export const adminFetchOwnerProducts = async (token) =>
  unwrap(await requestWithAuth('/admin/owner/products', token, { cache: 'no-store' }));

export const adminUpdateOwnerProductVisibility = async (token, productId, status) =>
  unwrap(
    await requestWithAuth(`/admin/owner/products/${encodeURIComponent(productId)}/visibility`, token, {
      method: 'PATCH',
      body: { status },
    }),
  );

export const adminUpdateOwnerCredentials = async (token, data) =>
  unwrap(
    await requestWithAuth('/admin/owner/credentials', token, {
      method: 'PATCH',
      body: data,
    }),
  );

export const adminUpdateSiteSettings = async (token, data) =>
  unwrap(
    await requestWithAuth('/admin/site-settings', token, {
      method: 'PATCH',
      body: data,
    }),
  );

export const adminFetchProducts = async (token, params = {}) => {
  const finalParams = { include: 'compact', ...params };
  const payload = await requestWithAuth(
    `/admin/products${buildQuery(finalParams)}`,
    token,
  );
  return payload;
};

export const adminFetchUsers = async (token, params = {}) => {
  const payload = await requestWithAuth(`/users${buildQuery(params)}`, token);
  return payload;
};

export const adminUpdateUserRole = async (token, userId, role) =>
  unwrap(
    await requestWithAuth(`/users/${encodeURIComponent(userId)}/role`, token, {
      method: 'PATCH',
      body: { role },
    }),
  );

export const adminFetchOrders = async (token, params = {}) =>
  requestWithAuth(`/orders${buildQuery(params)}`, token);

export const adminUpdateOrder = async (token, orderId, data) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}`, token, {
      method: 'PATCH',
      body: data,
    }),
  );

export const adminCreateShiprocketShipment = async (token, orderId) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}/shiprocket`, token, {
      method: 'POST',
    }),
  );

export const adminCreateShiprocketOrder = async (token, orderId) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}/shiprocket/order`, token, {
      method: 'POST',
    }),
  );

export const adminRefreshShiprocketTracking = async (token, orderId) =>
  unwrap(
    await requestWithAuth(`/orders/${encodeURIComponent(orderId)}/shiprocket/track`, token, {
      method: 'POST',
    }),
  );

export const adminFetchDiscounts = async (token) => {
  const payload = await requestWithAuth('/discounts', token);
  return unwrap(payload) || [];
};

export const adminCreateDiscount = async (token, data) =>
  unwrap(
    await requestWithAuth('/discounts', token, {
      method: 'POST',
      body: data,
    }),
  );

export const adminUpdateDiscount = async (token, id, data) =>
  unwrap(
    await requestWithAuth(`/discounts/${encodeURIComponent(id)}`, token, {
      method: 'PATCH',
      body: data,
    }),
  );

export const adminDeleteDiscount = async (token, id) =>
  unwrap(
    await requestWithAuth(`/discounts/${encodeURIComponent(id)}`, token, {
      method: 'DELETE',
    }),
  );

export const adminCreateProduct = async (token, data) =>
  unwrap(
    await requestWithAuth('/admin/products', token, {
      method: 'POST',
      body: data,
    }),
  );

export const adminUpdateProduct = async (token, id, data) =>
  unwrap(
    await requestWithAuth(`/admin/products/${encodeURIComponent(id)}`, token, {
      method: 'PUT',
      body: data,
    }),
  );

export const adminDeleteProduct = async (token, id) =>
  requestWithAuth(`/admin/products/${encodeURIComponent(id)}`, token, {
    method: 'DELETE',
  });

export const adminExportProductsCsv = async (token) =>
  requestWithAuth('/admin/products/export', token, { method: 'GET' });

export const adminImportProductsCsv = async (token, csvText) =>
  unwrap(
    await requestWithAuth('/admin/products/import-csv', token, {
      method: 'POST',
      body: { csv: csvText },
    }),
  );

export const adminFetchCollections = async (token, params = {}) =>
  unwrap(await requestWithAuth(`/collections${buildQuery(params)}`, token));

export const adminFetchCollection = async (token, id) =>
  unwrap(
    await requestWithAuth(
      `/collections/${encodeURIComponent(id)}${buildQuery({ include: 'detail' })}`,
      token,
    ),
  );

export const adminCreateCollection = async (token, data) =>
  unwrap(
    await requestWithAuth('/collections', token, {
      method: 'POST',
      body: data,
    }),
  );

export const adminUpdateCollection = async (token, id, data) =>
  unwrap(
    await requestWithAuth(`/collections/${encodeURIComponent(id)}`, token, {
      method: 'PUT',
      body: data,
    }),
  );

export const adminDeleteCollection = async (token, id) =>
  requestWithAuth(`/collections/${encodeURIComponent(id)}`, token, {
    method: 'DELETE',
  });

export const uploadImage = async (token, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const payload = await requestWithAuth('/uploads', token, {
    method: 'POST',
    body: formData,
  });
  return unwrap(payload);
};

export const uploadUserImage = async (token, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const payload = await requestWithAuth('/uploads/user', token, {
    method: 'POST',
    body: formData,
  });
  return unwrap(payload);
};

export const adminFetchStats = async (token) =>
  unwrap(await requestWithAuth('/admin/stats', token));
