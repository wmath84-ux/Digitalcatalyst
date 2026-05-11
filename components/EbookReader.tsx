import React, { useMemo, useRef, useState } from 'react';
import { ProductWithRating, CourseModule, ProductFile, WebsiteSettings } from '../App';

const FileIcon: React.FC<{ type: string }> = ({ type }) => {
    const commonClasses = "w-16 h-16 mb-4 text-gray-600";
    switch (type) {
        case 'pdf':
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-red-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
        case 'video':
        case 'youtube':
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-blue-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        case 'audio':
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-purple-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" /></svg>;
        default:
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${commonClasses} text-gray-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
    }
};

const getAllFiles = (modules: CourseModule[]): ProductFile[] => {
    let files: ProductFile[] = [];
    if (!modules) return files;
    modules.forEach(module => {
        if (module.files) files = [...files, ...module.files];
        if (module.modules) files = [...files, ...getAllFiles(module.modules)];
    });
    return files;
};

const defaultDoc = (product: ProductWithRating) => `
  <h1>${product.title}</h1>
  <p><strong>Welcome to your learning document.</strong> Admin-uploaded rich text notes will appear here. Use the toolbar to style text, create headings, highlight ideas, and build a Google Docs-like study sheet.</p>
  <h2>What you will learn</h2>
  <ul>${product.features.map(feature => `<li>${feature}</li>`).join('')}</ul>
  <blockquote>${product.longDescription}</blockquote>
`;


const EbookReader: React.FC<{ settings: WebsiteSettings; product: ProductWithRating; onBack: () => void; }> = ({ settings, product, onBack }) => {
    const files = useMemo(() => getAllFiles(product.courseContent || []), [product.courseContent]);
    const firstDoc = files.find(file => file.content || file.type === 'doc' || file.type === 'link');
    const [activeDoc, setActiveDoc] = useState<ProductFile | null>(firstDoc || null);
    const editorRef = useRef<HTMLDivElement>(null);
    const docHtml = activeDoc?.content || defaultDoc(product);

    const runCommand = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans">
            <header className="bg-white/95 backdrop-blur shadow-sm sticky top-0 z-20 border-b">
                <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-3 justify-between items-center">
                    <div className="flex items-center gap-4 min-w-0">
                        <button onClick={onBack} className="text-primary font-semibold hover:underline flex items-center gap-1">&larr; Back</button>
                        <div className="border-l pl-4 border-gray-300 min-w-0">
                            <h1 className="text-lg font-black text-gray-800 truncate">{product.title}</h1>
                            <p className="text-xs text-gray-500">{settings.content.siteName} Docs Workspace</p>
                        </div>
                    </div>
                    <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-primary text-white font-bold hover:opacity-90">Print / Save PDF</button>
                </div>
                <div className="px-4 sm:px-6 py-2 border-t bg-slate-50 flex flex-wrap gap-2 items-center">
                    <select onChange={e => runCommand('formatBlock', e.target.value)} className="px-3 py-2 rounded-lg border bg-white text-sm"><option value="p">Normal text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
                    {[['bold', 'B'], ['italic', 'I'], ['underline', 'U']].map(([cmd, label]) => <button key={cmd} onClick={() => runCommand(cmd)} className="w-9 h-9 rounded-lg border bg-white font-black hover:bg-blue-50">{label}</button>)}
                    <button onClick={() => runCommand('insertUnorderedList')} className="px-3 h-9 rounded-lg border bg-white font-bold hover:bg-blue-50">• List</button>
                    <button onClick={() => runCommand('insertOrderedList')} className="px-3 h-9 rounded-lg border bg-white font-bold hover:bg-blue-50">1. List</button>
                    <button onClick={() => runCommand('hiliteColor', '#fef08a')} className="px-3 h-9 rounded-lg border bg-yellow-100 font-bold hover:bg-yellow-200">Highlight</button>
                    <button onClick={() => runCommand('justifyLeft')} className="px-3 h-9 rounded-lg border bg-white font-bold hover:bg-blue-50">Left</button>
                    <button onClick={() => runCommand('justifyCenter')} className="px-3 h-9 rounded-lg border bg-white font-bold hover:bg-blue-50">Center</button>
                    <button onClick={() => runCommand('justifyRight')} className="px-3 h-9 rounded-lg border bg-white font-bold hover:bg-blue-50">Right</button>
                </div>
            </header>

            <main className="grid lg:grid-cols-[280px_1fr] gap-6 px-4 sm:px-6 py-8">
                <aside className="space-y-4">
                    <div className="bg-white rounded-2xl border shadow-sm p-4 sticky top-32">
                        <h2 className="font-black text-slate-800 mb-3">Course files</h2>
                        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                            {files.map(file => (
                                <button key={file.id} onClick={() => setActiveDoc(file)} className={`w-full text-left p-3 rounded-xl border transition-colors ${activeDoc?.id === file.id ? 'bg-blue-50 border-primary text-primary' : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-700'}`}>
                                    <span className="block font-bold text-sm truncate">{file.name}</span>
                                    <span className="text-xs uppercase opacity-70">{file.content ? 'rich notes' : file.type}</span>

                                </button>
                            ))}
                            {files.length === 0 && <p className="text-sm text-slate-500">No files uploaded yet. Showing a sample learning document.</p>}
                        </div>
                    </div>
                </aside>

                <section className="max-w-5xl w-full mx-auto">
                    <div className="bg-white border shadow-2xl rounded-sm min-h-[900px] px-8 sm:px-14 lg:px-20 py-14 print:shadow-none print:border-none">
                        <div

                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            className="prose prose-slate max-w-none focus:outline-none leading-8 text-slate-800 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-2xl [&_h2]:font-black [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-slate-600"
                            dangerouslySetInnerHTML={{ __html: docHtml }}
                        />
                    </div>


                </section>
            </main>
        </div>
    );
};

export default EbookReader;
