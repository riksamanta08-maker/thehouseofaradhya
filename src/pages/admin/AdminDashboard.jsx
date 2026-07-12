import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetchStats, formatMoney } from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { motion } from 'framer-motion';
import {
  Package, Layers, Users, ShoppingBag,
  Clock, CheckCircle, XCircle, IndianRupee,
  TrendingUp, Activity, Plus, Star
} from 'lucide-react';

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
  if (token === 'FULFILLED') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (token === 'PAID') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (token === 'PENDING') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (token === 'CANCELLED') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  return 'bg-slate-700/40 text-slate-200 border-slate-600';
};

const AdminDashboard = () => {
  const { token } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const loadStats = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await adminFetchStats(token);
        setStats(data);
      } catch (err) {
        setError(err?.message || 'Unable to load dashboard stats.');
      } finally {
        setLoading(false);
      }
    };
    loadStats();
    const interval = setInterval(loadStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [token]);

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin"></div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">Loading metrics...</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      >
        {error}
      </motion.div>
    );
  }

  if (!stats) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (!stats) return null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">System Overview</h2>
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Live metrics automatically refresh every 60s
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all shadow-sm"
        >
          Refresh Data
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-rose-400" />
          {error}
        </div>
      ) : null}

      {/* Primary Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div variants={itemVariants}>
          <Link
            to="/admin/products"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 to-[#0B1121] p-6 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all h-full overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Package className="w-16 h-16 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Products Engine</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-white">{stats.products?.total ?? 0}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">{stats.products?.active ?? 0} Live</span>
              <span>•</span>
              <span className="text-slate-500">{stats.products?.draft ?? 0} Draft</span>
            </div>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link
            to="/admin/collections"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 to-[#0B1121] p-6 hover:border-pink-500/30 hover:shadow-[0_0_20px_rgba(236,72,153,0.05)] transition-all h-full overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Layers className="w-16 h-16 text-pink-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Active Collections</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-white">{stats.collections?.total ?? 0}</p>
            </div>
            <div className="mt-4 text-xs font-medium text-pink-400 group-hover:text-pink-300 transition-colors flex items-center gap-1">
              Manage taxonomies <TrendingUp className="w-3 h-3" />
            </div>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link
            to="/admin/users"
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 to-[#0B1121] p-6 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.05)] transition-all h-full overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="w-16 h-16 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Total Users</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-white">{stats.users?.total ?? 0}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{stats.users?.customers ?? 0} Customers</span>
            </div>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="group relative flex flex-col justify-between rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 to-slate-900 p-6 h-full overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <IndianRupee className="w-16 h-16 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-emerald-500/80">Total Revenue</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-emerald-400 truncate">
                {formatMoney(stats.revenue?.total ?? 0, stats.revenue?.currency || 'INR')}
              </p>
            </div>
            <div className="mt-4">
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-full"></div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Orders Performance */}
      <motion.div variants={itemVariants} className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-blue-500/5 blur-[80px] pointer-events-none"></div>

        <div className="flex items-center justify-between mb-6 relative z-10">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-blue-400" />
            Order Performance
          </h3>
          <Link to="/admin/orders" className="text-xs font-bold text-blue-400 hover:text-blue-300">View All Orders &rarr;</Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800/50">
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Total</p>
            <p className="text-2xl font-bold text-white">{stats.orders?.total ?? 0}</p>
          </div>
          <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/10">
            <p className="text-[10px] uppercase font-bold tracking-widest text-amber-500/70 flex items-center gap-1.5 mb-1"><Clock className="w-3 h-3" /> Pending</p>
            <p className="text-2xl font-bold text-amber-400">{stats.orders?.pending ?? 0}</p>
          </div>
          <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/10">
            <p className="text-[10px] uppercase font-bold tracking-widest text-blue-500/70 flex items-center gap-1.5 mb-1"><ShoppingBag className="w-3 h-3" /> Paid</p>
            <p className="text-2xl font-bold text-blue-400">{stats.orders?.paid ?? 0}</p>
          </div>
          <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/10">
            <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/70 flex items-center gap-1.5 mb-1"><CheckCircle className="w-3 h-3" /> Fulfilled</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.orders?.fulfilled ?? 0}</p>
          </div>
          <div className="bg-rose-500/5 rounded-xl p-4 border border-rose-500/10">
            <p className="text-[10px] uppercase font-bold tracking-widest text-rose-500/70 flex items-center gap-1.5 mb-1"><XCircle className="w-3 h-3" /> Cancelled</p>
            <p className="text-2xl font-bold text-rose-400">{stats.orders?.cancelled ?? 0}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent Orders - takes up 2/3 */}
        <motion.div variants={itemVariants} className="lg:col-span-2 rounded-2xl border border-slate-800/60 bg-[#0d1323] overflow-hidden shadow-xl">
          <div className="border-b border-slate-800/60 px-6 py-5 bg-slate-900/30">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Latest Activity</h3>
          </div>
          <div className="p-0">
            {!stats.orders?.recent?.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <ShoppingBag className="w-8 h-8 opacity-20 mb-3" />
                <p className="text-sm">No recent orders found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {stats.orders.recent.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0 mb-3 sm:mb-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <p className="font-bold text-slate-100">{order.number || order.id}</p>
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase border ${statusBadge(order.status)}`}
                        >
                          {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-2">
                        <span className="text-slate-300 font-medium">{order.customer?.name || order.customer?.email || 'Guest'}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                        <span>{formatDateTime(order.createdAt)}</span>
                      </p>
                    </div>
                    <div className="sm:ml-4 sm:text-right flex sm:flex-col items-center sm:items-end justify-between">
                      <p className="text-sm font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                        {formatMoney(order.total, order.currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stats.orders?.recent?.length > 0 && (
              <div className="p-4 border-t border-slate-800/60 bg-slate-900/30 text-center">
                <Link to="/admin/orders" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">
                  View Full History &rarr;
                </Link>
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick Actions - takes up 1/3 */}
        <motion.div variants={itemVariants} className="rounded-2xl border border-slate-800/60 bg-[#0d1323] overflow-hidden shadow-xl flex flex-col">
          <div className="border-b border-slate-800/60 px-6 py-5 bg-slate-900/30">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Quick Actions</h3>
          </div>
          <div className="p-5 flex-1 flex flex-col gap-3">
            <Link to="/admin/products/new" className="group rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900/50 hover:bg-indigo-500/10 p-4 transition-all flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200 group-hover:text-white">Add New Product</p>
                <p className="text-xs text-slate-500">Create a new item in catalog</p>
              </div>
            </Link>

            <Link to="/admin/collections/new" className="group rounded-xl border border-dashed border-slate-700 hover:border-pink-500 bg-slate-900/50 hover:bg-pink-500/10 p-4 transition-all flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center group-hover:bg-pink-500 group-hover:text-white transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200 group-hover:text-white">New Collection</p>
                <p className="text-xs text-slate-500">Organize your products</p>
              </div>
            </Link>

            <div className="mt-auto border-t border-slate-800/60 pt-4 items-center gap-2">
              <Link to="/admin/reviews" className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-medium group">
                Moderate Reviews
                <Star className="w-4 h-4 text-slate-500 group-hover:text-yellow-400 transition-colors" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
};

export default AdminDashboard;
