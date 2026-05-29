import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProductWithRating, CourseModule, ProductFile, WebsiteSettings } from '../App';

const FileIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
    const commonClasses = className || "w-16 h-16 mb-4 text-gray-600";
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
    const firstDoc = useMemo(() => files.find(file => file.content || file.type === 'doc' || file.type === 'link' || file.type === 'pdf') || null, [files]);
    const [activeDoc, setActiveDoc] = useState<ProductFile | null>(firstDoc);
    const editorRef = useRef<HTMLDivElement>(null);
    const docHtml = activeDoc?.content || defaultDoc(product);

    useEffect(() => {
        setActiveDoc(firstDoc);
    }, [firstDoc]);

    const runCommand = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
    };

    const toolbarButtons = [
        { label: 'Bold', command: 'bold' },
        { label: 'Italic', command: 'italic' },
        { label: 'Underline', command: 'underline' },
    ];

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans">
            <header className="sticky top-0 z-20 border-b bg-white/95 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-4">
                        <button onClick={onBack} className="flex items-center gap-1 font-semibold text-primary hover:underline">&larr; Back</button>
                        <div className="min-w-0 border-l border-gray-300 pl-4">
                            <h1 className="truncate text-lg font-black text-gray-800">{product.title}</h1>
                            <p className="text-xs text-gray-500">{settings.content.siteName} Docs Workspace</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {toolbarButtons.map(button => (
                            <button
                                key={button.command}
                                onClick={() => runCommand(button.command)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                type="button"
                            >
                                {button.label}
                            </button>
                        ))}
                        <button onClick={() => runCommand('formatBlock', 'h2')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" type="button">H2</button>
                        <button onClick={() => window.print()} className="rounded-lg bg-primary px-4 py-2 font-bold text-white hover:opacity-90" type="button">Print / Save PDF</button>
                    </div>
                </div>
            </header>

            <main className="grid gap-6 px-4 py-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-8">
                <aside className="rounded-2xl border bg-white p-4 shadow-sm print:hidden">
                    <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">Documents</h2>
                    <div className="space-y-2">
                        {files.map(file => (
                            <button
                                key={file.id}
                                onClick={() => setActiveDoc(file)}
                                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${activeDoc?.id === file.id ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                                type="button"
                            >
                                <FileIcon type={file.type} className="h-6 w-6 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-sm font-bold">{file.name}</span>
                            </button>
                        ))}
                        {files.length === 0 && <p className="text-sm text-slate-500">No files uploaded yet. Showing a sample learning document.</p>}
                    </div>
                </aside>

                <section className="mx-auto w-full max-w-5xl">
                    <div className="min-h-[900px] rounded-sm border bg-white px-8 py-14 shadow-2xl print:border-none print:shadow-none sm:px-14 lg:px-20">
                        <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            className="prose prose-slate max-w-none leading-8 text-slate-800 focus:outline-none [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-2xl [&_h2]:font-black"
                            dangerouslySetInnerHTML={{ __html: docHtml }}
                        />
                    </div>
                </section>
            </main>
        </div>
    );
};

export default EbookReader;
