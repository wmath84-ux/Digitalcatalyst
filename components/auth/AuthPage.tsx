import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WebsiteSettings } from '../../App';
import UserAvatar from '../common/UserAvatar';
import { RememberedAuthAccount } from '../../utils/rememberedAuth';

type AuthMode = 'login' | 'signup' | 'admin';

type AuthResult = { success: boolean; message: string };

type AuthBusyState = { title: string; subtitle?: string } | null;

const AuthLoadingOverlay: React.FC<AuthBusyState> = ({ title, subtitle }) => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/90 p-6 backdrop-blur-[4px]" role="status" aria-live="polite" aria-label={title}>
        <div className="flex w-full max-w-[360px] flex-col items-center gap-6 rounded-[24px] border border-[#E5E7EB] bg-white px-8 py-10 text-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <div className="relative h-20 w-20">
                <span className="absolute inset-0 rounded-full border-[3px] border-[#F3F4F6]" />
                <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-black border-r-black" style={{ animationDuration: '0.9s' }} />
                <span className="absolute inset-0 grid place-items-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-black" />
                </span>
            </div>
            <div>
                <p className="text-[18px] font-black tracking-tight text-black">{title}</p>
                {subtitle ? <p className="mt-2 text-[13px] font-medium leading-5 text-[#6B7280]">{subtitle}</p> : null}
                <div className="mt-4 flex items-center justify-center gap-1">
                    <span className="h-1 w-8 rounded-full bg-black/20" />
                    <span className="h-1 w-2 rounded-full bg-black/60" />
                    <span className="h-1 w-2 rounded-full bg-black/30" />
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
        setAuthBusy({ title: 'Opening Google…', subtitle: "Secure Google sign-in. Please wait momentarily." });
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
            ? { title: 'Verifying admin…', subtitle: 'Checking secure admin credentials.' }
            : mode === 'signup'
                ? { title: 'Creating account…', subtitle: 'Setting up your secure workspace.' }
                : { title: 'Signing you in…', subtitle: 'Verifying your credentials securely.' });
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
        setAuthBusy({ title: 'Sending reset link…', subtitle: 'Please wait.' });
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
        <div className="relative flex min-h-screen flex-col items-center justify-start bg-[#FFFFFF] px-4 pb-10 pt-6 text-black sm:justify-center sm:px-6 sm:py-10">
            {/* Subtle trusted background */}
            <div className="pointer-events-none absolute inset-0 bg-[#FAFAFA]" />
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-[#0B63FF] via-[#111111] to-[#0B63FF]" />

            {/* Back button - trusted black */}
            <button onClick={onBack} className="absolute left-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-[13px] font-bold text-black shadow-sm hover:bg-[#F9FAFB] sm:left-6 sm:top-6">
                <span className="text-[14px]">←</span>
                <span className="hidden sm:inline">Back to store</span>
                <span className="sm:hidden">Back</span>
            </button>

            <div className="relative z-10 w-full max-w-[440px]">
                {/* Trust header */}
                <div className="mb-6 flex items-center justify-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white text-[14px]">🔒</span>
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6B7280]">Secure • Encrypted • Trusted by 10k+ learners</span>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-[#E5E7EB] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
                    {/* Card top accent */}
                    <div className="h-[3px] w-full bg-gradient-to-r from-black via-[#0B63FF] to-black" />

                    <div className="p-6 sm:p-8">
                        <div className="mb-6">
                            <div className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-black text-white font-black text-[13px]">DC</div>
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#111111]">{settings.content.siteName || 'Digital Catalyst'}</p>
                                <span className="ml-auto flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 text-[10px] font-bold text-[#111]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#0B63FF]" /> Verified Store
                                </span>
                            </div>
                            <h1 className="mt-4 text-[26px] font-black leading-[1.1] tracking-tight text-black sm:text-[28px]">
                                {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Admin access'}
                            </h1>
                            <p className="mt-2 text-[13px] font-medium leading-6 text-[#6B7280]">
                                {mode === 'login' ? 'Trusted login. Your purchases and progress restore securely after sign-in.' : mode === 'signup' ? 'Join with name, email and mobile. Firebase secures every session end-to-end.' : 'Secure admin sign-in. Only verified admin accounts can access dashboard.'}
                            </p>
                        </div>

                        <div className="mb-6 grid grid-cols-3 gap-1 rounded-full bg-[#F3F4F6] p-1">
                            {(['login','signup','admin'] as const).map(m => (
                                <button key={m} type="button" onClick={() => handleModeChange(m)} className={`rounded-full px-3 py-2 text-[13px] font-bold capitalize transition-all ${mode === m ? 'bg-black text-white shadow-sm' : 'text-[#6B7280] hover:text-black'}`}>{m === 'login' ? 'Login' : m === 'signup' ? 'Sign up' : 'Admin'}</button>
                            ))}
                        </div>

                        {rememberedAccount && (
                            <div className="mb-5 rounded-[16px] border border-[#E5E7EB] bg-[#FAFAFA] p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6B7280]">Continue as</p>
                                <div className="mt-3 flex items-center gap-3">
                                    <UserAvatar name={rememberedAccount.name} email={rememberedAccount.email} photoURL={rememberedAccount.photoURL} size={40} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-black text-black">{rememberedAccount.name || rememberedAccount.email.split('@')[0]}</p>
                                        <p className="truncate text-[12px] font-medium text-[#6B7280]">{rememberedAccount.email}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={handleRememberedContinue} disabled={isSubmitting || isGoogleLoading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-black px-4 py-3 text-[13px] font-black text-white hover:bg-[#111111] disabled:opacity-60">
                                    {rememberedAccount.authProvider === 'google' || rememberedAccount.providerIds?.includes('google.com') ? (isGoogleLoading ? 'Opening Google…' : 'Continue with Google') : 'Continue with email'}
                                </button>
                                <button type="button" onClick={handleUseAnotherAccount} className="mt-3 w-full text-[12px] font-bold text-[#6B7280] hover:text-black">Not you? Use another account</button>
                            </div>
                        )}

                        <button type="button" onClick={handleGoogleSubmit} disabled={isSubmitting || isGoogleLoading} className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 py-3 text-[13px] font-bold text-black shadow-sm hover:bg-[#F9FAFB] disabled:opacity-60">
                            {isGoogleLoading ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-black" />
                            ) : (
                                <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                                </svg>
                            )}
                            <span>{isGoogleLoading ? 'Please wait…' : mode === 'admin' ? 'Admin with Google' : 'Continue with Google'}</span>
                        </button>

                        <div className="mb-5 flex items-center gap-3">
                            <span className="h-px flex-1 bg-[#E5E7EB]" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF]">or email</span>
                            <span className="h-px flex-1 bg-[#E5E7EB]" />
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'signup' && (
                                <label className="block">
                                    <span className="text-[12px] font-bold text-[#111111]">Full name</span>
                                    <input value={name} onChange={e => setName(e.target.value)} required className="mt-1.5 w-full rounded-full border border-[#D1D5DB] bg-white px-4 py-3 text-[14px] font-medium text-black outline-none placeholder:text-[#9CA3AF] focus:border-black focus:ring-2 focus:ring-black/10" placeholder="Your name" />
                                </label>
                            )}
                            <label className="block">
                                <span className="text-[12px] font-bold text-[#111111]">Email address</span>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1.5 w-full rounded-full border border-[#D1D5DB] bg-white px-4 py-3 text-[14px] font-medium text-black outline-none placeholder:text-[#9CA3AF] focus:border-black focus:ring-2 focus:ring-black/10" placeholder="you@example.com" />
                            </label>
                            {mode === 'signup' && (
                                <label className="block">
                                    <span className="text-[12px] font-bold text-[#111111]">Mobile number</span>
                                    <div className="mt-1.5 flex overflow-hidden rounded-full border border-[#D1D5DB] bg-white focus-within:border-black focus-within:ring-2 focus-within:ring-black/10">
                                        <span className="bg-[#F9FAFB] px-4 py-3 text-[13px] font-bold text-black">+91</span>
                                        <input value={mobile} onChange={e => setMobile(e.target.value)} required className="w-full bg-transparent px-4 py-3 text-[14px] font-medium text-black outline-none placeholder:text-[#9CA3AF]" placeholder="10 digit mobile" inputMode="numeric" />
                                    </div>
                                </label>
                            )}
                            <label className="block">
                                <span className="text-[12px] font-bold text-[#111111]">Password</span>
                                <div className="relative mt-1.5">
                                    <input ref={passwordInputRef} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded-full border border-[#D1D5DB] bg-white px-4 py-3 pr-12 text-[14px] font-medium text-black outline-none placeholder:text-[#9CA3AF] focus:border-black focus:ring-2 focus:ring-black/10" placeholder="Enter password" />
                                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(prev => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-[#F3F4F6] text-[#6B7280] hover:text-black" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </label>
                            {(mode === 'login' || mode === 'admin') && (
                                <div className="flex justify-between">
                                    <span className="text-[11px] font-medium text-[#9CA3AF]">Firebase • Encrypted</span>
                                    <button type="button" onClick={handleForgotPassword} disabled={isSubmitting || isGoogleLoading} className="text-[12px] font-bold text-[#0B63FF] hover:text-black disabled:opacity-60">Forgot password?</button>
                                </div>
                            )}
                            {success && (
                                <div className="rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-[13px] font-medium text-[#15803D]">
                                    <p>{success}</p>
                                </div>
                            )}
                            {error && <p className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] p-3 text-[13px] font-medium text-[#B91C1C]">{error}</p>}
                            <button type="submit" disabled={isSubmitting || isGoogleLoading} className="flex w-full items-center justify-center rounded-full bg-black px-6 py-3.5 text-[14px] font-black text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:bg-[#111111] disabled:opacity-60">
                                {isSubmitting ? 'Please wait…' : mode === 'admin' ? 'Login to admin' : mode === 'login' ? 'Login securely' : 'Create account'}
                            </button>
                        </form>

                        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-[#F3F4F6] pt-5">
                            {[
                                { icon: '🔒', label: '256-bit SSL', sub: 'Encrypted' },
                                { icon: '🛡️', label: 'Firebase Auth', sub: 'Secure' },
                                { icon: '✓', label: 'Verified', sub: 'Trusted' },
                            ].map(item => (
                                <div key={item.label} className="flex flex-col items-center rounded-[12px] bg-[#FAFAFA] px-2 py-3 text-center">
                                    <span className="text-[14px]">{item.icon}</span>
                                    <span className="mt-1 text-[11px] font-black text-black">{item.label}</span>
                                    <span className="text-[10px] font-medium text-[#6B7280]">{item.sub}</span>
                                </div>
                            ))}
                        </div>

                        <p className="mt-5 text-center text-[11px] font-medium leading-5 text-[#9CA3AF]">By continuing, you agree to secure storage of session via Firebase. Your data is encrypted and never shared. <span className="font-bold text-[#0B63FF]">Privacy protected.</span></p>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-3 text-[11px] font-medium text-[#9CA3AF]">
                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#0B63FF]" /> Homepage color accent</span>
                    <span className="h-1 w-1 rounded-full bg-[#D1D5DB]" />
                    <span>Black & White trusted UI</span>
                </div>
            </div>
            {authBusy && <AuthLoadingOverlay {...authBusy} />}
        </div>
    );
};

export default AuthPage;
