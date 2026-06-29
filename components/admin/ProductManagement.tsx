import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coupon, CourseModule, Product, ProductFile, ProductFileType, ProductWithRating, ProductDocPage, QuizQuestion, User } from '../../App';
import NewProductEmailPreviewModal from './NewProductEmailPreviewModal';
import { PRODUCT_IMAGE_SLOTS, ProductImageSlot } from '../../utils/productImages';
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { auth, storage } from '../../firebase';

type ProductViewState = 'list' | 'add' | 'edit';

type ProductAdminInitialState = Omit<Product, 'id'> & {
    isCoinRedeemEnabled?: boolean;
    faqs: unknown[];
    modules: CourseModule[];
};

const DEFAULT_PRODUCT_PAYMENT_LINK = 'https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view';

type ProductFormData = {
    title: string;
    description: string;
    longDescription: string;
    price: string;
    salePrice: string;
    coinPrice: string;
    isCoinRedeemEnabled: boolean;
    imageSeed: string;
    category: string;
    department: 'Men' | 'Women' | 'Unisex';
    inStock: boolean;
    isVisible: boolean;
    manualRating: string;
    sku: string;
    dimensions: string;
    fileFormat: string;
    aspectRatio: string;
    isFree: boolean;
    couponCode: string;
    paymentLink: string;
    featuresText: string;
    tagsText: string;
};

const initialProductState: ProductAdminInitialState = {
    imageSeed: '',
    images: [],
    productImages: {},
    title: '',
    description: '',
    longDescription: '',
    features: [],
    price: '₹0',
    salePrice: undefined,
    coinPrice: 0,
    isCoinRedeemEnabled: true,
    category: '',
    department: 'Unisex',
    inStock: true,
    isVisible: true,
    manualRating: null,
    sku: '',
    tags: [],
    dimensions: '',
    fileFormat: '',
    courseContent: [],
    aspectRatio: 'aspect-[4/3]',
    priceHistory: [],
    isFree: false,
    couponCode: '',
    paymentLink: DEFAULT_PRODUCT_PAYMENT_LINK,
    wishlistCount: 0,
    viewCount: 0,
    faqs: [],
    modules: [],
};

const emptyArrays = {
    images: [] as string[],
    features: [] as string[],
    tags: [] as string[],
    courseContent: [] as CourseModule[],
    priceHistory: [],
};

const createEmptyProductForm = (product?: ProductWithRating | null): ProductFormData => {
    const source = product || initialProductState;

    return {
        title: source.title || '',
        description: source.description || '',
        longDescription: source.longDescription || '',
        price: source.price ? source.price.replace('₹', '') : '',
        salePrice: source.salePrice ? source.salePrice.replace('₹', '') : '',
        coinPrice: source.coinPrice ? String(source.coinPrice) : '',
        isCoinRedeemEnabled: (source as any).isCoinRedeemEnabled !== false,
        imageSeed: source.imageSeed || '',
        category: source.category || '',
        department: source.department || 'Unisex',
        inStock: source.inStock ?? true,
        isVisible: source.isVisible ?? true,
        manualRating: source.manualRating !== null && source.manualRating !== undefined ? source.manualRating.toString() : '',
        sku: source.sku || '',
        dimensions: source.dimensions || '',
        fileFormat: source.fileFormat || '',
        aspectRatio: source.aspectRatio || 'aspect-[4/3]',
        isFree: source.isFree || false,
        couponCode: source.couponCode || '',
        paymentLink: source.paymentLink || '',
        featuresText: (source.features || []).join('\n'),
        tagsText: (source.tags || []).join(', '),
    };
};

const normaliseQuizQuestions = (questions?: QuizQuestion[]): QuizQuestion[] => (questions || []).map(question => ({
    prompt: question.prompt || '',
    options: question.options || [],
    correctAnswer: question.correctAnswer ?? 0,
}));

const normaliseDocPages = (file: ProductFile): ProductDocPage[] | undefined => {
    if (file.type !== 'doc') return file.docPages;

    const pages = (file.docPages || [])
        .filter(page => page && page.id && page.title)
        .map(page => ({
            ...page,
            title: page.title.trim() || 'Untitled Page',
            content: page.content || '<h1>Open Docs Workspace</h1><p>Start building your lesson here.</p>',
        }));

    if (pages.length > 0) return pages;

    return [{
        id: 'doc-page-1',
        title: file.name || 'Page 1',
        content: file.content || '<h1>Open Docs Workspace</h1><p>Start building your lesson here.</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }];
};

const normaliseFiles = (files?: ProductFile[]): ProductFile[] => (files || []).map(file => ({
    ...file,
    content: file.content || '',
    docPages: normaliseDocPages(file),
    quiz: file.quiz ? { questions: normaliseQuizQuestions(file.quiz.questions || []) } : file.type === 'quiz' ? { questions: [] } : undefined,
}));

const normaliseModules = (modules?: CourseModule[]): CourseModule[] => (modules || []).map(module => ({
    ...module,
    title: module.title || 'Untitled Module',
    files: normaliseFiles(module.files || []),
    modules: normaliseModules(module.modules || []),
}));

const countModuleContent = (modules?: CourseModule[]): number => (modules || []).reduce(
    (count, module) => count + (module.files || []).length + countModuleContent(module.modules || []),
    0
);

const recursiveFileUpdate = (
    modules: CourseModule[],
    moduleId: string,
    updateCallback: (files: ProductFile[]) => ProductFile[]
): CourseModule[] => (modules || []).map(module => {
    if (module.id === moduleId) {
        return { ...module, files: updateCallback(module.files || []) };
    }

    return { ...module, modules: recursiveFileUpdate(module.modules || [], moduleId, updateCallback) };
});

const recursiveModuleUpdate = (
    modules: CourseModule[],
    moduleId: string,
    updateCallback: (module: CourseModule) => CourseModule
): CourseModule[] => (modules || []).map(module => {
    if (module.id === moduleId) return updateCallback(module);
    return { ...module, modules: recursiveModuleUpdate(module.modules || [], moduleId, updateCallback) };
});

const glassCard = 'rounded-[2rem] border border-white/50 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl';
const fieldClass = 'w-full rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-400/10';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-600';

const MAX_AUDIO_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 75 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SHEET_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FIRESTORE_INLINE_UPLOAD_BYTES = 700 * 1024;

const sanitizeStorageName = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'file';

const buildAdminContentStoragePath = (file: File, type: ProductFileType, productId: number | string) => {
    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const safeName = sanitizeStorageName(file.name.replace(/\.[^/.]+$/, ''));
    return `adminProductContent/${type}/${productId}/${Date.now()}-${safeName}.${extension}`;
};

const buildAdminImageStoragePath = (file: File, scope: string, productId: number | string) => {
    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const safeName = sanitizeStorageName(file.name.replace(/\.[^/.]+$/, ''));
    return `adminProductImages/${productId}/${scope}/${Date.now()}-${safeName}.${extension}`;
};

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read this file. Please try again.'));
    reader.readAsDataURL(file);
});

const ensureAdminUploadAuth = async () => {
    if (auth.currentUser) return auth.currentUser;

    try {
        const credential = await signInAnonymously(auth);
        return credential.user;
    } catch (error) {
        console.warn('ADMIN_UPLOAD_AUTH_UNAVAILABLE', error);
        return null;
    }
};

const classifyAdminUploadError = (error: unknown) => {
    const rawCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const message = error instanceof Error ? error.message : String(error || 'Unknown upload error');

    if (message.includes('NOT_AUTHENTICATED')) return message;
    if (rawCode.includes('storage/unauthorized') || message.toLowerCase().includes('permission')) return `STORAGE_RULES_DENIED: Firebase Storage rules denied this upload. ${message}`;
    if (rawCode.includes('storage/bucket-not-found') || rawCode.includes('storage/invalid-url') || message.toLowerCase().includes('bucket')) return `STORAGE_BUCKET_CONFIG_MISSING: Firebase Storage bucket/config is missing or invalid. ${message}`;
    if (message.toLowerCase().includes('timed out')) return `NETWORK_TIMEOUT: ${message}`;
    if (rawCode.includes('storage/retry-limit-exceeded') || rawCode.includes('storage/canceled')) return `NETWORK_TIMEOUT: Firebase Storage upload did not complete. ${message}`;
    return `UNKNOWN_UPLOAD_ERROR: ${message}`;
};

const getAdminContentMaxBytes = (type: ProductFileType) => {
    if (type === 'audio') return MAX_AUDIO_UPLOAD_BYTES;
    if (type === 'video') return MAX_VIDEO_UPLOAD_BYTES;
    if (type === 'pdf' || type === 'ebook') return MAX_DOCUMENT_UPLOAD_BYTES;
    if (type === 'sheet') return MAX_SHEET_UPLOAD_BYTES;
    return MAX_DOCUMENT_UPLOAD_BYTES;
};

const isRetryableStorageError = (error: unknown) => {
    const rawCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();

    if (rawCode.includes('storage/unauthorized') || message.includes('permission')) return false;
    if (rawCode.includes('storage/bucket-not-found') || rawCode.includes('storage/invalid-url') || message.includes('bucket')) return false;
    if (rawCode.includes('storage/canceled')) return false;

    return rawCode.includes('storage/retry-limit-exceeded')
        || rawCode.includes('storage/unknown')
        || message.includes('network')
        || message.includes('timeout')
        || message.includes('timed out')
        || message.includes('offline')
        || !rawCode;
};

const uploadAdminProductAsset = async (
    file: File,
    storagePath: string,
    logPrefix = 'ADMIN_CONTENT_UPLOAD',
    onProgress?: (percent: number) => void
) => {
    const uploadUser = await ensureAdminUploadAuth();
    console.info('ADMIN_UPLOAD_AUTH_CHECK', { authenticated: Boolean(uploadUser), uid: uploadUser?.uid || null });

    const fileRef = ref(storage, storagePath);
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const uploadTask = uploadBytesResumable(fileRef, file, {
                contentType: file.type || undefined,
                customMetadata: {
                    originalName: file.name,
                },
            });

            await new Promise<void>((resolve, reject) => {
                uploadTask.on('state_changed',
                    snapshot => {
                        const percent = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
                        onProgress?.(percent);
                        if (logPrefix === 'ADMIN_AUDIO_UPLOAD') {
                            console.info('ADMIN_AUDIO_UPLOAD_PROGRESS', { storagePath, attempt, percent, bytesTransferred: snapshot.bytesTransferred, totalBytes: snapshot.totalBytes });
                        } else {
                            console.info(`${logPrefix}_PROGRESS`, { storagePath, attempt, percent, bytesTransferred: snapshot.bytesTransferred, totalBytes: snapshot.totalBytes });
                        }
                    },
                    reject,
                    () => resolve()
                );
            });

            const downloadUrl = await getDownloadURL(fileRef);

            if (logPrefix === 'ADMIN_AUDIO_UPLOAD') {
                console.info('ADMIN_AUDIO_DOWNLOAD_URL_SUCCESS', { storagePath, url: downloadUrl });
            } else {
                console.info('ADMIN_DOWNLOAD_URL_SUCCESS', { storagePath, url: downloadUrl });
            }

            return {
                url: downloadUrl,
                storagePath,
                size: file.size,
                contentType: file.type || 'application/octet-stream',
            };
        } catch (error) {
            lastError = error;
            const retryable = isRetryableStorageError(error);
            console.warn(`${logPrefix}_ATTEMPT_FAILED`, { storagePath, attempt, retryable, error });

            if (!retryable || attempt === maxAttempts) break;
            await new Promise(resolve => setTimeout(resolve, attempt * 1200));
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Unknown upload error'));
};

const uploadAdminContentFile = async (file: File, type: ProductFileType, productId: number | string, onProgress?: (percent: number) => void) => {
    const maxBytes = getAdminContentMaxBytes(type);

    if (file.size > maxBytes) {
        throw new Error(`FILE_TOO_LARGE: ${type} files must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller.`);
    }

    if (file.size <= MAX_FIRESTORE_INLINE_UPLOAD_BYTES && !['audio', 'video', 'pdf', 'ebook', 'sheet'].includes(type)) {
        return {
            url: await readFileAsDataUrl(file),
            storagePath: undefined,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
        };
    }

    const storagePath = buildAdminContentStoragePath(file, type, productId);
    const isAudio = type === 'audio';

    if (isAudio) {
        console.info('ADMIN_AUDIO_UPLOAD_STARTED', { productId, storagePath, fileName: file.name, size: file.size, contentType: file.type });
    }

    try {
        const uploaded = await uploadAdminProductAsset(file, storagePath, isAudio ? 'ADMIN_AUDIO_UPLOAD' : 'ADMIN_CONTENT_UPLOAD', onProgress);

        if (isAudio) {
            console.info('ADMIN_AUDIO_UPLOAD_SUCCESS', { productId, storagePath, size: file.size, contentType: file.type });
        }

        return uploaded;
    } catch (error) {
        const preciseError = classifyAdminUploadError(error);

        if (isAudio) {
            console.error('ADMIN_AUDIO_UPLOAD_FAILED', { productId, storagePath, fileName: file.name, size: file.size, error: preciseError });
        }

        throw new Error(preciseError);
    }
};

const editorCommands: Array<[string, string, string?]> = [
    ['bold', 'B'],
    ['italic', 'I'],
    ['underline', 'U'],
    ['formatBlock', 'H1', '<h1>'],
    ['formatBlock', 'H2', '<h2>'],
    ['insertUnorderedList', '• List'],
    ['justifyLeft', 'Left'],
    ['justifyCenter', 'Center'],
    ['justifyRight', 'Right'],
];

const getMeaningfulDocText = (html: string) =>
    (html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();

const validateOpenDocsContent = (resourceName: string, pages: ProductDocPage[]) => {
    const trimmedName = resourceName.trim();

    if (!trimmedName) return 'Open Docs resource name is required.';
    if (!pages.length) return 'At least one Open Docs page is required.';

    const ids = pages.map(page => page.id.trim()).filter(Boolean);
    const titles = pages.map(page => page.title.trim().toLowerCase()).filter(Boolean);

    if (ids.length !== pages.length) return 'Every Open Docs page must have a valid page ID.';
    if (new Set(ids).size !== ids.length) return 'Duplicate Open Docs page IDs are not allowed.';
    if (titles.length !== pages.length) return 'Every Open Docs page must have a title.';
    if (new Set(titles).size !== titles.length) return 'Duplicate Open Docs page titles are not allowed.';

    const emptyPage = pages.find(page => !getMeaningfulDocText(page.content));
    if (emptyPage) return `Page "${emptyPage.title}" is empty. Add meaningful content before saving.`;

    return '';
};

const createAdminDocPage = (title: string, content = '<h1>New page</h1><p>Write here.</p>'): ProductDocPage => {
    const now = Date.now();

    return {
        id: `doc-page-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: title.trim() || 'Untitled Page',
        content,
        createdAt: now,
        updatedAt: now,
    };
};

const saveAdminEditorSelection = (editor: HTMLDivElement | null, selectionRef: React.MutableRefObject<Range | null>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editor) return;

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
        selectionRef.current = range.cloneRange();
    }
};

const restoreAdminEditorSelection = (editor: HTMLDivElement | null, selectionRef: React.MutableRefObject<Range | null>) => {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range || !editor || !editor.contains(range.commonAncestorContainer)) return;

    selection.removeAllRanges();
    selection.addRange(range);
};

const runAdminRichTextCommand = (
    editor: HTMLDivElement | null,
    selectionRef: React.MutableRefObject<Range | null>,
    command: string,
    commandValue?: string
) => {
    if (!editor) return false;

    editor.focus();
    restoreAdminEditorSelection(editor, selectionRef);

    try {
        const supported = typeof document.queryCommandSupported === 'function'
            ? document.queryCommandSupported(command)
            : true;

        if (!supported && command !== 'formatBlock') return false;

        const ok = document.execCommand(command, false, commandValue);
        saveAdminEditorSelection(editor, selectionRef);
        return ok;
    } catch {
        return false;
    }
};

const AdminDocsEditor: React.FC<{ value: string; onChange: (value: string) => void; }> = ({ value, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const selectionRef = useRef<Range | null>(null);
    const [warning, setWarning] = useState('');

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const runCommand = (command: string, commandValue?: string) => {
        const ok = runAdminRichTextCommand(editorRef.current, selectionRef, command, commandValue);

        if (!ok) {
            setWarning('Formatting failed. Click inside the editor and try again.');
            return;
        }

        setWarning('');
        onChange(editorRef.current?.innerHTML || '');
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-white/50 bg-white/80 shadow-sm">
            <div className="flex flex-wrap gap-2 border-b border-white/50 bg-white/80 p-3 backdrop-blur-xl">
                {(editorCommands || []).map(([command, label, value]) => (
                    <button
                        key={`${command}-${label}`}
                        type="button"
                        onPointerDown={event => event.preventDefault()}
                        onClick={() => runCommand(command, value)}
                        className="rounded-xl border border-white/50 bg-white/80 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-white hover:shadow-sm"
                    >
                        {label}
                    </button>
                ))}
            </div>

            {warning && <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">{warning}</p>}

            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => onChange(editorRef.current?.innerHTML || '')}
                onBlur={() => onChange(editorRef.current?.innerHTML || '')}
                onKeyUp={() => saveAdminEditorSelection(editorRef.current, selectionRef)}
                onMouseUp={() => saveAdminEditorSelection(editorRef.current, selectionRef)}
                onTouchEnd={() => saveAdminEditorSelection(editorRef.current, selectionRef)}
                onFocus={() => saveAdminEditorSelection(editorRef.current, selectionRef)}
                className="min-h-[62vh] max-w-none bg-white/80 p-5 text-slate-900 outline-none md:p-8 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-3xl [&_h2]:font-black [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
            />
        </div>
    );
};

const AdminOpenDocsBuilder: React.FC<{
    resourceName: string;
    pages: ProductDocPage[];
    activePageId: string;
    error: string;
    onResourceNameChange: (value: string) => void;
    onPagesChange: (pages: ProductDocPage[]) => void;
    onActivePageChange: (pageId: string) => void;
    onBack: () => void;
    onSave: () => void;
}> = ({ resourceName, pages, activePageId, error, onResourceNameChange, onPagesChange, onActivePageChange, onBack, onSave }) => {
    const activePage = pages.find(page => page.id === activePageId) || pages[0];

    const addPage = () => {
        const page = createAdminDocPage(`Page ${pages.length + 1}`);
        onPagesChange([...(pages || []), page]);
        onActivePageChange(page.id);
    };

    const renamePage = () => {
        if (!activePage) return;

        const title = prompt('Rename this docs tab', activePage.title)?.trim();
        if (!title) return;

        onPagesChange((pages || []).map(page =>
            page.id === activePage.id ? { ...page, title, updatedAt: Date.now() } : page
        ));
    };

    const deletePage = () => {
        if (!activePage || pages.length <= 1) return;
        if (!confirm('Delete this docs page?')) return;

        const nextPages = pages.filter(page => page.id !== activePage.id);
        onPagesChange(nextPages);
        onActivePageChange(nextPages[0]?.id || '');
    };

    return (
        <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-slate-950/75 p-0 backdrop-blur-xl sm:p-4">
            <div className="flex h-full min-h-0 overflow-hidden bg-[#f8fbff] text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:rounded-[2rem] sm:border sm:border-white/40">
                <aside className="flex w-[86vw] max-w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white/90 p-3 backdrop-blur-xl sm:w-80 sm:p-4">
                    <button type="button" onClick={onBack} className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">← Back to Add Content</button>
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/80 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">Nested docs page</p>
                        <p className="mt-1 text-xs font-bold leading-5 text-slate-600">Create multiple pages, switch tabs, rename them, then save as one Open Docs content item.</p>
                    </div>
                    <label className={`${labelClass} mt-4`}>Open Docs Name</label>
                    <input value={resourceName} onChange={event => onResourceNameChange(event.target.value)} className={fieldClass} placeholder="Chapter notes, workbook..." />
                    {error && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
                    <div className="mt-5 flex-1 overflow-y-auto custom-scrollbar">
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.24em] text-slate-500">Docs tabs</p>
                        <div className="space-y-2">{(pages || []).map((page, index) => (<button key={page.id} type="button" onClick={() => onActivePageChange(page.id)} className={`w-full rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${page.id === activePageId ? 'bg-cyan-100 text-cyan-800 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-50'}`}><span className="block truncate">Tab {index + 1}: {page.title}</span><span className="mt-1 block truncate text-[10px] uppercase tracking-widest text-slate-400">{getMeaningfulDocText(page.content).slice(0, 42) || 'Empty page'}</span></button>))}</div>
                    </div>
                    <div className="mt-4 space-y-2">
                        <button type="button" onClick={addPage} className="w-full rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-cyan-700">+ Create new page</button>
                        <button type="button" onClick={renamePage} className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-200">Rename current tab</button>
                        {pages.length > 1 && (<button type="button" onClick={deletePage} className="w-full rounded-2xl bg-rose-100 px-4 py-3 text-sm font-black text-rose-700 hover:bg-rose-200">Delete current page</button>)}
                    </div>
                </aside>
                <main className="flex min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white/85 p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-4">
                        <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-600">Full-page builder</p><h3 className="truncate text-xl font-black text-slate-900 sm:text-2xl">{activePage?.title || 'Open Docs Builder'}</h3></div>
                        <div className="flex shrink-0 gap-2"><button type="button" onClick={onBack} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Back</button><button type="button" onClick={onSave} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800">Save Open Docs</button></div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar sm:p-5 md:p-6">
                        {activePage ? (<AdminDocsEditor value={activePage.content} onChange={content => onPagesChange((pages || []).map(page => page.id === activePage.id ? { ...page, content, updatedAt: Date.now() } : page))} />) : (<div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-black text-slate-900">No docs page selected</p><button type="button" onClick={addPage} className="mt-4 rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white">Create first page</button></div>)}
                    </div>
                </main>
            </div>
        </div>
    );
};

const ContentComposer: React.FC<{
    onAdd: (file: Omit<ProductFile, 'id'>) => void;
    onClose: () => void;
    initialFile?: ProductFile | null;
    productId: number | string;
}> = ({ onAdd, onClose, initialFile = null, productId }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isEditing = Boolean(initialFile);
    const [uploadConfig, setUploadConfig] = useState<{ type: ProductFileType; accept: string } | null>(null);
    const [formState, setFormState] = useState<{ type: ProductFileType; url: string; name: string; content: string } | null>(() => initialFile ? {
        type: initialFile.type,
        url: initialFile.url || '',
        name: initialFile.name || 'Learning Resource',
        content: initialFile.content || '',
    } : null);
    const [docPages, setDocPages] = useState<ProductDocPage[]>(() => initialFile?.type === 'doc' ? (normaliseDocPages(initialFile) || []) : []);
    const [activeDocPageId, setActiveDocPageId] = useState(() => initialFile?.type === 'doc' ? (normaliseDocPages(initialFile)?.[0]?.id || '') : '');
    const [docError, setDocError] = useState('');
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() => initialFile?.quiz?.questions?.length ? normaliseQuizQuestions(initialFile.quiz.questions) : [{ prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const quizListRef = useRef<HTMLDivElement>(null);
    const previousQuizQuestionCountRef = useRef(quizQuestions.length);

    const contentTypes: Array<{ type: ProductFileType; title: string; description: string; icon: string; accept?: string }> = [
        { type: 'video', title: 'Video Upload', description: 'Upload MP4/WebM lesson files.', icon: '🎬', accept: 'video/*' },
        { type: 'youtube', title: 'YouTube Video', description: 'Embed a hosted YouTube lesson.', icon: '▶️' },
        { type: 'pdf', title: 'PDF', description: 'Attach worksheets, notes, or guides.', icon: '📄', accept: 'application/pdf' },
        { type: 'doc', title: 'Open Docs', description: 'Open a full-page builder for multi-page lesson notes.', icon: '🧠' },
        { type: 'quiz', title: 'Quiz', description: 'Create interactive assessment questions.', icon: '✅' },
        { type: 'link', title: 'External Link', description: 'Reference any hosted resource.', icon: '🔗' },
        { type: 'sheet', title: 'Spreadsheet', description: 'Upload CSV/XLS study material.', icon: '📊', accept: '.csv,.xls,.xlsx' },
        { type: 'ebook', title: 'E-book', description: 'Upload EPUB or PDF book content.', icon: '📚', accept: '.epub,.pdf' },
        { type: 'audio', title: 'Audio', description: 'Upload audio classes or podcasts.', icon: '🎧', accept: 'audio/*' },
    ];

    const triggerFileUpload = (type: ProductFileType, accept: string) => {
        setUploadConfig({ type, accept });
        fileInputRef.current?.click();
    };

    const showForm = (type: ProductFileType) => {
        const selected = contentTypes.find(item => item.type === type);

        setFormState({
            type,
            url: '',
            name: selected?.title || 'Learning Resource',
            content: type === 'doc' ? '<h1>Open Docs Workspace</h1><p>Start building your lesson here.</p>' : '',
        });

        if (type === 'doc') {
            const firstPage = createAdminDocPage('Page 1', '<h1>Open Docs Workspace</h1><p>Start building your lesson here.</p>');
            setDocPages([firstPage]);
            setActiveDocPageId(firstPage.id);
            setDocError('');
        }

        if (type === 'quiz') {
            setQuizQuestions([{ prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
        }
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        const selectedUploadConfig = uploadConfig;

        event.target.value = '';
        setUploadConfig(null);

        if (!file || !selectedUploadConfig) return;

        const maxBytes = getAdminContentMaxBytes(selectedUploadConfig.type);

        if (selectedUploadConfig.type === 'audio') {
            console.info('ADMIN_AUDIO_UPLOAD_SELECTED', { productId, fileName: file.name, size: file.size, contentType: file.type });
        }

        if (file.size > maxBytes) {
            alert(`${selectedUploadConfig.type} file is too large. Max allowed size is ${Math.round(maxBytes / (1024 * 1024))}MB.`);
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const uploaded = await uploadAdminContentFile(file, selectedUploadConfig.type, productId, setUploadProgress);
            const now = Date.now();

            onAdd({
                name: file.name,
                type: selectedUploadConfig.type,
                url: uploaded.url,
                storagePath: uploaded.storagePath,
                size: uploaded.size,
                contentType: uploaded.contentType,
                createdAt: now,
                updatedAt: now,
                content: '',
                quiz: { questions: [] },
            });

            onClose();
        } catch (error) {
            console.error('Admin content upload failed:', error);
            alert(error instanceof Error ? error.message : 'UNKNOWN_UPLOAD_ERROR: File upload failed.');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const updateQuizQuestion = (questionIndex: number, updater: (question: QuizQuestion) => QuizQuestion) => {
        setQuizQuestions(prev => (prev || []).map((question, index) => index === questionIndex ? updater(question) : question));
    };

    useEffect(() => {
        if (formState?.type !== 'quiz') {
            previousQuizQuestionCountRef.current = quizQuestions.length;
            return;
        }

        const questionWasAdded = quizQuestions.length > previousQuizQuestionCountRef.current;
        previousQuizQuestionCountRef.current = quizQuestions.length;

        if (questionWasAdded) {
            window.requestAnimationFrame(() => {
                const lastQuestion = quizListRef.current?.lastElementChild;
                lastQuestion?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
    }, [formState?.type, quizQuestions.length]);

    const addQuizQuestion = () => {
        setQuizQuestions(prev => [...(prev || []), { prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    };

    const handleFormSubmit = () => {
        if (!formState) return;

        const trimmedName = formState.name.trim() || 'Untitled Resource';

        if (formState.type === 'quiz') {
            onAdd({
                name: trimmedName,
                type: 'quiz',
                url: '',
                content: '',
                quiz: { questions: quizQuestions || [] },
            });
            onClose();
            return;
        }

        if (formState.type === 'doc') {
            const validationError = validateOpenDocsContent(trimmedName, docPages);

            if (validationError) {
                setDocError(validationError);
                return;
            }

            const cleanPages = docPages.map(page => ({
                ...page,
                title: page.title.trim(),
                content: page.content || '<p></p>',
                updatedAt: page.updatedAt || Date.now(),
            }));

            onAdd({
                name: trimmedName,
                type: 'doc',
                url: '',
                content: cleanPages[0]?.content || '',
                docPages: cleanPages,
                quiz: { questions: [] },
            });

            onClose();
            return;
        }

        onAdd({
            name: trimmedName,
            type: formState.type,
            url: formState.url,
            content: '',
            quiz: { questions: [] },
        });

        onClose();
    };

    return (
        <div className="mt-5 rounded-[1.75rem] border border-cyan-400/20 bg-cyan-400/5 p-5 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">Content Studio</p>
                    <h4 className="text-xl font-black text-slate-900">{isEditing ? 'Edit learning content' : 'Add learning content'}</h4>
                </div>
                <button type="button" onClick={onClose} className="rounded-full border border-white/50 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white/80 hover:shadow-sm">
                    Close
                </button>
            </div>

            {!formState ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(contentTypes || []).map(item => (
                        <button
                            key={item.type}
                            type="button"
                            onClick={() => item.accept ? triggerFileUpload(item.type, item.accept) : showForm(item.type)}
                            className="rounded-2xl border border-white/50 bg-white/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-white/80 hover:shadow-sm"
                        >
                            <span className="text-2xl">{item.icon}</span>
                            <span className="mt-3 block font-black text-slate-900">{item.title}</span>
                            <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
                        </button>
                    ))}
                </div>
            ) : formState.type === 'doc' ? (
                typeof document !== 'undefined' ? createPortal(
                    <AdminOpenDocsBuilder
                        resourceName={formState.name}
                        pages={docPages}
                        activePageId={activeDocPageId}
                        error={docError}
                        onResourceNameChange={value => setFormState(prev => prev ? { ...prev, name: value } : prev)}
                        onPagesChange={setDocPages}
                        onActivePageChange={setActiveDocPageId}
                        onBack={() => {
                            setFormState(null);
                            setDocError('');
                        }}
                        onSave={handleFormSubmit}
                    />,
                    document.body
                ) : (
                    <AdminOpenDocsBuilder
                        resourceName={formState.name}
                        pages={docPages}
                        activePageId={activeDocPageId}
                        error={docError}
                        onResourceNameChange={value => setFormState(prev => prev ? { ...prev, name: value } : prev)}
                        onPagesChange={setDocPages}
                        onActivePageChange={setActiveDocPageId}
                        onBack={() => {
                            setFormState(null);
                            setDocError('');
                        }}
                        onSave={handleFormSubmit}
                    />
                )
            ) : (
                <div className="flex max-h-[78vh] flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/80">
                    <div className="shrink-0 space-y-5 border-b border-white/50 bg-white/80 p-4 backdrop-blur-xl sm:p-5">
                        <div>
                            <label className={labelClass}>Resource Name</label>
                            <input value={formState.name} onChange={event => setFormState(prev => prev ? { ...prev, name: event.target.value } : prev)} className={fieldClass} />
                        </div>

                        {formState.type === 'quiz' && (
                            <p className="rounded-2xl border border-cyan-300/20 bg-cyan-600/10 px-4 py-3 text-sm font-bold text-cyan-700">
                                {quizQuestions.length} question{quizQuestions.length === 1 ? '' : 's'} added. Scroll inside this quiz builder to review every question before saving.
                            </p>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                        {formState.type === 'quiz' ? (
                            <div className="space-y-4">
                                <div ref={quizListRef} className="space-y-4">
                                    {(quizQuestions || []).map((question, questionIndex) => (
                                        <div key={questionIndex} className="rounded-2xl border border-white/50 bg-white/80 p-4">
                                            <label className={labelClass}>Question {questionIndex + 1}</label>
                                            <input value={question.prompt} onChange={event => updateQuizQuestion(questionIndex, q => ({ ...q, prompt: event.target.value }))} className={fieldClass} placeholder="What should learners answer?" />

                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                                {(question.options || []).map((option, optionIndex) => (
                                                    <label key={optionIndex} className="block">
                                                        <span className="mb-2 block text-xs font-bold text-slate-600">Option {optionIndex + 1}</span>
                                                        <div className="flex gap-2">
                                                            <input value={option} onChange={event => updateQuizQuestion(questionIndex, q => ({ ...q, options: (q.options || []).map((current, idx) => idx === optionIndex ? event.target.value : current) }))} className={fieldClass} />
                                                            <button type="button" onClick={() => updateQuizQuestion(questionIndex, q => ({ ...q, correctAnswer: optionIndex }))} className={`rounded-2xl px-4 text-xs font-black ${question.correctAnswer === optionIndex ? 'bg-emerald-400 text-slate-900' : 'border border-white/50 text-slate-600'}`}>
                                                                Correct
                                                            </button>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button type="button" onClick={addQuizQuestion} className="w-full rounded-2xl border border-dashed border-cyan-300/40 py-3 font-black text-cyan-700 hover:bg-cyan-400/10">
                                    + Add Question
                                </button>
                            </div>
                        ) : (
                            <div>
                                <label className={labelClass}>{formState.type === 'youtube' ? 'YouTube URL' : 'Resource URL'}</label>
                                <input value={formState.url} onChange={event => setFormState(prev => prev ? { ...prev, url: event.target.value } : prev)} className={fieldClass} placeholder="https://example.com/resource" />
                            </div>
                        )}
                    </div>

                    <div className="shrink-0 border-t border-white/50 bg-white/80 p-4 backdrop-blur-xl sm:p-5">
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setFormState(null)} className="rounded-2xl border border-white/50 px-5 py-3 font-bold text-slate-600 hover:bg-white/80 hover:shadow-sm">
                                Back
                            </button>
                            <button type="button" onClick={handleFormSubmit} className="rounded-2xl bg-cyan-600 px-6 py-3 font-black text-white shadow-sm hover:bg-cyan-700">
                                {isEditing ? 'Save Content' : 'Add Content'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <input ref={fileInputRef} type="file" accept={uploadConfig?.accept} onChange={handleFileSelected} className="hidden" />
            {isUploading && <p className="mt-4 text-sm font-bold text-cyan-700">Uploading content... {uploadProgress}% complete. Audio/video/PDF files are added only after Firebase Storage returns a download URL.</p>}
        </div>
    );
};

const ModuleEditor: React.FC<{
    module: CourseModule;
    allModules: CourseModule[];
    level: number;
    onUpdate: (modules: CourseModule[]) => void;
    onAddChild: (parentId: string) => void;
    productId: number | string;
}> = ({ module, allModules, level, onUpdate, onAddChild, productId }) => {
    const [isAddingContent, setIsAddingContent] = useState(false);
    const [editingFile, setEditingFile] = useState<ProductFile | null>(null);
    const files = module.files || [];
    const childModules = module.modules || [];

    const updateModule = (updater: (module: CourseModule) => CourseModule) => {
        onUpdate(recursiveModuleUpdate(allModules || [], module.id, updater));
    };

    const closeContentComposer = () => {
        setIsAddingContent(false);
        setEditingFile(null);
    };

    const handleAddContent = (fileData: Omit<ProductFile, 'id'>) => {
        const now = Date.now();
        const newFile: ProductFile = { ...fileData, id: `file-${now}`, createdAt: fileData.createdAt || now, updatedAt: now, quiz: fileData.quiz || { questions: [] } };
        onUpdate(recursiveFileUpdate(allModules || [], module.id, currentFiles => [...(currentFiles || []), newFile]));
        closeContentComposer();
    };

    const handleUpdateContent = (fileData: Omit<ProductFile, 'id'>) => {
        if (!editingFile) return;

        const updatedFile: ProductFile = {
            ...fileData,
            id: editingFile.id,
            createdAt: editingFile.createdAt || fileData.createdAt || Date.now(),
            updatedAt: Date.now(),
            quiz: fileData.quiz || { questions: [] },
        };

        onUpdate(recursiveFileUpdate(allModules || [], module.id, currentFiles =>
            (currentFiles || []).map(file => file.id === editingFile.id ? updatedFile : file)
        ));

        closeContentComposer();
    };

    const handleDeleteContent = (fileId: string) => {
        onUpdate(recursiveFileUpdate(allModules || [], module.id, currentFiles =>
            (currentFiles || []).filter(file => file.id !== fileId)
        ));
    };

    return (
        <div className={`rounded-[1.75rem] border p-5 ${level === 0 ? 'border-white/50 bg-white/80' : 'border-white/50 bg-white/80'}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                    <label className={labelClass}>Module Title</label>
                    <input value={module.title} onChange={event => updateModule(current => ({ ...current, title: event.target.value }))} className={fieldClass} placeholder="Module title" />
                </div>
                <div className="flex gap-2 pt-6">
                    <button type="button" onClick={() => setIsAddingContent(true)} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 hover:bg-cyan-100">+ Content</button>
                    <button type="button" onClick={() => onAddChild(module.id)} className="rounded-2xl border border-white/50 px-4 py-3 text-sm font-black text-slate-600 hover:bg-white/80 hover:shadow-sm">+ Submodule</button>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {files.length > 0 ? (files || []).map(file => (
                    <div key={file.id} className="flex flex-col gap-2 rounded-2xl border border-white/50 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-black text-slate-900">{file.name}</p>
                            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{file.type}{file.quiz?.questions?.length ? ` • ${file.quiz.questions.length} questions` : ''}</p>
                        </div>
                        <div className="flex gap-2 self-start sm:self-auto">
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingFile(file);
                                    setIsAddingContent(false);
                                }}
                                className="rounded-xl border border-cyan-300/30 px-3 py-2 text-xs font-black text-cyan-700 hover:bg-cyan-400/10"
                            >
                                Edit
                            </button>
                            <button type="button" onClick={() => handleDeleteContent(file.id)} className="rounded-xl border border-red-400/30 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-500/10">Remove</button>
                        </div>
                    </div>
                )) : <p className="rounded-2xl border border-dashed border-white/50 p-4 text-sm text-slate-600">No content yet. Add videos, PDFs, Open Docs, quizzes, and resource links here.</p>}
            </div>

            {(isAddingContent || editingFile) && (
                <ContentComposer
                    onAdd={editingFile ? handleUpdateContent : handleAddContent}
                    onClose={closeContentComposer}
                    initialFile={editingFile}
                    productId={productId}
                />
            )}

            {childModules.length > 0 && (
                <div className="mt-5 space-y-4 border-l border-white/50 pl-4">
                    {(childModules || []).map(child => (
                        <ModuleEditor key={child.id} module={child} allModules={allModules} level={level + 1} onUpdate={onUpdate} onAddChild={onAddChild} productId={productId} />
                    ))}
                </div>
            )}
        </div>
    );
};

const ProductForm: React.FC<{
    mode: 'add' | 'edit';
    product?: ProductWithRating | null;
    coupons: Coupon[];
    onSave: (product: Omit<Product, 'id'>) => Promise<boolean>;
    onCancel: () => void;
}> = ({ mode, product, coupons, onSave, onCancel }) => {
    const [formData, setFormData] = useState<ProductFormData>(() => createEmptyProductForm(product));
    const [modules, setModules] = useState<CourseModule[]>(() => normaliseModules(product?.courseContent || initialProductState.courseContent || []));
    const [images, setImages] = useState<string[]>(() => product?.images || initialProductState.images || []);
    const [productImages, setProductImages] = useState<Partial<Record<ProductImageSlot, string>>>(() => product?.productImages || {});
    const slotInputRefs = useRef<Partial<Record<ProductImageSlot, HTMLInputElement | null>>>({});
    const [imageMode, setImageMode] = useState<'upload' | 'ai'>('upload');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [isUploadingProductImage, setIsUploadingProductImage] = useState(false);
    const productImageInputRef = useRef<HTMLInputElement>(null);
    const draftProductIdRef = useRef<number | string>(product?.id || `draft-${Date.now()}`);

    useEffect(() => {
        const regular = parseFloat(formData.price) || 0;
        const sale = parseFloat(formData.salePrice) || 0;
        setDiscountPercent(regular > 0 && sale > 0 && sale < regular ? Math.round(((regular - sale) / regular) * 100) : 0);
    }, [formData.price, formData.salePrice]);

    useEffect(() => {
        if (formData.isFree && (!formData.price || formData.price === '0')) {
            setFormData(prev => ({ ...prev, price: '3', salePrice: '' }));
        }
    }, [formData.isFree]);

    const handleProductImagesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = event.currentTarget.files ? Array.from(event.currentTarget.files) as File[] : [];
        event.target.value = '';
        if (!files.length) return;

        setIsUploadingProductImage(true);

        const oversizedFile = files.find(file => file.size > MAX_PRODUCT_IMAGE_BYTES);
        if (oversizedFile) {
            alert('Product image is too large. Max allowed size is 8MB.');
            return;
        }

        try {
            const uploadedUrls = await Promise.all(files.map(async file => {
                const uploaded = await uploadAdminProductAsset(file, buildAdminImageStoragePath(file, 'gallery', draftProductIdRef.current), 'ADMIN_PRODUCT_IMAGE_UPLOAD');
                return uploaded.url;
            }));
            setImages(prev => [...(prev || []), ...uploadedUrls]);
        } catch (error) {
            console.error('Product image upload failed:', error);
            alert('Product image upload failed. Please check Firebase Storage permissions and try again.');
        } finally {
            setIsUploadingProductImage(false);
        }
    };


    const handleSlotImageUpload = (slot: ProductImageSlot, file?: File) => {
        if (!file) return;
        const config = PRODUCT_IMAGE_SLOTS[slot];
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = async () => {
            URL.revokeObjectURL(objectUrl);
            const uploadedRatio = image.naturalWidth / image.naturalHeight;
            if (Math.abs(uploadedRatio - config.ratioValue) / config.ratioValue > 0.01) {
                alert(`This image is not the required ${config.ratio} ratio. Upload ${config.recommendedSize} for best result.`);
                return;
            }

            setIsUploadingProductImage(true);

            if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
                alert('Product image is too large. Max allowed size is 8MB.');
                return;
            }

            try {
                const uploaded = await uploadAdminProductAsset(file, buildAdminImageStoragePath(file, slot, draftProductIdRef.current), 'ADMIN_PRODUCT_IMAGE_UPLOAD');
                setProductImages(prev => ({ ...prev, [slot]: uploaded.url }));
            } catch (error) {
                console.error('Product slot image upload failed:', error);
                alert('Product image upload failed. Please check Firebase Storage permissions and try again.');
            } finally {
                setIsUploadingProductImage(false);
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            alert('Could not read this image. Please upload a valid image file.');
        };
        image.src = objectUrl;
    };

    const handleGenerateAiImage = async () => {
        const prompt = encodeURIComponent(`${formData.title || 'Education course'} ${formData.description || 'premium learning product'}`);
        setIsGeneratingImage(true);
        try {
            const aiImageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=768&nologo=true`;
            setImages(prev => [aiImageUrl, ...(prev || []).filter(Boolean)]);
            setImageMode('upload');
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const addRootModule = () => {
        setModules(prev => [...(prev || []), { id: `mod-${Date.now()}`, title: 'New Module', files: [], modules: [] }]);
    };

    const addChildModule = (parentId: string) => {
        const child: CourseModule = { id: `mod-${Date.now()}`, title: 'New Submodule', files: [], modules: [] };
        setModules(prev => recursiveModuleUpdate(prev || [], parentId, module => ({ ...module, modules: [...(module.modules || []), child] })));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isSavingProduct) return;
        const resolvedPaymentLink = formData.paymentLink.trim() || product?.paymentLink?.trim() || DEFAULT_PRODUCT_PAYMENT_LINK;

        const features = ((formData.featuresText || '').split('\n') || []).map(item => item.trim()).filter(Boolean);
        const tags = ((formData.tagsText || '').split(',') || []).map(item => item.trim()).filter(Boolean);
        const formattedPrice = formData.price ? `₹${formData.price}` : '₹0';
        const formattedSalePrice = formData.salePrice ? `₹${formData.salePrice}` : undefined;

        setIsSavingProduct(true);

        const saved = await onSave({
            imageSeed: formData.imageSeed || formData.title || `product-${Date.now()}`,
            images: images || [],
            productImages,
            title: formData.title,
            description: formData.description,
            longDescription: formData.longDescription,
            features,
            tags,
            price: formattedPrice,
            salePrice: formattedSalePrice,
            coinPrice: Math.max(0, Number(formData.coinPrice || 0)),
            isCoinRedeemEnabled: formData.isCoinRedeemEnabled !== false,
            category: formData.category,
            department: formData.department,
            inStock: formData.inStock,
            isVisible: formData.isVisible,
            manualRating: formData.manualRating ? parseFloat(formData.manualRating) : null,
            sku: formData.sku,
            dimensions: formData.dimensions,
            fileFormat: formData.fileFormat,
            aspectRatio: formData.aspectRatio,
            isFree: formData.isFree,
            couponCode: formData.couponCode,
            paymentLink: resolvedPaymentLink,
            courseContent: normaliseModules(modules || []),
            priceHistory: product?.priceHistory || [],
            wishlistCount: product?.wishlistCount,
            viewCount: product?.viewCount,
        });

        if (!saved) {
            setIsSavingProduct(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] text-slate-900">
            <form onSubmit={handleSubmit}>
                <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                    <div className="mb-8 rounded-[1.75rem] border border-white/50 bg-white/70 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <button type="button" onClick={onCancel} className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-white/90 hover:shadow-sm sm:w-auto">← Back to List</button>
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-400">{mode === 'add' ? 'Create Product' : 'Edit Product'}</p>
                                <h1 className="mt-1 break-words text-2xl font-black text-slate-900 sm:text-3xl">{mode === 'add' ? 'New digital product' : formData.title || 'Product editor'}</h1>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                        <section className="space-y-8 lg:col-span-2">
                            <div className={glassCard}>
                                <div className="mb-6">
                                    <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Main Settings</p>
                                    <h2 className="mt-2 text-2xl font-black text-slate-900">Product identity</h2>
                                </div>
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Product Title</label>
                                        <input required value={formData.title} onChange={event => setFormData(prev => ({ ...prev, title: event.target.value }))} className={fieldClass} placeholder="Masterclass, template pack, guide..." />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Short Description</label>
                                        <textarea required rows={3} value={formData.description} onChange={event => setFormData(prev => ({ ...prev, description: event.target.value }))} className={fieldClass} placeholder="A concise storefront summary." />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Long Description</label>
                                        <textarea rows={7} value={formData.longDescription} onChange={event => setFormData(prev => ({ ...prev, longDescription: event.target.value }))} className={fieldClass} placeholder="Deep product narrative, outcomes, curriculum promise..." />
                                    </div>
                                    <div>
                                        <label className={labelClass}>SKU</label>
                                        <input value={formData.sku} onChange={event => setFormData(prev => ({ ...prev, sku: event.target.value }))} className={fieldClass} placeholder="DC-COURSE-001" />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Manual Rating</label>
                                        <input type="number" min="0" max="5" step="0.1" value={formData.manualRating} onChange={event => setFormData(prev => ({ ...prev, manualRating: event.target.value }))} className={fieldClass} placeholder="4.8" />
                                    </div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Curriculum Builder</p>
                                        <h2 className="mt-2 text-2xl font-black text-slate-900">Course content / files</h2>
                                        <p className="mt-2 text-sm text-slate-600">Organize Video, PDF, Open Docs, Quiz, audio, sheets, e-books, and links in spacious modules.</p>
                                    </div>
                                    <button type="button" onClick={addRootModule} className="rounded-2xl bg-white px-5 py-3 font-black text-slate-900 hover:bg-cyan-100">+ Add Module</button>
                                </div>
                                <div className="space-y-5">
                                    {(modules || []).length > 0 ? (modules || []).map(module => (
                                        <ModuleEditor key={module.id} module={module} allModules={modules || []} level={0} onUpdate={setModules} onAddChild={addChildModule} productId={draftProductIdRef.current} />
                                    )) : (
                                        <button type="button" onClick={addRootModule} className="w-full rounded-[1.75rem] border border-dashed border-cyan-300/30 bg-cyan-400/5 p-10 text-center transition hover:bg-cyan-400/10">
                                            <span className="block text-4xl">🧱</span>
                                            <span className="mt-3 block text-lg font-black text-slate-900">Start with your first module</span>
                                            <span className="mt-1 block text-sm text-slate-600">Every new module is initialized with empty files and submodules to prevent undefined map crashes.</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>

                        <aside className="space-y-8 lg:col-span-1">
                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Publish Status</h2>
                                <div className="mt-5 space-y-4">
                                    <label className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/80 p-4">
                                        <span><span className="block font-black text-slate-900">Visible</span><span className="text-sm text-slate-600">Show on storefront</span></span>
                                        <input type="checkbox" checked={formData.isVisible} onChange={event => setFormData(prev => ({ ...prev, isVisible: event.target.checked }))} className="h-5 w-5 accent-cyan-300" />
                                    </label>
                                    <label className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/80 p-4">
                                        <span><span className="block font-black text-slate-900">In Stock</span><span className="text-sm text-slate-600">Purchasable now</span></span>
                                        <input type="checkbox" checked={formData.inStock} onChange={event => setFormData(prev => ({ ...prev, inStock: event.target.checked }))} className="h-5 w-5 accent-emerald-300" />
                                    </label>
                                    <label className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/80 p-4">
                                        <span><span className="block font-black text-slate-900">Free via coupon</span><span className="text-sm text-slate-600">Enable free access flow</span></span>
                                        <input type="checkbox" checked={formData.isFree} onChange={event => setFormData(prev => ({ ...prev, isFree: event.target.checked }))} className="h-5 w-5 accent-blue-300" />
                                    </label>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Pricing</h2>
                                {discountPercent > 0 && <p className="mt-3 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-700">{discountPercent}% discount active</p>}
                                <div className="mt-5 space-y-4">
                                    <div><label className={labelClass}>Regular Price</label><input required type="number" value={formData.price} onChange={event => setFormData(prev => ({ ...prev, price: event.target.value }))} className={fieldClass} placeholder="999" /></div>
                                    <div><label className={labelClass}>Sale Price</label><input type="number" value={formData.salePrice} onChange={event => setFormData(prev => ({ ...prev, salePrice: event.target.value }))} className={fieldClass} placeholder="499" /></div>
                                    <div><label className={labelClass}>EduCoin Price (Leave 0 to disable coin purchase)</label><input type="number" min="0" value={formData.coinPrice} onChange={event => setFormData(prev => ({ ...prev, coinPrice: event.target.value }))} className={fieldClass} placeholder="1200" /></div>
                                    <div className="mt-4">
                                      <label className="mb-2 block text-sm font-semibold text-slate-700">EduCoin Redeem Price</label>
                                      <input type="number" min="0" value={formData.coinPrice || 0} onChange={(event) => setFormData((previous) => ({ ...previous, coinPrice: String(Math.max(0, Number(event.target.value || 0))) }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Example: 299" />
                                      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={formData.isCoinRedeemEnabled !== false} onChange={(event) => setFormData((previous) => ({ ...previous, isCoinRedeemEnabled: event.target.checked }))} />Enable Pay with EduCoin</label>
                                    </div>
                                    <div><label className={labelClass}>Coupon Code</label><select value={formData.couponCode} onChange={event => setFormData(prev => ({ ...prev, couponCode: event.target.value }))} className={fieldClass}><option value="">No coupon</option>{(coupons || []).map(coupon => <option key={coupon.id} value={coupon.code}>{coupon.code}</option>)}</select></div>
                                    <div><label className={labelClass}>Razorpay Payment Page Link</label><input value={formData.paymentLink} onChange={event => setFormData(prev => ({ ...prev, paymentLink: event.target.value }))} className={fieldClass} placeholder="https://pages.razorpay.com/..." /></div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Categories & Metadata</h2>
                                <div className="mt-5 space-y-4">
                                    <div><label className={labelClass}>Category</label><input value={formData.category} onChange={event => setFormData(prev => ({ ...prev, category: event.target.value }))} className={fieldClass} placeholder="Design, Finance, Coding..." /></div>
                                    <div><label className={labelClass}>Department</label><select value={formData.department} onChange={event => setFormData(prev => ({ ...prev, department: event.target.value as ProductFormData['department'] }))} className={fieldClass}><option>Unisex</option><option>Men</option><option>Women</option></select></div>
                                    <div><label className={labelClass}>Dimensions</label><input value={formData.dimensions} onChange={event => setFormData(prev => ({ ...prev, dimensions: event.target.value }))} className={fieldClass} placeholder="1024x768, A4, 16:9" /></div>
                                    <div><label className={labelClass}>File Format</label><input value={formData.fileFormat} onChange={event => setFormData(prev => ({ ...prev, fileFormat: event.target.value }))} className={fieldClass} placeholder="PDF + MP4 + Docs" /></div>
                                    <div><label className={labelClass}>Features (one per line)</label><textarea rows={4} value={formData.featuresText} onChange={event => setFormData(prev => ({ ...prev, featuresText: event.target.value }))} className={fieldClass} /></div>
                                    <div><label className={labelClass}>Tags (comma separated)</label><input value={formData.tagsText} onChange={event => setFormData(prev => ({ ...prev, tagsText: event.target.value }))} className={fieldClass} placeholder="premium, beginner, template" /></div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Image Upload</h2>
                                <div className="mt-5 grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setImageMode('upload')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'upload' ? 'bg-cyan-600 text-slate-900' : 'border border-white/50 text-slate-600'}`}>Upload</button>
                                    <button type="button" onClick={() => setImageMode('ai')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'ai' ? 'bg-purple-300 text-slate-900' : 'border border-white/50 text-slate-600'}`}>AI Image</button>
                                </div>
                                <div className="mt-4">
                                    {imageMode === 'upload' ? (
                                        <button type="button" onClick={() => productImageInputRef.current?.click()} disabled={isUploadingProductImage} className="w-full rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-400/5 p-8 text-center font-black text-cyan-700 hover:bg-cyan-400/10 disabled:opacity-60">{isUploadingProductImage ? 'Uploading images to Firebase...' : 'Upload product images'}</button>
                                    ) : (
                                        <button type="button" onClick={handleGenerateAiImage} disabled={isGeneratingImage} className="w-full rounded-3xl border border-dashed border-purple-300/40 bg-purple-400/5 p-8 text-center font-black text-purple-700 hover:bg-purple-400/10 disabled:opacity-60">{isGeneratingImage ? 'Generating...' : 'Generate from title + description'}</button>
                                    )}
                                    <input ref={productImageInputRef} type="file" accept="image/*" multiple onChange={handleProductImagesUpload} className="hidden" />
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {((images || []).filter(Boolean) || []).map((image, index) => (
                                        <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-2xl border border-white/50 bg-white/80">
                                            <img src={image} alt={`Product ${index + 1}`} className="h-full w-full object-contain" />
                                            <button type="button" onClick={() => setImages(prev => (prev || []).filter((_, currentIndex) => currentIndex !== index))} className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-sm font-black text-white opacity-90">×</button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4"><label className={labelClass}>Image Seed</label><input value={formData.imageSeed} onChange={event => setFormData(prev => ({ ...prev, imageSeed: event.target.value }))} className={fieldClass} placeholder="Fallback image seed" /></div>
                                <div className="mt-6 border-t border-slate-200 pt-5">
                                    <h3 className="text-lg font-black text-slate-900">Display-specific thumbnails</h3>
                                    <p className="mt-1 text-xs font-bold text-slate-500">Upload one exact-ratio image for each storefront placement. Wrong ratios are rejected instead of cropped.</p>
                                    <div className="mt-4 space-y-4">
                                        {(Object.keys(PRODUCT_IMAGE_SLOTS) as ProductImageSlot[]).map(slot => {
                                            const config = PRODUCT_IMAGE_SLOTS[slot];
                                            return <div key={slot} className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                                                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-900">{config.label}</p><p className="text-xs font-bold text-slate-500">Required {config.ratio} · Recommended {config.recommendedSize}</p></div>{productImages[slot] ? <button type="button" onClick={() => setProductImages(prev => ({ ...prev, [slot]: undefined }))} className="rounded-full bg-red-500 px-2 py-1 text-xs font-black text-white">Remove</button> : null}</div>
                                                <div className={`mt-3 ${config.aspectClass} overflow-hidden rounded-xl bg-slate-100`}>
                                                    {productImages[slot] ? <img src={productImages[slot]} alt={config.label} className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center text-xs font-black text-slate-400">No {config.ratio} image</div>}
                                                </div>
                                                <button type="button" onClick={() => slotInputRefs.current[slot]?.click()} disabled={isUploadingProductImage} className="mt-3 w-full rounded-xl border border-dashed border-cyan-300 px-3 py-2 text-xs font-black text-cyan-700 disabled:opacity-60">Upload / Replace {config.ratio}</button>
                                                <input ref={node => { slotInputRefs.current[slot] = node; }} type="file" accept="image/*" className="hidden" onChange={event => { handleSlotImageUpload(slot, event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
                                            </div>;
                                        })}
                                    </div>
                                </div>

                            </div>
                        </aside>
                    </div>
                </main>

                <footer className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
                    <div className="rounded-[1.75rem] border border-white/50 bg-white/75 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-5">
                        <div className="mb-4 sm:mb-0">
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-400">Ready to publish</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">Review all product details above, then save your changes.</p>
                        </div>
                        <button type="submit" disabled={isSavingProduct || isUploadingProductImage} className="w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-7 py-4 font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-48">{isSavingProduct ? 'Saving to Firebase...' : mode === 'add' ? 'Save Product' : 'Update Product'}</button>
                    </div>
                </footer>
            </form>
        </div>
    );
};

const ProductManagement: React.FC<{
    products: ProductWithRating[];
    users: User[];
    coupons: Coupon[];
    onAddProduct: (product: Omit<Product, 'id'>) => Promise<boolean>;
    onUpdateProduct: (product: Product) => Promise<boolean>;
    onDeleteProduct: (id: number) => Promise<boolean>;
}> = ({ products, users, coupons, onAddProduct, onUpdateProduct, onDeleteProduct }) => {
    const [viewState, setViewState] = useState<ProductViewState>('list');
    const [editingProduct, setEditingProduct] = useState<ProductWithRating | null>(null);
    const [newProductForEmail, setNewProductForEmail] = useState<ProductWithRating | null>(null);
    const safeProducts = products || [];

    const openAddView = () => {
        setEditingProduct(null);
        setViewState('add');
    };

    const openEditView = (product: ProductWithRating) => {
        setEditingProduct({
            ...product,
            images: product.images || [],
            productImages: product.productImages || {},
            features: product.features || [],
            tags: product.tags || [],
            courseContent: normaliseModules(product.courseContent || []),
            priceHistory: product.priceHistory || [],
        });
        setViewState('edit');
    };

    const handleSave = async (productData: Omit<Product, 'id'>): Promise<boolean> => {
        const safeProductData: Omit<Product, 'id'> = {
            ...productData,
            ...emptyArrays,
            ...productData,
            images: productData.images || [],
            productImages: productData.productImages || {},
            features: productData.features || [],
            tags: productData.tags || [],
            courseContent: normaliseModules(productData.courseContent || []),
            priceHistory: productData.priceHistory || [],
        };

        const saved = editingProduct && viewState === 'edit'
            ? await onUpdateProduct({ ...safeProductData, id: editingProduct.id })
            : await onAddProduct(safeProductData);

        if (!saved) return false;

        if (!editingProduct || viewState !== 'edit') {
            setNewProductForEmail({ ...safeProductData, id: Date.now(), rating: 0, reviewCount: 0, calculatedRating: 0 });
        }

        setEditingProduct(null);
        setViewState('list');
        return true;
    };

    if (viewState !== 'list') {
        return (
            <>
                <ProductForm mode={viewState} product={editingProduct} coupons={coupons || []} onSave={handleSave} onCancel={() => { setEditingProduct(null); setViewState('list'); }} />
                {newProductForEmail && <NewProductEmailPreviewModal product={newProductForEmail} relatedProducts={[]} users={users || []} onClose={() => setNewProductForEmail(null)} />}
            </>
        );
    }

    return (
        <div className="min-h-screen bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] p-4 text-slate-900 animate-fade-in-up sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Admin Inventory</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Product Management</h1>
                        <p className="mt-2 max-w-2xl text-slate-600">Manage your digital catalogue from a premium full-page workflow. Add and edit products in dedicated nested screens, not cramped modals.</p>
                    </div>
                    <button onClick={openAddView} className="rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-7 py-4 font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition hover:-translate-y-0.5">+ Add Product</button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-white/50 bg-white/80 p-5 backdrop-blur-xl"><p className="text-sm font-bold text-slate-600">Total Products</p><p className="mt-2 text-3xl font-black text-slate-900">{safeProducts.length}</p></div>
                    <div className="rounded-[1.5rem] border border-white/50 bg-white/80 p-5 backdrop-blur-xl"><p className="text-sm font-bold text-slate-600">Visible</p><p className="mt-2 text-3xl font-black text-emerald-300">{safeProducts.filter(product => product.isVisible !== false).length}</p></div>
                    <div className="rounded-[1.5rem] border border-white/50 bg-white/80 p-5 backdrop-blur-xl"><p className="text-sm font-bold text-slate-600">Out of Stock</p><p className="mt-2 text-3xl font-black text-rose-300">{safeProducts.filter(product => product.inStock === false).length}</p></div>
                </div>

                <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/50 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-white/50 bg-white/80 text-xs uppercase tracking-[0.24em] text-slate-600">
                                <tr>
                                    <th className="p-5 font-black">Product</th>
                                    <th className="p-5 font-black">Status</th>
                                    <th className="p-5 font-black">Price</th>
                                    <th className="p-5 font-black">Content</th>
                                    <th className="p-5 text-right font-black">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {safeProducts.length > 0 ? (safeProducts || []).map(product => {
                                    const thumbnail = product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed || product.id}/100/100`;
                                    const contentCount = countModuleContent(product.courseContent || []);
                                    return (
                                        <tr key={product.id} className="group transition hover:bg-white/80 hover:shadow-sm">
                                            <td className="p-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-white/50 bg-white/80">
                                                        <img src={thumbnail} alt="" className="h-full w-full object-contain" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-black text-slate-900 group-hover:text-cyan-700">{product.title}</p>
                                                        <p className="mt-1 text-xs font-mono text-slate-600">{product.sku || 'NO-SKU'} • {product.category || 'Uncategorized'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex flex-col gap-2">
                                                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${product.inStock !== false ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-700' : 'border-red-300/30 bg-red-400/10 text-red-700'}`}>{product.inStock !== false ? 'In Stock' : 'Out of Stock'}</span>
                                                    {product.isFree && <span className="w-fit rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-700">Free Flow</span>}
                                                </div>
                                            </td>
                                            <td className="p-5 font-bold text-slate-600">
                                                {product.salePrice ? <div><p className="text-rose-700">{product.salePrice}</p><p className="text-xs text-slate-600 line-through">{product.price}</p></div> : product.price}
                                            </td>
                                            <td className="p-5"><span className="rounded-full border border-white/50 bg-white/80 px-3 py-1 text-xs font-black text-slate-600">{contentCount} items</span></td>
                                            <td className="p-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => openEditView(product)} className="rounded-2xl border border-cyan-300/30 px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-400/10">Edit</button>
                                                    <button onClick={() => onDeleteProduct(product.id)} className="rounded-2xl border border-red-300/30 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-400/10">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-slate-600">
                                            <p className="text-4xl">📦</p>
                                            <p className="mt-3 text-lg font-black text-slate-900">No products yet</p>
                                            <p className="mt-1">Create your first product using the full-page editor.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {newProductForEmail && <NewProductEmailPreviewModal product={newProductForEmail} relatedProducts={[]} users={users || []} onClose={() => setNewProductForEmail(null)} />}
        </div>
    );
};

export default ProductManagement;
