import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgePercent,
  Banknote,
  CreditCard,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createCheckoutOrder,
  createRazorpayOrder,
  formatMoney,
  logCheckoutDebug,
  verifyDiscountCode,
  getApiBaseUrl,
} from '../lib/api';
import { useAuth } from '../contexts/auth-context';
import { useCart } from '../contexts/cart-context';
import {
  clearCheckoutDraft,
  getCheckoutDraft,
  setCheckoutDraft,
} from '../lib/checkout';
import { appendMetaDebugParams } from '../lib/metaPixel';

const PAYMENT_METHODS = [
  {
    id: 'PREPAID',
    label: 'Pay Online',
    description: 'Use Razorpay for cards, UPI, net banking, or wallets.',
    icon: CreditCard,
  },
  {
    id: 'COD',
    label: 'Cash on Delivery',
    description: 'Pay when the order reaches you.',
    icon: Banknote,
  },
];

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayScriptPromise = null;

const normalizeCheckoutPaymentMethod = (value) =>
  String(value || '').trim().toUpperCase() === 'COD' ? 'COD' : 'PREPAID';

const pickItemImage = (item) => {
  const image = item?.image || item?.imageUrl || item?.featuredImage?.url;
  if (image) return image;
  if (!Array.isArray(item?.images)) return undefined;
  const first = item.images.find(Boolean);
  return typeof first === 'string' ? first : first?.url || undefined;
};

const buildSafeDraft = (draft) => ({
  createdAt: draft?.createdAt || new Date().toISOString(),
  items: Array.isArray(draft?.items) ? draft.items : [],
  shipping: draft?.shipping || {},
  appliedDiscount: draft?.appliedDiscount || null,
  totals: {
    subtotal: Number(draft?.totals?.subtotal ?? 0),
    shippingFee: 0,
    paymentFee: 0,
    discountAmount: Number(
      draft?.appliedDiscount?.amount ?? draft?.totals?.discountAmount ?? 0,
    ),
    discountCode: draft?.appliedDiscount?.code || draft?.totals?.discountCode || null,
    total: Math.max(
      Number(draft?.totals?.subtotal ?? 0) -
        Number(draft?.appliedDiscount?.amount ?? draft?.totals?.discountAmount ?? 0),
      0,
    ),
    currency: draft?.totals?.currency || 'INR',
    itemCount: Number(draft?.totals?.itemCount ?? 0),
  },
});

const loadRazorpayScript = () => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      setTimeout(() => resolve(Boolean(window.Razorpay)), 0);
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  }).finally(() => {
    razorpayScriptPromise = null;
  });

  return razorpayScriptPromise;
};

export default function Payment() {
  const navigate = useNavigate();
  const { removeItem } = useCart();
  const { isAuthenticated, getAuthToken, refreshCustomer } = useAuth();

  const [draft, setDraft] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState('PREPAID');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState('');
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [discountMessage, setDiscountMessage] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);

  useEffect(() => {
    const currentDraft = getCheckoutDraft();
    if (!currentDraft?.items?.length) {
      navigate(appendMetaDebugParams('/cart'), { replace: true });
      return;
    }

    if (!currentDraft?.shipping) {
      navigate(appendMetaDebugParams('/checkout/address'), { replace: true });
      return;
    }

    const normalizedDraft = buildSafeDraft(currentDraft);
    setDraft(normalizedDraft);
    setCheckoutDraft(normalizedDraft);
    setSelectedPayment(normalizeCheckoutPaymentMethod(currentDraft.paymentMethod));
    setDiscountCodeInput(
      currentDraft?.appliedDiscount?.code || currentDraft?.totals?.discountCode || '',
    );
    setDiscountMessage('');
  }, [navigate]);

  useEffect(() => {
    setDraft((prev) => {
      if (!prev) return prev;

      const activeDiscount = prev.appliedDiscount || null;
      const nextDiscountAmount = Number(
        activeDiscount?.amount ?? prev?.totals?.discountAmount ?? 0,
      );
      const nextDraft = {
        ...prev,
        paymentMethod: selectedPayment,
        totals: {
          ...prev.totals,
          shippingFee: 0,
          paymentFee: 0,
          discountAmount: nextDiscountAmount,
          discountCode: activeDiscount?.code || prev?.totals?.discountCode || null,
          total: Math.max(Number(prev?.totals?.subtotal ?? 0) - nextDiscountAmount, 0),
        },
        updatedAt: new Date().toISOString(),
      };
      setCheckoutDraft(nextDraft);
      return nextDraft;
    });
  }, [selectedPayment]);

  const itemCount = useMemo(
    () => (draft?.items || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
    [draft?.items],
  );

  const currency = draft?.totals?.currency || 'INR';
  const subtotal = Number(draft?.totals?.subtotal ?? 0);
  const shippingFee = 0;
  const paymentFee = 0;
  const appliedDiscount = draft?.appliedDiscount || null;
  const discountAmount = Number(appliedDiscount?.amount ?? draft?.totals?.discountAmount ?? 0);
  const finalTotal = Math.max(subtotal + shippingFee + paymentFee - discountAmount, 0);

  const orderItems = useMemo(
    () =>
      (draft?.items || []).map((item) => ({
        id: String(item.id || '').trim(),
        sku: item.sku || undefined,
        name: item.name || item.slug || 'Product',
        price: Number(item.price || 0),
        currency: item.currency || currency,
        quantity: Number(item.quantity || 1),
        size: item.size || undefined,
        image: pickItemImage(item),
        // Numeric IDs for Shiprocket variant resolution
        product_id: item.product_id ?? undefined,
        variant_id: item.variant_id ?? undefined,
        variantId: item.variant_id ?? item.id ?? undefined,
      })),
    [currency, draft?.items],
  );

  const persistDiscountInDraft = (nextDiscount) => {
    if (!draft) return;
    const normalizedDiscount =
      nextDiscount && Number(nextDiscount.amount) > 0
        ? {
            id: nextDiscount.id || null,
            code: String(nextDiscount.code || '').trim().toUpperCase(),
            type: nextDiscount.type || null,
            value: Number(nextDiscount.value || 0),
            amount: Number(nextDiscount.amount || 0),
            name: nextDiscount.name || null,
          }
        : null;

    const nextDiscountAmount = Number(normalizedDiscount?.amount || 0);
    const nextDraft = {
      ...draft,
      appliedDiscount: normalizedDiscount,
      totals: {
        ...draft.totals,
        shippingFee: 0,
        paymentFee: 0,
        discountAmount: nextDiscountAmount,
        discountCode: normalizedDiscount?.code || null,
        total: Math.max(subtotal - nextDiscountAmount, 0),
      },
      updatedAt: new Date().toISOString(),
    };

    setDraft(nextDraft);
    setCheckoutDraft(nextDraft);
  };

  const handleApplyDiscount = async () => {
    if (!draft || discountLoading) return;
    const code = String(discountCodeInput || '').trim().toUpperCase();
    if (!code) {
      setDiscountMessage('Enter a discount code.');
      return;
    }

    try {
      setDiscountLoading(true);
      setDiscountMessage('');
      const verified = await verifyDiscountCode({
        code,
        subtotal,
        currency,
      });

      persistDiscountInDraft({
        id: verified?.id || null,
        code: verified?.code || code,
        type: verified?.type || null,
        value: Number(verified?.value || 0),
        amount: Number(verified?.amount || 0),
        name: verified?.name || null,
      });

      setDiscountCodeInput(verified?.code || code);
      setDiscountMessage(`Applied ${verified?.code || code} successfully.`);
      setError('');
    } catch (err) {
      setDiscountMessage(err?.message || 'Unable to apply this code.');
    } finally {
      setDiscountLoading(false);
    }
  };

  const handleRemoveDiscount = () => {
    if (!draft) return;
    persistDiscountInDraft(null);
    setDiscountCodeInput('');
    setDiscountMessage('Discount removed.');
  };

  const finalizeOrderSuccess = async (order) => {
    const checkoutItems = Array.isArray(draft?.items) ? draft.items : [];
    checkoutItems.forEach((item) => {
      removeItem(item.slug, item.size ?? null);
    });
    clearCheckoutDraft();

    if (typeof refreshCustomer === 'function') {
      await refreshCustomer();
    }

    navigate(appendMetaDebugParams('/checkout/success'), {
      replace: true,
      state: {
        order,
        orderNumber: order?.number || null,
      },
    });
  };

  const buildOrderPayload = () => ({
    paymentMethod: selectedPayment,
    totals: {
      subtotal,
      shippingFee: 0,
      paymentFee: 0,
      discountAmount,
      discountCode: appliedDiscount?.code || null,
      total: finalTotal,
      currency,
    },
    shipping: {
      ...draft.shipping,
      country: draft.shipping?.country || 'India',
    },
    items: orderItems,
    discount: appliedDiscount?.id || appliedDiscount?.code
      ? {
          id: appliedDiscount?.id || undefined,
          code: appliedDiscount?.code || undefined,
        }
      : null,
  });

  const sendCheckoutDebug = async (stage, details = null) => {
    try {
      await logCheckoutDebug({
      stage,
      paymentMethod: selectedPayment,
      isAuthenticated,
      hasToken: Boolean(typeof getAuthToken === 'function' ? getAuthToken() : null),
      hasDraft: Boolean(draft),
      itemCount,
      total: finalTotal,
      details,
      url: typeof window !== 'undefined' ? window.location.href : null,
      });
    } catch {
      // Debug logging should never interrupt checkout.
    }
  };

  const handlePlaceOrder = async () => {
    const apiBaseUrl = getApiBaseUrl();
    console.log('%c[CHECKOUT DEBUG] resolved API base URL:', 'color: #bada55; font-weight: bold', apiBaseUrl);
    console.log('%c[CHECKOUT DEBUG] full checkout-debug URL:', 'color: #bada55; font-weight: bold', `${apiBaseUrl}/checkout-debug`);
    console.log('%c[CHECKOUT DEBUG] full create-order URL:', 'color: #bada55; font-weight: bold', `${apiBaseUrl}/create-order`);
    console.log('%c[CHECKOUT DEBUG] payment method:', 'color: #bada55; font-weight: bold', selectedPayment);

    await sendCheckoutDebug('place_order_clicked');

    if (!draft?.items?.length || placingOrder) {
      await sendCheckoutDebug('blocked_missing_items_or_already_placing', {
        hasItems: Boolean(draft?.items?.length),
        placingOrder,
      });
      setError('Please select items to checkout.');
      return;
    }
    setError('');

    if (!isAuthenticated) {
      await sendCheckoutDebug('blocked_not_authenticated');
      navigate(appendMetaDebugParams('/login?redirect=/checkout/payment'));
      return;
    }

    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) {
      await sendCheckoutDebug('blocked_missing_token');
      setError('Session expired. Please log in again.');
      navigate(appendMetaDebugParams('/login?redirect=/checkout/payment'));
      return;
    }

    if (
      !draft.shipping?.fullName ||
      !draft.shipping?.address ||
      !draft.shipping?.city ||
      !draft.shipping?.state ||
      !draft.shipping?.postalCode
    ) {
      await sendCheckoutDebug('blocked_incomplete_shipping', {
        hasFullName: Boolean(draft.shipping?.fullName),
        hasAddress: Boolean(draft.shipping?.address),
        hasCity: Boolean(draft.shipping?.city),
        hasState: Boolean(draft.shipping?.state),
        hasPostalCode: Boolean(draft.shipping?.postalCode),
      });
      setError('Shipping address is incomplete. Please go back and complete your address.');
      return;
    }

    if (finalTotal <= 0) {
      await sendCheckoutDebug('blocked_invalid_total');
      setError('Order total is invalid. Please refresh and try again.');
      return;
    }

    const orderPayload = buildOrderPayload();
    console.log('%c[CHECKOUT DEBUG] built order payload (orderNumber usually null here):', 'color: #bada55; font-weight: bold', orderPayload?.number || 'not-assigned');

    if (selectedPayment === 'COD') {
      try {
        setPlacingOrder(true);
        await sendCheckoutDebug('calling_create_order_cod');
        const order = await createCheckoutOrder(token, {
          order: orderPayload,
        });
        await sendCheckoutDebug('create_order_cod_success', {
          orderNumber: order?.number || null,
        });
        await finalizeOrderSuccess(order);
      } catch (err) {
        await sendCheckoutDebug('create_order_cod_error', {
          message: err?.message || null,
          status: err?.status || null,
        });
        setError(err?.message || 'Unable to place this COD order right now.');
      } finally {
        setPlacingOrder(false);
      }
      return;
    }

    try {
      setPlacingOrder(true);
      await sendCheckoutDebug('loading_razorpay_script');
      const razorpayLoaded = await loadRazorpayScript();
      if (!razorpayLoaded || !window.Razorpay) {
        await sendCheckoutDebug('razorpay_script_failed');
        throw new Error('Razorpay checkout could not be loaded. Please try again.');
      }

      await sendCheckoutDebug('calling_razorpay_order');
      const razorpaySession = await createRazorpayOrder(token, {
        order: orderPayload,
      });
      await sendCheckoutDebug('razorpay_order_success', {
        razorpayOrderId: razorpaySession?.order?.id || null,
      });

      await new Promise((resolve, reject) => {
        const razorpay = new window.Razorpay({
          key: razorpaySession?.keyId,
          amount: razorpaySession?.order?.amount,
          currency: razorpaySession?.order?.currency || currency,
          name: 'Aradhya',
          description: 'Order payment',
          order_id: razorpaySession?.order?.id,
          prefill: {
            name: draft.shipping?.fullName || '',
            email: draft.shipping?.email || '',
            contact: draft.shipping?.phone || '',
          },
          notes: {
            address: draft.shipping?.address || '',
            city: draft.shipping?.city || '',
            state: draft.shipping?.state || '',
            pincode: draft.shipping?.postalCode || '',
          },
          theme: {
            color: '#111827',
          },
          handler: async (response) => {
            try {
              await sendCheckoutDebug('razorpay_handler_calling_create_order', {
                razorpayOrderId: response.razorpay_order_id || null,
              });
              const order = await createCheckoutOrder(token, {
                order: orderPayload,
                payment: {
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
              });
              await sendCheckoutDebug('create_order_prepaid_success', {
                orderNumber: order?.number || null,
              });
              await finalizeOrderSuccess(order);
              resolve();
            } catch (err) {
              await sendCheckoutDebug('create_order_prepaid_error', {
                message: err?.message || null,
                status: err?.status || null,
              });
              reject(err);
            }
          },
          modal: {
            ondismiss: () => {
              void sendCheckoutDebug('razorpay_modal_dismissed');
              reject(new Error('Payment was cancelled.'));
            },
          },
        });

        void sendCheckoutDebug('opening_razorpay_modal');
        razorpay.open();
      });
    } catch (err) {
      await sendCheckoutDebug('prepaid_checkout_error', {
        message: err?.message || null,
        status: err?.status || null,
      });
      setError(err?.message || 'Unable to continue to Razorpay right now.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!draft) return null;

  return (
    <div className="min-h-screen bg-[#f7f7fa] pb-24">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded p-1 text-gray-700 hover:bg-gray-100"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold tracking-wide text-[var(--color-text-main)]">
              PAYMENT
            </h1>
          </div>
          <span className="text-xs font-semibold text-gray-500">STEP 3/3</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-[var(--color-text-main)]">
            Deliver to
          </p>
          <p className="text-sm font-semibold text-gray-900">{draft.shipping?.fullName}</p>
          <p className="text-sm text-gray-600">{draft.shipping?.address}</p>
          <p className="text-sm text-gray-600">
            {draft.shipping?.city}, {draft.shipping?.state} {draft.shipping?.postalCode}
          </p>
          <p className="mt-1 text-sm text-gray-600">{draft.shipping?.phone}</p>
          <Link
            to={appendMetaDebugParams('/checkout/address')}
            className="mt-3 inline-flex text-xs font-semibold text-black hover:underline"
          >
            Change address
          </Link>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <BadgePercent className="h-4 w-4 text-gray-700" />
            <p className="text-sm font-semibold text-[var(--color-text-main)]">
              Apply Discount Code
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={discountCodeInput}
              onChange={(event) => setDiscountCodeInput(event.target.value.toUpperCase())}
              placeholder="Enter code"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
            />
            <button
              type="button"
              onClick={handleApplyDiscount}
              disabled={discountLoading || !discountCodeInput.trim()}
              className="rounded-lg border border-black px-4 py-2 text-xs font-bold uppercase tracking-wide text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
            >
              {discountLoading ? 'Applying...' : 'Apply'}
            </button>
          </div>

          {appliedDiscount?.code ? (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>
                {appliedDiscount.code} applied ({formatMoney(discountAmount, currency)} off)
              </span>
              <button
                type="button"
                onClick={handleRemoveDiscount}
                className="text-xs font-semibold underline"
              >
                Remove
              </button>
            </div>
          ) : null}

          {discountMessage ? (
            <p
              className={`mt-2 text-xs ${
                appliedDiscount?.code ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {discountMessage}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
              Payment method
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {PAYMENT_METHODS.map((method) => {
              const isSelected = selectedPayment === method.id;
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedPayment(method.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                    isSelected ? '' : 'hover:bg-gray-50'
                  }`}
                  style={isSelected ? { backgroundColor: 'rgba(17, 24, 39, 0.08)' } : undefined}
                >
                  <span
                    className={`mt-1 h-5 w-5 rounded-full border-2 ${
                      isSelected ? 'border-black' : 'border-gray-300'
                    }`}
                  >
                    <span
                      className={`mx-auto mt-[3px] block h-2.5 w-2.5 rounded-full ${
                        isSelected ? 'bg-black' : 'bg-transparent'
                      }`}
                    />
                  </span>
                  <Icon className="mt-0.5 h-4 w-4 text-gray-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{method.label}</p>
                    <p className="text-xs text-gray-500">{method.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-700" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Direct checkout with Razorpay and Shiprocket
              </p>
              <p className="mt-1 text-sm text-blue-800">
                Prepaid orders are verified with Razorpay on the backend. Once payment is
                confirmed, your shipment is created directly in Shiprocket and tracking is
                attached to your order automatically.
              </p>
              <p className="mt-2 text-xs text-blue-700">
                Selected method: {selectedPayment === 'COD' ? 'Cash on Delivery' : 'Razorpay'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-[var(--color-text-main)]">
            Order Summary
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Subtotal ({itemCount} items)</span>
              <span>{formatMoney(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Delivery</span>
              <span className="font-semibold text-emerald-600">Free</span>
            </div>
            {discountAmount > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <span>
                  Discount
                  {appliedDiscount?.code ? ` (${appliedDiscount.code})` : ''}
                </span>
                <span>-{formatMoney(discountAmount, currency)}</span>
              </div>
            ) : null}
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between text-base font-bold text-[var(--color-text-main)]">
                <span>Total Order Value</span>
                <span>{formatMoney(finalTotal, currency)}</span>
              </div>
            </div>
          </div>
        </section>

        {!isAuthenticated ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-bold">!</span>
            <div>
              <p className="font-semibold">Login Required</p>
              <p className="mt-1 text-xs">Please login to continue to checkout.</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span className="font-bold">x</span>
            <div className="flex-1">
              <p className="font-semibold">Error</p>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          </div>
        ) : null}

        {placingOrder ? (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>
              {selectedPayment === 'COD'
                ? 'Creating your order and shipment...'
                : 'Preparing secure payment...'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="fixed bottom-[60px] left-0 right-0 z-30 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.04)] md:bottom-0">
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={placingOrder}
          className="w-full rounded-sm bg-black py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          {placingOrder
            ? 'Processing...'
            : selectedPayment === 'COD'
              ? `Place COD Order - ${formatMoney(finalTotal, currency)}`
              : `Pay with Razorpay - ${formatMoney(finalTotal, currency)}`}
        </button>
      </div>
    </div>
  );
}
