import React from 'react';

const icons: { [key: string]: React.ReactNode } = {
    rocket: (
        <svg className="w-24 h-24 text-primary animate-icon-float" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5">
            <path d="M9.135 4.075c.42-.42 1.05-.675 1.71-.825 2.112-.48 4.297.03 6.09.925l.48 2.4-2.19.435-2.4-4.8.435-2.19c.895 1.793 1.405 3.978.925 6.09-.15.66-.405 1.29-.825 1.71L4.075 21.865c-.42.42-1.05.675-1.71.825-2.112.48-4.297-.03-6.09-.925l-.48-2.4 2.19-.435 2.4 4.8-.435 2.19c-.895-1.793-1.405-3.978-.925-6.09.15-.66.405-1.29.825-1.71l12.79-12.79z" stroke="none" fill="currentColor" />
            <path d="M15.5 2.5l5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 6l-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    gift: (
        <svg className="w-24 h-24 text-primary animate-icon-float" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
        </svg>
    ),
    megaphone: (
         <svg className="w-24 h-24 text-primary animate-icon-float" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.834 9.168-4.515l.002-.003.001-.002A2.25 2.25 0 0119.5 0h.003a2.25 2.25 0 012.246 2.25l-.003.001-.002.001-.001.002c-1.543 2.682-5.068 4.515-9.168 4.515H7a4.001 4.001 0 01-1.564-.317z"></path>
        </svg>
    ),
};


interface ComingSoonModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    message?: string;
    icon?: string;
}

const ComingSoonModal: React.FC<ComingSoonModalProps> = ({ 
    isOpen, 
    onClose,
    title = "Finalizing Launch Sequence...",
    message,
    icon = 'rocket'
}) => {
    if (!isOpen) return null;
    
    const defaultMessage = "Our experts are adding the final touches. This feature is preparing for liftoff. Check back soon!";

    return (
        <div className="coming-soon-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="coming-soon-title">
            <div className="coming-soon-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 font-bold text-2xl" aria-label="Close modal">&times;</button>
                
                <div className="text-center">
                    <div className="flex justify-center mb-6">
                        {icons[icon] || icons.rocket}
                    </div>
                    <h2 id="coming-soon-title" className="text-2xl font-extrabold text-primary">{title}</h2>
                    <p className="mt-4 text-base text-text-muted">
                        {message || defaultMessage}
                    </p>
                    <button onClick={onClose} className="mt-8 bg-primary text-white font-bold px-8 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95">
                        Got It
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComingSoonModal;