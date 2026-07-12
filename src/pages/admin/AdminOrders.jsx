import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCreateShiprocketOrder,
  adminCreateShiprocketShipment,
  adminFetchOrders,
  adminRefreshShiprocketTracking,
  adminUpdateOrder,
  formatMoney,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { useAdminToast } from '../../components/admin/AdminToaster';
import { motion } from 'framer-motion';
import {
  Search, Filter, ChevronDown, CheckCircle,
  Clock, XCircle, ShoppingBag, Package
} from 'lucide-react';

const ORDER_STEPS = ['PENDING', 'PAID', 'FULFILLED'];
const Motion = motion;

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusBadge = (status) => {
  const token = String(status || '').toUpperCase();
  if (token === 'FULFILLED') return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold';
  if (token === 'PAID') return 'bg-blue-500/10 border-blue-500/20 text-blue-400 font-bold';
  if (token === 'PENDING') return 'bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold';
  if (token === 'CANCELLED') return 'bg-rose-500/10 border-rose-500/20 text-rose-400 font-bold';
  return 'bg-slate-800/50 border-slate-700/50 text-slate-300 font-bold';
};

const trackingSteps = (order) => {
  const statusToken = String(order?.status || '').toUpperCase();
  const current = ORDER_STEPS.indexOf(statusToken);
  const placedAt = formatDateTime(order?.createdAt);
  const updatedAt = formatDateTime(order?.updatedAt);

  if (statusToken === 'CANCELLED') {
    return [
      {
        key: 'PENDING',
        title: 'Order Placed',
        done: true,
        current: false,
        date: placedAt,
      },
      {
        key: 'CANCELLED',
        title: 'Cancelled',
        done: true,
        current: true,
        date: updatedAt,
      },
    ];
  }

  return [
    {
      key: 'PENDING',
      title: 'Order Placed',
      done: true,
      current: current <= 0,
      date: placedAt,
    },
    {
      key: 'PAID',
      title: 'Payment Confirmed',
      done: current >= 1,
      current: current === 1,
      date: current >= 1 ? updatedAt : '-',
    },
    {
      key: 'FULFILLED',
      title: 'Delivered',
      done: current >= 2,
      current: current === 2,
      date: current >= 2 ? updatedAt : '-',
    },
  ];
};

const AdminOrders = () => {
  const { token } = useAdminAuth();
  const toast = useAdminToast();
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [savingTrackingOrderId, setSavingTrackingOrderId] = useState('');
  const [shiprocketActionOrderId, setShiprocketActionOrderId] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState('');
  const [trackingDrafts, setTrackingDrafts] = useState({});

  const loadOrders = useCallback(async () => {
    if (!token) {
      setError('Authentication required. Please log in again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await adminFetchOrders(token, {
        page: meta.page,
        limit: meta.limit,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: query || undefined,
      });
      const data = payload?.data ?? {};
      setOrders(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || null);
      setMeta((prev) => ({
        ...prev,
        total: Number(payload?.meta?.total ?? 0),
        page: Number(payload?.meta?.page ?? prev.page),
        limit: Number(payload?.meta?.limit ?? prev.limit),
      }));
    } catch (err) {
      const errorMessage = err?.message || err?.payload?.error?.message || 'Unable to load orders.';
      if (err?.status === 401 || err?.status === 403) {
        toast.error('Session Expired', 'Please log in again.');
      } else {
        toast.error('Load Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, query, statusFilter, token, toast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil((meta.total || 0) / (meta.limit || 1));
    return Math.max(1, pages || 1);
  }, [meta.limit, meta.total]);

  const handleSearch = (event) => {
    event.preventDefault();
    setMeta((prev) => ({ ...prev, page: 1 }));
    setQuery(queryInput.trim());
  };

  const handleStatusFilter = (value) => {
    setStatusFilter(value);
    setMeta((prev) => ({ ...prev, page: 1 }));
  };

  const handleStatusChange = async (order, nextStatus) => {
    if (!token || !order?.id || !nextStatus || nextStatus === order.status) return;
    setUpdatingOrderId(order.id);
    try {
      const updated = await adminUpdateOrder(token, order.id, { status: nextStatus });
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? {
              ...item,
              ...updated,
              customer: item.customer,
            }
            : item,
        ),
      );
      if (statusFilter !== 'ALL' && nextStatus !== statusFilter) {
        setOrders((prev) => prev.filter((item) => item.id !== order.id));
      }
      toast.success('Status Updated', `Order #${order.number || order.id} is now ${nextStatus}`);
      await loadOrders();
    } catch (err) {
      toast.error('Update Failed', err?.message || 'Unable to update order.');
    } finally {
      setUpdatingOrderId('');
    }
  };

  const getTrackingDraft = (order) => {
    const existing = trackingDrafts[order?.id];
    if (existing) return existing;
    const shipping = order?.shipping || {};
    return {
      trackingNumber: String(
        shipping?.trackingNumber || shipping?.awbCode || shipping?.awb || '',
      ).trim(),
      courierName: String(shipping?.courierName || '').trim(),
      trackingUrl: String(shipping?.trackingUrl || '').trim(),
      shiprocketOrderId: String(shipping?.shiprocketOrderId || '').trim(),
      estimatedDelivery: String(shipping?.estimatedDelivery || '').trim(),
    };
  };

  const updateTrackingField = (order, field, value) => {
    if (!order?.id) return;
    const baseline = getTrackingDraft(order);
    setTrackingDrafts((prev) => ({
      ...prev,
      [order.id]: {
        ...baseline,
        [field]: value,
      },
    }));
  };

  const saveTracking = async (orderId) => {
    if (!token || !orderId) return;
    const draft = trackingDrafts[orderId];
    if (!draft) return;
    setSavingTrackingOrderId(orderId);
    try {
      await adminUpdateOrder(token, orderId, {
        shipping: {
          trackingNumber: draft.trackingNumber,
          courierName: draft.courierName,
          shiprocketOrderId: draft.shiprocketOrderId,
          estimatedDelivery: draft.estimatedDelivery,
          trackingUrl: draft.trackingUrl,
        },
      });
      toast.success('Tracking Saved', 'Order tracking information updated.');
      await loadOrders();
    } catch (err) {
      toast.error('Save Failed', err?.message || 'Unable to save tracking info.');
    } finally {
      setSavingTrackingOrderId('');
    }
  };

  const createShiprocketOrder = async (order) => {
    if (!token || !order?.id) return;
    setShiprocketActionOrderId(order.id);
    try {
      const payload = await adminCreateShiprocketOrder(token, order.id);
      const wasExisting = Boolean(payload?.alreadyExists);
      toast.success(
        wasExisting ? 'Shiprocket Order Exists' : 'Shiprocket Order Created',
        wasExisting
          ? 'This order already has a Shiprocket order ID.'
          : 'Shiprocket order created. You can create shipment after it is synced.',
      );
      await loadOrders();
    } catch (err) {
      toast.error('Shiprocket Order Failed', err?.message || 'Unable to create Shiprocket order.');
      await loadOrders();
    } finally {
      setShiprocketActionOrderId('');
    }
  };

  const createShipment = async (order) => {
    if (!token || !order?.id) return;
    setShiprocketActionOrderId(order.id);
    try {
      const payload = await adminCreateShiprocketShipment(token, order.id);
      const wasExisting = Boolean(payload?.alreadyExists);
      toast.success(
        wasExisting ? 'Shipment Already Exists' : 'Shipment Created',
        wasExisting
          ? 'This order already has Shiprocket shipment details.'
          : 'Shiprocket shipment created and saved on the order.',
      );
      await loadOrders();
    } catch (err) {
      toast.error('Shipment Failed', err?.message || 'Unable to create Shiprocket shipment.');
    } finally {
      setShiprocketActionOrderId('');
    }
  };

  const refreshTracking = async (order) => {
    if (!token || !order?.id) return;
    setShiprocketActionOrderId(order.id);
    try {
      await adminRefreshShiprocketTracking(token, order.id);
      toast.success('Tracking Refreshed', 'Latest Shiprocket tracking was saved.');
      await loadOrders();
    } catch (err) {
      toast.error('Refresh Failed', err?.message || 'Unable to refresh Shiprocket tracking.');
    } finally {
      setShiprocketActionOrderId('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Orders</p>
          <h2 className="text-2xl font-bold text-white">Order Tracking Dashboard</h2>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          disabled={loading}
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all shadow-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <div className="rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-900 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Filtered Results</p>
          <p className="text-3xl font-black text-white tracking-tight">{meta.total || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-900 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">All Orders</p>
          <p className="text-3xl font-black text-white tracking-tight">{summary?.total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-amber-500/70 mb-1 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Pending</p>
          <p className="text-3xl font-black text-amber-400 tracking-tight">{summary?.pending ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-blue-500/70 mb-1 flex items-center gap-1.5"><ShoppingBag className="w-3 h-3" /> Paid</p>
          <p className="text-3xl font-black text-blue-400 tracking-tight">{summary?.paid ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/70 mb-1 flex items-center gap-1.5"><CheckCircle className="w-3 h-3" /> Fulfilled</p>
          <p className="text-3xl font-black text-emerald-400 tracking-tight">{summary?.fulfilled ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-rose-500/70 mb-1 flex items-center gap-1.5"><XCircle className="w-3 h-3" /> Cancelled</p>
          <p className="text-3xl font-black text-rose-400 tracking-tight">{summary?.cancelled ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-violet-400/80 mb-1 flex items-center gap-1.5"><Package className="w-3 h-3" /> Requests</p>
          <p className="text-3xl font-black text-violet-300 tracking-tight">{summary?.requestedOrderRequests ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#0d1323] p-4 rounded-2xl border border-slate-800/60 shadow-lg">
        <form onSubmit={handleSearch} className="flex flex-1 w-full gap-3 relative">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search by order #, name, or email..."
              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 pl-10 pr-4 py-2.5 text-sm font-medium text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 text-sm font-bold transition-colors shadow-lg shadow-blue-500/20"
          >
            Search
          </button>
        </form>

        <div className="relative flex-shrink-0 w-full md:w-auto">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(event) => handleStatusFilter(event.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-700/50 bg-slate-900/50 pl-10 pr-10 py-2.5 text-sm font-bold text-slate-300 focus:border-blue-500 transition-all outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {error ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-rose-400" />
          {error}
        </motion.div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0d1323] shadow-xl">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-widest text-[10px] font-bold border-b border-slate-800/60">
            <tr>
              <th className="px-6 py-5">Order details</th>
              <th className="px-6 py-5">Customer info</th>
              <th className="px-6 py-5">Date Placed</th>
              <th className="px-6 py-5">Value</th>
              <th className="px-6 py-5">Order Status</th>
              <th className="px-6 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-blue-500 animate-spin"></div>
                    <span className="text-slate-500 font-medium text-xs uppercase tracking-widest">Loading order log...</span>
                  </div>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-16 text-center text-slate-500">
                  <ShoppingBag className="w-12 h-12 opacity-20 mx-auto mb-4" />
                  <p className="font-medium">No results found for current filters.</p>
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const shipping = order?.shipping || {};
                const customerName = order?.customer?.name || shipping?.fullName || 'Guest';
                const customerEmail = order?.customer?.email || shipping?.email || 'No email provided';
                const currency = order?.totals?.currency || 'INR';
                const total = Number(order?.totals?.total ?? 0);
                const steps = trackingSteps(order);
                const isExpanded = expandedOrderId === order.id;
                const trackingDraft = getTrackingDraft(order);
                const shiprocketStatus = String(
                  shipping?.shiprocketStatus || shipping?.shipmentStatus || shipping?.shipment_status || '',
                ).trim();
                const shiprocketOrderId = String(
                  shipping?.shiprocketOrderId || shipping?.shiprocket_order_id || shipping?.order_id || '',
                ).trim();
                const shiprocketShipmentId = String(
                  shipping?.shiprocketShipmentId || shipping?.shipmentId || shipping?.shipment_id || '',
                ).trim();
                const shiprocketProvisioningError = String(
                  shipping?.shiprocketProvisioningError || '',
                ).trim();
                const awbCode = String(
                  shipping?.awbCode || shipping?.awb || shipping?.trackingNumber || '',
                ).trim();
                const requests = Array.isArray(order?.requests) ? order.requests : [];
                const activeRequests = requests.filter((req) => String(req?.status || '').toUpperCase() === 'REQUESTED');
                const latestRequest = requests[0] || null;
                const isShiprocketWorking = shiprocketActionOrderId === order.id;
                const canCreateShiprocketShipment =
                  Boolean(shiprocketOrderId) && !shiprocketShipmentId && !awbCode;

                return (
                  <React.Fragment key={order.id}>
                    <tr className={`transition-colors hover:bg-slate-800/20 ${isExpanded ? 'bg-slate-800/10' : ''}`}>
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-white tracking-tight text-[15px]">
                          {order?.number || order?.id}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5" />
                          {(Array.isArray(order?.items) ? order.items.length : 0)} line item(s)
                        </p>
                        {requests.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(order.id)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-violet-300 hover:bg-violet-500/20"
                          >
                            {activeRequests.length || requests.length} return/exchange request{(activeRequests.length || requests.length) === 1 ? '' : 's'}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-200 font-bold">{customerName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{customerEmail}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs font-medium">
                        {formatDateTime(order?.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-100 bg-slate-800/50 inline-flex px-3 py-1 rounded-lg border border-slate-700/50">
                          {formatMoney(total, currency)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2 relative">
                          <div className="relative">
                            <select
                              value={String(order?.status || 'PENDING').toUpperCase()}
                              onChange={(event) => handleStatusChange(order, event.target.value)}
                              disabled={updatingOrderId === order.id}
                              className={`appearance-none rounded-xl border border-slate-700/50 bg-slate-900 px-4 py-1.5 pr-8 text-[11px] font-bold tracking-wider outline-none cursor-pointer transition-colors hover:border-slate-500 disabled:opacity-50 ${statusBadge(order?.status)}`}
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="PAID">PAID</option>
                              <option value="FULFILLED">FULFILLED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50 pointer-events-none" />
                          </div>
                          {latestRequest ? (
                            <div className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                              {latestRequest.type} {latestRequest.status}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedOrderId((prev) => (prev === order.id ? '' : order.id))
                          }
                          className={`rounded-xl border border-slate-700/50 px-4 py-2 text-xs font-bold transition-all ${isExpanded
                            ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/30'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white bg-slate-900'
                            }`}
                        >
                          {isExpanded ? 'Merge info ▲' : 'Expand info ▼'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-[#0B1121] shadow-inner">
                        <td colSpan="6" className="p-0">
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="px-6 py-6 border-y border-slate-800"
                          >
                            <div className="grid lg:grid-cols-2 gap-8">
                              {/* Tracking Panel */}
                              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-5">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  Tracking Timeline
                                </p>
                                <div className="mt-4 space-y-3">
                                  {steps.map((step) => (
                                    <div key={step.key} className="flex items-center gap-3">
                                      <span
                                        className={`h-2.5 w-2.5 rounded-full ${step.done
                                          ? 'bg-emerald-300'
                                          : step.current
                                            ? 'bg-amber-300'
                                            : 'bg-slate-600'
                                          }`}
                                      />
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-100">
                                          {step.title}
                                        </p>
                                        <p className="text-xs text-slate-400">{step.date}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                  {!shiprocketOrderId ? (
                                    <button
                                      type="button"
                                      onClick={() => createShiprocketOrder(order)}
                                      disabled={isShiprocketWorking}
                                      className="rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/10 disabled:opacity-60"
                                    >
                                      {isShiprocketWorking ? 'Working...' : 'Create Shiprocket Order'}
                                    </button>
                                  ) : null}
                                  {canCreateShiprocketShipment ? (
                                    <button
                                      type="button"
                                      onClick={() => createShipment(order)}
                                      disabled={isShiprocketWorking}
                                      className="rounded-lg border border-blue-500/40 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/10 disabled:opacity-60"
                                    >
                                      {isShiprocketWorking ? 'Working...' : 'Create Shiprocket Shipment'}
                                    </button>
                                  ) : (
                                    <div className="rounded-lg border border-slate-700/60 px-3 py-2 text-xs font-semibold text-slate-500">
                                      {shiprocketShipmentId || awbCode
                                        ? 'Shipment already created'
                                        : shiprocketOrderId
                                          ? 'Shipment unavailable'
                                          : 'Shiprocket order not created'}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => refreshTracking(order)}
                                    disabled={isShiprocketWorking || (!shiprocketOrderId && !awbCode)}
                                    className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-60"
                                  >
                                    {isShiprocketWorking ? 'Working...' : 'Refresh Shiprocket Tracking'}
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  Shipping Details
                                </p>
                                <div className="mt-4 space-y-1 text-sm text-slate-200">
                                  <p>{shipping?.fullName || '-'}</p>
                                  <p className="text-slate-300">{shipping?.email || '-'}</p>
                                  <p className="text-slate-300">{shipping?.phone || '-'}</p>
                                  <p className="text-slate-300">
                                    {[shipping?.address, shipping?.city, shipping?.postalCode]
                                      .filter(Boolean)
                                      .join(', ') || '-'}
                                  </p>
                                  <p className="pt-2 text-xs text-slate-500">
                                    Last update: {formatDateTime(order?.updatedAt)}
                                  </p>
                                  <div className="pt-3 text-xs text-slate-400 space-y-1">
                                    <p>Shiprocket status: {shiprocketStatus || '-'}</p>
                                    <p>Shiprocket order ID: {shiprocketOrderId || '-'}</p>
                                    <p>Shipment ID: {shiprocketShipmentId || '-'}</p>
                                    <p>AWB: {awbCode || '-'}</p>
                                    {shiprocketProvisioningError ? (
                                      <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
                                        <p className="font-semibold text-rose-100">Shiprocket failed</p>
                                        <p className="mt-1 break-words">{shiprocketProvisioningError}</p>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                  Tracking Configuration
                                </p>
                                <button
                                  type="button"
                                  onClick={() => saveTracking(order.id)}
                                  disabled={savingTrackingOrderId === order.id}
                                  className="rounded border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                                >
                                  {savingTrackingOrderId === order.id
                                    ? 'Saving...'
                                    : 'Save Tracking'}
                                </button>
                              </div>

                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <input
                                  type="text"
                                  value={trackingDraft.trackingNumber}
                                  onChange={(event) =>
                                    updateTrackingField(order, 'trackingNumber', event.target.value)
                                  }
                                  placeholder="Tracking / AWB number"
                                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={trackingDraft.courierName}
                                  onChange={(event) =>
                                    updateTrackingField(order, 'courierName', event.target.value)
                                  }
                                  placeholder="Courier name"
                                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={trackingDraft.shiprocketOrderId}
                                  onChange={(event) =>
                                    updateTrackingField(order, 'shiprocketOrderId', event.target.value)
                                  }
                                  placeholder="Shiprocket order ID (optional)"
                                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={trackingDraft.estimatedDelivery}
                                  onChange={(event) =>
                                    updateTrackingField(order, 'estimatedDelivery', event.target.value)
                                  }
                                  placeholder="Estimated delivery (e.g. 22 Feb 2026)"
                                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={trackingDraft.trackingUrl}
                                  onChange={(event) =>
                                    updateTrackingField(order, 'trackingUrl', event.target.value)
                                  }
                                  placeholder="Tracking URL (optional)"
                                  className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                Items
                              </p>
                              <div className="mt-3 space-y-2">
                                {(Array.isArray(order?.items) ? order.items : []).map((item, idx) => (
                                  <div
                                    key={`${order.id}-${idx}`}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <p className="min-w-0 flex-1 truncate text-slate-200">
                                      {item?.name || 'Item'} x{item?.quantity || 1}
                                    </p>
                                    <p className="font-semibold text-slate-100">
                                      {formatMoney(
                                        Number(item?.price || 0) * Number(item?.quantity || 1),
                                        item?.currency || currency,
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {Array.isArray(order?.requests) && order.requests.length > 0 ? (
                              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-bold mb-3">
                                  Exchange / Return Requests ({order.requests.length})
                                </p>
                                <div className="space-y-4">
                                  {order.requests.map((req) => {
                                    const reqDate = req.createdAt
                                      ? new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                      : '-';
                                    const pref = req.exchangePreference || null;
                                    const reqItems = Array.isArray(req.items) ? req.items : [];
                                    const requestSync =
                                      order?.shipping?.shiprocketRequestSync?.requestId === req.id
                                        ? order.shipping.shiprocketRequestSync
                                        : null;
                                    const syncStatus = String(requestSync?.status || '').toUpperCase();
                                    const syncColor =
                                      syncStatus === 'SYNCED'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                        : syncStatus === 'FAILED'
                                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
                                    const statusColor = req.status === 'APPROVED' ? 'text-emerald-400' : req.status === 'REJECTED' ? 'text-rose-400' : req.status === 'COMPLETED' ? 'text-blue-400' : 'text-amber-400';
                                    return (
                                      <div key={req.id} className="rounded-lg border border-slate-700/60 bg-slate-900 p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${req.type === 'EXCHANGE' ? 'border-violet-500/40 text-violet-300 bg-violet-500/10' : req.type === 'RETURN' ? 'border-blue-500/40 text-blue-300 bg-blue-500/10' : 'border-rose-500/40 text-rose-300 bg-rose-500/10'}`}>
                                              {req.type}
                                            </span>
                                            <span className={`text-xs font-bold ${statusColor}`}>{req.status}</span>
                                          </div>
                                          <span className="text-xs text-slate-500">{reqDate}</span>
                                        </div>
                                        {req.reason ? (
                                          <p className="text-xs text-slate-300"><span className="text-slate-500">Reason:</span> {req.reason}</p>
                                        ) : null}
                                        {reqItems.length > 0 ? (
                                          <p className="text-xs text-slate-400">
                                            <span className="text-slate-500">Returning:</span>{' '}
                                            {reqItems.map((it) => it?.name || it?.id || 'Item').join(', ')}
                                          </p>
                                        ) : null}
                                        {requestSync ? (
                                          <div className={`rounded-lg border px-3 py-2 text-xs ${syncColor}`}>
                                            <p className="font-extrabold uppercase tracking-wider">
                                              Shiprocket {syncStatus || 'PENDING'}
                                            </p>
                                            {requestSync.shiprocketOrderId || requestSync.awbCode ? (
                                              <p className="mt-1 text-slate-300">
                                                Order: {requestSync.shiprocketOrderId || '-'} | AWB:{' '}
                                                {requestSync.awbCode || '-'}
                                              </p>
                                            ) : null}
                                            {requestSync.message ? (
                                              <p className="mt-1 text-slate-300">{requestSync.message}</p>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {pref && req.type === 'EXCHANGE' ? (
                                          <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2 space-y-1">
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-violet-400 mb-1">Customer Wants</p>
                                            {pref.productName ? (
                                              <p className="text-xs text-slate-200"><span className="text-slate-500">Product:</span> {pref.productName}</p>
                                            ) : null}
                                            {pref.size ? (
                                              <p className="text-xs text-slate-200"><span className="text-slate-500">Size:</span> {pref.size}</p>
                                            ) : null}
                                            {pref.color ? (
                                              <p className="text-xs text-slate-200"><span className="text-slate-500">Color:</span> {pref.color}</p>
                                            ) : null}
                                            {pref.notes ? (
                                              <p className="text-xs text-slate-200"><span className="text-slate-500">Notes:</span> {pref.notes}</p>
                                            ) : null}
                                            {!pref.productName && !pref.size && !pref.color && !pref.notes ? (
                                              <p className="text-xs text-slate-500 italic">No specific preference provided</p>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </motion.div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setMeta((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
          disabled={meta.page <= 1 || loading}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-2 text-xs text-slate-400">
          Page {meta.page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() =>
            setMeta((prev) => ({
              ...prev,
              page: Math.min(prev.page + 1, totalPages),
            }))
          }
          disabled={meta.page >= totalPages || loading}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </motion.div>
  );
};

export default AdminOrders;
