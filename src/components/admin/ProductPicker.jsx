import React, { useCallback, useEffect, useState } from 'react';
import { adminFetchProducts } from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';

export default function ProductPicker({ isOpen, onClose, onSelect, selectedHandles = [] }) {
  const { token } = useAdminAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set(selectedHandles));

  const loadProducts = useCallback(async (searchTerm = '') => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await adminFetchProducts(token, {
        search: searchTerm || undefined,
        limit: 50,
        include: 'compact',
      });
      const items = payload?.data ?? payload ?? [];
      setProducts(items);
    } catch (err) {
      console.error('Failed to load products for picker:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isOpen || !token) return;
    loadProducts();
    setSelected(new Set(selectedHandles));
  }, [isOpen, loadProducts, selectedHandles, token]);

  const handleSearch = () => {
    loadProducts(query.trim());
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    }
  };

  const toggleProduct = (handle) => {
    const next = new Set(selected);
    if (next.has(handle)) {
      next.delete(handle);
    } else {
      next.add(handle);
    }
    setSelected(next);
  };

  const handleConfirm = () => {
    onSelect(Array.from(selected));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Select Products</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="border-b border-slate-800 px-6 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by title or handle..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Search
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-slate-400">No products found.</div>
          ) : (
            <div className="grid gap-1">
              {products.map((product) => {
                const isSelected = selected.has(product.handle);
                const image = product.media?.find((item) => item.type === 'IMAGE')?.url;

                return (
                  <div
                    key={product.id}
                    onClick={() => toggleProduct(product.handle)}
                    className={`flex cursor-pointer items-center gap-4 rounded-lg px-4 py-3 transition ${
                      isSelected
                        ? 'border border-emerald-500/30 bg-emerald-500/10'
                        : 'border border-transparent hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                          : 'border-slate-600 bg-slate-950'
                      }`}
                    >
                      {isSelected ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      ) : null}
                    </div>

                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-800">
                      {image ? (
                        <img src={image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">Img</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${isSelected ? 'text-emerald-100' : 'text-slate-200'}`}>
                        {product.title}
                      </p>
                      <p className="truncate text-xs text-slate-500">{product.handle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/50 px-6 py-4">
          <span className="text-sm text-slate-400">{selected.size} selected</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg bg-emerald-400 px-6 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-300"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
