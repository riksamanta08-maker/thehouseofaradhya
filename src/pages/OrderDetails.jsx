import React, { useEffect, useMemo } from 'react';
import { CheckCircle2, Clock3, Package, Truck, AlertCircle, ArrowUpRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { formatMoney } from '../lib/api';
import { useNotifications } from '../components/NotificationProvider';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const hasPaymentConfirmation = (order) =>
  Number(order?.totals?.paidAmount ?? 0) > 0 ||
  Boolean(order?.totals?.paymentConfirmedAt) ||
  Boolean(order?.shipping?.paymentId);

const pickFirst = (...values) =>
  values
    .map((value) => (value == null ? '' : String(value).trim()))
    .find(Boolean) || '';

const getTrackingNumber = (shipping = {}) =>
  pickFirst(shipping.trackingNumber, shipping.awbCode, shipping.awb_code, shipping.awb);

const statusMeta = (order) => {
  const normalized = String(order?.status || '').toUpperCase();
  const advanceRequired = Boolean(order?.totals?.advanceRequired);
  const paymentConfirmed = hasPaymentConfirmation(order);
  if (normalized === 'FULFILLED') {
    return {
      label: 'Delivered',
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      Icon: CheckCircle2,
    };
  }
  if (normalized === 'PAID') {
    return {
      label: 'Paid',
      tone: 'text-blue-700 bg-blue-50 border-blue-200',
      Icon: Truck,
    };
  }
  if (normalized === 'PENDING' && paymentConfirmed && advanceRequired) {
    return {
      label: 'Advance Paid',
      tone: 'text-blue-700 bg-blue-50 border-blue-200',
      Icon: CheckCircle2,
    };
  }
  if (normalized === 'PENDING') {
    return {
      label: 'Pending',
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
      Icon: Clock3,
    };
  }
  if (normalized === 'CANCELLED') {
    return {
      label: 'Cancelled',
      tone: 'text-rose-700 bg-rose-50 border-rose-200',
      Icon: AlertCircle,
    };
  }
  return {
    label: normalized || 'Unknown',
    tone: 'text-gray-700 bg-gray-100 border-gray-200',
    Icon: AlertCircle,
  };
};

export default function OrderDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orders, isAuthenticated, loading } = useAuth();
  const { notify } = useNotifications();

  const justPlaced = Boolean(location.state?.justPlaced);
  const orderNumberFromState = location.state?.orderNumber || '';

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login?redirect=/orders', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (justPlaced && orderNumberFromState) {
      notify({
        title: 'Order Placed!',
        message: `Your order ${orderNumberFromState} has been confirmed.`,
      });
    }
  }, [justPlaced, orderNumberFromState, notify]);

  const sortedOrders = useMemo(
    () =>
      [...(Array.isArray(orders) ? orders : [])].sort(
        (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime(),
      ),
    [orders],
  );

  if (loading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f7f7fa] pb-10">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[--color-primary]" />
            <h1 className="text-xl font-extrabold text-[--color-text-main]">My Orders</h1>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-[--color-primary] hover:text-[--color-primary]"
          >
            Continue shopping
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4">
        {justPlaced ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Order placed successfully
            {orderNumberFromState ? ` • ${orderNumberFromState}` : ''}.
          </div>
        ) : null}

        {sortedOrders.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-[--color-text-main]">No orders yet</p>
            <p className="mt-1 text-sm text-gray-500">Your placed orders will appear here.</p>
            <Link
              to="/products"
              className="mt-4 inline-flex rounded-full bg-[--color-primary] px-4 py-2 text-sm font-semibold text-white hover:bg-[--color-primary-dark]"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          sortedOrders.map((order) => {
            const meta = statusMeta(order);
            const Icon = meta.Icon;
            const items = Array.isArray(order?.items) ? order.items : [];
            const currency = order?.totals?.currency || 'INR';
            const total = Number(order?.totals?.total ?? 0);
            const createdOn = formatDate(order?.createdAt);
            const shipping = order?.shipping || {};
            const trackingNumber = getTrackingNumber(shipping);
            const shipmentStatus = pickFirst(
              shipping.shiprocketStatus,
              shipping.shipmentStatus,
              shipping.shipment_status,
            );

            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-gray-500">
                      Order #{order.number || order.id}
                    </p>
                    {createdOn ? (
                      <p className="mt-1 text-xs text-gray-500">Placed on {createdOn}</p>
                    ) : null}
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.tone}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                </div>

                <div className="space-y-3 py-4 border-b border-gray-100">
                  {items.map((item, index) => (
                    <div key={`${order.id}-${index}`} className="flex items-center gap-3 text-sm">
                      <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                        {item?.image ? (
                          <img src={item.image} alt={item?.name || 'Item'} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-gray-400 text-xs font-semibold">
                            {(item?.name || 'I').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {item?.name || 'Item'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Qty x{item?.quantity || 1}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          {formatMoney(
                            Number(item?.price || 0) * Number(item?.quantity || 1),
                            item?.currency || currency,
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <div className="text-sm text-gray-600">
                    <p className="font-medium text-gray-900">{shipping?.fullName || 'Shipping details'}</p>
                    <p className="max-w-[440px] truncate">{shipping?.address || ''}</p>
                    {trackingNumber || shipmentStatus ? (
                      <p className="mt-1 text-xs font-semibold text-blue-700">
                        {shipmentStatus || 'Live tracking available'}
                        {trackingNumber ? ` | AWB ${trackingNumber}` : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">Tracking appears after dispatch.</p>
                    )}
                  </div>
                  <p className="text-lg font-extrabold text-[--color-text-main]">
                    {formatMoney(total, currency)}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
