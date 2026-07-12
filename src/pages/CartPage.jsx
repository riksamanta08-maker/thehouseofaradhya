import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgePercent, ChevronDown, Heart, Share2, Trash2, X } from 'lucide-react';
import { useCart } from '../contexts/cart-context';
import {
  fetchProductByHandle,
  findVariantForSize,
  formatMoney,
  getProductImageUrl,
  isSizeOptionName,
} from '../lib/api';
import { trackBeginCheckout } from '../lib/googleAnalytics';
import { setCheckoutDraft } from '../lib/checkout';
import { appendMetaDebugParams, trackMetaInitiateCheckout } from '../lib/metaPixel';
import { useCatalog } from '../contexts/catalog-context';
import { useWishlist } from '../contexts/wishlist-context';
import { useNotifications } from '../components/NotificationProvider';

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

const CartPage = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem } = useCart();
  const { getProduct } = useCatalog();
  const { toggleItem } = useWishlist();
  const { notify } = useNotifications();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
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
      const fetchedProducts = {};
      const failures = [];

      for (const handle of missingHandles) {
        try {
          const product = await fetchProductByHandle(handle);
          if (product) {
            fetchedProducts[handle] = product;
          } else {
            failures.push(handle);
          }
        } catch (error) {
          console.error(`Failed to load product "${handle}"`, error);
          failures.push(handle);
        }
      }

      if (cancelled) return;

      if (Object.keys(fetchedProducts).length) {
        setExternalProducts((prev) => ({ ...prev, ...fetchedProducts }));
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

  const selectedCartItems = useMemo(
    () => cartItems.filter((item) => selectedIds[item.id]),
    [cartItems, selectedIds],
  );

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
  const totalLabel = formatMoney(subtotalAmount, subtotalCurrency);

  const isEmpty = items.length === 0;

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

  const handleCheckout = async () => {
    if (!selectedCartItems.length || isCheckingOut) {
      setCheckoutError('Select at least one item to place your order.');
      return;
    }

    setCheckoutError(null);
    setIsCheckingOut(true);

    try {
      const missingHandles = selectedCartItems.filter((item) => item.loading || !item.product);
      if (missingHandles.length) {
        setCheckoutError('Some products are still loading. Please wait a moment and try again.');
        setIsCheckingOut(false);
        return;
      }

      // Validate all items have valid prices
      const invalidItems = selectedReadyItems.filter(
        (item) => !item.unitPrice?.amount || item.unitPrice.amount <= 0,
      );
      if (invalidItems.length) {
        setCheckoutError('Some items have invalid pricing. Please refresh your cart.');
        setIsCheckingOut(false);
        return;
      }

      const checkoutItems = selectedReadyItems.map((item) => {
        const resolvedSize = resolveItemSize(item);
        const numericProductId = item.product?.product_id ?? item.product?.externalNumericId ?? null;
        const numericVariantId = item.variant?.variant_id ?? item.variant?.externalNumericId ?? null;
        return {
          id: numericVariantId ?? item.variant?.id ?? item.product?.id ?? item.id,
          product_id: numericProductId,
          variant_id: numericVariantId,
          slug: item.handle,
          sku: item.variant?.sku ?? null,
          name: item.product?.title || item.handle,
          vendor: item.product?.vendor || '',
          size: resolvedSize,
          quantity: item.quantity ?? 1,
          price: Number(item.unitPrice?.amount ?? 0),
          currency: item.unitPrice?.currency || 'INR',
          image: getProductImageUrl(item.product),
        };
      });
      const subtotal = checkoutItems.reduce(
        (sum, entry) => sum + Number(entry.price || 0) * Number(entry.quantity || 0),
        0,
      );
      const currency = checkoutItems[0]?.currency || 'INR';
      const itemCount = checkoutItems.reduce(
        (sum, entry) => sum + Number(entry.quantity || 0),
        0,
      );

      setCheckoutDraft({
        createdAt: new Date().toISOString(),
        items: checkoutItems,
        totals: {
          subtotal,
          shippingFee: 0,
          paymentFee: 0,
          discountAmount: 0,
          discountCode: null,
          total: subtotal,
          currency,
          itemCount,
        },
        appliedDiscount: null,
      });

      trackMetaInitiateCheckout(checkoutItems, {
        value: subtotal,
        currency,
      });
      console.info('[GA4] begin_checkout event firing', {
        value: subtotal,
        currency,
        items: checkoutItems,
      });
      trackBeginCheckout(
        checkoutItems,
        {
          value: subtotal,
          currency,
        },
        { deferUntilNextPage: true },
      );

      navigate(appendMetaDebugParams('/checkout/address'));
    } catch (error) {
      console.error('Checkout failed', error);
      setCheckoutError(
        error instanceof Error && error.message
          ? error.message
          : 'We could not start the checkout. Please try again or reach out to support.',
      );
    } finally {
      setIsCheckingOut(false);
    }
  };



  if (isEmpty) {
    return (
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-500">
          Your bag is empty
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-gray-800"
        >
          Explore Products
        </Link>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-30 bg-white shadow-[0_1px_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => navigate(-1)}
            className="p-1 text-gray-700"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-base font-semibold tracking-wide text-gray-900">SHOPPING BAG</h1>
          <span className="text-[11px] font-medium text-gray-500">STEP 1/3</span>
        </div>
      </header>



      <section className="mt-2 flex items-center justify-between border-y border-gray-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              setSelectedIds(() => {
                const next = {};
                readyItems.forEach((item) => {
                  next[item.id] = allSelected ? false : true;
                });
                return next;
              });
            }}
            className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
          />
          <span className="whitespace-nowrap">
            {selectionCount}/{totalReady} items selected
          </span>
        </label>

        <div className="flex items-center gap-2 sm:gap-4 text-gray-500">
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
            onClick={() => readyItems.forEach((item) => removeItem(item.handle, item.size ?? null))}
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button type="button" className="p-1" aria-label="Save for later" onClick={handleSaveForLater}>
            <Heart className="h-5 w-5" />
          </button>
        </div>
      </section>

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
                    className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                  />
                </div>

                <Link
                  to={`/product/${item.handle}`}
                  className="h-28 w-24 flex-shrink-0 overflow-hidden rounded-md bg-gray-100"
                >
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
                </Link>

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
                      <span className="text-xs font-semibold uppercase text-gray-600">Size:</span>
                      <div className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-gray-800">
                        <span>{sizeLabel}</span>
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase text-gray-600">Qty:</span>
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
                      <span className="font-semibold text-red-600">{discount} OFF</span>
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

      {checkoutError && (
        <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span className="text-red-600 font-bold">⚠</span>
          <span>{checkoutError}</span>
        </div>
      )}

      {readyItems.length > 0 && readyItems.some((item) => item.variant?.quantityAvailable !== null && item.variant.quantityAvailable <= 5) && (
        <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ⚠ Some items in your cart have low stock. Order soon to avoid disappointment.
        </div>
      )}



      <div className="fixed bottom-[60px] md:bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
        <div className="mb-3 text-center text-sm font-bold text-gray-800">
          {selectionCount > 0 ? (
            <span className="flex items-center justify-between gap-2 flex-wrap">
              <span className="break-words">Total ({selectionCount} items):</span>
              <span className="text-lg whitespace-nowrap">{totalLabel}</span>
            </span>
          ) : (
            <span className="text-gray-500 font-normal">Select items to checkout</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={isCheckingOut || selectionCount === 0}
          className="w-full rounded-sm bg-gray-900 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          {isCheckingOut ? 'Placing order...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
};

export default CartPage;
