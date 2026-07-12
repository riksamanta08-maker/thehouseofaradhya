import MobilePageHeader from '../components/MobilePageHeader';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import SeoHead from '../components/SeoHead';
import { useCatalog } from '../contexts/catalog-context';
import { normaliseTokenValue, toProductCard, fetchCollectionByHandle } from '../lib/api';
import {
    buildBreadcrumbSchema,
    buildOrganizationSchema,
} from '../lib/seo';

const normalizeForMatch = (value) => {
    const normalized = normaliseTokenValue(value);
    if (!normalized) return '';
    return normalized.replace(/[^a-z0-9]+/g, ' ').trim();
};

const tokenize = (value) => normalizeForMatch(value).split(' ').filter(Boolean);

const uniqueTokens = (values) => Array.from(new Set(values.filter(Boolean)));

const formatLabel = (value) => {
    if (!value) return '';
    return value
        .toString()
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

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
        product?.productType,
        ...tags,
        ...collections.map((collection) => collection?.handle),
        ...collections.map((collection) => collection?.title),
    ].filter(Boolean);

    if (candidates.some((candidate) => matchesToken(candidate, targetTokens))) return true;

    if (targetTokens.length > 1) {
        const candidateTokens = uniqueTokens(candidates.flatMap((candidate) => tokenize(candidate)));
        if (!candidateTokens.length) return false;
        return targetTokens.every((token) =>
            candidateTokens.some((candidateToken) => candidateToken === token || candidateToken.includes(token)),
        );
    }

    return false;
};

const isBundleProduct = (product) => {
    if (!product) return false;

    // If the product belongs to ANY collection, it is a curated product that should be shown!
    if (Array.isArray(product.collections) && product.collections.length > 0) return true;

    const type = String(product.productType || '').toLowerCase();
    if (type.includes('bundle') || type.includes('combo') || type.includes('set') || type.includes('shirt,pant,shoes') || type.includes(',')) return true;
    const title = String(product.title || '').toLowerCase();
    if (title.includes('bundle') || title.includes('combo') || title.includes('set') || title.includes('outfit')) return true;
    const metafields = Array.isArray(product.metafields) ? product.metafields : [];
    const hasBundleMetafield = metafields.some(
        (f) =>
            String(f?.namespace || '').trim().toLowerCase() === 'custom' &&
            (String(f?.key || '').trim().toLowerCase() === 'combo_items' ||
                String(f?.key || '').trim().toLowerCase() === 'bundle_items')
    );
    if (hasBundleMetafield) return true;
    const tags = Array.isArray(product.tags) ? product.tags.map((t) => String(t).toLowerCase()) : [];
    if (tags.some((t) => t.includes('bundle') || t.includes('combo') || t.includes('outfit'))) return true;
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
        const rules = collection?.rules;
        if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return false;
        const flow = rules.storefrontFlow;
        if (!flow || typeof flow !== 'object' || Array.isArray(flow)) return false;
        if (flow.enabled === false) return false;
        const skintones = Array.isArray(flow.skintones) 
            ? flow.skintones 
            : typeof flow.skintones === 'string' 
                ? flow.skintones.split(',') 
                : [];
        return skintones.length > 0;
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

const getOccasionFromHandle = (handle) => {
    if (!handle) return '';
    const norm = String(handle).toLowerCase();
    if (norm.includes('casual') || norm.includes('date')) return 'casual';
    if (norm.includes('office') || norm.includes('work') || norm.includes('formal')) return 'office';
    if (norm.includes('puja') || norm.includes('festive') || norm.includes('ethnic')) return 'puja';
    if (norm.includes('party')) return 'party';
    return '';
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

const CollectionPage = () => {
    const { handle } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const skintoneFilter = normalizeForMatch(searchParams.get('skintone'));

    const { ensureCollectionProducts } = useCatalog();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [collectionInfo, setCollectionInfo] = useState(null);
    const [sortBy, setSortBy] = useState('recommended');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        async function loadCollection() {
            try {
                // LOG 1: Request Init
                console.log(`%c[API] Fetching collection: ${handle}`, 'color: #00d1ff; font-weight: bold');
                
                const result = await fetchCollectionByHandle(handle);
                
                // LOG 2: Primary API Response
                console.log('%c[API] Success (fetchCollectionByHandle):', 'color: #4caf50; font-weight: bold', result);

                if (!cancelled) {
                    if (result) {
                        setCollectionInfo({
                            title: result.title,
                            description: result.description,
                            image: result.image
                        });
                        setProducts(result.products || []);
                    } else {
                        // LOG 3: Fallback warning
                        console.warn(`%c[API] No result for "${handle}". Triggering ensureCollectionProducts...`, 'color: #ff9800');
                        
                        const cols = await ensureCollectionProducts(handle);
                        
                        // LOG 4: Fallback Response
                        console.log('%c[API] Fallback Result:', 'color: #ff9800; font-weight: bold', cols);
                        
                        setProducts(cols || []);
                        setCollectionInfo({ title: handle.replace(/-/g, ' '), description: '' });
                    }
                }
            } catch (e) {
                console.error(`%c[API] Error loading collection: ${handle}`, 'color: #f44336; font-weight: bold', e);
                if (!cancelled) setProducts([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        if (handle) {
            loadCollection();
        }

        return () => { cancelled = true; };
    }, [handle, ensureCollectionProducts]);

    const sortedProducts = useMemo(() => {
        const applySkintone = skintoneFilter && skintoneFilter !== 'all';
        let filtered = products.filter(isBundleProduct);

        // LOG 5: Data transformation tracking
        if (products.length > 0) {
            console.log(`%c[Logic] Processing ${products.length} products. Skintone: ${skintoneFilter || 'none'}, Sort: ${sortBy}`, 'color: #9c27b0');
        }

        if (applySkintone) {
            const occasion = getOccasionFromHandle(handle);
            filtered = products.filter((product) => {
                const isBundle = isBundleProduct(product);
                const hasExplicitRule = hasExplicitSortingRule(product, skintoneFilter, occasion);
                const hasSkintoneRuleAnyOccasion = hasExplicitSortingRule(product, skintoneFilter, '');

                if (hasExplicitRule || hasSkintoneRuleAnyOccasion) {
                    return true;
                }
                if (isBundle) {
                    return !hasExplicitSkintoneRestriction(product, skintoneFilter);
                }
                if (hasSpecificSkintoneInfo(product)) {
                    return productMatchesFilter(product, skintoneFilter);
                }
                return true;
            });
        }

        let sorted = [...filtered];
        if (sortBy === 'recommended' && skintoneFilter && skintoneFilter !== 'all') {
            const occasion = getOccasionFromHandle(handle);
            if (occasion) {
                sorted.sort((a, b) => {
                    const orderA = getProductMetafieldOrder(a, skintoneFilter, occasion);
                    const orderB = getProductMetafieldOrder(b, skintoneFilter, occasion);
                    if (orderA !== orderB) return orderA - orderB;
                    return String(a.title || '').localeCompare(String(b.title || ''));
                });
            }
        } else if (sortBy === 'price_low') {
            sorted.sort((a, b) => (a?.price ?? 0) - (b?.price ?? 0));
        } else if (sortBy === 'price_high') {
            sorted.sort((a, b) => (b?.price ?? 0) - (a?.price ?? 0));
        } else if (sortBy === 'new') {
            sorted.sort((a, b) => String(b?.id || '').localeCompare(String(a?.id || '')));
        }
        
        const finalResults = sorted.map(toProductCard).filter(Boolean);
        
        // LOG 6: Final count
        if (products.length > 0) {
            console.log(`%c[Logic] Final products to display: ${finalResults.length}`, 'color: #9c27b0; font-weight: bold');
        }

        return finalResults;
    }, [products, sortBy, skintoneFilter]);

    const updateFilter = (key, value) => {
        const prev = new URLSearchParams(searchParams);
        if (!value || value === 'all') {
            prev.delete(key);
        } else {
            prev.set(key, value);
        }
        setSearchParams(prev);
    };

    const collectionTitle = collectionInfo?.title || formatLabel(handle);
    const displaySkintone = formatLabel(skintoneFilter);
    const queryString = searchParams.toString();
    const canonicalPath = `/collections/${handle}`;
    const seoTitle = displaySkintone
        ? `${collectionTitle} for ${displaySkintone} Men`
        : `${collectionTitle} Designer Wear for Men`;
    const seoDescription = displaySkintone
        ? `Shop ${collectionTitle.toLowerCase()} from Aradhya with ${displaySkintone.toLowerCase()} focused styling and polished product direction for India.`
        : `Explore ${collectionTitle.toLowerCase()} from Aradhya with refined menswear styling and premium product direction for India.`;
    const collectionIntro = displaySkintone
        ? `This collection is filtered for ${displaySkintone.toLowerCase()} styling so you can browse combinations that feel sharper, more balanced, and easier to wear.`
        : `This collection brings together polished pieces designed for premium everyday dressing and refined Indian menswear.`;

    return (
        <div className="bg-white min-h-screen">
            <SeoHead
                title={seoTitle}
                description={seoDescription}
                keywords={['designer menswear collection', collectionTitle, 'Aradhya products']}
                canonicalPath={canonicalPath}
                image={collectionInfo?.image?.url}
                imageAlt={`${collectionTitle} collection`}
                noIndex={Boolean(queryString)}
                structuredData={[
                    buildOrganizationSchema(),
                    {
                        '@context': 'https://schema.org',
                        '@type': 'CollectionPage',
                        name: collectionTitle,
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
                            name: 'Collections',
                            url: 'https://www.thehouseofaradhya.com/products',
                        },
                        {
                            name: collectionTitle,
                            url: `https://www.thehouseofaradhya.com${canonicalPath}`,
                        },
                    ]),
                ]}
            />

            <MobilePageHeader
                title={collectionTitle}
                onSearch={() => document.dispatchEvent(new CustomEvent('open-search'))}
            />

            <div className="site-shell pt-6 pb-4">
                <div className="text-xs text-gray-500 mb-2">
                    Home / Collections / <span className="font-bold text-gray-800 capitalize">{collectionTitle}</span>
                </div>

                <div className="flex flex-col md:flex-row gap-6 items-end md:items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 capitalize mb-2">
                            {collectionTitle}
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-gray-600 mb-2">{collectionIntro}</p>
                        {collectionInfo?.description && (
                            <p className="text-gray-600 max-w-2xl">{collectionInfo.description}</p>
                        )}
                    </div>
                    <span className="text-gray-500 text-sm font-medium whitespace-nowrap">
                        {sortedProducts.length} items
                    </span>
                </div>
            </div>

            <div className="border-t border-b border-gray-200 bg-white sticky top-16 z-30">
                <div className="site-shell py-3 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar whitespace-nowrap flex-1">
                        <div className="relative group">
                            <button className={`flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-full transition-colors whitespace-nowrap ${skintoneFilter ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'
                                }`}>
                                {skintoneFilter ? `Skin: ${skintoneFilter}` : 'Skin Tone'} <ChevronDown className="w-4 h-4" />
                            </button>
                            <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-100 shadow-lg py-2 hidden group-hover:block z-40 rounded-lg">
                                <button onClick={() => updateFilter('skintone', 'all')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">All</button>
                                <button onClick={() => updateFilter('skintone', 'fair')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Fair</button>
                                <button onClick={() => updateFilter('skintone', 'neutral')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Neutral</button>
                                <button onClick={() => updateFilter('skintone', 'dark')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Dark</button>
                            </div>
                        </div>

                        {skintoneFilter && (
                            <button
                                onClick={() => setSearchParams(new URLSearchParams())}
                                className="text-xs text-red-600 font-bold hover:underline"
                            >
                                Reset
                            </button>
                        )}
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2 border border-gray-200 px-3 py-2 rounded-sm cursor-pointer hover:border-gray-400 relative group">
                        <span className="text-sm text-gray-500 hidden sm:inline">Sort by:</span>
                        <span className="text-sm font-bold text-gray-800 capitalize">{sortBy.replace('_', ' ')}</span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />

                        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-100 shadow-lg py-2 hidden group-hover:block z-40">
                            <button onClick={() => setSortBy('recommended')} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sortBy === 'recommended' ? 'font-bold bg-gray-50' : ''}`}>Recommended</button>
                            <button onClick={() => setSortBy('new')} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sortBy === 'new' ? 'font-bold bg-gray-50' : ''}`}>What's New</button>
                            <button onClick={() => setSortBy('price_low')} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sortBy === 'price_low' ? 'font-bold bg-gray-50' : ''}`}>Price: Low to High</button>
                            <button onClick={() => setSortBy('price_high')} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${sortBy === 'price_high' ? 'font-bold bg-gray-50' : ''}`}>Price: High to Low</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="site-shell py-8">
                {loading ? (
                    <div className="flex justify-center py-20 text-gray-500">Loading collection...</div>
                ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-x-6 lg:gap-y-10">
                        {sortedProducts.length > 0 ? (
                            sortedProducts.map((product, index) => (
                                <ProductCard key={product.handle || product.id || index} item={product} enableImageScroller={true} />
                            ))
                        ) : (
                            <div className="col-span-full text-center py-20 text-gray-500">
                                <p className="text-lg font-medium text-gray-900 mb-2">No products found</p>
                                <p>Try clearing filters or check back later.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CollectionPage;
