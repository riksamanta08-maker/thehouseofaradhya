import { useEffect } from 'react';
import {
  buildCanonicalUrl,
  createKeywordList,
  DEFAULT_LOCALE,
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
} from '../lib/seo';

const upsertMetaTag = (selector, attributes, content) => {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
};

const upsertLinkTag = (selector, attributes, href) => {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('link');
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

const syncPreloadImages = (images = []) => {
  const uniqueImages = Array.from(
    new Set((Array.isArray(images) ? images : []).map((item) => String(item || '').trim()).filter(Boolean)),
  );
  const existing = Array.from(document.head.querySelectorAll('link[data-seo-preload-image="true"]'));

  uniqueImages.forEach((href, index) => {
    const selector = `link[data-seo-preload-image="true"][data-preload-index="${index}"]`;
    let element = document.head.querySelector(selector);

    if (!element) {
      element = document.createElement('link');
      element.rel = 'preload';
      element.as = 'image';
      element.setAttribute('data-seo-preload-image', 'true');
      element.setAttribute('data-preload-index', String(index));
      document.head.appendChild(element);
    }

    element.href = href;
    element.setAttribute('fetchpriority', 'high');
  });

  existing
    .filter((element) => Number(element.getAttribute('data-preload-index')) >= uniqueImages.length)
    .forEach((element) => element.remove());
};

const upsertStructuredData = (data) => {
  const scripts = Array.isArray(data) ? data.filter(Boolean) : data ? [data] : [];
  const existing = Array.from(document.head.querySelectorAll('script[data-seo-structured-data="true"]'));

  if (!scripts.length) {
    existing.forEach((element) => element.remove());
    return;
  }

  scripts.forEach((entry, index) => {
    const scriptId = `seo-structured-data-${index}`;
    let element = document.head.querySelector(`#${scriptId}`);

    if (!element) {
      element = document.createElement('script');
      element.id = scriptId;
      element.type = 'application/ld+json';
      element.setAttribute('data-seo-structured-data', 'true');
      document.head.appendChild(element);
    }

    element.textContent = JSON.stringify(entry);
  });

  existing
    .filter((element) => Number(element.id.replace('seo-structured-data-', '')) >= scripts.length)
    .forEach((element) => element.remove());
};

const SeoHead = ({
  title,
  description,
  keywords = [],
  canonicalPath = '/',
  type = 'website',
  image = DEFAULT_SOCIAL_IMAGE,
  imageAlt = SITE_NAME,
  preloadImages = [],
  structuredData = null,
  noIndex = false,
}) => {
  useEffect(() => {
    const finalTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    const finalDescription = description || `${SITE_NAME} premium ecommerce store in India.`;
    const finalKeywords = createKeywordList(keywords);
    const canonicalUrl = buildCanonicalUrl(canonicalPath);

    document.title = finalTitle;

    upsertMetaTag('meta[name="description"]', { name: 'description' }, finalDescription);
    if (finalKeywords.length) {
      upsertMetaTag('meta[name="keywords"]', { name: 'keywords' }, finalKeywords.join(', '));
    }
    upsertMetaTag(
      'meta[name="robots"]',
      { name: 'robots' },
      noIndex ? 'noindex, nofollow' : 'index, follow',
    );

    upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, finalTitle);
    upsertMetaTag(
      'meta[property="og:description"]',
      { property: 'og:description' },
      finalDescription,
    );
    upsertMetaTag('meta[property="og:type"]', { property: 'og:type' }, type);
    upsertMetaTag('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
    upsertMetaTag('meta[property="og:site_name"]', { property: 'og:site_name' }, SITE_NAME);
    upsertMetaTag('meta[property="og:locale"]', { property: 'og:locale' }, DEFAULT_LOCALE);
    upsertMetaTag('meta[property="og:image"]', { property: 'og:image' }, image);
    upsertMetaTag('meta[property="og:image:alt"]', { property: 'og:image:alt' }, imageAlt);

    upsertMetaTag(
      'meta[name="twitter:card"]',
      { name: 'twitter:card' },
      'summary_large_image',
    );
    upsertMetaTag('meta[name="twitter:site"]', { name: 'twitter:site' }, '@thehouseofaradhya');
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, finalTitle);
    upsertMetaTag(
      'meta[name="twitter:description"]',
      { name: 'twitter:description' },
      finalDescription,
    );
    upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, image);
    upsertMetaTag('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt' }, imageAlt);

    upsertLinkTag('link[rel="canonical"]', { rel: 'canonical' }, canonicalUrl);
    syncPreloadImages(preloadImages);
    upsertStructuredData(structuredData);
  }, [canonicalPath, description, image, imageAlt, keywords, noIndex, preloadImages, structuredData, title, type]);

  return null;
};

export default SeoHead;
