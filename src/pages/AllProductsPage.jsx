import MobilePageHeader from '../components/MobilePageHeader';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import SeoHead from '../components/SeoHead';
import { useCatalog } from '../contexts/catalog-context';
import { fetchProductsPage, normaliseTokenValue, toProductCard } from '../lib/api';
import {
  buildBreadcrumbSchema,
  buildOrganizationSchema,
} from '../lib/seo';

const normalizeForMatch = (value) => {
  const normalized = normaliseTokenValue(value);
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim();
};

const formatLabel = (value) => {
  if (!value) return '';
  return value
    .toString()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const tokenize = (value) => normalizeForMatch(value).split(' ').filter(Boolean);

const uniqueTokens = (values) => Array.from(new Set(values.filter(Boolean)));

const matchesToken = (source, targetTokens) => {
  if (!source || targetTokens.length === 0) return false;
  const sourceTokens = tokenize(source);
  if (sourceTokens.length === 0) return false;
  if (targetTokens.length === 1) {
    const target = targetTokens[0];
    if (sourceTokens.includes(target)) return true;
    return sourceTokens.some((token) => token.includes(target));
  }
  if (targetTokens.every((token) => sourceTokens.includes(token))) return true;
  const collapsedSource = sourceTokens.join('');
  const collapsedTarget = targetTokens.join('');
  return collapsedSource.includes(collapsedTarget);
};

const productMatchesFilter = (product, filterToken) => {
  if (!filterToken) return true;
  const targetTokens = tokenize(filterToken);
  if (targetTokens.length === 0) return true;

  const tags = Array.isArray(product?.tags) ? product.tags : [];
  const collections = Array.isArray(product?.collections) ? product.collections : [];
  const candidates = [
    product?.title,
    product?.productType,
    product?.category,
    ...tags,
    ...collections.map((collection) => collection?.handle),
    ...collections.map((collection) => collection?.title),
  ].filter(Boolean);

  if (candidates.some((candidate) => matchesToken(candidate, targetTokens))) return true;

  // Also check if any candidate CONTAINS the target token as a substring
  if (targetTokens.length === 1) {
    const target = targetTokens[0];
    if (candidates.some((candidate) => String(candidate).toLowerCase().includes(target))) return true;
  }

  if (targetTokens.length > 1) {
    const candidateTokens = uniqueTokens(candidates.flatMap((candidate) => tokenize(candidate)));
    if (!candidateTokens.length) return false;
    return targetTokens.every((token) =>
      candidateTokens.some((candidateToken) => candidateToken === token || candidateToken.includes(token)),
    );
  }

  return false;
};

const OCCASION_SYNONYMS = {
  puja: ['puja', 'festive', 'festival', 'ethnic', 'traditional'],
  festive: ['festive', 'puja', 'festival', 'ethnic', 'traditional'],
  ethnic: ['ethnic', 'traditional', 'puja', 'festive', 'festival'],
  formal: ['formal', 'office', 'work', 'professional'],
  office: ['office', 'formal', 'work', 'professional'],
  casual: ['casual', 'date', 'daily'],
  date: ['date', 'casual', 'daily'],
};

const buildOccasionTokens = (value) => {
  const normalized = normalizeForMatch(value);
  if (!normalized || normalized === 'all') return [];
  const tokens = tokenize(normalized);
  const base = tokens[0] || normalized;
  const synonyms = OCCASION_SYNONYMS[base] ?? [];
  if (tokens.length <= 1) return uniqueTokens([normalized, ...synonyms]);
  return uniqueTokens([normalized, base, ...synonyms]);
};

const toCanonicalSkintone = (value) => {
  const tokens = tokenize(value);
  if (!tokens.length) return '';
  if (tokens.includes('fair')) return 'fair';
  if (tokens.includes('neutral') || tokens.includes('natural')) return 'neutral';
  if (tokens.includes('dark')) return 'dark';
  return tokens[0];
};

const toCanonicalOccasion = (value) => {
  const tokens = tokenize(value);
  if (!tokens.length) return '';
  if (tokens.includes('puja') || tokens.includes('festive') || tokens.includes('festival') || tokens.includes('ethnic') || tokens.includes('traditional')) return 'puja';
  if (tokens.includes('office') || tokens.includes('work') || tokens.includes('formal') || tokens.includes('professional')) return 'formal';
  if (tokens.includes('date') || tokens.includes('casual')) return 'casual';
  if (tokens.includes('party')) return 'party';
  return tokens[0];
};

const normalizeRuleValues = (value, canonicalize) => {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return uniqueTokens(values.map((item) => canonicalize(item)).filter(Boolean));
};

const getStorefrontFlowRule = (collection) => {
  const rules = collection?.rules;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return null;
  const flow = rules.storefrontFlow;
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) return null;
  if (flow.enabled === false) return null;
  return {
    skintones: normalizeRuleValues(flow.skintones, toCanonicalSkintone),
    occasions: normalizeRuleValues(flow.occasions, toCanonicalOccasion),
  };
};

const productMatchesStorefrontFlow = (product, { skintone = '', occasion = '' } = {}) => {
  const collections = Array.isArray(product?.collections) ? product.collections : [];
  if (!collections.length) return false;

  return collections.some((collection) => {
    const flow = getStorefrontFlowRule(collection);
    if (!flow) return false;
    const matchesSkintone =
      !skintone || flow.skintones.length === 0 || flow.skintones.includes(skintone);
    const matchesOccasion =
      !occasion || flow.occasions.length === 0 || flow.occasions.includes(occasion);
    return matchesSkintone && matchesOccasion;
  });
};

const isBundleProduct = (product) => {
  if (!product) return false;

  // If the product belongs to ANY collection, it is a curated product that should be shown!
  if (Array.isArray(product.collections) && product.collections.length > 0) return true;

  // 1. Check metafields (most definitive check)
  const metafields = Array.isArray(product.metafields) ? product.metafields : [];
  const hasBundleMetafield = metafields.some(
    (f) =>
      String(f?.namespace || '').trim().toLowerCase() === 'custom' &&
      (String(f?.key || '').trim().toLowerCase() === 'combo_items' ||
        String(f?.key || '').trim().toLowerCase() === 'bundle_items')
  );
  if (hasBundleMetafield) return true;

  // 2. Check productType
  const type = String(product.productType || '').toLowerCase();
  if (type.includes('bundle') || type.includes('combo') || type.includes('combination') || type.includes('set') || type.includes('shirt,pant,shoes') || type.includes(',')) return true;

  // 3. Check title
  const title = String(product.title || '').toLowerCase();
  if (title.includes('bundle') || title.includes('combo') || title.includes('combination') || title.includes('set') || title.includes('outfit')) return true;

  // 4. Check tags for bundle/combo/outfit indicators
  const tags = Array.isArray(product.tags) ? product.tags.map((t) => String(t).toLowerCase()) : [];
  if (tags.some((t) => t.includes('bundle') || t.includes('combo') || t.includes('outfit') || t.includes('combination'))) return true;

  return false;
};

const hasExplicitSortingRule = (product, skintone, occasion) => {
  if (!product || !skintone) return false;
  const metafields = Array.isArray(product.metafields) ? product.metafields : [];
  const skintoneKey = String(skintone).toLowerCase();
  return metafields.some((f) => {
    const ns = String(f?.namespace || '').trim().toLowerCase();
    const key = String(f?.key || '').trim().toLowerCase();
    if (ns !== 'custom') return false;
    if (occasion) {
      const occasionKey = String(occasion).toLowerCase();
      return key === `order_${skintoneKey}_${occasionKey}`;
    } else {
      return key.startsWith(`order_${skintoneKey}_`);
    }
  });
};

const hasExplicitSkintoneRestriction = (product, skintoneKey) => {
  const skintoneWords = ['fair', 'neutral', 'dark'];
  const otherSkintones = skintoneWords.filter((w) => w !== skintoneKey);
  const metafields = Array.isArray(product.metafields) ? product.metafields : [];

  // Check if there is an explicit sorting rule for the CURRENT skintone
  const hasCurrentSortingRule = metafields.some((f) => {
    const ns = String(f?.namespace || '').trim().toLowerCase();
    const key = String(f?.key || '').trim().toLowerCase();
    return ns === 'custom' && key.startsWith(`order_${skintoneKey.toLowerCase()}_`);
  });
  if (hasCurrentSortingRule) return false;

  const hasOtherSortingRule = metafields.some((f) => {
    const ns = String(f?.namespace || '').trim().toLowerCase();
    const key = String(f?.key || '').trim().toLowerCase();
    return ns === 'custom' && otherSkintones.some((other) => key.startsWith(`order_${other}_`));
  });
  if (hasOtherSortingRule) return true;

  const tags = Array.isArray(product.tags) ? product.tags : [];
  const collections = Array.isArray(product.collections) ? product.collections : [];
  const candidates = [
    ...tags,
    ...collections.map((c) => c?.handle),
    ...collections.map((c) => c?.title),
  ].filter(Boolean);

  // Check if it explicitly belongs to the CURRENT skintone
  const belongsToCurrent = candidates.some((candidate) => {
    const norm = String(candidate).toLowerCase();
    return norm.includes(skintoneKey.toLowerCase()) || (skintoneKey.toLowerCase() === 'neutral' && norm.includes('natural'));
  });
  if (belongsToCurrent) return false;

  return candidates.some((candidate) => {
    const norm = String(candidate).toLowerCase();
    return otherSkintones.some((other) => norm.includes(other));
  });
};


const hasSpecificSkintoneInfo = (product) => {
  const collections = Array.isArray(product?.collections) ? product.collections : [];
  
  // 1. Check storefrontFlow rules
  const hasSkintoneFlowRule = collections.some((collection) => {
    const flow = getStorefrontFlowRule(collection);
    return flow && flow.skintones && flow.skintones.length > 0;
  });
  if (hasSkintoneFlowRule) return true;

  // 2. Check tags and collection titles/handles
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  const candidates = [
    ...tags,
    ...collections.map((c) => c?.handle),
    ...collections.map((c) => c?.title),
  ].filter(Boolean);

  const skintoneWords = ['fair', 'neutral', 'natural', 'dark'];
  return candidates.some((candidate) => {
    const norm = String(candidate).toLowerCase();
    return skintoneWords.some((word) => norm.includes(word));
  });
};

const hasSpecificOccasionInfo = (product) => {
  const collections = Array.isArray(product?.collections) ? product.collections : [];
  
  // 1. Check storefrontFlow rules
  const hasOccasionFlowRule = collections.some((collection) => {
    const flow = getStorefrontFlowRule(collection);
    return flow && flow.occasions && flow.occasions.length > 0;
  });
  if (hasOccasionFlowRule) return true;

  // 2. Check tags and collection titles/handles
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  const candidates = [
    ...tags,
    ...collections.map((c) => c?.handle),
    ...collections.map((c) => c?.title),
  ].filter(Boolean);

  const occasionWords = [
    'puja', 'festive', 'festival', 'ethnic', 'traditional',
    'formal', 'office', 'work', 'professional',
    'date', 'party', 'casual'
  ];
  return candidates.some((candidate) => {
    const norm = String(candidate).toLowerCase();
    return occasionWords.some((word) => norm.includes(word));
  });
};

const SKINTONE_GROUPS = [
  { id: 'fair', label: 'Fair Skin', tokens: ['fair skin', 'fair'] },
  { id: 'neutral', label: 'Neutral Skin', tokens: ['neutral skin', 'neutral', 'natural skin', 'natural'] },
  { id: 'dark', label: 'Dark Skin', tokens: ['dark skin', 'dark'] },
];

const PAGE_SIZE = 40;

const mergeUniqueProducts = (existing, incoming) => {
  const seen = new Set();
  const merged = [];

  [...existing, ...incoming].forEach((item) => {
    const key = item?.handle || item?.id;
    if (!key) {
      merged.push(item);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
};

const getProductMetafieldOrder = (product, skintone, occasion) => {
  if (!product || !skintone || !occasion) return Number.MAX_SAFE_INTEGER;
  const metafields = Array.isArray(product.metafields) ? product.metafields : [];
  const keyToFind = `order_${String(skintone).toLowerCase()}_${String(occasion).toLowerCase()}`;
  const field = metafields.find(
    (f) =>
      String(f?.namespace || '').trim().toLowerCase() === 'custom' &&
      String(f?.key || '').trim().toLowerCase() === keyToFind,
  );
  if (!field) return Number.MAX_SAFE_INTEGER;
  const num = Number(field.value);
  return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
};

const sortProducts = (items, sortBy, skintone, occasion) => {
  const sorted = [...items];
  if (sortBy === 'recommended' && skintone && occasion) {
    sorted.sort((a, b) => {
      const orderA = getProductMetafieldOrder(a, skintone, occasion);
      const orderB = getProductMetafieldOrder(b, skintone, occasion);
      if (orderA !== orderB) return orderA - orderB;
      // Stable fallback: sort by title or id
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  } else if (sortBy === 'price_low') {
    sorted.sort((a, b) => (a?.price ?? 0) - (b?.price ?? 0));
  } else if (sortBy === 'price_high') {
    sorted.sort((a, b) => (b?.price ?? 0) - (a?.price ?? 0));
  } else if (sortBy === 'new') {
    sorted.sort((a, b) => String(b?.id || '').localeCompare(String(a?.id || '')));
  }
  return sorted;
};

const AllProductsPage = ({ initialCategory = 'all' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') ?? initialCategory;
  const rawSkintone = searchParams.get('skintone');
  const rawOccasion = searchParams.get('occasion');
  const skintoneFilter = normalizeForMatch(searchParams.get('skintone'));
  const occasionFilter = normalizeForMatch(searchParams.get('occasion'));
  const hasOccasionFilter = occasionFilter && occasionFilter !== 'all';

  const normalizedCategory = normalizeForMatch(activeCategory);
  const skintoneFromCategory = SKINTONE_GROUPS.find((group) =>
    group.tokens.some((token) => matchesToken(normalizedCategory, tokenize(token))),
  );
  const isSkintoneCategory = Boolean(skintoneFromCategory);
  const hasExplicitSkintone = skintoneFilter && skintoneFilter !== 'all';
  const hasSkintoneFilter = hasExplicitSkintone || isSkintoneCategory;
  const skintoneGroupFromFilter = hasExplicitSkintone
    ? SKINTONE_GROUPS.find((group) =>
      group.tokens.some((token) => normalizeForMatch(token) === skintoneFilter),
    )
    : null;
  const skintoneTokens = useMemo(
    () =>
      hasExplicitSkintone
        ? (skintoneGroupFromFilter ? skintoneGroupFromFilter.tokens : [skintoneFilter])
        : (skintoneFromCategory ? skintoneFromCategory.tokens : []),
    [hasExplicitSkintone, skintoneFilter, skintoneFromCategory, skintoneGroupFromFilter],
  );
  const occasionTokens = useMemo(() => buildOccasionTokens(occasionFilter), [occasionFilter]);
  const selectedSkintoneKey = hasExplicitSkintone
    ? toCanonicalSkintone(skintoneGroupFromFilter?.id || rawSkintone || skintoneFilter)
    : (isSkintoneCategory ? toCanonicalSkintone(skintoneFromCategory?.id || activeCategory) : '');
  const selectedOccasionKey = hasOccasionFilter
    ? toCanonicalOccasion(rawOccasion || occasionFilter)
    : '';

  const isShowcaseCollectionMode = Boolean(selectedSkintoneKey && selectedOccasionKey);
  const isAllMode = (activeCategory === 'all' || isSkintoneCategory) && !isShowcaseCollectionMode;
  const { products: catalogProducts, ensureCollectionProducts } = useCatalog();
  const [collectionProducts, setCollectionProducts] = useState([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [pagedProducts, setPagedProducts] = useState([]);
  const [pagedLoading, setPagedLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [catalogTotal, setCatalogTotal] = useState(null);
  const [sortBy, setSortBy] = useState('recommended');
  const bottomBoundaryRef = useRef(null);

  useEffect(() => {
    if (!isAllMode || !hasMore || pagedLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1, rootMargin: '150px' }
    );

    const target = bottomBoundaryRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [isAllMode, hasMore, pagedLoading]);

  useEffect(() => {
    if (!isAllMode) return;
    setPagedProducts([]);
    setPage(1);
    setHasMore(true);
    setCatalogTotal(null);
  }, [activeCategory, isAllMode, occasionFilter, skintoneFilter]);

  useEffect(() => {
    if (!isAllMode) return;
    let cancelled = false;

    async function loadPage() {
      setPagedLoading(true);
      try {
        // When an occasion filter is active, load all products without a backend
        // category filter — occasion matching is done client-side via tags/collections.
        // When a skintone filter is active (but no occasion), use it as a category hint.
        const fetchParams = {
          page: hasOccasionFilter ? 1 : page,
          limit: hasOccasionFilter ? 200 : PAGE_SIZE,
          category: hasOccasionFilter
            ? undefined
            : (hasExplicitSkintone ? skintoneFilter : undefined),
        };
        const { items, meta } = await fetchProductsPage(fetchParams);
        if (cancelled) return;
        setPagedProducts((prev) => {
          // When loading for an occasion filter, replace instead of append
          const base = hasOccasionFilter ? [] : prev;
          const merged = mergeUniqueProducts(base, items);
          if (hasOccasionFilter) {
            // All results fetched at once; disable "load more"
            setHasMore(false);
            setCatalogTotal(merged.length);
          } else if (meta?.total != null) {
            setCatalogTotal(meta.total);
            setHasMore(merged.length < meta.total);
          } else {
            setHasMore(items.length === PAGE_SIZE);
          }
          return merged;
        });
      } catch (error) {
        console.error('Failed to load products', error);
        if (!cancelled) {
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
          setPagedLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [isAllMode, page, occasionFilter, skintoneFilter, hasOccasionFilter, hasExplicitSkintone]);

  // Load products based on category (collection handle)
  useEffect(() => {
    if (isAllMode) return;
    let cancelled = false;
    setCollectionLoading(true);

    async function loadCollection() {
      try {
        // Construct target handle based on showcase collection mode or activeCategory
        const targetHandle = isShowcaseCollectionMode
  ? `${selectedSkintoneKey}-skintone-${selectedOccasionKey}-wear`
  : activeCategory;

        // Step 1: Try loading the primary target collection
        try {
          const products = await ensureCollectionProducts(targetHandle);
          if (!cancelled) {
            setCollectionProducts(products);
            return;
          }
        } catch (e) {
          console.warn(`Primary collection "${targetHandle}" not found:`, e.message);
        }

        // Step 2: Try fallback collections (e.g. 'tops' for 't-shirts')
        if (activeCategory === 't-shirts') {
          try {
            const topsProducts = await ensureCollectionProducts('tops');
            if (!cancelled) {
              setCollectionProducts(topsProducts);
              return;
            }
          } catch (e) {
            console.warn(`Fallback collection "tops" not found:`, e.message);
          }
        }

        // Step 3: Try general product search by category term
        try {
          const { items } = await fetchProductsPage({ category: activeCategory, limit: 100 });
          if (items && items.length > 0) {
            if (!cancelled) {
              setCollectionProducts(items);
              return;
            }
          }
        } catch (e) {
          console.warn(`Category search failed for "${activeCategory}":`, e.message);
        }

        // Step 4: Fallback to all products so the page isn't empty
        try {
          const { items: allItems } = await fetchProductsPage({ limit: 100 });
          if (!cancelled) {
            setCollectionProducts(allItems || []);
          }
        } catch (e) {
          console.error(`Final fallback to all products failed:`, e);
          if (!cancelled) setCollectionProducts([]);
        }

      } catch (err) {
        console.error(`General collection loading error:`, err);
        if (!cancelled) setCollectionProducts([]);
      } finally {
        if (!cancelled) setCollectionLoading(false);
      }
    }

    loadCollection();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, ensureCollectionProducts, isAllMode, isShowcaseCollectionMode, selectedSkintoneKey, selectedOccasionKey]);

  useEffect(() => {
    if (!isAllMode || !catalogProducts?.length || pagedProducts.length) return;
    setPagedProducts((prev) => mergeUniqueProducts(prev, catalogProducts));
  }, [catalogProducts, isAllMode, pagedProducts.length]);

  const products = useMemo(() => {
    const rawList = isAllMode ? pagedProducts : collectionProducts;
    return rawList.filter(Boolean);
  }, [isAllMode, pagedProducts, collectionProducts]);
  const loading = isAllMode ? pagedLoading && pagedProducts.length === 0 : collectionLoading;

  const filteredProducts = useMemo(() => {
    // If in showcase collection mode, bypass client-side filtering completely
    // since we've loaded the curated database collection directly
    if (isShowcaseCollectionMode) return products;

    const applySkintone = (hasExplicitSkintone || isSkintoneCategory) && skintoneTokens.length > 0;
    const applyOccasion = occasionTokens.length > 0;
    if (!(applySkintone || applyOccasion)) return products;

    const filtered = products.filter((product) => {
      const productCollections = Array.isArray(product?.collections) ? product.collections : [];
      const hasFlowRule = productCollections.some((collection) => Boolean(getStorefrontFlowRule(collection)));
      
      let matchesSkintone = true;
      let matchesOccasion = true;

      if (applySkintone) {
        const isBundle = isBundleProduct(product);
        const hasExplicitRule = hasExplicitSortingRule(product, selectedSkintoneKey, selectedOccasionKey);
        const hasSkintoneRuleAnyOccasion = hasExplicitSortingRule(product, selectedSkintoneKey, '');

        if (hasExplicitRule || hasSkintoneRuleAnyOccasion) {
          matchesSkintone = true;
        } else if (isBundle) {
          matchesSkintone = !hasExplicitSkintoneRestriction(product, selectedSkintoneKey);
        } else if (hasSpecificSkintoneInfo(product)) {
          if (hasFlowRule) {
            matchesSkintone = productMatchesStorefrontFlow(product, {
              skintone: selectedSkintoneKey,
              occasion: '',
            });
          } else {
            matchesSkintone = skintoneTokens.some((token) => productMatchesFilter(product, token));
          }
        } else {
          matchesSkintone = false;
        }
      }

      if (applyOccasion) {
        const hasExplicitRule = hasExplicitSortingRule(product, selectedSkintoneKey, selectedOccasionKey);
        const hasOccasionRuleAnySkintone = Array.isArray(product.metafields) && product.metafields.some(f => 
          String(f?.namespace || '').trim().toLowerCase() === 'custom' && 
          String(f?.key || '').trim().toLowerCase().endsWith(`_${String(selectedOccasionKey).toLowerCase()}`)
        );

        if (hasExplicitRule || hasOccasionRuleAnySkintone) {
          matchesOccasion = true;
        } else if (hasSpecificOccasionInfo(product)) {
          if (hasFlowRule) {
            matchesOccasion = productMatchesStorefrontFlow(product, {
              skintone: '',
              occasion: selectedOccasionKey,
            });
          } else {
            matchesOccasion = occasionTokens.some((token) => productMatchesFilter(product, token));
          }
        } else {
          matchesOccasion = true;
        }
      }

      return matchesSkintone && matchesOccasion;
    });

    let result = filtered;

    // Fallback 1: If filtering by both skintone and occasion yields nothing,
    // fall back to matching ONLY the occasion filter so the page isn't empty!
    if (result.length === 0 && applySkintone && applyOccasion) {
      result = products.filter((product) => {
        const productCollections = Array.isArray(product?.collections) ? product.collections : [];
        const hasFlowRule = productCollections.some((collection) => Boolean(getStorefrontFlowRule(collection)));
        let matchesOccasion = true;

        const hasExplicitRule = hasExplicitSortingRule(product, selectedSkintoneKey, selectedOccasionKey);
        const hasOccasionRuleAnySkintone = Array.isArray(product.metafields) && product.metafields.some(f => 
          String(f?.namespace || '').trim().toLowerCase() === 'custom' && 
          String(f?.key || '').trim().toLowerCase().endsWith(`_${String(selectedOccasionKey).toLowerCase()}`)
        );

        if (hasExplicitRule || hasOccasionRuleAnySkintone) {
          matchesOccasion = true;
        } else if (hasSpecificOccasionInfo(product)) {
          if (hasFlowRule) {
            matchesOccasion = productMatchesStorefrontFlow(product, {
              skintone: '',
              occasion: selectedOccasionKey,
            });
          } else {
            matchesOccasion = occasionTokens.some((token) => productMatchesFilter(product, token));
          }
        } else {
          matchesOccasion = true;
        }

        return matchesOccasion;
      });
    }

    // Fallback 2: If we still have 0 results (e.g. empty skintone filter or completely empty occasion filter),
    // fall back to returning all products so the page is never blank.
    if (result.length === 0) {
      return products;
    }

    return result;
  }, [
    products,
    hasExplicitSkintone,
    isSkintoneCategory,
    skintoneTokens,
    occasionTokens,
    selectedSkintoneKey,
    selectedOccasionKey,
    isShowcaseCollectionMode,
  ]);

  const sortedProducts = useMemo(() => {
  const data = sortProducts(
    filteredProducts,
    sortBy,
    selectedSkintoneKey,
    selectedOccasionKey
  )
    .map(toProductCard)
    .filter(Boolean);

  console.log("Sorted Products:", data);

  return data;
}, [filteredProducts, sortBy, selectedSkintoneKey, selectedOccasionKey]);

  const shouldGroupBySkintone = false;
  const groupedProducts = useMemo(() => {
    if (!shouldGroupBySkintone) return [];
    return SKINTONE_GROUPS.map((group) => {
      const toneProducts = filteredProducts.filter((product) => {
        const productCollections = Array.isArray(product?.collections) ? product.collections : [];
        const hasFlowRule = productCollections.some((collection) => Boolean(getStorefrontFlowRule(collection)));
        
        if (hasFlowRule) {
          return productMatchesStorefrontFlow(product, {
            skintone: group.id,
            occasion: selectedOccasionKey,
          });
        }
        return group.tokens.some((token) => productMatchesFilter(product, token));
      });
      return {
        ...group,
        products: sortProducts(toneProducts, sortBy, group.id, selectedOccasionKey).map(toProductCard).filter(Boolean),
      };
    }).filter((group) => group.products.length > 0);
  }, [filteredProducts, shouldGroupBySkintone, sortBy, selectedOccasionKey]);

  const hasActiveFilters =
    Boolean(occasionTokens.length) ||
    hasExplicitSkintone ||
    isSkintoneCategory ||
    activeCategory !== 'all';
  const totalItems = hasActiveFilters ? filteredProducts.length : catalogTotal ?? filteredProducts.length;
  const OCCASION_LABELS = {
    casual: 'Casual Wear',
    formal: 'Formal Wear',
    puja: 'Ethnic Wear',
    party: 'Party Wear',
  };
  const displaySkintone = skintoneFilter
    ? formatLabel(rawSkintone || skintoneFilter)
    : (skintoneFromCategory?.label || '');
  const displayOccasion = occasionFilter
    ? (OCCASION_LABELS[selectedOccasionKey] || formatLabel(rawOccasion || occasionFilter))
    : '';
  const pageTitle = isShowcaseCollectionMode
    ? `${displaySkintone} - ${displayOccasion}`
    : shouldGroupBySkintone && displayOccasion
      ? displayOccasion
      : (activeCategory === 'all' ? 'All Products' : formatLabel(activeCategory));
  const queryString = searchParams.toString();
  const routePath = typeof window !== 'undefined' ? window.location.pathname : '/products';
  const canonicalPath = routePath || '/products';
  const seoTitle = displaySkintone && displayOccasion
    ? `${displaySkintone} ${displayOccasion} Menswear Edit`
    : displaySkintone
      ? `${displaySkintone} Menswear Edit`
      : displayOccasion
        ? `${displayOccasion} Menswear Edit`
        : activeCategory !== 'all'
          ? `${formatLabel(activeCategory)} for Men`
          : 'Designer Menswear Products';
  const seoDescription = displaySkintone && displayOccasion
    ? `Browse ${displaySkintone.toLowerCase()} ${displayOccasion.toLowerCase()} products from Aradhya with refined styling and polished everyday direction.`
    : displaySkintone
      ? `Discover ${displaySkintone.toLowerCase()} focused products from Aradhya with balanced colour direction and premium everyday styling.`
      : displayOccasion
        ? `Shop ${displayOccasion.toLowerCase()} products from Aradhya with polished layering, premium fabrics, and India-ready styling.`
        : activeCategory !== 'all'
          ? `Shop ${formatLabel(activeCategory).toLowerCase()} from Aradhya with refined menswear styling and premium product direction for India.`
          : 'Explore Aradhya products across categories, skin filters, and occasion-led menswear edits.';
  const seoIntro = displaySkintone && displayOccasion
    ? `${displaySkintone} and ${displayOccasion} filters are active, so these products focus on colour, fit, and combinations that feel polished on Indian men.`
    : displaySkintone
      ? `These picks focus on ${displaySkintone.toLowerCase()} styling so you can find natural shirt, trouser, and shoe combinations with better contrast and balance.`
      : displayOccasion
        ? `These edited looks help you build a confident ${displayOccasion.toLowerCase()} wardrobe with versatile combinations that work in India.`
        : activeCategory !== 'all'
          ? `Explore this category with Aradhya styling ideas designed around fit, colour balance, and premium everyday wear.`
          : 'Browse designer menswear products across curated edits, filters, and category-led discovery.';

  const updateFilter = (key, value) => {
    const prev = new URLSearchParams(searchParams);
    if (!value || value === 'all') {
      prev.delete(key);
    } else {
      prev.set(key, value);
    }
    setSearchParams(prev);
  };

  const clearToneAndOccasionFilters = () => {
    const prev = new URLSearchParams(searchParams);
    prev.delete('skintone');
    prev.delete('occasion');
    setSearchParams(prev);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-page)]">
      <SeoHead
        title={seoTitle}
        description={seoDescription}
        keywords={['designer menswear', 'Aradhya products', pageTitle]}
        canonicalPath={canonicalPath}
        imageAlt={`${pageTitle} listing page`}
        noIndex={Boolean(queryString)}
        structuredData={[
          buildOrganizationSchema(),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: pageTitle,
            description: seoDescription,
            url: `https://www.thehouseofaradhya.com${canonicalPath}`,
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: sortedProducts.slice(0, 10).map((product, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: `https://www.thehouseofaradhya.com/product/${product.handle}`,
                name: product.title,
              })),
            },
          },
          buildBreadcrumbSchema([
            {
              name: 'Home',
              url: 'https://www.thehouseofaradhya.com/',
            },
            {
              name: pageTitle,
              url: `https://www.thehouseofaradhya.com${canonicalPath}`,
            },
          ]),
        ]}
      />

      {/* Mobile Header */}
      <MobilePageHeader
        title={pageTitle}
        onSearch={() => document.dispatchEvent(new CustomEvent('open-search'))}
      />

      {/* Breadcrumb / Title Header - Desktop Only */}
      <div className="site-shell hidden flex-col gap-2 py-6 md:flex">
        <div className="text-xs text-gray-500">
          Home / <span className="font-bold text-gray-800 capitalize">{pageTitle}</span>
        </div>
        <h1 className="text-lg font-bold text-gray-800 capitalize">
          {pageTitle} <span className="text-gray-400 font-normal text-sm">- {totalItems} items</span>
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600">{seoIntro}</p>
      </div>

      {/* Mobile Filter Bar */}
      <div className="border-b border-gray-100 bg-white lg:hidden sticky top-14 z-30">
        <div className="site-shell py-3 overflow-x-auto no-scrollbar flex items-center gap-2">

          <div className="relative flex-shrink-0">
            <select
              value={rawSkintone || 'all'}
              onChange={(event) => updateFilter('skintone', event.target.value)}
              className={`appearance-none rounded-full border px-4 py-1.5 text-xs font-bold transition-colors focus:outline-none pr-8 ${skintoneFilter ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-black'
                }`}
            >
              <option value="all">Skin Tone</option>
              <option value="fair">Fair</option>
              <option value="neutral">Neutral</option>
              <option value="dark">Dark</option>
            </select>
            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${skintoneFilter ? 'text-white' : 'text-gray-500'}`} />
          </div>

          <div className="relative flex-shrink-0">
            <select
              value={rawOccasion || 'all'}
              onChange={(event) => updateFilter('occasion', event.target.value)}
              className={`appearance-none rounded-full border px-4 py-1.5 text-xs font-bold transition-colors focus:outline-none pr-8 ${occasionFilter ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-black'
                }`}
            >
              <option value="all">Occasion</option>
              <option value="casual">Casual Wear</option>
              <option value="formal">Formal Wear</option>
              <option value="puja">Ethnic Wear</option>
              <option value="party">Party Wear</option>
            </select>
            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${occasionFilter ? 'text-white' : 'text-gray-500'}`} />
          </div>

          <div className="relative flex-shrink-0">
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="appearance-none rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-bold text-gray-800 transition-colors focus:outline-none focus:border-black hover:border-black pr-8"
            >
              <option value="recommended">Best</option>
              <option value="new">Newest</option>
              <option value="popularity">Popular</option>
              <option value="price_low">Price: Low</option>
              <option value="price_high">Price: High</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-gray-500" />
          </div>

          {(skintoneFilter || occasionFilter) ? (
            <button
              onClick={clearToneAndOccasionFilters}
              className="flex-shrink-0 text-[11px] font-bold text-gray-500 hover:text-black hover:underline px-2"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="hidden border-y border-[var(--color-border)] bg-[var(--color-bg-surface)] lg:block">
        <div className="site-shell py-3 flex justify-between items-center gap-4">
          {/* Left: Filters */}
          <div className="flex items-center gap-4 overflow-x-visible flex-1">

            {/* Skin Tone Filter */}
            <div className="relative group/filter">
              <button className={`flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-full transition-colors whitespace-nowrap ${skintoneFilter ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}>
                {skintoneFilter ? `Skin: ${displaySkintone}` : 'Skin Tone'} <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute top-full left-0 pt-2 hidden group-hover/filter:block z-50">
                <div className="w-48 bg-white border border-gray-100 shadow-xl py-2 rounded-xl overflow-hidden">
                  <button onClick={() => updateFilter('skintone', 'all')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">All Skin Tones</button>
                  <button onClick={() => updateFilter('skintone', 'fair')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Fair</button>
                  <button onClick={() => updateFilter('skintone', 'neutral')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Neutral</button>
                  <button onClick={() => updateFilter('skintone', 'dark')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Dark</button>
                </div>
              </div>
            </div>

            {/* Occasion Filter */}
            <div className="relative group/filter">
              <button className={`flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-full transition-colors whitespace-nowrap ${occasionFilter ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}>
                {occasionFilter ? `Occasion: ${displayOccasion}` : 'Occasion'} <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute top-full left-0 pt-2 hidden group-hover/filter:block z-50">
                <div className="w-48 bg-white border border-gray-100 shadow-xl py-2 rounded-xl overflow-hidden">
                  <button onClick={() => updateFilter('occasion', 'all')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">All Occasions</button>
                  <button onClick={() => updateFilter('occasion', 'casual')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Casual Wear</button>
                  <button onClick={() => updateFilter('occasion', 'formal')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Formal Wear</button>
                  <button onClick={() => updateFilter('occasion', 'puja')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Ethnic Wear</button>
                  <button onClick={() => updateFilter('occasion', 'party')} className="block w-full text-left px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-black">Party Wear</button>
                </div>
              </div>
            </div>

            {/* Clear Filters */}
            {(skintoneFilter || occasionFilter) && (
              <button
                onClick={clearToneAndOccasionFilters}
                className="text-xs font-bold text-gray-500 hover:text-black hover:underline px-2"
              >
                Reset
              </button>
            )}

          </div>

          {/* Right: Sort */}
          <div className="flex-shrink-0 relative group/sort">
            <button className="flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-full hover:border-black transition-colors bg-white z-10 relative">
              <span className="text-sm font-bold text-gray-800 capitalize">Sort: {sortBy.replace('_', ' ')}</span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            <div className="absolute top-full right-0 pt-2 hidden group-hover/sort:block z-50">
              <div className="w-56 bg-white border border-gray-100 shadow-xl py-2 rounded-xl overflow-hidden">
                <button onClick={() => setSortBy('recommended')} className={`block w-full text-left px-5 py-2.5 text-sm font-medium hover:bg-gray-50 ${sortBy === 'recommended' ? 'text-black font-bold bg-gray-50' : 'text-gray-700'}`}>Recommended</button>
                <button onClick={() => setSortBy('new')} className={`block w-full text-left px-5 py-2.5 text-sm font-medium hover:bg-gray-50 ${sortBy === 'new' ? 'text-black font-bold bg-gray-50' : 'text-gray-700'}`}>What's New</button>
                <button onClick={() => setSortBy('popularity')} className={`block w-full text-left px-5 py-2.5 text-sm font-medium hover:bg-gray-50 ${sortBy === 'popularity' ? 'text-black font-bold bg-gray-50' : 'text-gray-700'}`}>Popularity</button>
                <button onClick={() => setSortBy('price_low')} className={`block w-full text-left px-5 py-2.5 text-sm font-medium hover:bg-gray-50 ${sortBy === 'price_low' ? 'text-black font-bold bg-gray-50' : 'text-gray-700'}`}>Price: Low to High</button>
                <button onClick={() => setSortBy('price_high')} className={`block w-full text-left px-5 py-2.5 text-sm font-medium hover:bg-gray-50 ${sortBy === 'price_high' ? 'text-black font-bold bg-gray-50' : 'text-gray-700'}`}>Price: High to Low</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="site-shell py-6 lg:py-8 mb-20 md:mb-0">

        {loading ? (
          <div className="flex justify-center py-20 text-gray-500">Loading products...</div>
        ) : shouldGroupBySkintone ? (
          groupedProducts.length > 0 ? (
            <div className="space-y-10">
              {groupedProducts.map((group) => (
                <section key={group.id} className="space-y-4">
                  <div className="flex items-end justify-between">
                    <h2 className="text-xl font-bold text-gray-900">{group.label}</h2>
                    <span className="text-sm text-gray-500">{group.products.length} items</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-x-6 lg:gap-y-10">
                    {group.products.map((product, index) => (
                      <ProductCard key={product.handle || product.id || index} item={product} enableImageScroller={true} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="col-span-full text-center py-20 text-gray-500">No products found for this occasion.</div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-x-2 lg:gap-y-2">
            {sortedProducts.length > 0 ? (
              sortedProducts.map((product, index) => (
                <ProductCard key={product.handle || product.id || index} item={product} enableImageScroller={true} />
              ))
            ) : (
              <div className="col-span-full text-center py-20 text-gray-500">No products found in this category.</div>
            )}
          </div>
        )}

        {isAllMode && sortedProducts.length > 0 ? (
          <div ref={bottomBoundaryRef} className="flex justify-center pt-10 pb-6">
            {hasMore ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <svg className="animate-spin h-5 w-5 text-slate-900" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading more stunning collections...</span>
              </div>
            ) : (
              <span className="text-sm font-medium text-slate-400 tracking-wide uppercase">You have reached the end.</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AllProductsPage;
