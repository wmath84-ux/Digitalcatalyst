import React, { useMemo, useState } from 'react';
import { WebsiteSettings } from '../../App';

interface AuthPageProps {
    settings: WebsiteSettings;
    onOtpAuthenticate: (profile: { name: string; email: string; mobile: string }) => { success: boolean; message: string };
    onBack: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ settings, onOtpAuthenticate, onBack }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [otp, setOtp] = useState('');
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const normalizedMobile = useMemo(() => mobile.replace(/\D/g, '').slice(-10), [mobile]);
    const canSendOtp = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && normalizedMobile.length === 10;

    const handleSendOtp = () => {
        setError('');
        setSuccess('');
        if (!canSendOtp) {
            setError('Enter your name, valid email, and 10 digit mobile number first.');
            return;
        }
        const demoOtp = String(Math.floor(100000 + Math.random() * 900000));
        setGeneratedOtp(demoOtp);
        setOtp(demoOtp);
        setSuccess(`Demo OTP sent to +91 ${normalizedMobile}. It is prefilled for local preview.`);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!generatedOtp) {
            setError('Please send OTP first.');
            return;
        }
        if (otp !== generatedOtp) {
            setError('Invalid OTP. Please check the code and try again.');
            return;
        }
        const result = onOtpAuthenticate({ name: name.trim(), email: email.trim().toLowerCase(), mobile: normalizedMobile });
        if (!result.success) setError(result.message);
    };

    return (
        <div className="min-h-screen bg-[#070b1f] text-slate-900 relative overflow-hidden flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(82,143,240,0.35),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.30),transparent_32%)]" />
            <button onClick={onBack} className="absolute top-5 left-5 z-10 text-slate-900/80 hover:text-slate-900 font-semibold">&larr; Back</button>

            <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-[1.05fr_0.95fr] rounded-[2rem] overflow-hidden bg-white/70 backdrop-blur-2xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <section className="p-8 sm:p-12 lg:p-14 bg-gradient-to-br from-white/15 to-white/5">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 border border-white/50 text-sm text-blue-700 mb-8">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Secure OTP learning account
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black leading-tight">Start learning premium notes, courses, and AI support in one beautiful app.</h1>
                    <p className="mt-5 text-lg text-slate-600 max-w-xl">Login or sign up with mobile OTP, save favourites, unlock purchases, watch private video embeds, and continue reading inside a Google Docs inspired workspace.</p>
                    <div className="mt-10 grid sm:grid-cols-2 gap-4">
                        {[
                            ['🛒', 'Marketplace', 'Amazon-style browsing for notes, courses, coupons, reviews, and subscriptions.'],
                            ['📄', 'Docs reader', 'Clean editor-style reading with formatting toolbar and focused pages.'],
                            ['🎬', 'Video courses', 'Embedded YouTube lessons with side notes, PDF export, and AI mentor.'],
                            ['🛡️', 'Admin control', 'Manage products, prices, content, coupons, reviews, users, and analytics.'],
                        ].map(([icon, title, text]) => (
                            <div key={title} className="rounded-2xl bg-white/70 border border-white/50 p-4">
                                <div className="text-2xl">{icon}</div>
                                <h3 className="font-bold mt-2">{title}</h3>
                                <p className="text-sm text-slate-600 mt-1">{text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="bg-white/70 backdrop-blur-xl text-slate-900 p-6 sm:p-10 lg:p-12">
                    <div className="mb-8">
                        <p className="text-sm font-bold text-primary uppercase tracking-[0.25em]">{settings.content.siteName}</p>
                        <h2 className="text-3xl font-black mt-2">Login / Sign up</h2>
                        <p className="text-slate-600 mt-2">We will use your name for reviews, email for receipts, and mobile for OTP access.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">Full name</span>
                            <input value={name} onChange={e => setName(e.target.value)} required className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-primary outline-none" placeholder="Your name" />
                        </label>
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">Email address</span>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-primary outline-none" placeholder="you@example.com" />
                        </label>
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">Mobile number</span>
                            <div className="mt-2 flex rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-4 focus-within:ring-blue-100 focus-within:border-primary">
                                <span className="px-4 py-3 bg-slate-100 text-slate-600 font-bold">+91</span>
                                <input value={mobile} onChange={e => setMobile(e.target.value)} required className="w-full px-4 py-3 bg-transparent outline-none" placeholder="10 digit mobile" inputMode="numeric" />
                            </div>
                        </label>
                        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                            <input value={otp} onChange={e => setOtp(e.target.value)} required className="px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-primary outline-none" placeholder="6 digit OTP" inputMode="numeric" />
                            <button type="button" onClick={handleSendOtp} className="px-5 py-3 rounded-2xl bg-white/70 text-slate-900 font-bold hover:bg-primary transition-colors">Send OTP</button>
                        </div>
                        {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">{success}</p>}
                        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}
                        <button type="submit" className="w-full bg-gradient-to-r from-primary to-accent text-white font-black px-8 py-4 rounded-2xl hover:shadow-sm hover:-translate-y-0.5 transition-all">Continue to learning store</button>
                    </form>
                    <p className="mt-5 text-xs text-slate-600 text-center">Prototype note: OTP is simulated locally; connect Firebase/Auth provider for production SMS delivery.</p>
                </section>
            </div>
        </div>
    );
};

export default AuthPage;
