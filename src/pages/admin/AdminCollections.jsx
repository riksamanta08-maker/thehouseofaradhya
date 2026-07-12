import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminDeleteCollection,
  adminFetchCollections,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { motion } from 'framer-motion';
import { Layers, Plus, Edit, Trash2, FolderTree, Package } from 'lucide-react';
import { useAdminToast } from '../../components/admin/AdminToaster';

const Motion = motion;

const AdminCollections = () => {
  const { token } = useAdminAuth();
  const toast = useAdminToast();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCollections = useCallback(async () => {
    if (!token) {
      toast.error('Authentication Required', 'Please log in again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await adminFetchCollections(token, { limit: 200 });
      setCollections(Array.isArray(items) ? items : []);
    } catch (err) {
      const errorMessage = err?.message || err?.payload?.error?.message || 'Unable to load collections.';
      if (err?.status === 401 || err?.status === 403) {
        toast.error('Session Expired', 'Please log in again.');
      } else {
        toast.error('Load Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [toast, token]);

  useEffect(() => {
    if (!token) return;
    loadCollections();
  }, [loadCollections, token]);

  const handleDelete = async (id) => {
    if (!id) return;
    const confirmDelete = window.confirm('Delete this collection? This cannot be undone.');
    if (!confirmDelete) return;

    try {
      await adminDeleteCollection(token, id);
      toast.success('Collection Deleted', 'The collection was successfully removed.');
      await loadCollections();
    } catch (err) {
      toast.error('Deletion Failed', err?.message || 'Unable to delete collection.');
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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Collections</p>
          <h2 className="text-2xl font-bold text-white tracking-tight">Collection Management</h2>
        </div>
        <Link
          to="/admin/collections/new"
          className="flex items-center gap-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-lg shadow-pink-500/20"
        >
          <Plus className="w-4 h-4" />
          Add Collection
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0d1323] shadow-xl">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-widest text-[10px] font-bold border-b border-slate-800/60">
            <tr>
              <th className="px-6 py-5">Title</th>
              <th className="px-6 py-5">Category Handle</th>
              <th className="px-6 py-5">Parent Category</th>
              <th className="px-6 py-5">Total Products</th>
              <th className="px-6 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-pink-500 animate-spin"></div>
                    <span className="text-slate-500 font-medium text-xs uppercase tracking-widest">Loading categories...</span>
                  </div>
                </td>
              </tr>
            ) : collections.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-16 text-center text-slate-500">
                  <Layers className="w-12 h-12 opacity-20 mx-auto mb-4" />
                  <p className="font-medium">No collections found.</p>
                </td>
              </tr>
            ) : (
              (() => {
                // Group: parents first, then children under their parent
                const parents = collections.filter((c) => !c.parentId);
                const childMap = {};
                collections.forEach((c) => {
                  if (c.parentId) {
                    if (!childMap[c.parentId]) childMap[c.parentId] = [];
                    childMap[c.parentId].push(c);
                  }
                });
                const ordered = [];
                parents.forEach((p) => {
                  ordered.push({ ...p, _isParent: true });
                  (childMap[p.id] || []).forEach((child) =>
                    ordered.push({ ...child, _isChild: true }),
                  );
                });
                // Add any orphaned children (parentId set but parent not in list)
                collections.forEach((c) => {
                  if (c.parentId && !parents.find((p) => p.id === c.parentId)) {
                    if (!ordered.find((o) => o.id === c.id)) {
                      ordered.push({ ...c, _isChild: true });
                    }
                  }
                });

                return ordered.map((collection) => (
                  <tr key={collection.id} className="transition-colors hover:bg-slate-800/20">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {collection._isChild ? (
                          <div className="w-6 flex justify-end">
                            <div className="w-3 h-3 border-b-2 border-l-2 border-slate-700 rounded-bl-sm"></div>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400 border border-pink-500/20">
                            <FolderTree className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className={`font-bold ${collection._isChild ? 'text-slate-300 text-[13px]' : 'text-white text-[15px]'}`}>
                            {collection.title}
                          </div>
                          {collection._isParent && childMap[collection.id]?.length > 0 && (
                            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 mt-1 block">
                              {childMap[collection.id].length} sub-collection{childMap[collection.id].length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs font-medium">/{collection.handle}</td>
                    <td className="px-6 py-4">
                      <span className="text-slate-400 font-medium text-xs bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-700/50">
                        {collection.parent?.title || 'None'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-300 font-bold bg-slate-800/50 px-3 py-1 rounded-lg border border-slate-700/50 inline-flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 opacity-50" /> {collection._count?.products ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/collections/${collection.id}`}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-pink-500 hover:text-white hover:border-pink-400 transition-colors"
                          title="Edit Collection"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(collection.id)}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:bg-rose-500 hover:text-white hover:border-rose-400 transition-colors"
                          title="Delete Collection"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ));
              })()
            )}
          </tbody>
        </table>
      </div>
    </motion.div >
  );
};

export default AdminCollections;
