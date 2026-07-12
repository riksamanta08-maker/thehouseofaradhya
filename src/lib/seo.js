export const SITE_NAME = 'The House of Aradhya';
export const SITE_SHORT_NAME = 'Aradhya';
export const SITE_URL = 'https://www.thehouseofaradhya.com';
export const SITE_LOGO_URL = `${SITE_URL}/aradhya-logo.png`;
export const DEFAULT_SOCIAL_IMAGE = SITE_LOGO_URL;
export const DEFAULT_LOCALE = 'en_IN';

export const TARGET_KEYWORDS = [
  'Aradhya designer wear',
  'men outfit combination',
  'skintone based outfit combinations for men',
  'men outfit under 2500',
  'shirt and pant shoes combination for men',
  'best colour combination for men',
  'men fashion for dark skin tone',
  'men fashion for fair skin tone',
  'men fashion for wheatish skin tone',
  'men fashion for neutral skin tone',
  'what to wear for date men india',
  'party outfit for men india',
  'college outfit for men india',
  'old money outfits for men india',
];

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'srsltid',
]);

export function absoluteUrl(path = '/') {
  if (!path) return SITE_URL;
  return new URL(path, SITE_URL).toString();
}

export function buildCanonicalUrl(path = '/', { keepQueryParams = [] } = {}) {
  const url = new URL(path, SITE_URL);
  const keepSet = new Set(
    (Array.isArray(keepQueryParams) ? keepQueryParams : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  );

  Array.from(url.searchParams.keys()).forEach((key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (normalizedKey.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(normalizedKey)) {
      url.searchParams.delete(key);
      return;
    }

    if (!keepSet.has(key)) {
      url.searchParams.delete(key);
    }
  });

  url.hash = '';
  return url.toString();
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateText(value, maxLength = 160) {
  const cleaned = stripHtml(value);
  if (!cleaned || cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeImageUrl(value, fallback = DEFAULT_SOCIAL_IMAGE) {
  if (!value) return fallback;
  const source = String(value).trim();
  if (!source) return fallback;
  if (source.startsWith('http://') || source.startsWith('https://')) return source;
  return absoluteUrl(source.startsWith('/') ? source : `/${source}`);
}

export function createKeywordList(keywords = []) {
  return Array.from(new Set(keywords.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function buildOrganizationSchema({
  description = 'The House of Aradhya is an Indian premium ecommerce brand.',
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: SITE_LOGO_URL,
    image: SITE_LOGO_URL,
    description,
  };
}

export function buildWebsiteSchema({
  description = 'Shop The House of Aradhya online in India.',
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: SITE_SHORT_NAME,
    url: SITE_URL,
    description,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildWebPageSchema({
  name,
  description,
  url,
  image,
  about,
  isPartOf,
} = {}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
  };

  if (image) {
    schema.primaryImageOfPage = normalizeImageUrl(image, DEFAULT_SOCIAL_IMAGE);
  }

  if (about) {
    schema.about = about;
  }

  if (isPartOf) {
    schema.isPartOf = isPartOf;
  }

  return schema;
}

export function buildBreadcrumbSchema(items = []) {
  const normalizedItems = items.filter((item) => item?.name && item?.url);
  if (!normalizedItems.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: normalizedItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqSchema(items = []) {
  const entities = items
    .filter((item) => item?.question && item?.answer)
    .map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: stripHtml(item.answer),
      },
    }));

  if (!entities.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entities,
  };
}

export function buildAggregateRatingSchema(summary) {
  const average = Number(summary?.average);
  const count = Number(summary?.count);
  if (!Number.isFinite(average) || !Number.isFinite(count) || count <= 0) {
    return null;
  }

  return {
    '@type': 'AggregateRating',
    ratingValue: Number(average.toFixed(1)),
    reviewCount: count,
  };
}

export function buildReviewSchema(reviews = []) {
  return reviews
    .slice(0, 3)
    .map((review) => {
      const author = String(review?.author || review?.name || 'Customer').trim();
      const body = stripHtml(review?.body || review?.comment || review?.text || '');
      const rating = Number(review?.rating);
      const reviewDate = review?.date || review?.createdAt || review?.created_at || null;

      if (!body) return null;

      const reviewSchema = {
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: author || 'Customer',
        },
        reviewBody: body,
      };

      if (Number.isFinite(rating) && rating > 0) {
        reviewSchema.reviewRating = {
          '@type': 'Rating',
          ratingValue: rating,
          bestRating: 5,
        };
      }

      if (reviewDate) {
        reviewSchema.datePublished = reviewDate;
      }

      return reviewSchema;
    })
    .filter(Boolean);
}

export function buildProductSchema({
  name,
  description,
  image,
  sku,
  url,
  price,
  currency = 'INR',
  availability = 'https://schema.org/InStock',
  aggregateRating = null,
  reviews = [],
  brand = SITE_SHORT_NAME,
}) {
  const normalizedImages = Array.isArray(image)
    ? image.map((entry) => normalizeImageUrl(entry, '')).filter(Boolean)
    : [normalizeImageUrl(image, '')].filter(Boolean);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image: normalizedImages,
    url,
    brand: {
      '@type': 'Brand',
      name: brand,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: currency,
      price,
      availability,
      url,
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  if (sku) {
    schema.sku = sku;
  }

  if (aggregateRating) {
    schema.aggregateRating = aggregateRating;
  }

  const reviewEntries = buildReviewSchema(reviews);
  if (reviewEntries.length) {
    schema.review = reviewEntries;
  }

  return schema;
}
