import React, { useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { CheckCircle, Package, Truck, Home } from 'lucide-react';
import { trackPurchase } from '../lib/googleAnalytics';
import { applyMetaAdvancedMatching, trackMetaPurchase } from '../lib/metaPixel';

const PURCHASE_EFFECT_STORAGE_KEY = 'aradhya-browser-purchase-fired-v1';

const normalizePurchaseKey = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const getPurchaseRuntimeRegistry = () => {
  if (typeof window === 'undefined') {
    return new Set();
  }

  if (window.__aradhyaBrowserPurchaseFired instanceof Set) {
    return window.__aradhyaBrowserPurchaseFired;
  }

  const registry = new Set(
    Array.isArray(window.__aradhyaBrowserPurchaseFired)
      ? window.__aradhyaBrowserPurchaseFired
      : [],
  );
  window.__aradhyaBrowserPurchaseFired = registry;
  return registry;
};

const readPurchaseKeysFromStorage = (storage) => {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(PURCHASE_EFFECT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => normalizePurchaseKey(entry)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const writePurchaseKeyToStorage = (storage, purchaseKey) => {
  if (!storage || !purchaseKey) {
    return;
  }

  const nextKeys = [
    purchaseKey,
    ...readPurchaseKeysFromStorage(storage).filter((entry) => entry !== purchaseKey),
  ].slice(0, 50);

  try {
    storage.setItem(PURCHASE_EFFECT_STORAGE_KEY, JSON.stringify(nextKeys));
  } catch {
    // Ignore storage write failures for the browser purchase guard.
  }
};

const hasStartedBrowserPurchase = (purchaseKey) => {
  if (!purchaseKey || typeof window === 'undefined') {
    return false;
  }

  if (getPurchaseRuntimeRegistry().has(purchaseKey)) {
    return true;
  }

  return (
    readPurchaseKeysFromStorage(window.sessionStorage).includes(purchaseKey) ||
    readPurchaseKeysFromStorage(window.localStorage).includes(purchaseKey)
  );
};

const markBrowserPurchaseStarted = (purchaseKey) => {
  if (!purchaseKey || typeof window === 'undefined') {
    return;
  }

  getPurchaseRuntimeRegistry().add(purchaseKey);
  writePurchaseKeyToStorage(window.sessionStorage, purchaseKey);
  writePurchaseKeyToStorage(window.localStorage, purchaseKey);
};

const OrderConfirmation = () => {
  const location = useLocation();
  const purchaseEffectStartedRef = useRef(false);
  const order = location.state?.order || null;
  const orderNumber = location.state?.orderNumber || order?.number || '';
  const awb = String(
    order?.shipping?.awbCode || order?.shipping?.awb || order?.shipping?.trackingNumber || '',
  ).trim();
  const metaPurchaseEventId =
    order?.metaPurchaseEventId ||
    order?.metaTracking?.purchaseEventId ||
    order?.shipping?.metaTracking?.purchaseEventId ||
    null;
  const purchaseTrackingKey =
    normalizePurchaseKey(order?.id) ||
    normalizePurchaseKey(order?.number) ||
    normalizePurchaseKey(order?._id) ||
    normalizePurchaseKey(metaPurchaseEventId);

  const purchaseItems = useMemo(() => {
    const candidates = Array.isArray(order?.items)
      ? order.items
      : Array.isArray(order?.lineItems)
        ? order.lineItems
        : [];

    return candidates.map((item) => ({
      id: item?.productId ?? item?.variantId ?? item?.id ?? item?.sku ?? item?.slug ?? null,
      productId:
        item?.sku ?? item?.productId ?? item?.variantId ?? item?.id ?? item?.slug ?? null,
      sku: item?.sku ?? null,
      slug: item?.slug ?? null,
      handle: item?.slug ?? item?.handle ?? null,
      name: item?.name ?? item?.title ?? item?.productName ?? 'Product',
      price: Number(item?.price ?? item?.unitPrice ?? item?.amount ?? 0),
      currency: item?.currency ?? order?.currency ?? order?.totals?.currency ?? 'INR',
      quantity: Number(item?.quantity ?? 1),
      size: item?.size ?? item?.variantTitle ?? null,
    }));
  }, [order]);

  const purchaseValue = useMemo(
    () =>
      Number(
        order?.totals?.total ??
          order?.total ??
          order?.amount ??
          purchaseItems.reduce(
            (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
            0,
          ),
      ),
    [order, purchaseItems],
  );

  const purchaseCurrency =
    order?.totals?.currency || order?.currency || purchaseItems[0]?.currency || 'INR';

  useEffect(() => {
    if (!order) return;
    if (!purchaseTrackingKey) return;
    if (purchaseEffectStartedRef.current || hasStartedBrowserPurchase(purchaseTrackingKey)) {
      return;
    }

    purchaseEffectStartedRef.current = true;
    markBrowserPurchaseStarted(purchaseTrackingKey);

    (async () => {
      console.info('[Meta Pixel] Purchase event firing', {
        orderId: order?.id || order?.number || order?._id || null,
        eventId: metaPurchaseEventId,
        purchaseTrackingKey,
        value: purchaseValue,
        currency: purchaseCurrency,
      });

      await applyMetaAdvancedMatching({
        customer: order?.customer || null,
        shipping: order?.shipping || null,
      });

      trackMetaPurchase({
        orderId: order?.id || order?.number || order?._id || null,
        eventId: metaPurchaseEventId,
        value: purchaseValue,
        currency: purchaseCurrency,
        items: purchaseItems,
      });

      console.info('[GA4] purchase event firing', {
        transactionId: order?.id || order?.number || order?._id || null,
        value: purchaseValue,
        currency: purchaseCurrency,
        items: purchaseItems,
      });
      trackPurchase({
        transactionId: order?.id || order?.number || order?._id || null,
        value: purchaseValue,
        currency: purchaseCurrency,
        items: purchaseItems,
      });
    })();
  }, [metaPurchaseEventId, order, purchaseCurrency, purchaseItems, purchaseTrackingKey, purchaseValue]);

  if (!order) {
    return <Navigate to="/orders" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-gray-50 px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl md:p-12">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-12 w-12 text-emerald-600" />
          </div>

          <h1 className="mb-3 text-3xl font-bold text-gray-900 md:text-4xl">
            Order Confirmed
          </h1>
          <p className="text-lg text-gray-600">
            Your order <span className="font-semibold text-gray-900">#{orderNumber}</span> has
            been placed successfully.
          </p>

          <p className="mt-3 text-sm text-gray-500">
            Your payment and order are saved. Shipment details will appear as soon as Shiprocket
            confirms the AWB.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              to={`/orders/${order.id}`}
              state={{ order, justPlaced: true }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-6 py-3 font-semibold text-white transition hover:bg-gray-900"
            >
              <Package className="h-5 w-5" />
              View Order Details
            </Link>

            {awb ? (
              <Link
                to={`/track/${encodeURIComponent(awb)}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <Truck className="h-5 w-5" />
                Track Shipment
              </Link>
            ) : null}
          </div>

          <Link
            to="/products"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Home className="h-5 w-5" />
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
