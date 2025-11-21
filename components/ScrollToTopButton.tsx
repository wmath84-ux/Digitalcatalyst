import React from 'react';

interface ScrollToTopButtonProps {
    isVisible: boolean;
    onClick: () => void;
}

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ isVisible, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`scroll-to-top-btn ${isVisible ? 'is-visible' : ''}`}
            aria-label="Scroll to top"
            title="Scroll to top"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
        </button>
    );
};

export default ScrollToTopButton;
