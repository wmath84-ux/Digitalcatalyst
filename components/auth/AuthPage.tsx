import React, { useMemo, useState } from 'react';
import { WebsiteSettings } from '../../App';

type AuthMode = 'login' | 'signup';

interface AuthPageProps {
    settings: WebsiteSettings;
    onEmailPasswordAuthenticate: (mode: AuthMode, profile: { name: string; email: string; mobile: string; password: string }) => Promise<{ success: boolean; message: string }>;
    onBack: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ settings, onEmailPasswordAuthenticate, onBack }) => {
    const [mode, setMode] = useState<AuthMode>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const normalizedMobile = useMemo(() => mobile.replace(/\D/g, '').slice(-10), [mobile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (mode === 'signup' && name.trim().length < 2) {
            setError('Enter your full name to create an account.');
            return;
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            setError('Enter a valid email address.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setIsSubmitting(true);
        const result = await onEmailPasswordAuthenticate(mode, { name: name.trim(), email: email.trim().toLowerCase(), mobile: normalizedMobile, password });
        setIsSubmitting(false);
        if (!result.success) {
            setError(result.message);
            return;
        }
        setSuccess(result.message);
    };

    return (
        <div className="relative flex min-h-screen items-start justify-center overflow-y-auto bg-white p-3 pt-16 text-slate-950 sm:items-center sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92),rgba(255,255,255,0.96))]" />
            <button onClick={onBack} className="absolute left-3 top-3 z-10 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-xl hover:text-slate-950 sm:left-5 sm:top-5 sm:px-4">&larr; Back</button>

            <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-[2rem] lg:grid-cols-[1.05fr_0.95fr]">
                <section className="bg-gradient-to-br from-white via-sky-50/80 to-emerald-50/60 p-4 sm:p-12 lg:p-14">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-3 py-2 text-xs font-bold text-blue-800 shadow-sm sm:mb-8 sm:px-4 sm:text-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Secure email learning account
                    </div>
                    <h1 className="text-3xl font-black leading-tight sm:text-5xl">Start learning premium notes, courses, and AI support in one beautiful app.</h1>
                    <p className="mt-3 max-w-xl text-base leading-7 text-slate-700 sm:mt-5 sm:text-lg">Login or sign up with email and password, save favourites, unlock purchases, watch private video embeds, and continue reading inside a Google Docs inspired workspace.</p>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-10 sm:gap-4">
                        {[
                            ['🛒', 'Marketplace', 'Amazon-style browsing for notes, courses, coupons, reviews, and subscriptions.'],
                            ['📄', 'Docs reader', 'Clean editor-style reading with formatting toolbar and focused pages.'],
                            ['🎬', 'Video courses', 'Embedded YouTube lessons with side notes, PDF export, and AI mentor.'],
                            ['🛡️', 'Admin control', 'Manage products, prices, content, coupons, reviews, users, and analytics.'],
                        ].map(([icon, title, text]) => (
                            <div key={title} className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm sm:p-4">
                                <div className="text-xl sm:text-2xl">{icon}</div>
                                <h3 className="mt-2 text-sm font-bold sm:text-base">{title}</h3>
                                <p className="mt-1 text-xs leading-5 text-slate-700 sm:text-sm">{text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="border-l border-slate-100 bg-white/95 p-4 text-slate-950 backdrop-blur-xl sm:p-10 lg:p-12">
                    <div className="mb-5 sm:mb-8">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary sm:text-sm sm:tracking-[0.25em]">{settings.content.siteName}</p>
                        <h2 className="mt-2 text-2xl font-black sm:text-3xl">Login / Sign up</h2>
                        <p className="text-slate-700 mt-2">Use email and password for secure access. Mobile is saved on sign up for account support.</p>
                    </div>
                    <div className="mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                        {(['login', 'signup'] as AuthMode[]).map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => { setMode(tab); setError(''); setSuccess(''); }}
                                className={`rounded-xl px-4 py-2.5 text-sm font-black transition-all ${mode === tab ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
                            >
                                {tab === 'login' ? 'Login' : 'Sign up'}
                            </button>
                        ))}
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
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">Password</span>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-blue-700 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:py-3" placeholder="Minimum 6 characters" />
                        </label>
                        {mode === 'signup' && (
                            <label className="block">
                                <span className="text-sm font-bold text-slate-700">Mobile number</span>
                                <div className="mt-2 flex overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-blue-700 focus-within:ring-4 focus:ring-blue-100">
                                    <span className="bg-slate-100 px-3 py-2.5 font-bold text-slate-700 sm:px-4 sm:py-3">+91</span>
                                    <input value={mobile} onChange={e => setMobile(e.target.value)} className="w-full bg-transparent px-4 py-2.5 outline-none sm:py-3" placeholder="10 digit mobile" inputMode="numeric" />
                                </div>
                            </label>
                        )}
                        {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">{success}</p>}
                        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}
                        <button type="submit" disabled={isSubmitting} className="w-full rounded-2xl bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 px-6 py-3.5 font-black text-white shadow-[0_14px_34px_rgba(30,64,175,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70 sm:px-8 sm:py-4">{isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login to learning store' : 'Create learning account'}</button>
                    </form>
                    <p className="mt-5 text-xs text-slate-700 text-center">Firebase Email/Password Auth secures this session; purchases restore from your account after login.</p>
                </section>
            </div>
        </div>
    );
};

export default AuthPage;
