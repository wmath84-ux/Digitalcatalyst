
import React from 'react';
import { ProductWithRating, CourseModule, ProductFile, WebsiteSettings } from '../App';

const FileIcon: React.FC<{ type: string }> = ({ type }) => {
    // Returns an SVG icon based on file type
    const commonClasses = "w-16 h-16 mb-4 text-gray-600";
    
    switch (type) {
        case 'pdf':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-red-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
            );
        case 'video':
        case 'youtube':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-blue-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'audio':
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-purple-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" />
                </svg>
            );
        default: // Generic doc or link
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-gray-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
            );
    }
};

const DownloadCard: React.FC<{ file: ProductFile }> = ({ file }) => {
    return (
        <div className="bg-white rounded-xl shadow-lg border p-8 flex flex-col items-center text-center transform hover:-translate-y-1 transition-transform duration-300 w-full max-w-sm mx-auto">
            <FileIcon type={file.type} />
            <h3 className="text-lg font-bold text-gray-800 mb-2 break-words w-full">{file.name}</h3>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-6">{file.type.toUpperCase()}</p>
            
            <a 
                href={file.url} 
                download={file.name}
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-primary text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 shadow-md transition-all flex items-center justify-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {file.type === 'youtube' || file.type === 'link' ? 'Open Link' : 'Download'}
            </a>
        </div>
    );
};

// Recursively flatten all files from modules
const getAllFiles = (modules: CourseModule[]): ProductFile[] => {
    let files: ProductFile[] = [];
    if (!modules) return files;
    
    modules.forEach(module => {
        if (module.files) files = [...files, ...module.files];
        if (module.modules) files = [...files, ...getAllFiles(module.modules)];
    });
    return files;
};

const EbookReader: React.FC<{
    settings: WebsiteSettings;
    product: ProductWithRating;
    onBack: () => void;
}> = ({ settings, product, onBack }) => {
    const files = getAllFiles(product.courseContent || []);

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="bg-white shadow-sm sticky top-0 z-10 border-b">
                <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onBack}
                            className="text-primary font-semibold hover:underline flex items-center gap-1"
                        >
                            &larr; Back
                        </button>
                        <h1 className="text-xl font-bold text-gray-800 border-l pl-4 border-gray-300">{product.title}</h1>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-12">
                <div className="text-center max-w-2xl mx-auto mb-12">
                    <h2 className="text-3xl font-extrabold text-primary">Your Downloads</h2>
                    <p className="mt-2 text-gray-600">Access the files included with your purchase below.</p>
                </div>

                {files.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {files.map((file) => (
                            <DownloadCard key={file.id} file={file} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 bg-white rounded-xl shadow-inner border">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-gray-500 text-lg">No downloadable files found for this product.</p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default EbookReader;
