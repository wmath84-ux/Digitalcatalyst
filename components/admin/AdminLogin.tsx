
import React, { useState } from 'react';
import { WebsiteSettings } from '../../App';

interface AdminLoginProps {
    settings: WebsiteSettings;
    onLogin: (email: string, password: string) => Promise<boolean>;
    onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ settings, onLogin, onBack }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const success = await onLogin(email, password);
            if (!success) {
                setError('Incorrect admin credentials or missing Firebase admin role.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="tagmaster-admin-theme relative min-h-screen overflow-hidden bg-[#d8e0ef] bg-[radial-gradient(circle_at_18%_10%,rgba(79,70,229,0.16),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(135deg,#d8e0ef,#e8edf5_48%,#d2dceb)] flex flex-col justify-center items-center p-4">
             <div className="absolute top-4 left-4 z-10">
                <button onClick={onBack} className="rounded-full border border-slate-300/70 bg-white/80 px-4 py-2 text-slate-800 font-bold shadow-sm backdrop-blur-xl hover:bg-white">
                    &larr; Back to Home
                </button>
            </div>
            <div className="relative z-10 max-w-md w-full bg-white/90 backdrop-blur-xl p-8 rounded-2xl shadow-[0_24px_70px_rgba(51,65,85,0.16)] border border-slate-200/80">
                <h1 className="text-3xl font-black text-center text-slate-950">Admin Login</h1>
                <p className="text-center text-slate-700 mt-2">Enter your credentials to access the dashboard.</p>
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <div>
                        <label htmlFor="email" className="sr-only">Email</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-700 transition outline-none"
                            placeholder="Email Address"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="sr-only">Password</label>
                        <div className="relative">
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-xl bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-700 transition outline-none"
                                placeholder="Password"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowPassword(prev => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.507 10.066 7.507.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                                ) : (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 text-white font-black px-8 py-3 rounded-xl shadow-[0_14px_34px_rgba(30,64,175,0.22)] hover:opacity-90 transition-all duration-300"

                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Checking…' : 'Login'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;