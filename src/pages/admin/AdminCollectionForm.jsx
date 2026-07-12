import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  adminCreateCollection,
  adminFetchCollection,
  adminFetchCollections,
  adminFetchProducts,
  adminUpdateCollection,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { useAdminToast } from '../../components/admin/AdminToaster';
import { motion } from 'framer-motion';
import { FolderTree, Package, Image as ImageIcon, Sparkles, Settings2, Save, X, Search } from 'lucide-react';

const Motion = motion;

const slugify = (value) =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const SKINTONE_OPTIONS = [
  { value: 'fair', label: 'Fair' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'dark', label: 'Dark' },
];

const OCCASION_OPTIONS = [
  { value: 'date', label: 'Date Wear' },
  { value: 'office', label: 'Office Wear' },
  { value: 'puja', label: 'Puja/Festive' },
  { value: 'party', label: 'Party' },
  { value: 'casual', label: 'Casual' },
];

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeChoiceList = (value, allowedValues) => {
  const allowed = new Set(allowedValues.map((item) => item.value));
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return Array.from(
    new Set(
      list
        .map((item) => String(item).trim().toLowerCase())
        .filter((item) => allowed.has(item)),
    ),
  );
};

const readFlowConfig = (rules) => {
  const sourceRules = isObject(rules) ? rules : {};
  const flow = isObject(sourceRules.storefrontFlow) ? sourceRules.storefrontFlow : {};
  const flowSkintones = normalizeChoiceList(flow.skintones, SKINTONE_OPTIONS);
  const flowOccasions = normalizeChoiceList(flow.occasions, OCCASION_OPTIONS);
  return {
    rules: sourceRules,
    flowEnabled: flow.enabled !== false && (flowSkintones.length > 0 || flowOccasions.length > 0),
    flowSkintones,
    flowOccasions,
  };
};

const buildRulesPayload = ({ rules, flowEnabled, flowSkintones, flowOccasions }) => {
  const nextRules = isObject(rules) ? { ...rules } : {};
  if (!flowEnabled) {
    delete nextRules.storefrontFlow;
  } else {
    nextRules.storefrontFlow = {
      enabled: true,
      skintones: flowSkintones,
      occasions: flowOccasions,
    };
  }
  return Object.keys(nextRules).length ? nextRules : null;
};

const buildSuggestedHandle = ({ title, parentId, collections }) => {
  const titleSlug = slugify(title || '');
  if (!titleSlug) return '';
  if (!parentId) return titleSlug;

  const parent = Array.isArray(collections)
    ? collections.find((collection) => collection.id === parentId)
    : null;
  const parentSlug = slugify(parent?.handle || parent?.title || '');
  if (!parentSlug) return titleSlug;

  return slugify(`${parentSlug}-${titleSlug}`);
};

const AdminCollectionForm = () => {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { token } = useAdminAuth();
  const toast = useAdminToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [handleTouched, setHandleTouched] = useState(false);
  const [form, setForm] = useState({
    title: '',
    handle: '',
    descriptionHtml: '',
    imageUrl: '',
    parentId: '',
    type: 'MANUAL',
    rules: {},
    flowEnabled: false,
    flowSkintones: [],
    flowOccasions: [],
  });

  useEffect(() => {
    if (!token) return;
    adminFetchCollections(token, { limit: 200 })
      .then((items) => setCollections(Array.isArray(items) ? items : []))
      .catch(() => setCollections([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadAllProducts = async () => {
      setProductsLoading(true);
      try {
        const allProducts = [];
        const seen = new Set();
        let page = 1;
        const limit = 200;

        while (true) {
          const payload = await adminFetchProducts(token, { page, limit, include: 'compact' });
          const items = Array.isArray(payload?.data)
            ? payload.data
            : (Array.isArray(payload) ? payload : []);

          items.forEach((item) => {
            if (!item?.id || seen.has(item.id)) return;
            seen.add(item.id);
            allProducts.push(item);
          });

          const total = Number(payload?.meta?.total);
          if (!items.length) break;
          if (Number.isFinite(total) && allProducts.length >= total) break;
          if (items.length < limit) break;
          page += 1;
        }

        if (!cancelled) {
          setProducts(allProducts);
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setProductsLoading(false);
        }
      }
    };

    loadAllProducts();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (isNew || !id || !token) {
      setSelectedProductIds([]);
      setHandleTouched(false);
      return;
    }
    setLoading(true);
    adminFetchCollection(token, id)
      .then((collection) => {
        if (!collection) return;
        const flowConfig = readFlowConfig(collection.rules);
        const assignedProducts = Array.isArray(collection.products) ? collection.products : [];
        setForm({
          title: collection.title || '',
          handle: collection.handle || '',
          descriptionHtml: collection.descriptionHtml || '',
          imageUrl: collection.imageUrl || '',
          parentId: collection.parentId || '',
          type: collection.type || 'MANUAL',
          rules: flowConfig.rules,
          flowEnabled: flowConfig.flowEnabled,
          flowSkintones: flowConfig.flowSkintones,
          flowOccasions: flowConfig.flowOccasions,
        });
        setHandleTouched(Boolean(collection.handle));
        setSelectedProductIds(
          assignedProducts
            .map((product) => product?.id)
            .filter(Boolean),
        );
      })
      .catch((err) => {
        toast.error('Load Failed', err?.message || 'Unable to load collection details.');
      })
      .finally(() => setLoading(false));
  }, [id, isNew, token, toast]);

  useEffect(() => {
    if (!isNew || handleTouched) return;
    const suggested = buildSuggestedHandle({
      title: form.title,
      parentId: form.parentId,
      collections,
    });
    setForm((prev) => {
      if (prev.handle === suggested) return prev;
      return { ...prev, handle: suggested };
    });
  }, [isNew, handleTouched, form.title, form.parentId, collections]);

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleChoice = (field, value) => {
    setForm((prev) => {
      const selected = Array.isArray(prev[field]) ? prev[field] : [];
      return {
        ...prev,
        [field]: selected.includes(value)
          ? selected.filter((entry) => entry !== value)
          : [...selected, value],
      };
    });
  };

  const toggleProductSelection = (productId) => {
    if (!productId) return;
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((idValue) => idValue !== productId)
        : [...prev, productId],
    );
  };

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product?.title, product?.handle, product?.vendor]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query)),
    );
  }, [products, productSearch]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    const suggestedHandle = buildSuggestedHandle({
      title: form.title,
      parentId: form.parentId,
      collections,
    });

    const payload = {
      title: form.title.trim(),
      handle: form.handle.trim() || suggestedHandle,
      descriptionHtml: form.descriptionHtml.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      parentId: form.parentId || null,
      type: form.type || 'MANUAL',
      rules: buildRulesPayload(form),
      productIds: selectedProductIds,
    };

    try {
      if (isNew) {
        await adminCreateCollection(token, payload);
        toast.success('Collection Created', 'The new collection is now live.');
      } else {
        await adminUpdateCollection(token, id, payload);
        toast.success('Collection Updated', 'Changes have been saved successfully.');
      }
      navigate('/admin/collections');
    } catch (err) {
      const message = err?.message || 'Unable to save collection.';
      if (err?.status === 409 && /handle/i.test(message)) {
        const fallback = buildSuggestedHandle({
          title: form.title,
          parentId: form.parentId,
          collections,
        });
        toast.error(
          'Handle Conflict',
          fallback
            ? `Collection handle already exists. Try "${fallback}" or set a custom unique handle.`
            : 'Collection handle already exists. Set a custom unique handle.'
        );
      } else {
        toast.error('Save Failed', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const parentOptions = collections.filter((collection) => collection.id !== id);
  const visibleProductIds = filteredProducts.map((product) => product.id).filter(Boolean);
  const allVisibleSelected =
    visibleProductIds.length > 0 && visibleProductIds.every((productId) => selectedProductIds.includes(productId));
  const getProductPreviewImage = (product) => {
    if (!product) return '';
    if (Array.isArray(product.media)) {
      const image =
        product.media.find((item) => item?.type === 'IMAGE' && item?.url) ||
        product.media.find((item) => item?.url);
      if (image?.url) return image.url;
    }
    if (product.featuredImage?.url) return product.featuredImage.url;
    if (product.image?.url) return product.image.url;
    if (typeof product.imageUrl === 'string') return product.imageUrl;
    return '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* Header Sticky Bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 bg-[#0d1323]/80 backdrop-blur-xl border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-pink-400 font-bold mb-1 flex items-center gap-2">
            <FolderTree className="w-4 h-4" />
            {isNew ? 'Create Collection' : 'Edit Collection'}
          </p>
          <h2 className="text-2xl font-bold text-white">
            {isNew ? 'New Category' : form.title || 'Collection detail'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/collections"
            className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/50 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
            Discard
          </Link>
          <button
            onClick={handleSubmit}
            disabled={saving || loading}
            className="flex items-center gap-2 rounded-xl bg-pink-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-pink-500 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Collection'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Main Column */}
        <div className="xl:col-span-2 space-y-6">

          {/* Basic Details Card */}
          <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-pink-500/5 blur-[120px] pointer-events-none rounded-full" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-pink-400" />
              General Information
            </h3>

            <div className="space-y-5 relative">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Collection Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => handleFieldChange('title', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all outline-none"
                  placeholder="e.g. Summer Collection 2024"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Description</label>
                <textarea
                  value={form.descriptionHtml}
                  onChange={(event) => handleFieldChange('descriptionHtml', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all outline-none min-h-[160px] resize-y"
                  placeholder="Describe your collection..."
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Handle (URL Slug)</label>
                <input
                  type="text"
                  value={form.handle}
                  onChange={(event) => {
                    const value = event.target.value;
                    handleFieldChange('handle', value);
                    setHandleTouched(value.trim().length > 0);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all outline-none"
                  placeholder="Auto-generated if left blank"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Sub-collections auto-use parent handle prefix so each handle stays unique.
                </p>
              </div>
            </div>
          </div>

          {/* Media Card */}
          <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl relative overflow-hidden">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-6 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              Cover Image
            </h3>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Image URL</label>
              <input
                type="text"
                value={form.imageUrl}
                onChange={(event) => handleFieldChange('imageUrl', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
                placeholder="https://example.com/image.jpg"
              />
            </div>
          </div>

          {/* Products Association Card */}
          <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-400" />
                Included Products
              </h3>
              <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">{selectedProductIds.length} selected</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search products by title, handle, vendor..."
                  className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 pl-10 pr-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedProductIds((prev) =>
                    Array.from(new Set([...prev, ...visibleProductIds])),
                  )
                }
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Select Visible
              </button>
              <button
                type="button"
                onClick={() => setSelectedProductIds((prev) => prev.filter((id) => !visibleProductIds.includes(id)))}
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Unselect Visible
              </button>
              <button
                type="button"
                onClick={() => setSelectedProductIds([])}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500 hover:text-white transition-colors"
              >
                Clear All
              </button>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 max-h-[400px] overflow-y-auto overflow-x-hidden">
              {productsLoading ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-indigo-500 animate-spin mb-3"></div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Loading Catalog...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                  <Package className="w-10 h-10 opacity-20 mb-3" />
                  <p className="text-sm font-medium">No products found</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {filteredProducts.map((product) => {
                    const selected = selectedProductIds.includes(product.id);
                    const previewImage = getProductPreviewImage(product);
                    return (
                      <label
                        key={product.id}
                        className={`w-full group flex items-center justify-between p-4 cursor-pointer transition-colors ${selected ? 'bg-indigo-500/5 hover:bg-indigo-500/10' : 'hover:bg-slate-800/40'
                          }`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="relative flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleProductSelection(product.id)}
                              className="peer sr-only"
                            />
                            <div className={`w-5 h-5 rounded border ${selected ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-slate-900 border-slate-600'} flex items-center justify-center transition-colors group-hover:border-indigo-400`}>
                              {selected && <Save className="w-3 h-3" />}
                            </div>
                          </div>

                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
                            {previewImage ? (
                              <img
                                src={previewImage}
                                alt={product.title || 'Product'}
                                className="h-full w-full object-cover transition-transform group-hover:scale-110"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500 uppercase font-bold">
                                No Img
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-bold truncate transition-colors ${selected ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                              {product.title || 'Untitled product'}
                            </p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">/{product.handle || 'no-handle'}</p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {!allVisibleSelected && visibleProductIds.length > 0 && (
              <p className="mt-3 text-[11px] text-slate-500 font-medium">
                Showing {visibleProductIds.length} products from your catalog.
              </p>
            )}
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">

          {/* Organization Card */}
          <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-6 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-amber-400" />
              Organization
            </h3>

            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Parent Collection</label>
                <div className="relative mt-2">
                  <select
                    value={form.parentId}
                    onChange={(event) => handleFieldChange('parentId', event.target.value)}
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 pl-4 py-3 pr-10 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all outline-none appearance-none cursor-pointer"
                  >
                    <option value="">None (Top-Level)</option>
                    {parentOptions
                      .filter((c) => !c.parentId)
                      .map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.title}
                        </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  Nest this collection under a broader category.
                </p>
              </div>

              {!isNew && (() => {
                const children = collections.filter((c) => c.parentId === id);
                if (!children.length) return null;
                return (
                  <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 space-y-3 mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Sub-Collections ({children.length})
                    </p>
                    <div className="space-y-1.5">
                      {children.map((child) => (
                        <Link
                          key={child.id}
                          to={`/admin/collections/${child.id}`}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border border-transparent hover:border-slate-700/50"
                        >
                          <span className="text-slate-600 opacity-50">└─</span>
                          {child.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="pt-4 border-t border-slate-800/60">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Assignment Type</label>
                <div className="relative mt-2">
                  <select
                    value={form.type}
                    onChange={(event) => handleFieldChange('type', event.target.value)}
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-900/50 pl-4 py-3 pr-10 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all outline-none appearance-none cursor-pointer"
                  >
                    <option value="MANUAL">Manual Selection</option>
                    <option value="AUTOMATED">Automated (Rules)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Storefront Flow Card */}
          <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-purple-500/5 blur-[120px] pointer-events-none rounded-full" />

            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Storefront Flow
                </h3>
                <p className="text-[11px] text-slate-500 mt-2 font-medium">
                  Control visibility in Skin Tone + Occasion filter widgets.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={form.flowEnabled}
                  onChange={(event) => handleFieldChange('flowEnabled', event.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
              </label>
            </div>

            {form.flowEnabled && (
              <div className="space-y-6 pt-4 border-t border-slate-800/60 animate-in fade-in slide-in-from-top-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-3">Target Skintones</label>
                  <div className="flex flex-wrap gap-2">
                    {SKINTONE_OPTIONS.map((option) => {
                      const checked = form.flowSkintones.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleChoice('flowSkintones', option.value)}
                          className={`rounded-full border px-4 py-1.5 text-[11px] font-bold transition-all ${checked
                            ? 'border-purple-500 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                            : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-3">Target Occasions</label>
                  <div className="flex flex-wrap gap-2">
                    {OCCASION_OPTIONS.map((option) => {
                      const checked = form.flowOccasions.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleChoice('flowOccasions', option.value)}
                          className={`rounded-full border px-4 py-1.5 text-[11px] font-bold transition-all ${checked
                            ? 'border-purple-500 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                            : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default AdminCollectionForm;
