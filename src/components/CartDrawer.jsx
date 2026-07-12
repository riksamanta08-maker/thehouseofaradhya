import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { BadgePercent, ChevronDown, Heart, Share2, Trash2, X } from 'lucide-react';
import { useCart } from '../contexts/cart-context';
import { useCatalog } from '../contexts/catalog-context';
import { useWishlist } from '../contexts/wishlist-context';
import { useNotifications } from './NotificationProvider';
import {
  fetchProductByHandle,
  findVariantForSize,
  formatMoney,
  getProductImageUrl,
  isSizeOptionName,
} from '../lib/api';

const DEFAULT_SIZE_TOKENS = new Set(['default', 'default title', 'title']);
const normalizeSizeToken = (value) => String(value ?? '').trim().toLowerCase();

const resolveItemSize = (item) => {
  const explicitSize = String(item?.size ?? '').trim();
  if (explicitSize && !DEFAULT_SIZE_TOKENS.has(normalizeSizeToken(explicitSize))) {
    return explicitSize;
  }

  const selectedOptions = Array.isArray(item?.variant?.selectedOptions)
    ? item.variant.selectedOptions
    : [];
  const optionMatch = selectedOptions.find(
    (option) => isSizeOptionName(option?.name) && String(option?.value ?? '').trim(),
  );
  const optionValue = String(optionMatch?.value ?? '').trim();
  if (optionValue && !DEFAULT_SIZE_TOKENS.has(normalizeSizeToken(optionValue))) {
    return optionValue;
  }

  const titleValue = String(item?.variant?.title ?? '').trim();
  if (titleValue && !DEFAULT_SIZE_TOKENS.has(normalizeSizeToken(titleValue))) {
    return titleValue;
  }

  return null;
};

const CartDrawer = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem } = useCart();
  const { getProduct } = useCatalog();
  const { toggleItem } = useWishlist();
  const { notify } = useNotifications();
  const [externalProducts, setExternalProducts] = useState({});
  const [selectedIds, setSelectedIds] = useState({});

  const cartHandles = useMemo(
    () => Array.from(new Set(items.map((item) => item.slug).filter(Boolean))),
    [items],
  );

  useEffect(() => {
    const missingHandles = cartHandles.filter(
      (handle) => !getProduct(handle) && !externalProducts[handle],
    );
    if (!missingHandles.length) return;

    let cancelled = false;

    (async () => {
      const fetched = {};
      const failures = [];
      for (const handle of missingHandles) {
        try {
          const product = await fetchProductByHandle(handle);
          if (product) {
            fetched[handle] = product;
          } else {
            failures.push(handle);
          }
        } catch (error) {
          console.error(`Failed to load product "${handle}"`, error);
          failures.push(handle);
        }
      }

      if (cancelled) return;
      if (Object.keys(fetched).length) {
        setExternalProducts((prev) => ({ ...prev, ...fetched }));
      }

      if (failures.length) {
        failures.forEach((handle) => {
          removeItem(handle);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cartHandles, getProduct, externalProducts, removeItem]);

  const cartItems = useMemo(
    () =>
      items.map((item) => {
        const handle = item.slug;
        const product = getProduct(handle) ?? externalProducts[handle];
        const quantity = item.quantity ?? 1;

        if (!product) {
          return {
            id: item.id,
            handle,
            quantity,
            size: item.size ?? null,
            loading: true,
          };
        }

        const variant = findVariantForSize(product, item.size);
        const unitPriceAmount = variant?.price ?? product.price ?? 0;
        const currencyCode = variant?.currencyCode ?? product.currencyCode;

        return {
          id: item.id,
          handle,
          product,
          variant,
          quantity,
          size: item.size ?? null,
          loading: false,
          unitPrice: {
            amount: unitPriceAmount,
            currency: currencyCode,
          },
          lineTotal: {
            amount: unitPriceAmount * quantity,
            currency: currencyCode,
          },
        };
      }),
    [items, getProduct, externalProducts],
  );

  const readyItems = useMemo(
    () => cartItems.filter((item) => !item.loading && item.product),
    [cartItems],
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = {};
      readyItems.forEach((item) => {
        const existing = prev[item.id];
        next[item.id] = typeof existing === 'boolean' ? existing : true;
      });
      return next;
    });
  }, [readyItems]);

  const selectedReadyItems = useMemo(
    () => readyItems.filter((item) => selectedIds[item.id]),
    [readyItems, selectedIds],
  );

  const selectionCount = selectedReadyItems.length;
  const totalReady = readyItems.length;
  const allSelected = totalReady > 0 && selectionCount === totalReady;

  const subtotalAmount = selectedReadyItems.reduce(
    (acc, item) => acc + (item.lineTotal?.amount ?? 0),
    0,
  );
  const subtotalCurrency = selectedReadyItems[0]?.lineTotal?.currency;
  const subtotalLabel = formatMoney(subtotalAmount, subtotalCurrency);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Address removed as requested


  const handleSelectAll = () => {
    setSelectedIds(() => {
      const next = {};
      readyItems.forEach((item) => {
        next[item.id] = allSelected ? false : true;
      });
      return next;
    });
  };

  const handlePlaceOrder = () => {
    onClose();
    navigate('/cart');
  };

  const handleShareBag = async () => {
    const fallbackUrl = typeof window !== 'undefined' ? window.location.href : '';
    const list = selectedReadyItems.map((item) => item.product?.title).filter(Boolean);
    const title = 'My ARADHYA bag';
    const text =
      list.length > 0
        ? `Checkout these picks: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '...' : ''}`
        : 'Have a look at my cart on ARADHYA.';
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: fallbackUrl });
        notify({ title: 'Share', message: 'Bag shared successfully.' });
        return;
      }
      await navigator.clipboard?.writeText(fallbackUrl);
      notify({ title: 'Link copied', message: 'Cart link copied to clipboard.' });
    } catch (err) {
      console.warn('Share failed', err);
      notify({ title: 'Share failed', message: 'Unable to share right now.' });
    }
  };

  const handleSaveForLater = () => {
    const targets = selectedReadyItems.length ? selectedReadyItems : readyItems;
    if (!targets.length) return;
    targets.forEach((item) => {
      toggleItem(item.handle, {
        title: item.product.title,
        handle: item.handle,
        vendor: item.product.vendor,
        price: formatMoney(item.unitPrice.amount, item.unitPrice.currency),
        img: getProductImageUrl(item.product),
      });
      removeItem(item.handle, item.size ?? null);
    });
    notify({
      title: 'Wishlist',
      message: `${targets.length} item${targets.length > 1 ? 's' : ''} moved to wishlist.`,
    });
  };

  const empty = items.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <Motion.div
          className="fixed inset-0 z-[998] flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Motion.div
            className="h-full w-full bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <Motion.aside
            className="relative ml-auto flex h-full w-full max-w-md flex-col bg-gray-50 shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900">SHOPPING BAG</p>
                <p className="text-xs font-medium text-gray-500">Step 1/3</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-transparent p-2 transition hover:border-gray-200"
                aria-label="Close cart"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Address section removed */}

            {!empty && (
              <section className="mt-2 flex items-center justify-between border-y border-gray-200 bg-white px-4 py-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-[--color-primary] focus:ring-[--color-primary]"
                  />
                  <span>
                    {selectionCount}/{totalReady} items selected
                  </span>
                </label>

                <div className="flex items-center gap-3 text-gray-500">
                  <button type="button" className="p-1" aria-label="Share bag" onClick={handleShareBag}>
                    <Share2 className="h-5 w-5" />
                  </button>
                  <button type="button" className="p-1" aria-label="Apply offer">
                    <BadgePercent className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="p-1"
                    aria-label="Remove all"
                    onClick={() =>
                      readyItems.forEach((item) => removeItem(item.handle, item.size ?? null))
                    }
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                  <button type="button" className="p-1" aria-label="Save for later" onClick={handleSaveForLater}>
                    <Heart className="h-5 w-5" />
                  </button>
                </div>
              </section>
            )}

            <div className="flex-1 overflow-y-auto">
              {empty ? (
                <div className="flex h-full items-center justify-center bg-white px-6 py-10 text-center">
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-gray-500">
                    Your cart is currently empty.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {readyItems.map((item) => {
                    const imageUrl = getProductImageUrl(item.product);
                    const sizeLabel = resolveItemSize(item) || 'Default';
                    const unitPriceLabel = formatMoney(item.unitPrice.amount, item.unitPrice.currency);
                    const compareAt = item.variant?.compareAtPrice?.amount;
                    const compareAtLabel =
                      compareAt && compareAt > item.unitPrice.amount
                        ? formatMoney(compareAt, item.unitPrice.currency)
                        : null;
                    const discount =
                      compareAt && compareAt > item.unitPrice.amount
                        ? formatMoney(compareAt - item.unitPrice.amount, item.unitPrice.currency)
                        : null;
                    const lowStock =
                      Number.isFinite(item.variant?.quantityAvailable) &&
                        item.variant.quantityAvailable > 0 &&
                        item.variant.quantityAvailable <= 10
                        ? `${item.variant.quantityAvailable} left`
                        : null;
                    const returnDays = item.product.tags?.includes('return-14') ? 14 : 7;

                    return (
                      <div key={item.id} className="bg-white px-4 py-3">
                        <div className="flex gap-3">
                          <div className="pt-1">
                            <input
                              type="checkbox"
                              checked={!!selectedIds[item.id]}
                              onChange={() =>
                                setSelectedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                              }
                              className="h-4 w-4 rounded border-gray-300 text-[--color-primary] focus:ring-[--color-primary]"
                            />
                          </div>

                          <div className="h-24 w-20 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={item.product.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.25em] text-gray-400">
                                No Image
                              </div>
                            )}
                          </div>

                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold leading-snug text-gray-900 break-words">
                                  {item.product.title}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Sold by: {item.product.vendor || 'Brand'}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Remove item"
                                onClick={() => removeItem(item.handle, item.size ?? null)}
                                className="p-1 text-gray-500 hover:text-gray-700"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase text-gray-600">
                                  Size:
                                </span>
                                <div className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-gray-800">
                                  <span>{sizeLabel}</span>
                                  <ChevronDown className="h-4 w-4 text-gray-500" />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase text-gray-600">
                                  Qty:
                                </span>
                                <div className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1">
                                  <button
                                    type="button"
                                    className="px-2 text-gray-600"
                                    onClick={() =>
                                      updateQuantity(item.handle, item.size ?? null, item.quantity - 1)
                                    }
                                  >
                                    -
                                  </button>
                                  <span className="px-1 text-gray-900">{item.quantity}</span>
                                  <button
                                    type="button"
                                    className="px-2 text-gray-600"
                                    onClick={() =>
                                      updateQuantity(item.handle, item.size ?? null, item.quantity + 1)
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {lowStock && (
                                <span className="rounded border border-orange-400 px-2 py-0.5 text-[11px] font-semibold text-orange-500">
                                  {lowStock}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-semibold text-gray-900">{unitPriceLabel}</span>
                              {compareAtLabel && (
                                <span className="text-gray-400 line-through">{compareAtLabel}</span>
                              )}
                              {discount && (
                                <span className="font-semibold text-[--color-primary]">
                                  {discount} OFF
                                </span>
                              )}
                            </div>

                            <p className="text-[13px] text-gray-600">
                              <span className="font-semibold">{returnDays} days</span> return available
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!empty && (
              <div className="border-t border-gray-200 bg-white px-4 py-3 text-center text-sm font-semibold text-gray-700">
                {selectionCount === 0
                  ? 'No item selected, select at least one item to place order.'
                  : `Selected Total: ${subtotalLabel}`}
              </div>
            )}

            <footer className="border-t border-gray-200 bg-white px-4 py-4 md:pb-4">
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={selectionCount === 0}
                  className="w-full rounded-sm bg-gray-900 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  Place Order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/cart');
                  }}
                  className="w-full rounded-sm border border-gray-900 py-3 text-sm font-semibold uppercase tracking-wide text-gray-900 transition hover:bg-gray-900 hover:text-white"
                >
                  View Full Cart
                </button>
              </div>
            </footer>
          </Motion.aside>
        </Motion.div>
      )}
    </AnimatePresence>
  );
};

export default CartDrawer;
