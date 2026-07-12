import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCreateDiscount,
  adminDeleteDiscount,
  adminFetchDiscounts,
  adminUpdateDiscount,
  formatMoney,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { useAdminToast } from '../../components/admin/AdminToaster';
import { BadgePercent, Plus, Save, Trash2, Edit3, RotateCcw } from 'lucide-react';

const EMPTY_FORM = {
  id: '',
  code: '',
  name: '',
  description: '',
  type: 'FLAT',
  value: '',
  minSubtotal: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

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

export default function AdminDiscounts() {
  const { token } = useAdminAuth();
  const toast = useAdminToast();

  const [discounts, setDiscounts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadDiscounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const list = await adminFetchDiscounts(token);
      setDiscounts(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.message || 'Unable to load discounts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDiscounts();
  }, [loadDiscounts]);

  const isEditing = Boolean(form.id);

  const sortedDiscounts = useMemo(
    () =>
      [...discounts].sort(
        (a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime(),
      ),
    [discounts],
  );

  const resetForm = () => setForm(EMPTY_FORM);

  const setField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toPayload = () => ({
    code: String(form.code || '').trim(),
    name: String(form.name || '').trim() || null,
    description: String(form.description || '').trim() || null,
    type: form.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FLAT',
    value: Number(form.value),
    minSubtotal:
      form.minSubtotal === '' || form.minSubtotal === null
        ? null
        : Number(form.minSubtotal),
    maxDiscount:
      form.type === 'PERCENTAGE' && form.maxDiscount !== '' && form.maxDiscount !== null
        ? Number(form.maxDiscount)
        : null,
    startsAt: toDateOrNull(form.startsAt),
    endsAt: toDateOrNull(form.endsAt),
    isActive: Boolean(form.isActive),
  });

  const validateForm = () => {
    if (!String(form.code || '').trim()) return 'Discount code is required.';
    if (!Number.isFinite(Number(form.value)) || Number(form.value) <= 0) {
      return 'Discount value must be greater than zero.';
    }
    if (form.type === 'PERCENTAGE' && Number(form.value) > 100) {
      return 'Percentage cannot exceed 100.';
    }
    if (form.minSubtotal !== '' && Number(form.minSubtotal) < 0) {
      return 'Minimum subtotal cannot be negative.';
    }
    if (form.maxDiscount !== '' && Number(form.maxDiscount) <= 0) {
      return 'Max discount must be greater than zero.';
    }
    if (form.startsAt && form.endsAt && new Date(form.startsAt) > new Date(form.endsAt)) {
      return 'End date must be after start date.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token || submitting) return;

    const validationError = validateForm();
    if (validationError) {
      toast.error('Invalid Input', validationError);
      return;
    }

    const payload = toPayload();
    setSubmitting(true);
    try {
      if (isEditing) {
        await adminUpdateDiscount(token, form.id, payload);
        toast.success('Discount Updated', 'Discount changes saved.');
      } else {
        await adminCreateDiscount(token, payload);
        toast.success('Discount Created', 'New discount is ready.');
      }
      resetForm();
      await loadDiscounts();
    } catch (err) {
      toast.error('Save Failed', err?.message || 'Unable to save discount.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (discount) => {
    if (!discount?.id) return;
    setForm({
      id: discount.id,
      code: discount.code || '',
      name: discount.name || '',
      description: discount.description || '',
      type: discount.type || 'FLAT',
      value: String(discount.value ?? ''),
      minSubtotal: discount.minSubtotal == null ? '' : String(discount.minSubtotal),
      maxDiscount: discount.maxDiscount == null ? '' : String(discount.maxDiscount),
      startsAt: toDateInputValue(discount.startsAt),
      endsAt: toDateInputValue(discount.endsAt),
      isActive: Boolean(discount.isActive),
    });
  };

  const handleDelete = async (discount) => {
    if (!token || !discount?.id || busyId) return;
    const confirmed = window.confirm(`Delete discount code ${discount.code}?`);
    if (!confirmed) return;

    setBusyId(discount.id);
    try {
      await adminDeleteDiscount(token, discount.id);
      toast.success('Discount Deleted', `${discount.code} was removed.`);
      if (form.id === discount.id) {
        resetForm();
      }
      await loadDiscounts();
    } catch (err) {
      toast.error('Delete Failed', err?.message || 'Unable to delete discount.');
    } finally {
      setBusyId('');
    }
  };

  const handleToggleActive = async (discount) => {
    if (!token || !discount?.id || busyId) return;
    setBusyId(discount.id);
    try {
      await adminUpdateDiscount(token, discount.id, {
        isActive: !discount.isActive,
      });
      toast.success(
        'Status Updated',
        `${discount.code} is now ${discount.isActive ? 'inactive' : 'active'}.`,
      );
      await loadDiscounts();
    } catch (err) {
      toast.error('Update Failed', err?.message || 'Unable to update status.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Promotions</p>
          <h2 className="text-2xl font-bold text-white">Discount Management</h2>
        </div>
        <button
          type="button"
          onClick={loadDiscounts}
          disabled={loading}
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr,1.8fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-5 shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {isEditing ? 'Edit Discount' : 'Create Discount'}
            </p>
            {isEditing ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            ) : null}
          </div>

          <div className="grid gap-3">
            <input
              value={form.code}
              onChange={(event) => setField('code', event.target.value.toUpperCase())}
              placeholder="Code (e.g. SAVE200)"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              placeholder="Label (optional)"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
            <textarea
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
              rows={2}
              placeholder="Description (optional)"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.type}
              onChange={(event) => setField('type', event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="FLAT">Flat</option>
              <option value="PERCENTAGE">Percentage</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.value}
              onChange={(event) => setField('value', event.target.value)}
              placeholder={form.type === 'PERCENTAGE' ? 'Value (%)' : 'Value (INR)'}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minSubtotal}
              onChange={(event) => setField('minSubtotal', event.target.value)}
              placeholder="Min subtotal (optional)"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.maxDiscount}
              onChange={(event) => setField('maxDiscount', event.target.value)}
              placeholder="Max discount (optional)"
              disabled={form.type !== 'PERCENTAGE'}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => setField('startsAt', event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => setField('endsAt', event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setField('isActive', event.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
            />
            Active
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {isEditing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Discount'}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] shadow-xl overflow-hidden">
          <div className="border-b border-slate-800/60 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">All Discount Codes</p>
          </div>
          <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Loading discounts...</div>
            ) : sortedDiscounts.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No discounts created yet.</div>
            ) : (
              sortedDiscounts.map((discount) => (
                <div key={discount.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-bold text-slate-200">
                          <BadgePercent className="h-3.5 w-3.5" />
                          {discount.code}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            discount.isActive
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {discount.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-100">
                        {discount.type === 'PERCENTAGE'
                          ? `${discount.value}% off`
                          : `${formatMoney(discount.value, 'INR')} off`}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Min subtotal:{' '}
                        {discount.minSubtotal == null
                          ? 'None'
                          : formatMoney(discount.minSubtotal, 'INR')}
                        {discount.type === 'PERCENTAGE' && discount.maxDiscount != null
                          ? ` | Max: ${formatMoney(discount.maxDiscount, 'INR')}`
                          : ''}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Start: {formatDateTime(discount.startsAt)} | End: {formatDateTime(discount.endsAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(discount)}
                        disabled={busyId === discount.id}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                      >
                        {discount.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(discount)}
                        disabled={busyId === discount.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(discount)}
                        disabled={busyId === discount.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
