import React, { useState } from 'react';
import { WebsiteSettings } from '../../App';

interface AuthPageProps {
    settings: WebsiteSettings;
    onLogin: (email: string, password: string) => boolean;
    onSignup: (email: string, password: string) => { success: boolean, message: string };
    onBack: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ settings, onLogin, onSignup, onBack }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (isLoginView) {
            if (!onLogin(email, password)) setError('Invalid email or password.');
        } else {
            if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
            if (password.length < 6) { setError('Password must be at least 6 characters long.'); return; }
            const result = onSignup(email, password);
            if (!result.success) setError(result.message);
        }
    };

    const toggleView = () => {
        setIsLoginView(!isLoginView);
        setError(''); setEmail(''); setPassword(''); setConfirmPassword('');
    };

    return (
        <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
             <div className="absolute top-4 left-4">
                <button onClick={onBack} className="text-primary font-semibold hover:underline">
                    &larr; Back
                </button>
            </div>
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border">
                <h1 className="text-3xl font-bold text-center text-primary">{isLoginView ? 'Login' : 'Create Account'}</h1>
                <p className="text-center text-text-muted mt-2">
                    {isLoginView ? 'Welcome back! Please enter your details.' : 'Join us to start your journey.'}
                </p>
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Email address" />
                    <input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Password" />
                    {!isLoginView && <input id="confirm-password" name="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Confirm Password" />}
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <button type="submit" className="w-full bg-primary text-white font-bold px-8 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95">
                        {isLoginView ? 'Login' : 'Sign Up'}
                    </button>
                </form>
                 <div className="mt-6 text-center">
                    <button onClick={toggleView} className="text-sm text-primary hover:underline">
                        {isLoginView ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;