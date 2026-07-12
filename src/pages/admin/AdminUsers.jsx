import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetchUsers, adminUpdateUserRole } from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { motion } from 'framer-motion';
import { Users as UsersIcon, Search, Shield, User, Store, ChevronDown } from 'lucide-react';
import { useAdminToast } from '../../components/admin/AdminToaster';

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

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const AdminUsers = () => {
  const { token, admin } = useAdminAuth();
  const toast = useAdminToast();
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 });
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState('');

  const loadUsers = useCallback(async () => {
    if (!token) {
      toast.error('Authentication Required', 'Please log in again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await adminFetchUsers(token, {
        page: meta.page,
        limit: meta.limit,
        search: query || undefined,
      });
      setUsers(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []);
      if (payload?.meta) {
        setMeta((prev) => ({
          ...prev,
          total: Number(payload.meta.total ?? 0),
          page: Number(payload.meta.page ?? prev.page),
          limit: Number(payload.meta.limit ?? prev.limit),
        }));
      }
    } catch (err) {
      const errorMessage = err?.message || err?.payload?.error?.message || 'Unable to load users.';
      if (err?.status === 401 || err?.status === 403) {
        toast.error('Session Expired', 'Please log in again.');
      } else {
        toast.error('Load Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [token, meta.page, meta.limit, query, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const summary = useMemo(() => {
    const totals = users.reduce(
      (acc, user) => {
        const role = normalizeToken(user?.role);
        if (role === 'admin') acc.admin += 1;
        if (role === 'customer') acc.customer += 1;
        if (role === 'vendor') acc.vendor += 1;
        return acc;
      },
      { admin: 0, customer: 0, vendor: 0 },
    );
    return { total: meta.total || users.length, ...totals };
  }, [users, meta.total]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil((meta.total || 0) / (meta.limit || 1));
    return Math.max(1, pages || 1);
  }, [meta.limit, meta.total]);

  const handleSearch = (event) => {
    event.preventDefault();
    setMeta((prev) => ({ ...prev, page: 1 }));
    setQuery(queryInput.trim());
  };

  const handleRoleChange = async (userId, nextRole) => {
    if (!token || !userId || !nextRole) return;
    if (userId === admin?.id && nextRole !== 'ADMIN') {
      toast.error('Operation Denied', 'You cannot remove your own admin access while signed in.');
      return;
    }

    setUpdatingUserId(userId);
    try {
      const updated = await adminUpdateUserRole(token, userId, nextRole);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === userId
            ? { ...item, role: updated?.role || nextRole }
            : item,
        ),
      );
      toast.success('Role Updated', `User role successfully changed to ${nextRole}.`);
    } catch (err) {
      toast.error('Update Failed', err?.message || 'Unable to update user role.');
    } finally {
      setUpdatingUserId('');
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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Users</p>
          <h2 className="text-2xl font-bold text-white tracking-tight">Customer Accounts</h2>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          disabled={loading}
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all shadow-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-900 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1 flex items-center gap-1.5"><UsersIcon className="w-3.5 h-3.5" /> Total Users</p>
          <p className="text-3xl font-black text-white tracking-tight">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/70 mb-1 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Admins</p>
          <p className="text-3xl font-black text-emerald-400 tracking-tight">{summary.admin}</p>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-blue-500/70 mb-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Customers</p>
          <p className="text-3xl font-black text-blue-400 tracking-tight">{summary.customer}</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-cyan-500/10 to-[#0d1323] p-5 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-widest text-cyan-500/70 mb-1 flex items-center gap-1.5"><Store className="w-3.5 h-3.5" /> Vendors</p>
          <p className="text-3xl font-black text-cyan-400 tracking-tight">{summary.vendor}</p>
        </div>
      </div>

      <div className="bg-[#0d1323] p-4 rounded-2xl border border-slate-800/60 shadow-lg">
        <form onSubmit={handleSearch} className="flex gap-3 relative max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search by name, email, or role..."
              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 pl-10 pr-4 py-2.5 text-sm font-medium text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 text-sm font-bold transition-colors border border-slate-700/50 shadow-sm"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0d1323] shadow-xl">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-widest text-[10px] font-bold border-b border-slate-800/60">
            <tr>
              <th className="px-6 py-5">Name</th>
              <th className="px-6 py-5">Email Address</th>
              <th className="px-6 py-5">Join Date</th>
              <th className="px-6 py-5 text-right w-48">Access Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-cyan-500 animate-spin"></div>
                    <span className="text-slate-500 font-medium text-xs uppercase tracking-widest">Loading accounts...</span>
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-16 text-center text-slate-500">
                  <User className="w-12 h-12 opacity-20 mx-auto mb-4" />
                  <p className="font-medium">No customer accounts found.</p>
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = user.id === admin?.id;
                const roleValue = String(user.role || 'CUSTOMER').toUpperCase();
                const hasUnsupportedRole = !['CUSTOMER', 'ADMIN'].includes(roleValue);

                let roleColor = 'text-slate-400';
                if (roleValue === 'ADMIN') roleColor = 'text-emerald-400';

                return (
                  <tr key={user.id} className="transition-colors hover:bg-slate-800/20">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center font-bold text-slate-400 text-xs">
                          {(user.name || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-extrabold text-white tracking-tight">{user.name || 'No Name Provided'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-medium">{user.email}</td>
                    <td className="px-6 py-4 text-slate-500 text-[11px] font-medium tracking-wide">{formatDateTime(user.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end gap-1.5 relative">
                        <div className="relative inline-block w-full max-w-[130px]">
                          <select
                            value={roleValue}
                            onChange={(event) =>
                              handleRoleChange(user.id, event.target.value)
                            }
                            disabled={updatingUserId === user.id || isSelf}
                            className={`w-full appearance-none rounded-xl border border-slate-700/50 bg-slate-900 px-3 py-1.5 pl-3 pr-8 text-[11px] font-black tracking-wider outline-none cursor-pointer transition-colors hover:border-slate-500 disabled:opacity-50 ${roleColor}`}
                          >
                            {hasUnsupportedRole ? (
                              <option value={roleValue}>{roleValue}</option>
                            ) : null}
                            <option value="CUSTOMER">CUSTOMER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-50 pointer-events-none" />
                        </div>
                        {isSelf ? (
                          <span className="text-[10px] text-amber-500 font-bold tracking-widest uppercase">Current Device</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between bg-[#0d1323] p-4 rounded-xl border border-slate-800/60 shadow-lg">
        <button
          type="button"
          onClick={() => setMeta((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
          disabled={meta.page <= 1 || loading}
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-30"
        >
          Previous
        </button>
        <span className="px-4 py-1.5 rounded-lg bg-slate-900 border border-slate-800/50 text-xs font-medium text-slate-400 tracking-wide">
          Page <strong className="text-white">{meta.page}</strong> of <strong className="text-white">{totalPages}</strong>
          <span className="opacity-50 mx-2">|</span>
          {meta.total} records
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
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </motion.div>
  );
};

export default AdminUsers;
