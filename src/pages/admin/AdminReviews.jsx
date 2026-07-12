import React, { useCallback, useEffect, useState } from 'react';
import {
  adminFetchReviews,
  deleteReview as adminDeleteReview,
  updateReview as adminUpdateReview,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';

const formatDate = (value) => {
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

const badgeTone = (status) => {
  const token = String(status || '').toUpperCase();
  if (token === 'PUBLISHED') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (token === 'REJECTED') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  if (token === 'PENDING') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-slate-700/40 text-slate-200 border-slate-600';
};

const AdminReviews = () => {
  const { token } = useAdminAuth();
  const [reviews, setReviews] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const loadReviews = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError('Authentication required. Please log in again.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await adminFetchReviews(token, {
        status,
        search: search || undefined,
      });
      setReviews(Array.isArray(payload?.items) ? payload.items : []);
      setMeta(payload?.meta || null);
    } catch (err) {
      setError(err?.message || 'Unable to load reviews.');
    } finally {
      setLoading(false);
    }
  }, [search, status, token]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const changeStatus = async (reviewId, nextStatus) => {
    if (!token || !reviewId) return;
    setUpdatingId(reviewId);
    setError('');
    try {
      const updated = await adminUpdateReview(token, reviewId, { status: nextStatus });
      setReviews((prev) =>
        prev.map((item) =>
          item.id === reviewId ? { ...item, ...updated } : item,
        ),
      );
    } catch (err) {
      setError(err?.message || 'Unable to update review.');
    } finally {
      setUpdatingId('');
    }
  };

  const removeReview = async (reviewId) => {
    if (!token || !reviewId) return;
    const confirmed = window.confirm('Delete this review permanently?');
    if (!confirmed) return;

    setUpdatingId(reviewId);
    setError('');
    try {
      await adminDeleteReview(token, reviewId);
      setReviews((prev) => prev.filter((item) => item.id !== reviewId));
    } catch (err) {
      setError(err?.message || 'Unable to delete review.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Reviews</p>
          <h2 className="text-2xl font-bold text-white">Review Moderation</h2>
        </div>
        <button
          type="button"
          onClick={loadReviews}
          disabled={loading}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total</p>
          <p className="mt-2 text-2xl font-bold text-white">{meta?.count ?? reviews.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Published</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{meta?.publishedCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Pending</p>
          <p className="mt-2 text-2xl font-bold text-amber-300">{meta?.pendingCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Rejected</p>
          <p className="mt-2 text-2xl font-bold text-rose-300">{meta?.rejectedCount ?? 0}</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by title, comment, user, email"
          className="min-w-[260px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200"
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PUBLISHED">Published</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
        >
          Search
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-slate-300 uppercase tracking-[0.2em] text-xs">
            <tr>
              <th className="px-6 py-4">Review</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="px-6 py-10 text-center text-slate-400">
                  Loading reviews...
                </td>
              </tr>
            ) : reviews.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-10 text-center text-slate-400">
                  No reviews found.
                </td>
              </tr>
            ) : (
              reviews.map((review) => (
                <tr key={review.id} className="border-t border-slate-800 align-top">
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-100">{review.title || 'No title'}</p>
                      <p className="text-xs text-slate-300">
                        Rating: {review.rating}/5 • {formatDate(review.createdAt)}
                      </p>
                      {review.comment ? (
                        <p className="max-w-xl text-xs text-slate-300 whitespace-pre-wrap">{review.comment}</p>
                      ) : null}
                      {Array.isArray(review.media) && review.media.length ? (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {review.media.map((media) => (
                            <a
                              key={media.id || media.url}
                              href={media.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block h-16 w-16 overflow-hidden rounded border border-slate-700 bg-slate-950"
                            >
                              <img
                                src={media.url}
                                alt="Review upload"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-200">{review.user?.name || 'Customer'}</p>
                    <p className="text-xs text-slate-400">{review.user?.email || '-'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-200">{review.product?.title || '-'}</p>
                    <p className="text-xs text-slate-400">{review.product?.handle || '-'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeTone(review.status)}`}
                    >
                      {review.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => changeStatus(review.id, 'PUBLISHED')}
                        disabled={updatingId === review.id}
                        className="rounded border border-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => changeStatus(review.id, 'REJECTED')}
                        disabled={updatingId === review.id}
                        className="rounded border border-amber-500/40 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => removeReview(review.id)}
                        disabled={updatingId === review.id}
                        className="rounded border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminReviews;
