import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LoaderCircle, Package, Truck } from 'lucide-react';
import { fetchShipmentTracking } from '../lib/api';

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusTone = (status) => {
  const token = String(status || '').trim().toUpperCase();
  if (token.includes('DELIVER')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (token.includes('TRANSIT') || token.includes('SHIP')) {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

export default function TrackShipmentPage() {
  const { awb } = useParams();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadTracking = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await fetchShipmentTracking(awb);
        if (!active) return;
        setTracking(payload);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to fetch tracking right now.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (awb) {
      loadTracking();
    } else {
      setLoading(false);
      setError('Tracking number is missing.');
    }

    return () => {
      active = false;
    };
  }, [awb]);

  const summary = tracking?.summary || {};
  const activities = Array.isArray(tracking?.activities) ? tracking.activities : [];

  return (
    <div className="min-h-screen bg-[#f7f7fa] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to="/orders"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-black"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Orders
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-gray-900">Shipment Tracking</h1>
            <p className="mt-1 text-sm text-gray-500">AWB: {awb || '-'}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading shipment status...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!loading && tracking ? (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={`rounded-2xl border px-4 py-4 ${statusTone(summary.status)}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Status</p>
                  <p className="mt-2 text-xl font-bold">{summary.status || 'Tracking received'}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Courier
                  </p>
                  <p className="mt-2 text-xl font-bold text-gray-900">
                    {summary.courierName || 'Shiprocket Courier'}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Estimated Delivery
                  </p>
                  <p className="mt-2 text-base font-semibold text-gray-900">
                    {summary.estimatedDeliveryDate || 'Not provided'}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Delivered At
                  </p>
                  <p className="mt-2 text-base font-semibold text-gray-900">
                    {summary.deliveredAt || 'Not delivered yet'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Truck className="h-5 w-5 text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">Tracking Timeline</h2>
              </div>

              {activities.length ? (
                <div className="space-y-4">
                  {activities.map((activity, index) => (
                    <div
                      key={`${activity.date || 'scan'}-${index}`}
                      className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
                    >
                      <div className="mt-0.5">
                        {index === 0 ? (
                          <Truck className="h-5 w-5 text-blue-600" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">
                          {activity.status || 'Shipment updated'}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {activity.location || 'Location unavailable'}
                        </p>
                        {activity.details ? (
                          <p className="mt-2 text-sm text-gray-500">{activity.details}</p>
                        ) : null}
                      </div>
                      <p className="text-xs font-medium text-gray-500">
                        {formatDateTime(activity.date)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                  Tracking has started, but Shiprocket has not returned any scan events yet.
                </div>
              )}
            </section>
          </>
        ) : null}

        {!loading && !tracking && !error ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 font-semibold text-gray-900">Tracking not available</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
