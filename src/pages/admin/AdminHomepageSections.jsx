import React, { useEffect, useMemo, useState } from 'react';
import {
  adminFetchProducts,
  adminUpdateProduct,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { useAdminToast } from '../../components/admin/AdminToaster';

const TITLE_PRESETS = [
  'Special Products',
  'Most Selling Products',
  'Trending Now',
  'New Arrivals',
  'Best Picks',
  'Editor Picks',
];

const SECTION_DEFS = [
  {
    id: 'featured',
    adminLabel: 'Highlighted Products',
    description: 'First homepage product row.',
    enabledKey: 'homepage_featured',
    orderKey: 'homepage_featured_order',
    titleKey: 'homepage_featured_title',
    defaultTitle: 'Special Products',
  },
  {
    id: 'bestSeller',
    adminLabel: 'Best Seller Products',
    description: 'Second homepage product row.',
    enabledKey: 'homepage_best_seller',
    orderKey: 'homepage_best_seller_order',
    titleKey: 'homepage_best_seller_title',
    defaultTitle: 'Most Selling Products',
  },
];

const HOMEPAGE_META_KEYS = new Set(
  SECTION_DEFS.flatMap((section) => [section.enabledKey, section.orderKey, section.titleKey]),
);

const normalizeToken = (value) => String(value ?? '').trim().toLowerCase();

const readHomepageMetafield = (product, key) =>
  (Array.isArray(product?.metafields) ? product.metafields : []).find(
    (field) =>
      normalizeToken(field?.namespace) === 'custom' &&
      normalizeToken(field?.key) === normalizeToken(key),
  ) ?? null;

const readHomepageBoolean = (product, key) => {
  const value = readHomepageMetafield(product, key)?.value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return ['true', '1', 'yes', 'y', 'on'].includes(normalizeToken(value));
};

const readHomepageOrder = (product, key) => {
  const raw = readHomepageMetafield(product, key)?.value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Number(String(raw ?? '').trim());
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const readHomepageTitle = (product, key) =>
  String(readHomepageMetafield(product, key)?.value ?? '').trim();

const parseOrderValue = (value) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getConfigOrder = (config, productId) =>
  parseOrderValue(config?.orderById?.[productId]) ?? Number.MAX_SAFE_INTEGER;

const sortSelectedProducts = (products, section) =>
  [...products].sort((left, right) => {
    const orderDiff =
      readHomepageOrder(left, section.orderKey) - readHomepageOrder(right, section.orderKey);
    if (orderDiff !== 0) return orderDiff;
    return String(left.title || '').localeCompare(String(right.title || ''));
  });

const buildSectionState = (products, section) => {
  const selectedProducts = sortSelectedProducts(
    products.filter((product) => readHomepageBoolean(product, section.enabledKey)),
    section,
  );
  const titleFromData =
    selectedProducts.map((product) => readHomepageTitle(product, section.titleKey)).find(Boolean) ||
    section.defaultTitle;
  const presetValue = TITLE_PRESETS.includes(titleFromData) ? titleFromData : 'custom';

  return {
    titlePreset: presetValue,
    customTitle: presetValue === 'custom' ? titleFromData : '',
    selectedIds: selectedProducts.map((product) => product.id),
    orderById: Object.fromEntries(
      selectedProducts.map((product, index) => [
        product.id,
        Number.isFinite(readHomepageOrder(product, section.orderKey))
          ? String(readHomepageOrder(product, section.orderKey))
          : String(index + 1),
      ]),
    ),
    search: '',
  };
};

const resolveSectionTitle = (config, section) =>
  config.titlePreset === 'custom'
    ? config.customTitle.trim() || section.defaultTitle
    : config.titlePreset || section.defaultTitle;

const stripHomepageMetafields = (metafields) =>
  (Array.isArray(metafields) ? metafields : []).filter(
    (field) =>
      !(
        normalizeToken(field?.namespace) === 'custom' &&
        HOMEPAGE_META_KEYS.has(normalizeToken(field?.key))
      ),
  );

const upsertSectionMetafields = (metafields, section, { selected, order, title }) => {
  if (!selected) return metafields;
  const next = [...metafields];
  next.push({
    set: 'PRODUCT',
    namespace: 'custom',
    key: section.enabledKey,
    type: 'boolean',
    value: true,
  });
  next.push({
    set: 'PRODUCT',
    namespace: 'custom',
    key: section.orderKey,
    type: 'number_integer',
    value: order,
  });
  next.push({
    set: 'PRODUCT',
    namespace: 'custom',
    key: section.titleKey,
    type: 'single_line_text_field',
    value: title,
  });
  return next;
};

const sectionCardClass =
  'rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl';

export default function AdminHomepageSections() {
  const { token } = useAdminAuth();
  const toast = useAdminToast();
  const [products, setProducts] = useState([]);
  const [sectionConfigs, setSectionConfigs] = useState(() =>
    Object.fromEntries(
      SECTION_DEFS.map((section) => [
        section.id,
        {
          titlePreset: section.defaultTitle,
          customTitle: '',
          selectedIds: [],
          orderById: {},
          search: '',
        },
      ]),
    ),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const allProducts = [];
        const seen = new Set();
        let page = 1;
        const limit = 100;

        while (true) {
          const payload = await adminFetchProducts(token, {
            include: 'full',
            limit,
            page,
          });
          const items = payload?.data ?? payload ?? [];
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

        if (cancelled) return;
        setProducts(allProducts);
        setSectionConfigs(
          Object.fromEntries(
            SECTION_DEFS.map((section) => [section.id, buildSectionState(allProducts, section)]),
          ),
        );
      } catch (error) {
        if (!cancelled) {
          toast.error('Load Failed', error?.message || 'Unable to load homepage sections.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [toast, token]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const handleSectionChange = (sectionId, patch) => {
    setSectionConfigs((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        ...patch,
      },
    }));
  };

  const autoNumberSection = (sectionId) => {
    setSectionConfigs((prev) => {
      const current = prev[sectionId];
      const orderedIds = [...current.selectedIds].sort((leftId, rightId) => {
        const leftProduct = productsById.get(leftId);
        const rightProduct = productsById.get(rightId);
        const orderDiff = getConfigOrder(current, leftId) - getConfigOrder(current, rightId);
        if (orderDiff !== 0) return orderDiff;
        return String(leftProduct?.title || '').localeCompare(String(rightProduct?.title || ''));
      });

      return {
        ...prev,
        [sectionId]: {
          ...current,
          selectedIds: orderedIds,
          orderById: Object.fromEntries(
            orderedIds.map((productId, index) => [productId, String(index + 1)]),
          ),
        },
      };
    });
  };

  const clearSection = (sectionId) => {
    handleSectionChange(sectionId, {
      selectedIds: [],
      orderById: {},
    });
  };

  const toggleProduct = (sectionId, productId) => {
    setSectionConfigs((prev) => {
      const current = prev[sectionId];
      const isSelected = current.selectedIds.includes(productId);
      const selectedIds = isSelected
        ? current.selectedIds.filter((id) => id !== productId)
        : [...current.selectedIds, productId];
      const orderById = { ...current.orderById };
      if (isSelected) {
        delete orderById[productId];
      } else {
        orderById[productId] = String(selectedIds.length);
      }
      return {
        ...prev,
        [sectionId]: {
          ...current,
          selectedIds,
          orderById,
        },
      };
    });
  };

  const handleSave = async () => {
    if (!token || saving) return;
    setSaving(true);
    try {
      const activeProductIds = new Set();
      SECTION_DEFS.forEach((section) => {
        const config = sectionConfigs[section.id];
        config.selectedIds.forEach((id) => activeProductIds.add(id));
        products.forEach((product) => {
          if (readHomepageBoolean(product, section.enabledKey)) {
            activeProductIds.add(product.id);
          }
        });
      });

      const updates = [];
      activeProductIds.forEach((productId) => {
        const product = productsById.get(productId);
        if (!product) return;
        let metafields = stripHomepageMetafields(product.metafields);

        SECTION_DEFS.forEach((section) => {
          const config = sectionConfigs[section.id];
          const selected = config.selectedIds.includes(productId);
          const order = Number(config.orderById[productId] || 0) || 1;
          const title = resolveSectionTitle(config, section);
          metafields = upsertSectionMetafields(metafields, section, {
            selected,
            order,
            title,
          });
        });

        updates.push(
          adminUpdateProduct(token, productId, { metafields }),
        );
      });

      await Promise.all(updates);

      const refreshed = products.map((product) => {
        let metafields = stripHomepageMetafields(product.metafields);
        SECTION_DEFS.forEach((section) => {
          const config = sectionConfigs[section.id];
          metafields = upsertSectionMetafields(metafields, section, {
            selected: config.selectedIds.includes(product.id),
            order: Number(config.orderById[product.id] || 0) || 1,
            title: resolveSectionTitle(config, section),
          });
        });
        return { ...product, metafields };
      });
      setProducts(refreshed);
      toast.success('Saved', 'Homepage sections updated successfully.');
    } catch (error) {
      toast.error('Save Failed', error?.message || 'Unable to update homepage sections.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Homepage</p>
          <h2 className="text-2xl font-bold text-white tracking-tight">Homepage Sections</h2>
          <p className="mt-1 text-sm text-slate-400">
            Select highlight products and manage section titles from one place.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Homepage Sections'}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {SECTION_DEFS.map((section) => {
          const config = sectionConfigs[section.id];
          const resolvedTitle = resolveSectionTitle(config, section);
          const selectedSet = new Set(config.selectedIds);
          const selectedProducts = config.selectedIds
            .map((productId) => productsById.get(productId))
            .filter(Boolean)
            .sort((left, right) => {
              const orderDiff = getConfigOrder(config, left.id) - getConfigOrder(config, right.id);
              if (orderDiff !== 0) return orderDiff;
              return String(left.title || '').localeCompare(String(right.title || ''));
            });
          const visibleProducts = [...products]
            .filter((product) => {
              const haystack = `${product.title || ''} ${product.handle || ''} ${product.vendor || ''}`;
              return haystack.toLowerCase().includes(config.search.toLowerCase());
            })
            .sort((left, right) => {
              const leftSelected = selectedSet.has(left.id) ? 0 : 1;
              const rightSelected = selectedSet.has(right.id) ? 0 : 1;
              if (leftSelected !== rightSelected) return leftSelected - rightSelected;
              const leftOrder = getConfigOrder(config, left.id);
              const rightOrder = getConfigOrder(config, right.id);
              if (leftOrder !== rightOrder) return leftOrder - rightOrder;
              return String(left.title || '').localeCompare(String(right.title || ''));
            });

          return (
            <section key={section.id} className={sectionCardClass}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-white">{section.adminLabel}</p>
                  <p className="mt-1 text-sm text-slate-400">{section.description}</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                  {config.selectedIds.length} selected
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.25em] text-slate-500">
                    Section Name Presets
                  </label>
                  <select
                    value={config.titlePreset}
                    onChange={(event) =>
                      handleSectionChange(section.id, { titlePreset: event.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  >
                    {TITLE_PRESETS.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                    <option value="custom">Custom Name</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.25em] text-slate-500">
                    Custom Section Name
                  </label>
                  <input
                    type="text"
                    value={config.customTitle}
                    onChange={(event) =>
                      handleSectionChange(section.id, { customTitle: event.target.value })
                    }
                    disabled={config.titlePreset !== 'custom'}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none disabled:opacity-50"
                    placeholder={section.defaultTitle}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                Homepage title preview: <span className="font-semibold text-white">{resolvedTitle}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => autoNumberSection(section.id)}
                  disabled={!config.selectedIds.length}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Auto-number 1, 2, 3
                </button>
                <button
                  type="button"
                  onClick={() => clearSection(section.id)}
                  disabled={!config.selectedIds.length}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear section
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                      Selected Order Preview
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      These products will show on the homepage in this order.
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">
                    {selectedProducts.length ? `${selectedProducts.length} items` : 'No items yet'}
                  </div>
                </div>

                {selectedProducts.length ? (
                  <div className="mt-4 space-y-2">
                    {selectedProducts.map((product, index) => {
                      const orderValue = getConfigOrder(config, product.id);
                      return (
                        <div
                          key={`${section.id}-selected-${product.id}`}
                          className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5"
                        >
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-300">
                            {orderValue === Number.MAX_SAFE_INTEGER ? index + 1 : orderValue}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-white">
                              {product.title}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {product.vendor || 'No vendor'} | /{product.handle}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 px-4 py-5 text-center text-xs text-slate-500">
                    Select products below and give them position numbers.
                  </div>
                )}
              </div>

              <div className="mt-5">
                <label className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Search Products
                </label>
                <input
                  type="text"
                  value={config.search}
                  onChange={(event) =>
                    handleSectionChange(section.id, { search: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  placeholder="Search by title, vendor, or handle"
                />
              </div>

              <div className="mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {loading ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">
                    Loading products...
                  </div>
                ) : visibleProducts.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">
                    No products found for this search.
                  </div>
                ) : (
                  visibleProducts.map((product) => {
                    const isSelected = selectedSet.has(product.id);
                    return (
                      <label
                        key={`${section.id}-${product.id}`}
                        className={`flex gap-4 rounded-xl border px-4 py-3 transition ${
                          isSelected
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProduct(section.id, product.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">
                            {product.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {product.vendor || 'No vendor'} | /{product.handle}
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="w-24">
                            <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              Position
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={config.orderById[product.id] || ''}
                              onChange={(event) =>
                                handleSectionChange(section.id, {
                                  orderById: {
                                    ...config.orderById,
                                    [product.id]: event.target.value,
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
