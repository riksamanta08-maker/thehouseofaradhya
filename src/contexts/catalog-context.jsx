// src/contexts/catalog-context.jsx
/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchAllProducts,
  fetchCollectionByHandle,
  fetchCollections,
  formatMoney,
  toProductCard,
} from '../lib/api';

const CatalogContext = createContext(undefined);

const initialState = {
  status: 'idle',
  loading: false,
  error: null,
  products: [],
  productByHandle: {},
  productCards: [],
  collections: [],
};

const DEFAULT_PRODUCT_LIMIT = Number(import.meta.env.VITE_CATALOG_LIMIT) || 36;

const scheduleCatalogBootstrap = (callback) => {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  const run = () => {
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(callback, { timeout: 2500 });
      cleanup = () => window.cancelIdleCallback(idleId);
      return;
    }

    const timeoutId = window.setTimeout(callback, 1200);
    cleanup = () => window.clearTimeout(timeoutId);
  };

  let cleanup = () => {};

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
    cleanup = () => window.removeEventListener('load', run);
  }

  return cleanup;
};

export const CatalogProvider = ({ children, productLimit = DEFAULT_PRODUCT_LIMIT }) => {
  const [state, setState] = useState(initialState);
  const [collectionCache, setCollectionCache] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogue() {
      const _catStart = performance.now();
      console.log('%c[Catalog] ⏳ Initializing CatalogContext...', 'color:#8b5cf6;font-weight:bold');
      setState((prev) => ({
        ...prev,
        status: prev.status === 'ready' ? prev.status : 'loading',
        loading: true,
        error: null,
      }));

      // ── Step 1: Load products FIRST (this is what the homepage needs) ──
      try {
        const productsData = await fetchAllProducts(productLimit);
        if (cancelled) return;

        const validProducts = Array.isArray(productsData) ? productsData : [];
        const productByHandle = {};
        validProducts.forEach((product) => {
          if (product?.handle) productByHandle[product.handle] = product;
        });
        const productCards = validProducts.map(toProductCard).filter(Boolean);

        const _prodDur = (performance.now() - _catStart).toFixed(0);
        console.log(`%c[Catalog] ✅ Products ready in ${_prodDur}ms`, 'color:#22c55e;font-weight:bold', { count: validProducts.length });

        // Set state to 'ready' immediately — homepage can now render products
        setState((prev) => ({
          ...prev,
          status: 'ready',
          loading: false,
          products: validProducts,
          productByHandle,
          productCards,
        }));
      } catch (error) {
        const _prodDur = (performance.now() - _catStart).toFixed(0);
        console.error(`%c[Catalog] ❌ Products failed after ${_prodDur}ms`, 'color:#ef4444;font-weight:bold', error);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          status: prev.products.length ? 'ready' : 'error',
          loading: false,
          error,
        }));
      }

      // ── Step 2: Load collections in background (non-blocking) ──
      try {
        const collectionsData = await fetchCollections(16);
        if (cancelled) return;
        const validCollections = Array.isArray(collectionsData) ? collectionsData.filter(Boolean) : [];
        const _colDur = (performance.now() - _catStart).toFixed(0);
        console.log(`%c[Catalog] ✅ Collections loaded in ${_colDur}ms`, 'color:#22c55e;font-weight:bold', { count: validCollections.length });
        setState((prev) => ({
          ...prev,
          collections: validCollections,
        }));
      } catch (error) {
        console.warn('[Catalog] Collections failed (non-critical):', error.message);
      }
    }

    const cancelBootstrap = scheduleCatalogBootstrap(loadCatalogue);

    return () => {
      cancelled = true;
      cancelBootstrap();
    };
  }, [productLimit]);

  const getProduct = useCallback(
    (handle) => {
      if (!handle) return null;
      return state.productByHandle[handle] ?? null;
    },
    [state.productByHandle],
  );

  const ensureCollectionProducts = useCallback(
    async (handle, { limit = 200 } = {}) => {
      if (!handle) return [];
      const cacheKey = `${handle}|${limit}`;
      if (collectionCache[cacheKey]) {
        console.log(`%c[Catalog] ✅ Collection cache HIT %c"${handle}" (${collectionCache[cacheKey].length} products)`, 'color:#22c55e;font-weight:bold', 'color:#6b7280');
        return collectionCache[cacheKey];
      }
      const _colStart = performance.now();
      console.log(`%c[Catalog] ⏳ Fetching collection %c"${handle}"`, 'color:#3b82f6;font-weight:bold', 'color:#6b7280');
      const collection = await fetchCollectionByHandle(handle, limit);
      const products = collection?.products ?? [];
      const _colDur = (performance.now() - _colStart).toFixed(0);
      console.log(`%c[Catalog] ✅ Collection %c"${handle}" %c→ ${products.length} products in ${_colDur}ms`, 'color:#22c55e;font-weight:bold', 'color:#6b7280', _colDur > 1000 ? 'color:#ef4444;font-weight:bold' : 'color:#f59e0b;font-weight:bold');
      setCollectionCache((prev) => ({
        ...prev,
        [cacheKey]: products,
      }));
      return products;
    },
    [collectionCache],
  );

  const value = useMemo(
    () => ({
      ...state,
      loading: state.loading || state.status === 'loading',
      getProduct,
      getProductCard: (handle) => {
        const product = getProduct(handle);
        return product ? toProductCard(product) : null;
      },
      ensureCollectionProducts,
      collectionCache,
      formatMoney,
    }),
    [state, getProduct, ensureCollectionProducts, collectionCache],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = () => {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return context;
};

export default CatalogProvider;
