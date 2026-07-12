// src/contexts/cart-context.jsx
/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

const CartContext = createContext(undefined);

const storageKey = 'evrydae-cart-v1';

const createId = (slug, size) => `${slug}::${size ?? 'onesize'}`;

const withValidQuantity = (quantity) => {
  const parsed = Number(quantity);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 99);
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'set': {
      return action.payload;
    }
    case 'add': {
      const { item } = action.payload;
      const existingIndex = state.findIndex((entry) => entry.id === item.id);
      if (existingIndex !== -1) {
        const next = [...state];
        const current = next[existingIndex];
        next[existingIndex] = {
          ...current,
          quantity: withValidQuantity(current.quantity + item.quantity),
        };
        return next;
      }
      return [...state, item];
    }
    case 'updateQuantity': {
      const { id, quantity } = action.payload;
      const nextQuantity = withValidQuantity(quantity);
      return state
        .map((entry) =>
          entry.id === id
            ? {
                ...entry,
                quantity: nextQuantity,
              }
            : entry,
        )
        .filter(Boolean);
    }
    case 'remove': {
      const { id } = action.payload;
      return state.filter((entry) => entry.id !== id);
    }
    case 'removeBySlug': {
      const { slug } = action.payload;
      return state.filter((entry) => entry.slug !== slug);
    }
    case 'clear': {
      return [];
    }
    default:
      return state;
  }
};

const sanitiseItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item.slug !== 'string') return null;
      const id = createId(item.slug, item.size);
      return {
        id,
        slug: item.slug,
        size: item.size ?? null,
        quantity: withValidQuantity(item.quantity ?? 1),
      };
    })
    .filter(Boolean);
};

const initialiseCart = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitiseItems(parsed);
  } catch {
    return [];
  }
};

const CartProvider = ({ children }) => {
  const [items, dispatch] = useReducer(cartReducer, [], initialiseCart);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // no-op: fail silently if storage is unavailable
    }
  }, [items]);

  const addItem = useCallback((slug, { quantity = 1, size = null } = {}) => {
    if (!slug) return;
    const item = {
      id: createId(slug, size),
      slug,
      size,
      quantity: withValidQuantity(quantity),
    };
    dispatch({ type: 'add', payload: { item } });
  }, []);

  const updateQuantity = useCallback((slug, size, quantity) => {
    if (!slug) return;
    const id = createId(slug, size);
    const nextQuantity = Number(quantity);
    if (Number.isNaN(nextQuantity) || nextQuantity < 1) {
      dispatch({ type: 'remove', payload: { id } });
      return;
    }
    dispatch({ type: 'updateQuantity', payload: { id, quantity: nextQuantity } });
  }, []);

  const removeItem = useCallback((slug, size) => {
    if (!slug) return;
    if (typeof size === 'undefined') {
      dispatch({ type: 'removeBySlug', payload: { slug } });
      return;
    }
    const id = createId(slug, size);
    dispatch({ type: 'remove', payload: { id } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'clear' });
  }, []);

  const totalItems = useMemo(
    () => items.reduce((acc, item) => acc + (item.quantity ?? 0), 0),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      totalItems,
    }),
    [items, addItem, updateQuantity, removeItem, clearCart, totalItems],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartProvider;
