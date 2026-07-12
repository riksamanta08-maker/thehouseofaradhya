import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { useAdminAuth } from '../../contexts/admin-auth-context';

const AdminLogin = () => {
  const { login, loading, error } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');

    if (!email.trim() || !password) {
      setLocalError('Enter both email and password.');
      return;
    }

    const result = await login(email.trim(), password);
    if (result.success) {
      const redirect = location.state?.from || '/admin/orders';
      navigate(redirect, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admin Access</p>
        <h1 className="text-2xl font-bold text-white mt-3">Sign in to manage commerce</h1>
        <p className="text-sm text-slate-400 mt-2">
          Use your admin credentials to access the full admin workspace.
        </p>

        {(localError || error) && (
          <div className="mt-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {localError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Email</label>
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-10 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="admin@brand.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Password</label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-10 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-400 text-slate-950 font-semibold py-3 text-sm uppercase tracking-[0.25em] hover:bg-emerald-300 transition disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Enter Studio'}
          </button>
        </form>

        <div className="mt-6 text-xs text-slate-500">
          Need an admin account? Run the `create:admin` script from the backend.
        </div>

        <Link to="/" className="mt-4 inline-flex text-xs text-slate-400 hover:text-slate-200">
          Back to storefront
        </Link>
      </div>
    </div>
  );
};

export default AdminLogin;
