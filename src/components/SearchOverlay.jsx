// src/components/SearchOverlay.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalog } from '../contexts/catalog-context';
import { formatMoney, getProductImageUrl, searchProducts } from '../lib/api';

const POPULAR_PRODUCTS_LIMIT = 12;
const SEARCH_RESULTS_LIMIT = 40;

const SearchOverlay = ({ open, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const { products: catalogProducts } = useCatalog();

  const popularProducts = useMemo(() => {
    return (catalogProducts ?? [])
      .slice(0, POPULAR_PRODUCTS_LIMIT)
      .map((product) => ({
        title: product.title,
        price: formatMoney(product.price, product.currencyCode),
        img: getProductImageUrl(product),
        href: product.handle ? `/product/${product.handle}` : '',
        handle: product.handle,
        badge: product.tags?.includes('new') ? 'New' : undefined,
      }))
      .filter((card) => card.href);
  }, [catalogProducts]);

  const [productResults, setProductResults] = useState(popularProducts);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery('');
      setProductResults(popularProducts);

      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        window.clearTimeout(timer);
        document.body.style.overflow = previousOverflow;
      };
    }

    return undefined;
  }, [open, popularProducts]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setProductResults(popularProducts);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    searchProducts(term, SEARCH_RESULTS_LIMIT)
      .then((nodes) => {
        if (cancelled) return;
        const cards =
          nodes?.map((node) => ({
            title: node?.title ?? 'Product',
            price: formatMoney(
              node?.priceRange?.minVariantPrice?.amount,
              node?.priceRange?.minVariantPrice?.currencyCode,
            ),
            img: node?.featuredImage?.url ?? '',
            href: node?.handle ? `/product/${node.handle}` : '',
            handle: node?.handle,
            badge: node?.tags?.includes('new') ? 'New' : undefined,
          })) ?? [];
        setProductResults(cards.filter((card) => card.href));
      })
      .catch((error) => {
        console.error('Overlay search failed', error);
        if (!cancelled) setProductResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, query, popularProducts]);

  const suggestionItems = useMemo(() => {
    if (!catalogProducts?.length) return [];

    const keywordEntries = new Map();

    const register = (value) => {
      const cleaned = String(value ?? '').trim();
      if (!cleaned) return;
      const normalized = cleaned.toLowerCase();
      const existing = keywordEntries.get(normalized);
      if (existing) {
        existing.count += 1;
        if (cleaned.length > existing.label.length) {
          existing.label = cleaned;
        }
      } else {
        keywordEntries.set(normalized, { label: cleaned, count: 1 });
      }
    };

    const registerWithTokens = (value) => {
      register(value);
      const tokens = String(value ?? '')
        .split(/[\s\\/,&|-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
      tokens.forEach(register);
    };

    catalogProducts.forEach((product) => {
      registerWithTokens(product?.title);
      registerWithTokens(product?.vendor);
      registerWithTokens(product?.productType);
      if (product?.handle) {
        registerWithTokens(product.handle.replace(/[-_]/g, ' '));
      }
      (product?.tags ?? []).forEach((tag) => registerWithTokens(tag));
      (product?.collections ?? []).forEach((collection) =>
        registerWithTokens(collection?.title),
      );
    });

    const keywords = Array.from(keywordEntries.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label);
      })
      .map((entry) => entry.label);

    if (!query) return keywords.slice(0, 6);

    const normalized = query.toLowerCase();
    const matches = keywords.filter((value) => value.toLowerCase().includes(normalized));
    const remaining = keywords.filter((value) => !matches.includes(value));
    return [...matches, ...remaining].slice(0, 6);
  }, [catalogProducts, query]);

  const performSearch = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    onClose();
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    performSearch(query);
  };

  const handleSuggestion = (value) => {
    if (!value) return;
    performSearch(value);
  };

  const handleProductClick = (href) => {
    if (!href) return;
    window.location.href = href;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-white/90 backdrop-blur">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <h2 className="text-xs uppercase tracking-[0.35em] text-neutral-500">Search</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-[0.3em] text-neutral-500 transition hover:text-neutral-900"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for products..."
            className="w-full border-b border-neutral-900 bg-transparent pb-3 text-base uppercase tracking-[0.3em] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </form>

        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">Suggestions</p>
            <ul className="mt-4 space-y-2 text-sm uppercase tracking-[0.25em] text-neutral-700">
              {suggestionItems.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className="w-full text-left transition hover:text-neutral-900"
                    onClick={() => handleSuggestion(item)}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">Products</p>
              {!loading && productResults.length > 0 ? (
                <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                  {productResults.length} items
                </p>
              ) : null}
            </div>
            <div className="mt-4 max-h-[58vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {loading ? (
                  <p className="col-span-2 text-sm uppercase tracking-[0.25em] text-neutral-500">
                    Searching for "{query}"...
                  </p>
                ) : productResults.length === 0 ? (
                  <p className="col-span-2 text-sm uppercase tracking-[0.25em] text-neutral-500">
                    {query ? `No results for "${query}".` : 'No featured products available right now.'}
                  </p>
                ) : (
                  productResults.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => handleProductClick(item.href)}
                      className="flex flex-col w-full gap-2 rounded-xl border border-transparent p-2 text-left transition hover:border-neutral-200 hover:bg-white"
                    >
                      <div className="aspect-square w-full overflow-hidden rounded-lg bg-neutral-100">
                        {item.img ? (
                          <img
                            src={item.img}
                            alt={item.title || 'Product'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                            No Image
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-[0.28em] text-neutral-900 line-clamp-2">
                          {item.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">
                          {item.price}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-neutral-200 pt-4">
          <button
            type="button"
            onClick={() => performSearch(query)}
            disabled={!query.trim()}
            className="flex w-full items-center justify-between rounded-full border border-neutral-200 px-4 py-3 text-[11px] uppercase tracking-[0.32em] text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Search for "{query || '...'}"</span>
            <span aria-hidden>{'->'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchOverlay;
