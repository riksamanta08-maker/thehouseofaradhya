import React from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../../contexts/admin-auth-context';

const AdminSettings = () => {
  const { admin } = useAdminAuth();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-slate-400">View admin account settings and console access details.</p>
      </div>

      <section className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Admin Account</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{admin?.email}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              This page stays available to every administrator. Private website controls are kept on a separate owner page.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-[#0d1323] p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Access Level</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{admin?.role || 'ADMIN'}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              Your account can manage commerce data according to its assigned admin permissions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminSettings;
