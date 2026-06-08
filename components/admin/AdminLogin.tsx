
import React, { useState } from 'react';
import { WebsiteSettings } from '../../App';

interface AdminLoginProps {
    settings: WebsiteSettings;
    onLogin: (email: string, password: string) => boolean;
    onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ settings, onLogin, onBack }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (onLogin(email, password)) {
            setError('');
        } else {
            setError('Incorrect email or password. Please try again.');
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#d8e0ef] bg-[radial-gradient(circle_at_18%_10%,rgba(79,70,229,0.16),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(135deg,#d8e0ef,#e8edf5_48%,#d2dceb)] flex flex-col justify-center items-center p-4">
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
                        <input
                            id="password"
                            name="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-700 transition outline-none"
                            placeholder="Password"
                        />
                    </div>

                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 text-white font-black px-8 py-3 rounded-xl shadow-[0_14px_34px_rgba(30,64,175,0.22)] hover:opacity-90 transition-all duration-300"
                        >
                            Login
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;