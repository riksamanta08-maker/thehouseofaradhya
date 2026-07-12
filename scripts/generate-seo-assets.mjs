import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blogArticles } from '../src/content/blogArticles.js';
import { keywordLandingPages } from '../src/content/keywordLandingPages.js';
import { DEFAULT_SOCIAL_IMAGE, SITE_URL } from '../src/lib/seo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const API_BASE = (process.env.SEO_API_BASE_URL || SITE_URL).replace(/\/+$/, '');
const PAGE_SIZE = 200;
const buildTimestamp = new Date().toISOString();

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0', image: '/images/hero-poster.webp' },
  { path: '/products', changefreq: 'daily', priority: '0.9' },
  { path: '/collections/fair-skin', changefreq: 'weekly', priority: '0.9', image: '/images/skintone-fair.webp' },
  { path: '/collections/neutral-skin', changefreq: 'weekly', priority: '0.9', image: '/images/skintone-neutral.webp' },
  { path: '/collections/dark-skin', changefreq: 'weekly', priority: '0.9', image: '/images/skintone-dark.webp' },
  { path: '/shoes', changefreq: 'weekly', priority: '0.9' },
  { path: '/shoes/loafers', changefreq: 'weekly', priority: '0.9' },
  { path: '/shoes/boots', changefreq: 'weekly', priority: '0.9' },
  { path: '/shoes/sneakers', changefreq: 'weekly', priority: '0.9' },
  { path: '/shoes/sandals', changefreq: 'weekly', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/faq', changefreq: 'monthly', priority: '0.5' },
  { path: '/blog', changefreq: 'weekly', priority: '0.6' },
  { path: '/cancel-refund-exchange', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal/privacy-policy', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal/terms-of-use', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal/money-back-policy', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal/refund-return-policy', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal/refund-process', changefreq: 'monthly', priority: '0.3' },
  { path: '/legal/cookie-policy', changefreq: 'monthly', priority: '0.3' },
  ...keywordLandingPages.map((page) => ({
    path: page.path,
    changefreq: 'weekly',
    priority: page.pageType === 'guide' ? '0.85' : '0.8',
    image: page.heroImageWebp || page.heroImage,
  })),
];

const toAbsoluteUrl = (pathname) => new URL(pathname, SITE_URL).toString();

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const normalizeDate = (value, fallback = buildTimestamp) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
};

const normalizeImageUrl = (value) => {
  if (!value) return null;
  const source = String(value).trim();
  if (!source) return null;
  return source.startsWith('http://') || source.startsWith('https://')
    ? source
    : toAbsoluteUrl(source.startsWith('/') ? source : `/${source}`);
};

const normalizeImageAlt = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const uniqueImages = (images = []) => {
  const seen = new Set();
  return images.filter((image) => {
    const key = `${image.loc}::${image.caption || ''}`;
    if (!image.loc || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function createUrlsetXml(urls, { includeImages = false } = {}) {
  const xmlns = includeImages
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : '';

  const body = urls
    .map((entry) => {
      const parts = [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <lastmod>${escapeXml(entry.lastmod || buildTimestamp)}</lastmod>`,
        `    <changefreq>${escapeXml(entry.changefreq || 'weekly')}</changefreq>`,
        `    <priority>${escapeXml(entry.priority || '0.5')}</priority>`,
      ];

      if (includeImages) {
        uniqueImages(entry.images).forEach((image) => {
          parts.push('    <image:image>');
          parts.push(`      <image:loc>${escapeXml(image.loc)}</image:loc>`);
          if (image.caption) {
            parts.push(`      <image:caption>${escapeXml(image.caption)}</image:caption>`);
          }
          parts.push('    </image:image>');
        });
      }

      parts.push('  </url>');
      return parts.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlns}>\n${body}\n</urlset>\n`;
}

function createSitemapIndexXml(items) {
  const body = items
    .map(
      (item) => `  <sitemap>\n    <loc>${escapeXml(item.loc)}</loc>\n    <lastmod>${escapeXml(
        item.lastmod || buildTimestamp,
      )}</lastmod>\n  </sitemap>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

function createRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nDisallow: /admin\nDisallow: /admin/\nDisallow: /api/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /checkout/\nDisallow: /login\nDisallow: /register\nDisallow: /profile\nDisallow: /wishlist\nDisallow: /search\nDisallow: /*?*sort=\nDisallow: /*?*utm_\nDisallow: /*?*fbclid=\nDisallow: /*?*gclid=\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchAllProducts() {
  const items = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const url = `${API_BASE}/api/products?limit=${PAGE_SIZE}&page=${page}&include=compact`;
    const payload = await fetchJson(url);
    const batch = Array.isArray(payload?.data) ? payload.data : [];
    const metaTotal = Number(payload?.meta?.total);

    if (Number.isFinite(metaTotal) && metaTotal > 0) {
      total = metaTotal;
    }

    items.push(...batch);

    if (!batch.length || batch.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return items;
}

async function fetchAllCollections() {
  const items = [];
  let page = 1;

  while (true) {
    const url = `${API_BASE}/api/collections?limit=${PAGE_SIZE}&page=${page}`;
    const payload = await fetchJson(url);
    const batch = Array.isArray(payload?.data) ? payload.data : [];

    items.push(...batch);

    if (!batch.length || batch.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return items;
}

function buildEntryImages({ image, imageAlt, images = [] }) {
  const normalized = [];

  const pushImage = (value, caption) => {
    const loc = normalizeImageUrl(value);
    if (!loc) return;
    normalized.push({
      loc,
      caption: normalizeImageAlt(caption),
    });
  };

  pushImage(image, imageAlt);
  images.forEach((item) => {
    pushImage(item?.url || item?.src || item, item?.alt || item?.altText || imageAlt);
  });

  if (!normalized.length) {
    pushImage(DEFAULT_SOCIAL_IMAGE, imageAlt);
  }

  return uniqueImages(normalized);
}

function createPriorityForProduct(product) {
  const updatedAt = new Date(product?.updatedAt || product?.publishedAt || 0);
  const ageInDays = Number.isFinite(updatedAt.getTime())
    ? Math.round((Date.now() - updatedAt.getTime()) / 86400000)
    : Number.POSITIVE_INFINITY;

  return ageInDays <= 120 ? '0.8' : '0.7';
}

async function main() {
  const pageEntries = [];
  const imageEntries = [];
  const seenPages = new Set();
  const seenImages = new Set();

  const registerPage = (entry) => {
    if (!entry?.loc || seenPages.has(entry.loc)) return;
    seenPages.add(entry.loc);

    const images = buildEntryImages(entry);
    const normalizedEntry = {
      loc: entry.loc,
      lastmod: normalizeDate(entry.lastmod),
      changefreq: entry.changefreq || 'weekly',
      priority: entry.priority || '0.5',
      images,
    };

    pageEntries.push(normalizedEntry);

    images.forEach((image) => {
      const key = `${normalizedEntry.loc}::${image.loc}`;
      if (seenImages.has(key)) return;
      seenImages.add(key);
      imageEntries.push({
        ...normalizedEntry,
        images: [image],
      });
    });
  };

  STATIC_ROUTES.forEach((route) => {
    registerPage({
      loc: toAbsoluteUrl(route.path),
      lastmod: route.lastmod,
      changefreq: route.changefreq,
      priority: route.priority,
      image: route.image,
      imageAlt: route.path === '/' ? 'The House of Aradhya homepage hero' : `${route.path} page image`,
    });
  });

  blogArticles.forEach((article) => {
    registerPage({
      loc: toAbsoluteUrl(`/blog/${article.slug}`),
      lastmod: article.updatedAt || article.publishedAt,
      changefreq: 'monthly',
      priority: '0.6',
      image: article.coverImage,
      imageAlt: article.coverAlt || article.title,
    });
  });

  try {
    const [products, collections] = await Promise.all([fetchAllProducts(), fetchAllCollections()]);

    collections.forEach((collection) => {
      if (!collection?.handle) return;
      registerPage({
        loc: toAbsoluteUrl(`/collections/${collection.handle}`),
        lastmod: collection.updatedAt || collection.publishedAt,
        changefreq: 'weekly',
        priority: '0.9',
        image:
          collection.image?.url ||
          collection.featuredImage?.url ||
          collection.heroImage?.url ||
          collection.products?.[0]?.featuredImage?.url,
        imageAlt:
          collection.image?.altText ||
          collection.featuredImage?.altText ||
          `${collection.title || collection.handle} collection image`,
      });
    });

    products.forEach((product) => {
      if (!product?.handle) return;
      registerPage({
        loc: toAbsoluteUrl(`/product/${product.handle}`),
        lastmod: product.updatedAt || product.publishedAt,
        changefreq: 'weekly',
        priority: createPriorityForProduct(product),
        image: product.featuredImage?.url || product.image?.url,
        imageAlt:
          product.featuredImage?.altText ||
          product.image?.altText ||
          `${product.title || product.handle} product image`,
        images: Array.isArray(product.images) ? product.images.slice(0, 10) : [],
      });
    });
  } catch (error) {
    console.warn(`[seo] Unable to fully hydrate sitemap from API: ${error.message}`);
  }

  await fs.mkdir(publicDir, { recursive: true });

  const pageSitemapName = 'sitemap-pages.xml';
  const imageSitemapName = 'sitemap-images.xml';

  await fs.writeFile(
    path.join(publicDir, pageSitemapName),
    createUrlsetXml(pageEntries, { includeImages: true }),
    'utf8',
  );
  await fs.writeFile(
    path.join(publicDir, imageSitemapName),
    createUrlsetXml(imageEntries, { includeImages: true }),
    'utf8',
  );
  await fs.writeFile(
    path.join(publicDir, 'sitemap.xml'),
    createSitemapIndexXml([
      { loc: toAbsoluteUrl(`/${pageSitemapName}`), lastmod: buildTimestamp },
      { loc: toAbsoluteUrl(`/${imageSitemapName}`), lastmod: buildTimestamp },
    ]),
    'utf8',
  );
  await fs.writeFile(path.join(publicDir, 'robots.txt'), createRobotsTxt(), 'utf8');

  console.log(`[seo] Generated ${pageSitemapName} with ${pageEntries.length} URLs`);
  console.log(`[seo] Generated ${imageSitemapName} with ${imageEntries.length} image URLs`);
  console.log('[seo] Generated sitemap.xml index');
  console.log('[seo] Generated robots.txt');
}

main().catch((error) => {
  console.error('[seo] Failed to generate SEO assets', error);
  process.exitCode = 1;
});
