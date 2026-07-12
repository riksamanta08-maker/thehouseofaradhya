import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminDeleteProduct,
  adminExportProductsCsv,
  adminFetchProducts,
  adminImportProductsCsv,
  formatMoney,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { useAdminToast } from '../../components/admin/AdminToaster';
import { motion } from 'framer-motion';
import {
  Search, PackageOpen, Download, Upload,
  Trash2, Plus, Image as ImageIcon, Edit, Tag
} from 'lucide-react';

const Motion = motion;

const AdminProducts = () => {
  const { token } = useAdminAuth();
  const toast = useAdminToast();
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ done: 0, total: 0 });
  const [importSummary, setImportSummary] = useState(null);
  const [deleteSummary, setDeleteSummary] = useState(null);

  const loadProducts = useCallback(
    async (searchValue = '') => {
      if (!token) {
        toast.error('Authentication Required', 'Please log in again.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const payload = await adminFetchProducts(token, {
          search: searchValue || undefined,
          limit: 100,
        });
        const items = payload?.data ?? payload ?? [];
        setProducts(items);
      } catch (err) {
        const errorMessage =
          err?.message || err?.payload?.error?.message || 'Unable to load products.';
        setError(errorMessage);
        if (err?.status === 401 || err?.status === 403) {
          toast.error('Session Expired', 'Please log in again.');
        } else {
          toast.error('Load Failed', errorMessage);
        }
      } finally {
        setLoading(false);
      }
    },
    [toast, token],
  );

  useEffect(() => {
    if (!token) return;
    loadProducts();
  }, [loadProducts, token]);

  const handleSearch = (event) => {
    event.preventDefault();
    loadProducts(query.trim());
  };

  const handleDelete = async (productId) => {
    if (!productId) return;
    const confirmDelete = window.confirm('Delete this product? This cannot be undone.');
    if (!confirmDelete) return;
    try {
      await adminDeleteProduct(token, productId);
      toast.success('Product Deleted', 'The product has been successfully removed.');
      await loadProducts(query.trim());
    } catch (err) {
      toast.error('Deletion Failed', err?.message || 'Unable to delete product.');
    }
  };

  const fetchAllProductIds = async () => {
    const ids = [];
    const seen = new Set();
    let page = 1;
    const limit = 200;

    while (true) {
      const payload = await adminFetchProducts(token, {
        limit,
        page,
        include: 'compact',
      });
      const items = payload?.data ?? payload ?? [];
      items.forEach((item) => {
        if (!item?.id || seen.has(item.id)) return;
        seen.add(item.id);
        ids.push(item.id);
      });

      const total = Number(payload?.meta?.total);
      if (!items.length) break;
      if (Number.isFinite(total) && ids.length >= total) break;
      if (items.length < limit) break;
      page += 1;
    }

    return ids;
  };

  const handleDeleteAll = async () => {
    if (!token || deletingAll) return;
    const firstConfirm = window.confirm(
      'Delete ALL products from catalog? This cannot be undone.',
    );
    if (!firstConfirm) return;

    setError('');
    setDeleteSummary(null);
    setDeletingAll(true);
    setDeleteProgress({ done: 0, total: 0 });

    try {
      const ids = await fetchAllProductIds();
      if (!ids.length) {
        setDeleteSummary({ deleted: 0, failed: 0, total: 0 });
        return;
      }

      const secondConfirm = window.confirm(
        `You are about to delete ${ids.length} products. Continue?`,
      );
      if (!secondConfirm) return;

      let deleted = 0;
      let failed = 0;
      setDeleteProgress({ done: 0, total: ids.length });

      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        try {
          await adminDeleteProduct(token, id);
          deleted += 1;
        } catch (err) {
          failed += 1;
          console.error('Delete failed for product', id, err);
        } finally {
          setDeleteProgress({ done: index + 1, total: ids.length });
        }
      }

      setDeleteSummary({ deleted, failed, total: ids.length });
      toast.success('Bulk Deletion Complete', `Successfully deleted ${deleted} products.`);
      await loadProducts(query.trim());
    } catch (err) {
      toast.error('Bulk Deletion Failed', err?.message || 'Unable to delete all products.');
    } finally {
      setDeletingAll(false);
      setDeleteProgress({ done: 0, total: 0 });
    }
  };

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const csv = await adminExportProductsCsv(token);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'products-export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export Successful', 'Products have been exported to CSV.');
    } catch (err) {
      toast.error('Export Failed', err?.message || 'Unable to export CSV.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setImporting(true);
    setError('');
    setImportSummary(null);
    setDeleteSummary(null);
    try {
      const text = await file.text();
      const summary = await adminImportProductsCsv(token, text);
      setImportSummary(summary);
      toast.success('Import Successful', `${summary.created ?? 0} created, ${summary.updated ?? 0} updated, ${summary.failed ?? 0} failed.`);
      await loadProducts(query.trim());
    } catch (err) {
      toast.error('Import Failed', err?.message || 'CSV import failed.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const getMinPrice = (product) => {
    const prices = Array.isArray(product?.variants)
      ? product.variants.map((variant) => Number(variant?.price || 0))
      : [];
    const min = prices.length ? Math.min(...prices) : 0;
    return formatMoney(min, undefined);
  };

  const getImageCount = (product) => {
    const counted = Number(product?._count?.media);
    if (Number.isFinite(counted) && counted >= 0) return counted;
    return Array.isArray(product?.media) ? product.media.length : 0;
  };

  const getPreviewImage = (product) => {
    if (!Array.isArray(product?.media)) return '';
    const image =
      product.media.find((media) => media?.type === 'IMAGE' && media?.url) ||
      product.media.find((media) => media?.url);
    return image?.url || '';
  };

  const statusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'ACTIVE') return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    if (s === 'DRAFT') return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    return 'bg-slate-800/50 border-slate-700/50 text-slate-300';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Products</p>
          <h2 className="text-2xl font-bold text-white tracking-tight">Catalog Management</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || deletingAll}
            className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <label
            className={`flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2.5 text-xs font-bold text-slate-300 transition-all shadow-sm ${deletingAll ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-700 hover:text-white'
              }`}
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importing...' : 'Import CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportCsv}
              className="hidden"
              disabled={deletingAll}
            />
          </label>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={deletingAll || loading}
            className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-all shadow-sm disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deletingAll
              ? `Deleting... ${deleteProgress.done}/${deleteProgress.total}`
              : 'Clear Catalog'}
          </button>
          <Link
            to="/admin/products/new"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Link>
        </div>
      </div>

      <div className="bg-[#0d1323] p-4 rounded-2xl border border-slate-800/60 shadow-lg">
        <form onSubmit={handleSearch} className="flex gap-3 relative max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, handle, or tag..."
              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 pl-10 pr-4 py-2.5 text-sm font-medium text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 text-sm font-bold transition-colors border border-slate-700/50"
          >
            Search
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {importSummary ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
          <p className="font-bold mb-1">Last Import Summary</p>
          <ul className="list-disc pl-5 opacity-80">
            <li>Created: {importSummary.created ?? 0}</li>
            <li>Updated: {importSummary.updated ?? 0}</li>
            <li>Failed: {importSummary.failed ?? 0}</li>
          </ul>
        </div>
      ) : null}

      {deleteSummary ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <p className="font-bold mb-1">Last Deletion Summary</p>
          <ul className="list-disc pl-5 opacity-80">
            <li>Deleted: {deleteSummary.deleted ?? 0}/{deleteSummary.total ?? 0}</li>
            {deleteSummary.failed ? <li>Failed: {deleteSummary.failed}</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0d1323] shadow-xl">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-widest text-[10px] font-bold border-b border-slate-800/60">
            <tr>
              <th className="px-6 py-5">Product Info</th>
              <th className="px-6 py-5">Media</th>
              <th className="px-6 py-5">Handle</th>
              <th className="px-6 py-5">Status</th>
              <th className="px-6 py-5">Base Price</th>
              <th className="px-6 py-5 text-right flex-1">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-indigo-500 animate-spin"></div>
                    <span className="text-slate-500 font-medium text-xs uppercase tracking-widest">Loading catalog...</span>
                  </div>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-16 text-center text-slate-500">
                  <PackageOpen className="w-12 h-12 opacity-20 mx-auto mb-4" />
                  <p className="font-medium">No products match your search.</p>
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const previewImage = getPreviewImage(product);
                const imageCount = getImageCount(product);
                return (
                  <tr key={product.id} className="transition-colors hover:bg-slate-800/20">
                    <td className="px-6 py-4">
                      <div className="max-w-[200px] truncate font-extrabold text-white text-[14px]">{product.title}</div>
                      <div className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        {product.vendor || 'Aradhya Studio'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/80">
                          {previewImage ? (
                            <img
                              src={previewImage}
                              alt={product.title || 'Product image'}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-600">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/50">
                          {imageCount}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-medium text-xs"> /{product.handle}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase border ${statusBadge(product.status)}`}>
                        {product.status || 'DRAFT'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-100 bg-slate-800/50 inline-flex px-3 py-1 rounded-lg border border-slate-700/50">
                        {getMinPrice(product)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/products/${product.id}`}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-indigo-500 hover:text-white hover:border-indigo-400 transition-colors"
                          title="Edit Product"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(product.id)}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:bg-rose-500 hover:text-white hover:border-rose-400 transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default AdminProducts;
