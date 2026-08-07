import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WebsiteSettings } from '../../App';
import UserAvatar from '../common/UserAvatar';
import { RememberedAuthAccount } from '../../utils/rememberedAuth';
import LiquidMetalButton from '../ui/LiquidMetalButton';

type AuthMode = 'login' | 'signup' | 'admin';

type AuthResult = { success: boolean; message: string };

type AuthBusyState = { title: string; subtitle?: string } | null;

const AuthLoadingOverlay: React.FC<AuthBusyState> = ({ title, subtitle }) => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/92 p-6 backdrop-blur-[6px]" role="status" aria-live="polite" aria-label={title}>
        <div className="flex w-full max-w-sm flex-col items-center gap-7 rounded-[2rem] border border-slate-200/80 bg-white/98 px-8 py-11 text-center shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
            <div className="relative h-24 w-24">
                <span className="absolute inset-0 rounded-full border-4 border-slate-100" />
                <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-600" style={{ animationDuration: '0.9s' }} />
                <span className="absolute inset-2.5 animate-spin rounded-full border-4 border-transparent border-b-emerald-500 border-l-indigo-500" style={{ animationDuration: '1.3s', animationDirection: 'reverse' }} />
                <span className="absolute inset-0 grid place-items-center">
                    <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-emerald-500 shadow-[0_0_20px_rgba(99,102,241,0.65)]" />
                </span>
            </div>
            <div>
                <p className="text-xl font-black tracking-tight text-slate-900">{title}</p>
                {subtitle ? <p className="mt-2 text-sm font-semibold leading-5 text-slate-500">{subtitle}</p> : null}
                <div className="mt-5 flex items-center justify-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '120ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" style={{ animationDelay: '240ms' }} />
                </div>
            </div>
        </div>
    </div>
);

interface SignupProfile {
    name: string;
    email: string;
    mobile: string;
}

interface AuthPageProps {
    settings: WebsiteSettings;
    initialMode?: AuthMode;
    rememberedAccount?: RememberedAuthAccount | null;
    onForgetRememberedAccount: () => void;
    onGoogleLogin: () => Promise<AuthResult> | AuthResult;
    onEmailLogin: (email: string, password: string) => Promise<AuthResult> | AuthResult;
    onEmailSignup: (profile: SignupProfile, password: string) => Promise<AuthResult> | AuthResult;
    onPasswordReset: (email: string) => Promise<AuthResult> | AuthResult;
    onAdminGoogleLogin: () => Promise<AuthResult> | AuthResult;
    onAdminEmailLogin: (email: string, password: string) => Promise<AuthResult> | AuthResult;
    onBack: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ settings, initialMode = 'login', rememberedAccount, onForgetRememberedAccount, onGoogleLogin, onEmailLogin, onEmailSignup, onPasswordReset, onAdminGoogleLogin, onAdminEmailLogin, onBack }) => {
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const passwordInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [authBusy, setAuthBusy] = useState<AuthBusyState>(null);

    const normalizedMobile = useMemo(() => mobile.replace(/\D/g, '').slice(-10), [mobile]);
    const isValidEmail = /\S+@\S+\.\S+/.test(email);

    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);

    const handleModeChange = (nextMode: AuthMode) => {
        setMode(nextMode);
        setError('');
        setSuccess('');
        setPassword('');
    };


    const handleGoogleSubmit = async () => {
        setError('');
        setSuccess('');
        setIsGoogleLoading(true);
        setAuthBusy({ title: 'Loading Google account…', subtitle: "Opening Google's sign-in window. Please wait." });
        try {
            const result = mode === 'admin' ? await onAdminGoogleLogin() : await onGoogleLogin();
            if (!result.success) setError(result.message);
            else if (result.message) setSuccess(result.message);
        } finally {
            setIsGoogleLoading(false);
            setAuthBusy(null);
        }
    };


    const handleRememberedContinue = async () => {
        if (!rememberedAccount) return;
        setError('');
        setSuccess('');
        const isGoogleAccount = rememberedAccount.authProvider === 'google' || rememberedAccount.providerIds?.includes('google.com');
        if (isGoogleAccount) {
            await handleGoogleSubmit();
            return;
        }
        setMode('login');
        setEmail(rememberedAccount.email);
        window.setTimeout(() => passwordInputRef.current?.focus(), 0);
    };

    const handleUseAnotherAccount = () => {
        const rememberedEmail = rememberedAccount?.email;
        onForgetRememberedAccount();
        if (rememberedEmail && email.trim().toLowerCase() === rememberedEmail.toLowerCase()) setEmail('');
        setPassword('');
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!isValidEmail) {
            setError('Please enter a valid email address.');
            return;
        }
        if (!password) {
            setError('Please enter your password.');
            return;
        }
        if (mode === 'signup' && name.trim().length < 2) {
            setError('Please enter your full name.');
            return;
        }
        if (mode === 'signup' && normalizedMobile.length !== 10) {
            setError('Please enter a valid 10 digit mobile number.');
            return;
        }

        setIsSubmitting(true);
        setAuthBusy(mode === 'admin'
            ? { title: 'Logging into admin…', subtitle: 'Please wait while we verify your admin credentials.' }
            : mode === 'signup'
                ? { title: 'Creating your account…', subtitle: 'Please wait while we set up your new account.' }
                : { title: 'Logging you in…', subtitle: 'Please wait while we verify your credentials.' });
        try {
            if (mode === 'admin') {
                const result = await onAdminEmailLogin(email.trim().toLowerCase(), password);
                if (!result.success) setError(result.message);
                else if (result.message) setSuccess(result.message);
            } else {
                const result = mode === 'login'
                    ? await onEmailLogin(email.trim().toLowerCase(), password)
                    : await onEmailSignup({ name: name.trim(), email: email.trim().toLowerCase(), mobile: normalizedMobile }, password);
                if (!result.success) setError(result.message);
                else if (result.message) setSuccess(result.message);
            }
        } finally {
            setIsSubmitting(false);
            setAuthBusy(null);
        }
    };

    const handleForgotPassword = async () => {
        setError('');
        setSuccess('');
        setMode('login');
        setIsSubmitting(true);
        setAuthBusy({ title: 'Sending reset email…', subtitle: 'Please wait while we send the password reset email.' });
        try {
            const result = await onPasswordReset(email);
            if (result.success) setSuccess(result.message);
            else setError(result.message);
        } finally {
            setIsSubmitting(false);
            setAuthBusy(null);
        }
    };

    return (
        <div className="relative flex min-h-screen items-start justify-center overflow-y-auto bg-white px-3 pb-6 pt-16 text-slate-950 sm:items-center sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92),rgba(255,255,255,0.96))]" />
            <button onClick={onBack} className="absolute left-3 top-3 z-10 hidden rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-xl hover:text-slate-950 sm:left-5 sm:top-5 sm:inline-flex sm:px-4">&larr; Back</button>

            <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-10 lg:p-12">
                    <div className="mb-5 sm:mb-8">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary sm:text-sm sm:tracking-[0.25em]">{settings.content.siteName}</p>
                        <h2 className="mt-2 text-2xl font-black sm:text-3xl">{mode === 'login' ? 'Login' : mode === 'signup' ? 'Create your account' : 'Admin Login'}</h2>
                        <p className="text-slate-700 mt-2">{mode === 'login' ? 'Welcome back. Login to restore your purchases and learning progress.' : mode === 'signup' ? 'We will use your name for reviews, email for receipts, and mobile for account support.' : 'Sign in with admin credentials to access the dashboard.'}</p>
                    </div>

                    <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                        <button type="button" onClick={() => handleModeChange('login')} className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${mode === 'login' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>Login</button>
                        <button type="button" onClick={() => handleModeChange('signup')} className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${mode === 'signup' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>Sign up</button>
                        <button type="button" onClick={() => handleModeChange('admin')} className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${mode === 'admin' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>Admin</button>
                    </div>

                    {rememberedAccount && (
                        <div className="mb-5 rounded-[1.5rem] border border-blue-100 bg-gradient-to-br from-white via-blue-50/80 to-indigo-50/70 p-4 shadow-[0_18px_50px_rgba(37,99,235,0.10)]">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Continue as</p>
                            <div className="mt-3 flex items-center gap-3">
                                <UserAvatar name={rememberedAccount.name} email={rememberedAccount.email} photoURL={rememberedAccount.photoURL} size={48} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-base font-black text-slate-950">{rememberedAccount.name || rememberedAccount.email.split('@')[0]}</p>
                                    <p className="truncate text-sm font-semibold text-slate-600">{rememberedAccount.email}</p>
                                </div>
                            </div>
                            <button type="button" onClick={handleRememberedContinue} disabled={isSubmitting || isGoogleLoading} className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 px-5 py-3 font-black text-white shadow-[0_14px_34px_rgba(30,64,175,0.18)] disabled:cursor-not-allowed disabled:opacity-70">
                                {rememberedAccount.authProvider === 'google' || rememberedAccount.providerIds?.includes('google.com') ? (
                                    isGoogleLoading ? (
                                        <>
                                            <svg aria-hidden="true" className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            <span>Loading Google account…</span>
                                        </>
                                    ) : 'Continue with Google account'
                                ) : 'Continue with email'}
                            </button>
                            <button type="button" onClick={handleUseAnotherAccount} className="mt-3 w-full text-sm font-black text-slate-500 hover:text-blue-800">Not you? Use another account</button>
                        </div>
                    )}

                    <button type="button" onClick={handleGoogleSubmit} disabled={isSubmitting || isGoogleLoading} className="mb-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-black text-slate-800 shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_44px_rgba(37,99,235,0.14)] disabled:cursor-not-allowed disabled:opacity-70">
                        {isGoogleLoading ? (
                            <svg aria-hidden="true" className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                            </svg>
                        )}
                        {isGoogleLoading ? 'Loading Google account…' : mode === 'admin' ? 'Admin login with Google' : mode === 'login' ? 'Login with Google' : 'Continue with Google'}
                    </button>
                    <div className="mb-5 flex items-center gap-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        <span className="h-px flex-1 bg-slate-200" />
                        <span>or continue with email</span>
                        <span className="h-px flex-1 bg-slate-200" />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                        {mode === 'signup' && (
                            <label className="block">
                                <span className="text-sm font-bold text-slate-700">Full name</span>
                                <input value={name} onChange={e => setName(e.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-blue-700 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:py-3" placeholder="Your name" />
                            </label>
                        )}
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">Email address</span>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-blue-700 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:py-3" placeholder="you@example.com" />
                        </label>
                        {mode === 'signup' && (
                            <label className="block">
                                <span className="text-sm font-bold text-slate-700">Mobile number</span>
                                <div className="mt-2 flex overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-blue-700 focus-within:ring-4 focus-within:ring-blue-100">
                                    <span className="bg-slate-100 px-3 py-2.5 font-bold text-slate-700 sm:px-4 sm:py-3">+91</span>
                                    <input value={mobile} onChange={e => setMobile(e.target.value)} required className="w-full bg-transparent px-4 py-2.5 outline-none sm:py-3" placeholder="10 digit mobile" inputMode="numeric" />
                                </div>
                            </label>
                        )}
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">Password</span>
                            <div className="relative mt-2">
                                <input ref={passwordInputRef} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 pr-12 outline-none focus:border-blue-700 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:py-3" placeholder="Enter password" />
                                <button type="button" tabIndex={-1} onClick={() => setShowPassword(prev => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                    {showPassword ? (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.507 10.066 7.507.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    )}
                                </button>
                            </div>
                        </label>
                        {mode === 'login' && (
                            <div className="flex justify-end">
                                <button type="button" onClick={handleForgotPassword} disabled={isSubmitting || isGoogleLoading} className="text-sm font-bold text-blue-800 hover:text-blue-950 disabled:cursor-not-allowed disabled:opacity-60">Forgot password?</button>
                            </div>
                        )}
                        {mode === 'admin' && (
                            <div className="flex justify-end">
                                <button type="button" onClick={handleForgotPassword} disabled={isSubmitting || isGoogleLoading} className="text-sm font-bold text-blue-800 hover:text-blue-950 disabled:cursor-not-allowed disabled:opacity-60">Forgot password?</button>
                            </div>
                        )}
                        {success && (
                            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                                <p>{success}</p>
                                {mode === 'login' && <p className="mt-1 font-semibold">Check your Inbox, Spam, or Promotions folder.</p>}
                            </div>
                        )}
                        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}
                        <LiquidMetalButton tone="dark" type="submit" disabled={isSubmitting || isGoogleLoading} className="w-full rounded-2xl px-6 py-3.5 font-black disabled:cursor-not-allowed disabled:opacity-70 sm:px-8 sm:py-4">{isSubmitting ? 'Please wait...' : mode === 'admin' ? 'Login to admin dashboard' : mode === 'login' ? 'Login to learning store' : 'Create account'}</LiquidMetalButton>
                    </form>
                    <p className="mt-5 text-xs text-slate-700 text-center">Firebase Auth secures this session; purchases restore from your account after login.</p>
            </div>
            {authBusy && <AuthLoadingOverlay {...authBusy} />}
        </div>
    );
};

export default AuthPage;
