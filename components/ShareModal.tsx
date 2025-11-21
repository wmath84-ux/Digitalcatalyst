import React, { useState } from 'react';

interface ShareModalProps {
    url: string;
    title: string;
    onClose: () => void;
}

const ShareIcon: React.FC<{ network: string, color: string, children: React.ReactNode, onClick: () => void }> = ({ network, color, children, onClick }) => (
    <button onClick={onClick} className="share-button">
        <div className="w-16 h-16 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: `${color}20` }}>
            <div style={{ color }}>
                {children}
            </div>
        </div>
        <span className="font-semibold text-gray-700">{network}</span>
    </button>
);

const ShareModal: React.FC<ShareModalProps> = ({ url, title, onClose }) => {
    const [copySuccess, setCopySuccess] = useState('');

    const networks = [
        { name: 'WhatsApp', color: '#25D366', url: `https://api.whatsapp.com/send?text=${encodeURIComponent(title + '\n' + url)}` },
        { name: 'Facebook', color: '#1877F2', url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
        { name: 'Twitter', color: '#1DA1F2', url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
        { name: 'Telegram', color: '#0088cc', url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
    ];

    const copyToClipboard = () => {
        navigator.clipboard.writeText(url).then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        }, () => {
            setCopySuccess('Failed to copy');
            setTimeout(() => setCopySuccess(''), 2000);
        });
    };

    return (
        <div className="share-modal-overlay" onClick={onClose}>
            <div className="share-modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 font-bold text-2xl" aria-label="Close share modal">&times;</button>
                <h2 className="text-2xl font-bold text-center text-primary">Share this Product</h2>
                <p className="text-center text-text-muted mt-2">Spread the word and share this awesome product with your friends!</p>
                <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 justify-items-center">
                    {networks.map(({ name, color, url: shareUrl }) => (
                        <a key={name} href={shareUrl} target="_blank" rel="noopener noreferrer" className="share-button">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
                                {/* Placeholder for actual icons */}
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
                                    {name === 'WhatsApp' && <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.269.655 4.512 1.916 6.43l-1.225 4.485 4.575-1.201z" />}
                                    {name === 'Facebook' && <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />}
                                    {name === 'Twitter' && <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616v.064c0 2.455 1.753 4.59 4.085 5.07a5.025 5.025 0 01-2.223.084c.645 2.008 2.518 3.469 4.74 3.51a10.42 10.42 0 01-7.557 2.224c-1.921 0-4.042-.483-5.88-1.385 2.483 1.59 5.437 2.51 8.592 2.51 9.979 0 15.39-8.25 15.39-15.39 0-.235 0-.468-.016-.701A10.99 10.99 0 0024 4.557z" />}
                                    {name === 'Telegram' && <path d="M15.3,16.4l2.4-11.4c0.2-1-0.5-1.5-1.2-1.2L3.1,10.2c-1,0.4-1,1-0.2,1.3l2.6,0.8l0.6,2.7c0.2,0.8,0.7,1,1.4,0.6l3.1-2.3 l2.9,2.1c0.9,0.6,1.5,0.3,1.7-0.7L15.3,16.4z" />}
                                </svg>
                            </div>
                            <span className="font-semibold text-gray-700">{name}</span>
                        </a>
                    ))}
                </div>

                <div className="mt-8 pt-6 border-t">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Or copy the link</p>
                    <div className="relative">
                        <button onClick={copyToClipboard} className="copy-link-button">
                            <span className="truncate pr-4">{url}</span>
                            <span className={`font-semibold transition-colors ${copySuccess === 'Copied!' ? 'text-green-600' : 'text-primary'}`}>
                                {copySuccess || 'Copy'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
