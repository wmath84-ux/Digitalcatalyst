import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WebsiteSettings } from '../../App';
import UserAvatar from '../common/UserAvatar';
import { RememberedAuthAccount } from '../../utils/rememberedAuth';

type AuthMode = 'login' | 'signup';

type AuthResult = { success: boolean; message: string };

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
    onBack: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ settings, initialMode = 'login', rememberedAccount, onForgetRememberedAccount, onGoogleLogin, onEmailLogin, onEmailSignup, onPasswordReset, onBack }) => {
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const passwordInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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
        try {
            const result = await onGoogleLogin();
            if (!result.success) setError(result.message);
            else if (result.message) setSuccess(result.message);
        } finally {
            setIsGoogleLoading(false);
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
        try {
            const result = mode === 'login'
                ? await onEmailLogin(email.trim().toLowerCase(), password)
                : await onEmailSignup({ name: name.trim(), email: email.trim().toLowerCase(), mobile: normalizedMobile }, password);
            if (!result.success) setError(result.message);
            else if (result.message) setSuccess(result.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = async () => {
        setError('');
        setSuccess('');
        setMode('login');
        setIsSubmitting(true);
        try {
            const result = await onPasswordReset(email);
            if (result.success) setSuccess(result.message);
            else setError(result.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-start justify-center overflow-y-auto bg-white px-3 pb-6 pt-16 text-slate-950 sm:items-center sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92),rgba(255,255,255,0.96))]" />
            <button onClick={onBack} className="absolute left-3 top-3 z-10 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-xl hover:text-slate-950 sm:left-5 sm:top-5 sm:px-4">&larr; Back</button>

            <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-10 lg:p-12">
                    <div className="mb-5 sm:mb-8">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary sm:text-sm sm:tracking-[0.25em]">{settings.content.siteName}</p>
                        <h2 className="mt-2 text-2xl font-black sm:text-3xl">{mode === 'login' ? 'Login' : 'Create your account'}</h2>
                        <p className="text-slate-700 mt-2">{mode === 'login' ? 'Welcome back. Login to restore your purchases and learning progress.' : 'We will use your name for reviews, email for receipts, and mobile for account support.'}</p>
                    </div>

                    <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                        <button type="button" onClick={() => handleModeChange('login')} className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${mode === 'login' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>Login</button>
                        <button type="button" onClick={() => handleModeChange('signup')} className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${mode === 'signup' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>Sign up</button>
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
                            <button type="button" onClick={handleRememberedContinue} disabled={isSubmitting || isGoogleLoading} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 px-5 py-3 font-black text-white shadow-[0_14px_34px_rgba(30,64,175,0.18)] disabled:cursor-not-allowed disabled:opacity-70">
                                {rememberedAccount.authProvider === 'google' || rememberedAccount.providerIds?.includes('google.com') ? (isGoogleLoading ? 'Opening Google...' : 'Continue with this account') : 'Continue with email'}
                            </button>
                            <button type="button" onClick={handleUseAnotherAccount} className="mt-3 w-full text-sm font-black text-slate-500 hover:text-blue-800">Not you? Use another account</button>
                        </div>
                    )}

                    <button type="button" onClick={handleGoogleSubmit} disabled={isSubmitting || isGoogleLoading} className="mb-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-black text-slate-800 shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_44px_rgba(37,99,235,0.14)] disabled:cursor-not-allowed disabled:opacity-70">
                        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                        </svg>
                        {isGoogleLoading ? 'Opening Google...' : 'Continue with Google'}
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
                            <input ref={passwordInputRef} type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-blue-700 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:py-3" placeholder="Enter password" />
                        </label>
                        {mode === 'login' && (
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
                        <button type="submit" disabled={isSubmitting || isGoogleLoading} className="w-full rounded-2xl bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 px-6 py-3.5 font-black text-white shadow-[0_14px_34px_rgba(30,64,175,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70 sm:px-8 sm:py-4">{isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login to learning store' : 'Create account'}</button>
                    </form>
                    <p className="mt-5 text-xs text-slate-700 text-center">Firebase Auth secures this session; purchases restore from your account after login.</p>
            </div>
        </div>
    );
};

export default AuthPage;
