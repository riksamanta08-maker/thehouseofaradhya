import React, { useEffect, useState } from 'react';
import { Activity, Database, Globe2, LockKeyhole, Power, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  adminFetchOwnerProducts,
  adminFetchOwnerSiteSettings,
  adminUpdateOwnerCredentials,
  adminUpdateOwnerProductVisibility,
  adminUpdateSiteSettings,
} from '../../lib/api';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { useAdminToast } from '../../components/admin/AdminToaster';
import { isOwnerAdmin } from '../../lib/adminOwner';

const DEFAULT_OFFLINE_TITLE = 'Website is offline';
const DEFAULT_OFFLINE_MESSAGE = 'We are updating the store. Please check back soon.';

const OwnerAccessDenied = () => (
  <div className="flex min-h-[420px] items-center justify-center">
    <section className="w-full max-w-lg rounded-2xl border border-rose-500/30 bg-[#0d1323] p-8 text-center shadow-xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-rose-300">Access Denied</p>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-white">Owner account required</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        This page is locked and cannot be managed from a normal admin account.
      </p>
    </section>
  </div>
);

const AdminWebsiteControl = () => {
  const { admin, token, isAuthenticated, loading: authLoading } = useAdminAuth();
  const location = useLocation();
  const toast = useAdminToast();
  const [settings, setSettings] = useState({
    isOnline: true,
    title: DEFAULT_OFFLINE_TITLE,
    message: DEFAULT_OFFLINE_MESSAGE,
  });
  const [ownerStatus, setOwnerStatus] = useState(null);
  const [products, setProducts] = useState([]);
  const [credentials, setCredentials] = useState({
    email: '',
    currentPassword: '',
    newPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productSavingId, setProductSavingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !isOwnerAdmin(admin)) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [data, ownerProducts] = await Promise.all([
          adminFetchOwnerSiteSettings(token),
          adminFetchOwnerProducts(token),
        ]);
        const siteSettings = data?.settings || data;
        if (active) {
          setSettings({
            isOnline: siteSettings?.isOnline !== false,
            title: siteSettings?.title || DEFAULT_OFFLINE_TITLE,
            message: siteSettings?.message || DEFAULT_OFFLINE_MESSAGE,
          });
          setOwnerStatus(data || null);
          setCredentials((prev) => ({
            ...prev,
            email: data?.owner?.email || admin?.email || '',
          }));
          setProducts(Array.isArray(ownerProducts) ? ownerProducts : []);
        }
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load website control.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [admin, token]);

  const saveSettings = async (nextSettings = settings) => {
    setSaving(true);
    setError('');
    try {
      const saved = await adminUpdateSiteSettings(token, nextSettings);
      setSettings({
        isOnline: saved?.isOnline !== false,
        title: saved?.title || nextSettings.title,
        message: saved?.message || nextSettings.message,
      });
      toast.success('Website Control Saved', saved?.isOnline === false ? 'Website is now OFF.' : 'Website is now ON.');
    } catch (err) {
      setError(err?.message || 'Unable to save website control.');
      toast.error('Save Failed', err?.message || 'Unable to save website control.');
    } finally {
      setSaving(false);
    }
  };

  const toggleOnline = () => {
    const nextSettings = { ...settings, isOnline: !settings.isOnline };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const updateProductVisibility = async (product, nextStatus) => {
    if (!product?.id || productSavingId) return;
    setProductSavingId(product.id);
    setError('');
    try {
      const updated = await adminUpdateOwnerProductVisibility(token, product.id, nextStatus);
      setProducts((prev) =>
        prev.map((item) => (item.id === product.id ? { ...item, ...updated } : item)),
      );
      toast.success('Product Updated', nextStatus === 'ACTIVE' ? 'Product is visible.' : 'Product is hidden.');
    } catch (err) {
      setError(err?.message || 'Unable to update product visibility.');
      toast.error('Update Failed', err?.message || 'Unable to update product visibility.');
    } finally {
      setProductSavingId('');
    }
  };

  const saveCredentials = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await adminUpdateOwnerCredentials(token, {
        email: credentials.email,
        currentPassword: credentials.currentPassword,
        newPassword: credentials.newPassword || undefined,
      });
      if (result?.token) {
        localStorage.setItem('admin_auth_token', result.token);
      }
      setCredentials((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
      }));
      toast.success('Owner Login Updated', 'Sign in details were updated.');
    } catch (err) {
      setError(err?.message || 'Unable to update owner login.');
      toast.error('Update Failed', err?.message || 'Unable to update owner login.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">Checking owner access...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!isOwnerAdmin(admin)) {
    return <OwnerAccessDenied />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">Loading website control...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Website Control</h2>
        <p className="mt-1 text-sm text-slate-400">Owner-only controls for the public website and backend status.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${settings.isOnline ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
              {settings.isOnline ? <Globe2 className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Current Status</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-white">
                Website {settings.isOnline ? 'ON' : 'OFF'}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                When OFF, visitors see a black offline screen. Admin pages stay open so you can turn it back ON.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleOnline}
            disabled={saving}
            className={`inline-flex min-w-44 items-center justify-center gap-3 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60 ${settings.isOnline ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
          >
            <Power className="h-5 w-5" />
            {saving ? 'Saving...' : settings.isOnline ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-emerald-300" />
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Backend</p>
          </div>
          <p className="mt-3 text-xl font-black text-white">{ownerStatus?.backend?.ok ? 'Online' : 'Checking'}</p>
          <p className="mt-1 text-xs text-slate-500">{ownerStatus?.backend?.timestamp || 'Refresh to verify status'}</p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-300" />
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Database</p>
          </div>
          <p className="mt-3 text-xl font-black text-white">
            {ownerStatus?.backend?.databaseConfigured ? 'Configured' : 'Not configured'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Private backend check</p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-5 w-5 text-violet-300" />
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Access</p>
          </div>
          <p className="mt-3 text-xl font-black text-white">{ownerStatus?.owner?.access || 'OWNER'}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{ownerStatus?.owner?.email || admin?.email}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
        <div className="grid gap-5">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Offline Heading</span>
            <input
              value={settings.title}
              onChange={(event) => setSettings((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
              maxLength={80}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Offline Message</span>
            <textarea
              value={settings.message}
              onChange={(event) => setSettings((prev) => ({ ...prev, message: event.target.value }))}
              rows={4}
              className="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
              maxLength={240}
            />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">{settings.title.length}/80 heading · {settings.message.length}/240 message</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/60 px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => saveSettings()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/60 px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save Text
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Product Visibility</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">Show or hide products</h3>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-800/60">
          {products.length ? (
            products.map((product) => {
              const isVisible = product.status === 'ACTIVE';
              return (
                <div key={product.id} className="flex items-center justify-between gap-4 border-b border-slate-800/60 px-4 py-3 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950">
                      {product.media?.[0]?.url ? (
                        <img src={product.media[0].url} alt={product.media[0].alt || product.title} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{product.title}</p>
                      <p className="truncate text-xs text-slate-500">/{product.handle}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateProductVisibility(product, isVisible ? 'DRAFT' : 'ACTIVE')}
                    disabled={productSavingId === product.id}
                    className={`inline-flex min-w-28 items-center justify-center rounded-xl px-4 py-2 text-xs font-black transition disabled:opacity-60 ${isVisible ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {productSavingId === product.id ? 'Saving...' : isVisible ? 'Showing' : 'Hidden'}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No products found.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Owner Login</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">Change admin email or password</h3>
          <p className="mt-2 text-sm leading-6 text-amber-200">
            After changing email, update Vercel owner email env values to the same email.
          </p>
        </div>
        <form onSubmit={saveCredentials} className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Admin Email</span>
            <input
              type="email"
              value={credentials.email}
              onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
              className="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Current Password</span>
            <input
              type="password"
              value={credentials.currentPassword}
              onChange={(event) => setCredentials((prev) => ({ ...prev, currentPassword: event.target.value }))}
              className="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">New Password</span>
            <input
              type="password"
              value={credentials.newPassword}
              onChange={(event) => setCredentials((prev) => ({ ...prev, newPassword: event.target.value }))}
              className="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
              minLength={6}
            />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving || !credentials.currentPassword}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save Login
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default AdminWebsiteControl;
