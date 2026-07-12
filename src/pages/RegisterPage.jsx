import React, { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { Mail, Lock, Eye, EyeOff, User, UserPlus } from 'lucide-react';

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5">
        <path
            fill="#EA4335"
            d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3.1l3 2.3c1.8-1.6 2.8-4.1 2.8-7 0-.7-.1-1.5-.2-2.2H12z"
        />
        <path
            fill="#34A853"
            d="M12 22c2.6 0 4.8-.9 6.4-2.5l-3-2.3c-.8.5-1.9.9-3.3.9-2.5 0-4.6-1.7-5.3-4H3.7v2.4C5.3 19.8 8.4 22 12 22z"
        />
        <path
            fill="#4A90E2"
            d="M6.7 14.1c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V8.3H3.7A9.8 9.8 0 0 0 2.6 12c0 1.6.4 3.2 1.1 4.6l3-2.5z"
        />
        <path
            fill="#FBBC05"
            d="M12 6.5c1.4 0 2.6.5 3.5 1.4l2.6-2.6C16.8 4 14.6 3 12 3 8.4 3 5.3 5.2 3.7 8.3l3 2.4c.7-2.3 2.8-4.2 5.3-4.2z"
        />
    </svg>
);

const RegisterPage = () => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const { register, loginWithGoogle, canUseGoogleAuth, loading, error } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectPath = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const redirect = params.get('redirect');
        if (!redirect || !redirect.startsWith('/')) return '/profile';
        return redirect;
    }, [location.search]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        setSuccessMessage('');

        const { firstName, lastName, email, password, confirmPassword } = formData;
        const normalizedEmail = email.trim();
        const normalizedFirst = firstName.trim();
        const normalizedLast = lastName.trim();

        if (!normalizedFirst || !normalizedLast || !normalizedEmail || !password) {
            setLocalError('Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setLocalError('Password must be at least 6 characters');
            return;
        }

        const result = await register({
            firstName: normalizedFirst,
            lastName: normalizedLast,
            email: normalizedEmail,
            password,
        });
        if (result.success) {
            setFormData({
                firstName: '',
                lastName: '',
                email: '',
                password: '',
                confirmPassword: '',
            });
            setSuccessMessage('Account created. You can sign in now.');
        }
    };

    const handleGoogleSignIn = useCallback(async () => {
        setLocalError('');
        setSuccessMessage('');
        const result = await loginWithGoogle();
        if (result.success) {
            navigate(redirectPath, { replace: true });
        } else if (result.error) {
            setLocalError(result.error);
        }
    }, [loginWithGoogle, navigate, redirectPath]);

    return (
        <div className="min-h-screen pt-32 pb-16 site-shell flex flex-col items-center">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold mb-2">Create Account</h1>
                    <p className="text-gray-600">Join us to start shopping</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
                    {successMessage && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                            {successMessage}
                        </div>
                    )}
                    {(localError || error) && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {localError || error}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loading || !canUseGoogleAuth}
                        className="w-full mb-6 border border-gray-300 bg-white text-gray-900 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <GoogleIcon />
                        <span>
                            {loading
                                ? 'Please wait...'
                                : canUseGoogleAuth
                                    ? 'Continue with Google'
                                    : 'Google sign-in unavailable'}
                        </span>
                    </button>
                    <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-gray-400">
                        <span className="h-px flex-1 bg-gray-200" />
                        <span>or</span>
                        <span className="h-px flex-1 bg-gray-200" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium mb-2">First Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                    placeholder="John"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Last Name</label>
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                placeholder="Doe"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                placeholder="you@example.com"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">Confirm Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? (
                            <span>Creating account...</span>
                        ) : (
                            <>
                                <UserPlus className="w-5 h-5" />
                                <span>Create Account</span>
                            </>
                        )}
                    </button>

                    <div className="mt-6 text-center text-sm text-gray-600">
                        Already have an account?{' '}
                        <Link to="/login" className="text-black font-bold hover:underline">
                            Sign in
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RegisterPage;
