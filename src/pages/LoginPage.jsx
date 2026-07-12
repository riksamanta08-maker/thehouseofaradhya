import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { Mail, Lock, Eye, EyeOff, LogIn, Phone, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { setupRecaptcha, signInWithPhone } from '../lib/firebase';

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

const formatPhoneForFirebase = (value) => {
    const trimmed = String(value || '').trim().replace(/[\s-]/g, '');
    if (/^[6-9]\d{9}$/.test(trimmed)) {
        return `+91${trimmed}`;
    }
    return trimmed;
};

const getPhoneAuthErrorMessage = (err) => {
    if (err?.code === 'auth/operation-not-allowed') {
        return 'Phone OTP login is not enabled in Firebase. Please enable the Phone sign-in provider for this Firebase project.';
    }
    if (err?.code === 'auth/unauthorized-domain') {
        return 'This website domain is not authorized in Firebase Authentication.';
    }
    if (err?.code === 'auth/captcha-check-failed') {
        return 'OTP security check failed because this website domain is not authorized in Firebase. Please add the domain in Firebase Authentication settings.';
    }
    if (err?.code === 'auth/invalid-phone-number') {
        return 'Please enter a valid mobile number with country code, e.g. +919876543210.';
    }
    if (err?.code === 'auth/too-many-requests') {
        return 'Too many OTP attempts. Please wait a while and try again.';
    }
    return err?.message || 'Failed to send OTP. Please check your number and try again.';
};

const LoginPage = () => {
    // Mode states: 'password' or 'otp'
    const [loginMode, setLoginMode] = useState('otp');
    
    // Password Login states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Phone OTP Login states
    const [phone, setPhone] = useState('');
    const [otpStep, setOtpStep] = useState(1); // 1 = enter phone, 2 = enter OTP
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [timer, setTimer] = useState(0);
    
    // Status/Error states
    const [localError, setLocalError] = useState('');
    const [localLoading, setLocalLoading] = useState(false);

    const otpRefs = useRef([]);
    const timerRef = useRef(null);

    const { login, loginWithGoogle, loginWithFirebasePhone, canUseGoogleAuth, loading: authLoading, error } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    const redirectPath = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const redirect = params.get('redirect');
        if (!redirect || !redirect.startsWith('/')) return '/profile';
        return redirect;
    }, [location.search]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // Countdown Timer logic
    const startCountdown = () => {
        setTimer(60);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // Password Login Submit
    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        const normalizedEmail = email.trim();

        if (!normalizedEmail || !password) {
            setLocalError('Please fill in all fields');
            return;
        }

        const result = await login(normalizedEmail, password);
        if (result.success) {
            navigate(redirectPath, { replace: true });
        }
    };

    // Google Sign In
    const handleGoogleSignIn = useCallback(async () => {
        setLocalError('');
        const result = await loginWithGoogle();
        if (result.success) {
            navigate(redirectPath, { replace: true });
        } else if (result.error) {
            setLocalError(result.error);
        }
    }, [loginWithGoogle, navigate, redirectPath]);

    // Send OTP SMS trigger
    const handleSendOtp = async (e) => {
        if (e) e.preventDefault();
        setLocalError('');
        setLocalLoading(true);

        const formattedPhone = formatPhoneForFirebase(phone);
        // Indian phone validation check as default helper
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!formattedPhone || !phoneRegex.test(formattedPhone)) {
            setLocalError('Please enter a valid phone number with country code (e.g. +919876543210)');
            setLocalLoading(false);
            return;
        }

        try {
            // Set up Recaptcha container
            const appVerifier = await setupRecaptcha('recaptcha-container');
            if (!appVerifier) {
                throw new Error('reCAPTCHA failed to initialize');
            }

            // Send SMS OTP
            const confirmResult = await signInWithPhone(formattedPhone, appVerifier);
            setConfirmationResult(confirmResult);
            setPhone(formattedPhone);
            setOtpStep(2);
            startCountdown();
            setOtp(['', '', '', '', '', '']);
            // Auto focus first OTP input box
            setTimeout(() => {
                otpRefs.current[0]?.focus();
            }, 300);
        } catch (err) {
            console.error('Error sending OTP', err);
            setLocalError(getPhoneAuthErrorMessage(err));
            
            // Reset recaptcha verifier
            if (window.recaptchaVerifier) {
                try {
                    window.recaptchaVerifier.clear();
                    window.recaptchaVerifier = null;
                } catch (e) {
                    console.error(e);
                }
            }
        } finally {
            setLocalLoading(false);
        }
    };

    // Verify OTP and complete login
    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLocalError('');
        setLocalLoading(true);

        const code = otp.join('');
        if (code.length < 6) {
            setLocalError('Please enter the 6-digit OTP code');
            setLocalLoading(false);
            return;
        }

        try {
            if (!confirmationResult) {
                throw new Error('No active authentication request. Please click Resend.');
            }

            // Confirm OTP with Firebase
            const firebaseResult = await confirmationResult.confirm(code);
            const idToken = await firebaseResult.user.getIdToken(true);
            const name = firebaseResult.user.displayName || '';

            // Verify with our own backend
            const backendResult = await loginWithFirebasePhone(idToken, name);
            if (backendResult.success) {
                navigate(redirectPath, { replace: true });
            } else {
                setLocalError(backendResult.error || 'Server login sync failed.');
            }
        } catch (err) {
            console.error('Error verifying OTP', err);
            setLocalError(
                err.code === 'auth/invalid-verification-code'
                    ? 'The OTP code is incorrect. Please try again.'
                    : err.message || 'OTP verification failed. Please try again.'
            );
        } finally {
            setLocalLoading(false);
        }
    };

    // Handle single OTP digit change
    const handleOtpChange = (val, index) => {
        // Only accept numbers
        if (val && isNaN(val)) return;

        const newOtp = [...otp];
        newOtp[index] = val.slice(-1); // Take only the last digit
        setOtp(newOtp);

        // Auto focus next box
        if (val !== '' && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    // Handle OTP backspace backrouting
    const handleOtpKeyDown = (e, index) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    // Handle OTP Clipboard Paste
    const handleOtpPaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newOtp = pasted.split('');
            setOtp(newOtp);
            otpRefs.current[5]?.focus();
        }
    };

    const isSubmitting = authLoading || localLoading;

    return (
        <div className="min-h-screen pt-32 pb-16 site-shell flex flex-col items-center">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold mb-2">Welcome Back</h1>
                    <p className="text-gray-600">Access your premium wardrobe collection</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                    {/* Error Display */}
                    {(localError || error) && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                            {localError || error}
                        </div>
                    )}

                    {/* Google Login Trigger */}
                    {otpStep === 1 && (
                        <>
                            <button
                                type="button"
                                onClick={handleGoogleSignIn}
                                disabled={isSubmitting || !canUseGoogleAuth}
                                className="w-full border border-gray-300 bg-white text-gray-900 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                                <GoogleIcon />
                                <span>
                                    {isSubmitting
                                        ? 'Please wait...'
                                        : canUseGoogleAuth
                                            ? 'Continue with Google'
                                            : 'Google sign-in unavailable'}
                                </span>
                            </button>

                            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-gray-400">
                                <span className="h-px flex-1 bg-gray-200" />
                                <span>or</span>
                                <span className="h-px flex-1 bg-gray-200" />
                            </div>
                        </>
                    )}

                    {/* Mode Toggle Switch */}
                    {otpStep === 1 && (
                        <div className="mb-6 bg-gray-100 p-1 rounded-xl flex gap-1 border border-gray-200">
                            <button
                                type="button"
                                onClick={() => { setLoginMode('otp'); setLocalError(''); }}
                                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                                    loginMode === 'otp'
                                        ? 'bg-black text-white shadow-sm'
                                        : 'text-gray-500 hover:text-black'
                                }`}
                            >
                                Phone OTP Login
                            </button>
                            <button
                                type="button"
                                onClick={() => { setLoginMode('password'); setLocalError(''); }}
                                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                                    loginMode === 'password'
                                        ? 'bg-black text-white shadow-sm'
                                        : 'text-gray-500 hover:text-black'
                                }`}
                            >
                                Password Login
                            </button>
                        </div>
                    )}

                    {/* Invisible ReCAPTCHA Container */}
                    <div id="recaptcha-container" className="hidden" />

                    {/* Form Layouts */}
                    {loginMode === 'password' && (
                        <form onSubmit={handlePasswordSubmit}>
                            <div className="mb-6">
                                <label className="block text-sm font-semibold mb-2 text-gray-700">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                        placeholder="you@example.com"
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-semibold mb-2 text-gray-700">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                        placeholder="••••••••"
                                        disabled={isSubmitting}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                                {isSubmitting ? (
                                    <span>Signing in...</span>
                                ) : (
                                    <>
                                        <LogIn className="w-5 h-5" />
                                        <span>Sign In</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {loginMode === 'otp' && (
                        <div>
                            {/* Step 1: Input Phone Number */}
                            {otpStep === 1 && (
                                <form onSubmit={handleSendOtp}>
                                    <div className="mb-6">
                                        <label className="block text-sm font-semibold mb-2 text-gray-700">Mobile Number</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-black focus:border-black transition-colors"
                                                placeholder="+919876543210"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">Include country code (e.g. +91 for India)</p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                        {isSubmitting ? (
                                            <span className="flex items-center gap-2">
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Sending SMS OTP...
                                            </span>
                                        ) : (
                                            <>
                                                <ShieldCheck className="w-5 h-5" />
                                                <span>Get Login OTP</span>
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}

                            {/* Step 2: Input OTP Verification Code */}
                            {otpStep === 2 && (
                                <form onSubmit={handleVerifyOtp}>
                                    <div className="mb-2 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setOtpStep(1)}
                                            className="text-gray-500 hover:text-black transition-colors flex items-center gap-1 text-sm font-semibold cursor-pointer"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            Change Number
                                        </button>
                                    </div>

                                    <div className="mb-6 text-center">
                                        <p className="text-sm text-gray-600">
                                            We sent a verification code to <span className="font-bold text-black">{phone}</span>
                                        </p>
                                    </div>

                                    <div className="mb-6">
                                        <label className="block text-sm font-semibold mb-3 text-center text-gray-700">
                                            Enter 6-Digit Passcode
                                        </label>
                                        
                                        {/* Luxury individual code boxes */}
                                        <div className="flex justify-between gap-2 max-w-xs mx-auto" onPaste={handleOtpPaste}>
                                            {otp.map((digit, idx) => (
                                                <input
                                                    key={idx}
                                                    ref={(el) => (otpRefs.current[idx] = el)}
                                                    type="text"
                                                    maxLength="1"
                                                    value={digit}
                                                    onChange={(e) => handleOtpChange(e.target.value, idx)}
                                                    onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                                                    className="w-11 h-12 text-center text-xl font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-black focus:border-black transition-all bg-gray-50"
                                                    disabled={isSubmitting}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting || otp.join('').length < 6}
                                        className="w-full bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                        {isSubmitting ? (
                                            <span className="flex items-center gap-2">
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Verifying OTP...
                                            </span>
                                        ) : (
                                            <span>Verify & Login</span>
                                        )}
                                    </button>

                                    {/* Timer and Resend Actions */}
                                    <div className="mt-6 text-center text-sm text-gray-500">
                                        {timer > 0 ? (
                                            <p>Resend OTP SMS in <span className="font-bold text-black">{timer}s</span></p>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleSendOtp}
                                                disabled={isSubmitting}
                                                className="text-black font-bold hover:underline cursor-pointer disabled:opacity-50"
                                            >
                                                Resend OTP Code
                                            </button>
                                        )}
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Registration Redirect */}
                    <div className="mt-8 text-center text-sm text-gray-600">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-black font-bold hover:underline">
                            Create one
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
