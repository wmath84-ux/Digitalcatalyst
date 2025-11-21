
import React from 'react';

const BrokenFileIcon: React.FC = () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300">
        <path d="M10 2H30L40 12V46H10V2Z" fill="currentColor" opacity="0.6"/>
        <path d="M30 2V12H40L30 2Z" fill="currentColor" opacity="0.4"/>
        
        {/* Face */}
        <rect x="19" y="22" width="2" height="2" fill="currentColor" />
        <rect x="27" y="22" width="2" height="2" fill="currentColor" />
        
        {/* Mouth */}
        <rect x="17" y="30" width="2" height="2" fill="currentColor" />
        <rect x="19" y="32" width="2" height="2" fill="currentColor" />
        <rect x="21" y="34" width="6" height="2" fill="currentColor" />
        <rect x="27" y="32" width="2" height="2" fill="currentColor" />
        <rect x="29" y="30" width="2" height="2" fill="currentColor" />
    </svg>
);

const OfflinePage: React.FC = () => {
    return (
        <div className="bg-gray-100 w-full min-h-screen flex items-center justify-center">
            <BrokenFileIcon />
        </div>
    );
};

export default OfflinePage;
