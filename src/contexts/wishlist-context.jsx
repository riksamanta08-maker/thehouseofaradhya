// src/contexts/wishlist-context.jsx
/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useCatalog } from './catalog-context';

const WishlistContext = createContext(undefined);

const storageKey = 'evrydae-wishlist-v1';

const sanitiseEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry.handle !== 'string') return null;
      return {
        handle: entry.handle,
        addedAt: Number(entry.addedAt) || Date.now(),
        card: entry.card && typeof entry.card === 'object' ? entry.card : null,
      };
    })
    .filter(Boolean);
};

const loadInitialWishlist = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitiseEntries(parsed);
  } catch {
    return [];
  }
};

export const WishlistProvider = ({ children }) => {
  const { getProductCard } = useCatalog();
  const [entries, setEntries] = useState(loadInitialWishlist);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Ignore storage errors (private mode, etc)
    }
  }, [entries]);

  const addItem = useCallback((handle, cardSnapshot = null) => {
    if (!handle) return;
    setEntries((current) => {
      if (current.some((entry) => entry.handle === handle)) return current;
      return [
        ...current,
        {
          handle,
          addedAt: Date.now(),
          card: cardSnapshot ?? null,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((handle) => {
    if (!handle) return;
    setEntries((current) => current.filter((entry) => entry.handle !== handle));
  }, []);

  const toggleItem = useCallback((handle, cardSnapshot = null) => {
    if (!handle) return;
    setEntries((current) => {
      const exists = current.some((entry) => entry.handle === handle);
      if (exists) {
        return current.filter((entry) => entry.handle !== handle);
      }
      return [
        ...current,
        {
          handle,
          addedAt: Date.now(),
          card: cardSnapshot ?? null,
        },
      ];
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const resolvedItems = useMemo(
    () =>
      entries.map((entry) => {
        const catalogCard = getProductCard(entry.handle);
        return {
          handle: entry.handle,
          addedAt: entry.addedAt,
          card: catalogCard ?? entry.card ?? null,
        };
      }),
    [entries, getProductCard],
  );

  const handles = useMemo(() => entries.map((entry) => entry.handle), [entries]);

  const value = useMemo(
    () => ({
      items: resolvedItems,
      handles,
      count: handles.length,
      addItem,
      removeItem,
      toggleItem,
      clear,
      isWishlisted: (handle) => handles.includes(handle),
    }),
    [resolvedItems, handles, addItem, removeItem, toggleItem, clear],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};

export default WishlistProvider;
