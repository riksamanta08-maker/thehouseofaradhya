import React from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/admin-auth-context';
import { AdminToastProvider } from '../../components/admin/AdminToaster';
import {
  LayoutDashboard,
  Package,
  Sparkles,
  Layers,
  ShoppingBag,
  BadgePercent,
  Star,
  Users,
  LogOut,
  Settings
} from 'lucide-react';

const AdminLayout = () => {
  const { admin, isAuthenticated, loading, logout } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.35em] text-slate-400">Loading admin...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  const navItemClass = ({ isActive }) =>
    `group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${isActive
      ? 'bg-gradient-to-r from-blue-600/20 to-transparent text-blue-400 border-l-2 border-blue-500 shadow-[inset_0px_1px_rgba(255,255,255,0.05)]'
      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-l-2 border-transparent'
    }`;

  return (
    <AdminToastProvider>
      <div className="min-h-screen bg-[#0a0f1c] text-slate-100 flex font-sans selection:bg-blue-500/30">
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 w-72 bg-[#0d1323] border-r border-slate-800/60 shadow-2xl flex flex-col">
          {/* Header Logo */}
          <div className="flex items-center gap-3 px-8 py-8 border-b border-slate-800/40">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-xl font-bold tracking-tighter text-white">AS</span>
            </div>
            <div>
              <h1 className="text-[17px] font-bold text-white tracking-tight">Aradhya Studio</h1>
              <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-blue-400 mt-0.5">Admin Console</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-6 px-4 no-scrollbar">
            <div className="mb-3 px-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Overview</p>
            </div>
            <nav className="flex flex-col gap-1 mb-8">
              <NavLink to="/admin" end className={navItemClass}>
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </NavLink>
            </nav>

            <div className="mb-3 px-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Management</p>
            </div>
            <nav className="flex flex-col gap-1">
              <NavLink to="/admin/products" className={navItemClass}>
                <Package className="w-5 h-5" />
                <span>Products</span>
              </NavLink>
              <NavLink to="/admin/homepage-sections" className={navItemClass}>
                <Sparkles className="w-5 h-5" />
                <span>Homepage Sections</span>
              </NavLink>
              <NavLink to="/admin/collections" className={navItemClass}>
                <Layers className="w-5 h-5" />
                <span>Collections</span>
              </NavLink>
              <NavLink to="/admin/orders" className={navItemClass}>
                <ShoppingBag className="w-5 h-5" />
                <span>Orders</span>
              </NavLink>
              <NavLink to="/admin/discounts" className={navItemClass}>
                <BadgePercent className="w-5 h-5" />
                <span>Discounts</span>
              </NavLink>
              <NavLink to="/admin/reviews" className={navItemClass}>
                <Star className="w-5 h-5" />
                <span>Reviews</span>
              </NavLink>
              <NavLink to="/admin/users" className={navItemClass}>
                <Users className="w-5 h-5" />
                <span>Users</span>
              </NavLink>
              <NavLink to="/admin/settings" className={navItemClass}>
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </NavLink>
            </nav>
          </div>

          {/* User Profile / Logout footer */}
          <div className="p-6 border-t border-slate-800/40 bg-[#0a0f1c]/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                <span className="text-sm font-bold text-slate-300">{admin?.email?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-medium text-slate-200 truncate">{admin?.email}</p>
                <p className="text-[10px] text-slate-500">Administrator</p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-600 transition-all group"
            >
              <LogOut className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 ml-72 bg-[#0a0f1c] min-h-screen flex flex-col">
          {/* Topbar sticky */}
          <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-5 border-b border-slate-800/60 bg-[#0a0f1c]/80 backdrop-blur-xl">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Commerce Control</h2>
              <p className="text-xs text-slate-400 mt-1">Manage your platform and track performance.</p>
            </div>
            <div className="flex items-center gap-4">
              <NavLink
                to="/admin/settings"
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </NavLink>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-8 flex-1 overflow-y-auto">
            <div className="max-w-[1600px] mx-auto">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </AdminToastProvider>
  );
};

export default AdminLayout;
