import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';
import { useCatalog } from '../contexts/catalog-context';

/* 2. Define Occasion Data (from OccasionSelector.jsx) */
const getSkintoneImage = (file) => `${import.meta.env?.BASE_URL ?? '/'}images/${file}`;
const getOccasionImage = (file) => `${import.meta.env?.BASE_URL ?? '/'}images/${file}`;

const OCCASIONS = [
    {
        id: 'casual',
        title: 'Casual Wear',
        tag: 'Casual Wear',
        image: getOccasionImage('occasion-casual.jpg'),
    },
    {
        id: 'formal',
        title: 'Formal Wear',
        tag: 'Formal Wear',
        image: getOccasionImage('occasion-formal.jpg'),
    },
    {
        id: 'ethnic',
        title: 'Ethnic Wear',
        tag: 'Ethnic Wear',
        image: getOccasionImage('occasion-ethnic.jpg'),
    },
];

/* 3. Define Skin Tone Groups (matching AllProductsPage logic) */
const SKINTONES = [
    {
        id: 'fair',
        label: 'Fair Skin',
        image: getSkintoneImage('skintone-fair.jpg'),
        tokens: ['fair skin', 'fair'],
    },
    {
        id: 'neutral',
        label: 'Neutral Skin',
        image: getSkintoneImage('skintone-neutral.jpg'),
        tokens: ['neutral skin', 'neutral', 'natural skin', 'natural'],
    },
    {
        id: 'dark',
        label: 'Dark Skin',
        image: getSkintoneImage('skintone-dark.jpg'),
        tokens: ['dark skin', 'dark'],
    },
];

/* Helper: Filter Logic (Reused from AllProductsPage roughly) */
const tokenize = (str) => str?.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) || [];

const productMatchesStorefrontFlow = (product, { skintone = '', occasion = '' } = {}) => {
    const collections = Array.isArray(product?.collections) ? product.collections : [];
    if (!collections.length) return false;

    return collections.some((collection) => {
        const rules = collection?.rules;
        if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return false;
        const flow = rules.storefrontFlow;
        if (!flow || typeof flow !== 'object' || Array.isArray(flow) || flow.enabled === false) return false;

        const flowSkintones = (Array.isArray(flow.skintones) ? flow.skintones : []).map(s => String(s).toLowerCase());
        const flowOccasions = (Array.isArray(flow.occasions) ? flow.occasions : []).map(o => String(o).toLowerCase());

        const matchesSkintone = !skintone || flowSkintones.length === 0 || flowSkintones.includes(skintone.toLowerCase());
        
        // Map canonical filter occasions to DB tags:
        // - occasion 'casual' matches 'casual' or 'date'
        // - occasion 'formal' matches 'formal' or 'office'
        // - occasion 'ethnic' matches 'ethnic' or 'puja'
        const mappedOccasions = flowOccasions.flatMap(o => {
            if (o === 'date') return ['date', 'casual'];
            if (o === 'office') return ['office', 'formal'];
            if (o === 'puja' || o === 'ethnic') return ['puja', 'ethnic', 'festive', 'traditional'];
            return [o];
        });

        const matchesOccasion = !occasion || flowOccasions.length === 0 || mappedOccasions.includes(occasion.toLowerCase());

        return matchesSkintone && matchesOccasion;
    });
};

const productMatches = (product, skintone, occasion) => {
    if (!product) return false;

    // 1. Try Collection storefrontFlow rules first
    if (productMatchesStorefrontFlow(product, { skintone, occasion })) {
        return true;
    }

    // 2. Fallback to basic tag/type-based matching
    const tags = (product.tags || []).map(t => String(t).toLowerCase());
    const type = String(product.productType || '').toLowerCase();
    const title = String(product.title || '').toLowerCase();
    
    // Check skintone
    const skintoneWords = skintone === 'fair' ? ['fair'] 
                        : skintone === 'neutral' ? ['neutral', 'natural'] 
                        : skintone === 'dark' ? ['dark'] : [];
    const matchesSkintone = !skintone || skintoneWords.some(word => 
        tags.some(t => t.includes(word)) || type.includes(word) || title.includes(word)
    );

    // Check occasion
    const occasionWords = occasion === 'casual' ? ['casual', 'date']
                        : occasion === 'formal' ? ['formal', 'office', 'work']
                        : occasion === 'ethnic' ? ['ethnic', 'puja', 'traditional', 'festive']
                        : [occasion];
    const matchesOccasion = !occasion || occasionWords.some(word => 
        tags.some(t => t.includes(word)) || type.includes(word) || title.includes(word)
    );

    return matchesSkintone && matchesOccasion;
};

export default function SkinToneShowcase() {
    const { products, ensureCollectionProducts } = useCatalog();
    const [collectionProducts, setCollectionProducts] = useState({});

    // Helper to identify combo or bundle products
    const isCombo = (p) => {
        if (!p) return false;
        const title = p.title?.toLowerCase() || '';
        const handle = p.handle?.toLowerCase() || '';
        const type = p.productType?.toLowerCase() || '';
        const tags = (p.tags || []).map(t => t.toLowerCase());
        return (
            title.includes('combo') || title.includes('bundle') ||
            handle.includes('combo') || handle.includes('bundle') ||
            type.includes('combo') || type.includes('bundle') ||
            tags.some(t => t.includes('combo') || t.includes('bundle'))
        );
    };

    // Load skin tone occasion collections to respect manual database positioning/ordering
    useEffect(() => {
        let isMounted = true;

        async function fetchAllShowcaseCollections() {
           const handles = [
    'fair-skintone-casual-wear',
    'fair-skintone-formal-wear',
    'neutral-skintone-casual-wear',
    'neutral-skintone-formal-wear',
    'dark-skintone-casual-wear',
    'dark-skintone-formal-wear',
];

            const results = {};
            await Promise.all(
                handles.map(async (handle) => {
                    try {
                        const prods = await ensureCollectionProducts(handle, { limit: 40 });
                        if (isMounted) {
                            results[handle] = prods;
                        }
                    } catch (err) {
                        console.error(`Failed to load showcase collection ${handle}:`, err);
                    }
                })
            );

            if (isMounted) {
                setCollectionProducts(results);
            }
        }

        fetchAllShowcaseCollections();

        return () => {
            isMounted = false;
        };
    }, [ensureCollectionProducts]);

    // Memoize the nested structure: Skin -> Occasion -> Matched Product
    const showcaseData = useMemo(() => {
        return SKINTONES.map((skin) => {
            const skinOccasions = OCCASIONS.map((occasion) => {
                // Map the storefront canonical occasion ID to the legacy database collection occasion segment
                // casual -> date, formal -> office, ethnic -> puja
                const collectionHandle = `${skin.id}-skintone-${occasion.id}-wear`;
                const colProds = collectionProducts[collectionHandle] || [];

                // 1. Try to find a combo/bundle product in the curated database collection (respects manual sorting)
                let matchedProduct = colProds.find(isCombo);

                // 2. Fall back to any product in the curated database collection
                if (!matchedProduct && colProds.length > 0) {
                    matchedProduct = colProds[0];
                }

                // 3. Fall back to global filtering logic if the collection is empty/not loaded yet
                if (!matchedProduct && products?.length > 0) {
                    const matchingProducts = products.filter((p) =>
                        productMatches(p, skin.id, occasion.id)
                    );
                    matchedProduct = matchingProducts.find(isCombo) || matchingProducts[0] || null;
                }

                return {
                    ...occasion,
                    product: matchedProduct || null,
                };
            });

            return {
                ...skin,
                occasions: skinOccasions,
            };
        });
    }, [products, collectionProducts]);

    return (
        <section className="site-shell py-10 space-y-16">
            <div className="text-center space-y-2">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 uppercase tracking-widest">
                    Shop By Skin Tone
                </h2>
                <p className="text-slate-500 max-w-2xl mx-auto">
                    Discover the perfect shades and styles curated specifically for your skin tone and occasion.
                </p>
            </div>

            {showcaseData.map((skin) => (
                <div key={skin.id} className="space-y-8 border-b border-gray-100 pb-12 last:border-0 last:pb-0">
                    {/* Skin Tone Banner / Header */}
                    <div className="relative group overflow-hidden rounded-2xl">
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors z-10" />
                        <img
                            src={skin.image}
                            alt={skin.label}
                            className="w-full h-48 md:h-64 object-cover object-center transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 z-20 flex items-center justify-center">
                            <Link
                                to={`/products?skintone=${skin.id}`}
                                className="bg-white/90 backdrop-blur-sm px-8 py-3 rounded-full text-lg font-bold hover:bg-white transition-colors shadow-lg"
                            >
                                {skin.label} Collection
                            </Link>
                        </div>
                    </div>

                    {/* Occasion Grid for this Skin Tone */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {skin.occasions.map((occasion) => (
                            <div key={occasion.id} className="space-y-4">
                                {/* Occasion Header */}
                                <div className="flex items-center gap-3">
                                    <div className="h-px bg-gray-200 flex-1" />
                                    <h3 className="font-semibold text-gray-900 uppercase tracking-wider text-sm">
                                        {occasion.title}
                                    </h3>
                                    <div className="h-px bg-gray-200 flex-1" />
                                </div>

                                {/* 1. Occasion Banner Link */}
                                <Link
                                    to={`/products?skintone=${skin.id}&occasion=${encodeURIComponent(occasion.tag)}`}
                                    className="block group relative overflow-hidden rounded-xl aspect-[16/9] shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <img
                                        src={occasion.image}
                                        alt={`${skin.label} - ${occasion.title}`}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-white font-medium text-sm">Browse {occasion.title} &rarr;</span>
                                    </div>
                                </Link>

                                {/* 2. Featured Product for this Combo */}
                                {occasion.product ? (
                                    <div className="transform transition-transform hover:-translate-y-1">
                                        <ProductCard item={occasion.product} />
                                    </div>
                                ) : (
                                    <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm h-[300px] flex items-center justify-center">
                                        No product in this category yet
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
}
