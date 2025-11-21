
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
        <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
             <div className="absolute top-4 left-4">
                <button onClick={onBack} className="text-primary font-semibold hover:underline">
                    &larr; Back to Home
                </button>
            </div>
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border">
                <h1 className="text-3xl font-bold text-center text-primary">Admin Login</h1>
                <p className="text-center text-text-muted mt-2">Enter your credentials to access the dashboard.</p>
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                            placeholder="Password"
                        />
                    </div>

                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            className="w-full bg-primary text-white font-bold px-8 py-3 rounded-lg hover:opacity-90 transition-all duration-300"
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