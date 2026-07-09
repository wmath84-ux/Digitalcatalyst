import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coupon, CourseModule, Product, ProductFile, ProductFileType, ProductWithRating, ProductDocPage, QuizQuestion, User, CourseAccessLevel } from '../../App';
import NewProductEmailPreviewModal from './NewProductEmailPreviewModal';
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, storage } from '../../firebase';
import { normalizeCoinPrice } from '../../utils/economy';
import { parseKeywordList, withProductSearchIndex } from '../../utils/productSearch';
import { validateProductImageUpload } from '../../utils/productImageUpload.js';
import PremiumImageUrlInput, { PremiumImageUrlStatus } from '../common/PremiumImageUrlInput';
import PremiumMediaUrlInput from '../common/PremiumMediaUrlInput';
import { buildUrlMediaSource, getFriendlyStorageErrorMessage, getStorageDisabledMessage, isStorageUploadEnabled } from '../../utils/mediaMode';

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
    searchKeywordsText: string;
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
    keywords: [],
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
        searchKeywordsText: ((source as any).keywords || []).join(', '),
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

const normaliseCourseAccessLevel = (value?: string): CourseAccessLevel => {
    if (value === 'paidUpdate' || value === 'hidden') return value;
    return 'included';
};


const extractYouTubeVideoId = (value?: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const idPattern = /^[a-zA-Z0-9_-]{11}$/;
    if (idPattern.test(raw)) return raw;

    try {
        const normalizedRaw = raw.startsWith('http://')
            ? raw.replace(/^http:\/\//i, 'https://')
            : raw;
        const parsedUrl = new URL(normalizedRaw);
        const host = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
        const parts = parsedUrl.pathname.split('/').filter(Boolean);
        const queryId = parsedUrl.searchParams.get('v') || parsedUrl.searchParams.get('video_id');

        if (queryId && idPattern.test(queryId)) return queryId;

        if (host === 'youtu.be') {
            const shortId = parts[0] || '';
            if (idPattern.test(shortId)) return shortId;
        }

        if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
            const route = parts[0] || '';
            const routeId = ['embed', 'shorts', 'live', 'v'].includes(route) ? parts[1] || '' : '';
            if (idPattern.test(routeId)) return routeId;
        }
    } catch {
        // Fallback regex below handles pasted iframe/src fragments or partial URLs.
    }

    const fallbackMatch = raw.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return fallbackMatch?.[1] || '';
};

const normaliseYouTubeUrl = (value: string) => {
    const videoId = extractYouTubeVideoId(value);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : value.trim();
};

const normaliseFiles = (files?: ProductFile[]): ProductFile[] => (files || []).map(file => {
    const legacyYoutubeSource = String(
        (file as any).youtubeVideoId ||
        file.youtubeUrl ||
        (file as any).videoUrl ||
        file.embedUrl ||
        file.url ||
        ''
    );
    const youtubeVideoId = file.type === 'youtube' ? extractYouTubeVideoId(legacyYoutubeSource) : '';

    return {
        ...file,
        url: file.type === 'youtube' ? normaliseYouTubeUrl(legacyYoutubeSource) : file.url,
        sourceType: file.type === 'youtube' ? 'external_url' : file.sourceType,
        youtubeUrl: file.type === 'youtube' ? normaliseYouTubeUrl(legacyYoutubeSource) : file.youtubeUrl,
        youtubeVideoId: file.type === 'youtube' ? youtubeVideoId : file.youtubeVideoId,
        accessLevel: normaliseCourseAccessLevel(file.accessLevel),
        paidUpdateId: file.paidUpdateId || '',
        paidUpdateTitle: file.paidUpdateTitle || '',
        paidUpdatePrice: file.paidUpdatePrice || '',
        paidUpdateCoinPrice: Number(file.paidUpdateCoinPrice || 0),
        content: file.content || '',
        docPages: normaliseDocPages(file),
        quiz: file.quiz ? { questions: normaliseQuizQuestions(file.quiz.questions || []) } : file.type === 'quiz' ? { questions: [] } : undefined,
    };
});

const normaliseModules = (modules?: CourseModule[]): CourseModule[] => (modules || []).map(module => ({
    ...module,
    accessLevel: normaliseCourseAccessLevel(module.accessLevel),
    paidUpdateId: module.paidUpdateId || '',
    paidUpdateTitle: module.paidUpdateTitle || '',
    paidUpdatePrice: module.paidUpdatePrice || '',
    paidUpdateCoinPrice: Number(module.paidUpdateCoinPrice || 0),
    title: module.title || 'Untitled Module',
    files: normaliseFiles(module.files || []),
    modules: normaliseModules(module.modules || []),
}));


const COURSE_INTRO_MODULE_ID = 'course-intro-module';
const COURSE_INTRO_FILE_ID = 'course-intro';

const isCourseIntroFile = (file?: Partial<ProductFile> | null) => {
    const id = String(file?.id || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return id.includes('course-intro') || id.includes('welcome-intro') || /\b(welcome|course intro|introduction)\b/.test(name);
};

const buildDefaultCourseIntroFile = (title?: string): ProductFile => {
    const courseTitle = title?.trim() || 'this course';
    const content = `<h1>Welcome to ${courseTitle}</h1><p>This is the course intro page. Use the module panel to browse lessons, documents, quizzes, and resources.</p><p>Start here, then select the first lesson in the list when you are ready to continue.</p><p>You can edit this welcome content from the admin course content editor.</p>`;

    return {
        id: COURSE_INTRO_FILE_ID,
        name: 'Welcome / Course Intro',
        type: 'doc',
        url: '',
        accessLevel: 'included',
        paidUpdateId: '',
        paidUpdateTitle: '',
        paidUpdatePrice: '',
        paidUpdateCoinPrice: 0,
        content,
        docPages: [{ id: 'course-intro-page', title: 'Welcome / Course Intro', content, createdAt: Date.now(), updatedAt: Date.now() }],
    };
};

const findCourseIntroFile = (modules?: CourseModule[]): ProductFile | null => {
    for (const module of modules || []) {
        const intro = (module.files || []).find(isCourseIntroFile);
        if (intro) return intro;
        const nestedIntro = findCourseIntroFile(module.modules || []);
        if (nestedIntro) return nestedIntro;
    }
    return null;
};

const stripCourseIntroFiles = (modules?: CourseModule[]): CourseModule[] => (modules || []).map(module => ({
    ...module,
    files: (module.files || []).filter(file => !isCourseIntroFile(file)),
    modules: stripCourseIntroFiles(module.modules || []),
}));

const ensureEditableCourseIntroModule = (modules?: CourseModule[], title?: string): CourseModule[] => {
    const normalizedModules = normaliseModules(modules || []);
    const existingIntro = findCourseIntroFile(normalizedModules);
    const introFile = existingIntro || buildDefaultCourseIntroFile(title);
    const introModule: CourseModule = {
        id: COURSE_INTRO_MODULE_ID,
        title: 'Welcome / Course Intro',
        accessLevel: 'included',
        paidUpdateId: '',
        paidUpdateTitle: '',
        paidUpdatePrice: '',
        paidUpdateCoinPrice: 0,
        files: [{ ...introFile, accessLevel: 'included', paidUpdateId: '', paidUpdateTitle: '', paidUpdatePrice: '', paidUpdateCoinPrice: 0 }],
        modules: [],
    };

    const modulesWithoutIntro = stripCourseIntroFiles(normalizedModules)
        .filter(module => module.id !== COURSE_INTRO_MODULE_ID || (module.files || []).length > 0 || (module.modules || []).length > 0);

    return [introModule, ...modulesWithoutIntro];
};

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

const recursiveModuleDelete = (modules: CourseModule[], moduleId: string): CourseModule[] =>
    (modules || [])
        .filter(module => module.id !== moduleId)
        .map(module => ({ ...module, modules: recursiveModuleDelete(module.modules || [], moduleId) }));

const glassCard = 'rounded-[2rem] border border-white/50 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl';
const fieldClass = 'w-full rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-400/10';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-600';


type HostedDocsProvider = 'direct_pdf' | 'google_drive_pdf' | 'google_drive_doc' | 'external_docs_link' | 'open_docs';
type MediaUrlProvider = 'direct_audio' | 'direct_video' | 'google_drive_audio' | 'google_drive_video' | 'external_media';
type MediaComposerKind = 'audio' | 'video';

type ContentComposerFormState = {
    type: ProductFileType;
    url: string;
    name: string;
    content: string;
    provider?: HostedDocsProvider | MediaUrlProvider | 'upload' | 'external_url' | 'drive' | 'direct' | 'external';
    accessLevel?: CourseAccessLevel;
    paidUpdateId?: string;
    paidUpdateTitle?: string;
    paidUpdatePrice?: string;
    paidUpdateCoinPrice?: string;
};

const hostedDocsProviderLabels: Record<HostedDocsProvider, string> = {
    direct_pdf: 'PDF',
    google_drive_pdf: 'Google Drive PDF',
    google_drive_doc: 'Google Drive Doc',
    open_docs: 'Open Docs',
    external_docs_link: 'External Docs Link',
};

const hostedDocsProviders: HostedDocsProvider[] = ['direct_pdf', 'google_drive_pdf', 'google_drive_doc', 'open_docs', 'external_docs_link'];
const mediaUrlProviders: MediaUrlProvider[] = ['direct_audio', 'direct_video', 'google_drive_audio', 'google_drive_video', 'external_media'];
const mediaProviderOptions: Record<MediaComposerKind, Array<{ provider: MediaUrlProvider; label: string; helper: string }>> = {
    audio: [
        { provider: 'direct_audio', label: 'Audio URL', helper: 'Paste a direct MP3/M4A/WAV/OGG link for native playback.' },
        { provider: 'google_drive_audio', label: 'Google Drive Audio URL', helper: 'Paste a public Google Drive audio share link. Anyone with the link must be able to view.' },
        { provider: 'external_media', label: 'External Hosted Audio URL', helper: 'Paste any secure hosted audio page/link. It opens inside a premium fallback card if direct playback is blocked.' },
    ],
    video: [
        { provider: 'direct_video', label: 'Video URL', helper: 'Paste a direct MP4/WebM/MOV link for native playback.' },
        { provider: 'google_drive_video', label: 'Google Drive Video URL', helper: 'Paste a public Google Drive video share link for embedded preview.' },
        { provider: 'external_media', label: 'External Hosted Video URL', helper: 'Paste any secure hosted video page/link. It opens inside a premium fallback card if direct playback is blocked.' },
    ],
};

const isMediaUrlProvider = (provider?: string): provider is MediaUrlProvider => Boolean(provider && mediaUrlProviders.includes(provider as MediaUrlProvider));
const mediaProviderKind = (provider?: string, fallback: MediaComposerKind = 'video'): MediaComposerKind => {
    if (provider === 'direct_audio' || provider === 'google_drive_audio') return 'audio';
    if (provider === 'direct_video' || provider === 'google_drive_video') return 'video';
    return fallback;
};
const mediaProviderLabel = (provider?: string, kind: MediaComposerKind = 'video') => {
    if (provider === 'direct_audio') return 'Audio URL';
    if (provider === 'direct_video') return 'Video URL';
    if (provider === 'google_drive_audio') return 'Google Drive Audio URL';
    if (provider === 'google_drive_video') return 'Google Drive Video URL';
    return kind === 'audio' ? 'External Hosted Audio URL' : 'External Hosted Video URL';
};
const mediaProviderHelper = (provider?: string, kind: MediaComposerKind = 'video') => {
    const option = mediaProviderOptions[kind].find(item => item.provider === provider);
    return option?.helper || 'Paste a public https media URL. Google Drive links and direct audio/video URLs are supported.';
};

const extractGoogleDriveFileId = (value: string) => {
    const trimmed = value.trim();
    const patterns = [
        /drive\.google\.com\/file\/d\/([^/?#]+)/i,
        /drive\.google\.com\/open\?id=([^&#]+)/i,
        /drive\.google\.com\/uc\?id=([^&#]+)/i,
        /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([^/?#]+)/i,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) return decodeURIComponent(match[1]);
    }

    try {
        const url = new URL(trimmed);
        return url.searchParams.get('id') || '';
    } catch {
        return '';
    }
};

const isGoogleDriveUrl = (value: string) => /https:\/\/(?:drive|docs)\.google\.com\//i.test(value.trim());
const isDirectAudioUrl = (value: string) => /\.(mp3|m4a|aac|wav|ogg|oga|opus)(?:$|[?#])/i.test(value.trim());
const isDirectVideoUrl = (value: string) => /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(value.trim());
const mediaProviderToProductProvider = (provider?: string) => provider === 'google_drive_audio' || provider === 'google_drive_video' ? 'drive' : provider === 'direct_audio' || provider === 'direct_video' ? 'direct' : 'external';
const mediaProviderContentType = (type: ProductFileType, provider?: string, url = '') => type === 'audio' ? (provider === 'direct_audio' || isDirectAudioUrl(url) ? 'audio/url' : 'audio/external') : type === 'video' ? (provider === 'direct_video' || isDirectVideoUrl(url) ? 'video/url' : 'video/external') : undefined;

const resolveInitialMediaProvider = (file?: ProductFile | null): ContentComposerFormState['provider'] => {
    if (!file) return undefined;
    if (isMediaUrlProvider(file.provider)) return file.provider;
    if (file.type === 'audio') {
        if (file.provider === 'drive' || isGoogleDriveUrl(file.url)) return 'google_drive_audio';
        if (file.provider === 'direct' || isDirectAudioUrl(file.url)) return 'direct_audio';
        if (file.provider === 'external' || file.sourceType === 'url') return 'external_media';
    }
    if (file.type === 'video') {
        if (file.provider === 'drive' || isGoogleDriveUrl(file.url)) return 'google_drive_video';
        if (file.provider === 'direct' || isDirectVideoUrl(file.url)) return 'direct_video';
        if (file.provider === 'external' || file.sourceType === 'url') return 'external_media';
    }
    return file.provider as ContentComposerFormState['provider'];
};

const toGoogleDrivePreviewUrl = (value: string) => {
    const fileId = extractGoogleDriveFileId(value);
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : value.trim();
};

const inferHostedDocsType = (provider: HostedDocsProvider): ProductFileType => {
    if (provider === 'direct_pdf' || provider === 'google_drive_pdf') return 'pdf';
    if (provider === 'open_docs') return 'doc';
    return 'link';
};

const isHostedDocsProvider = (provider?: string): provider is HostedDocsProvider => Boolean(provider && hostedDocsProviders.includes(provider as HostedDocsProvider));

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
    console.info('ADMIN_UPLOAD_AUTH_CHECK_STARTED');
    const user = auth.currentUser;

    if (!user) {
        console.error('ADMIN_AUTH_USER_MISSING');
        console.error('ADMIN_UPLOAD_AUTH_CHECK_FAILED', { reason: 'missing_firebase_auth_user' });
        throw new Error('Firebase admin login required before uploading files.');
    }

    console.info('ADMIN_AUTH_USER_FOUND', { uid: user.uid, email: user.email || null });
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    const role = userSnap.exists() ? userSnap.data().role : undefined;
    const isAdmin = role === 'admin' || role === 'super_admin';

    if (!isAdmin) {
        console.error('ADMIN_ROLE_CHECK_FAILED', { uid: user.uid, email: user.email || null, role: role || null, reason: 'admin_role_missing' });
        console.error('ADMIN_UPLOAD_BLOCKED_PERMISSION', { uid: user.uid, email: user.email || null, role: role || null });
        throw new Error(`Your Firebase user is not marked as admin. Add role: admin in users/${user.uid}. UID: ${user.uid}. Email: ${user.email || 'No email found'}. Current role: ${role || 'missing'}.`);
    }

    console.info('ADMIN_ROLE_CHECK_SUCCESS', { uid: user.uid, email: user.email || null, role });
    console.info('ADMIN_UPLOAD_AUTH_CHECK_SUCCESS', { uid: user.uid, role });
    return user;
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

const createAdminUploadSession = async (file: File, storagePath: string) => {
    console.info('ADMIN_UPLOAD_SESSION_CREATE_STARTED', {
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        storageBucket: storage.app.options.storageBucket,
        storagePath,
    });
    const user = await ensureAdminUploadAuth();
    console.info('ADMIN_UPLOAD_SESSION_CREATE_SUCCESS', { uid: user.uid, storageBucket: storage.app.options.storageBucket, storagePath });
    return { user, storagePath };
};


const getProductImageContentType = (file: File) => {
    if (file.type && file.type.startsWith('image/')) return file.type;

    const extension = file.name.toLowerCase().split('.').pop() || '';
    const contentTypeByExtension: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
    };

    return contentTypeByExtension[extension] || 'image/jpeg';
};

const uploadAdminProductAsset = async (
    file: File,
    storagePath: string,
    logPrefix = 'ADMIN_CONTENT_UPLOAD',
    onProgress?: (percent: number) => void,
    contentTypeOverride?: string
) => {
    try {
        await createAdminUploadSession(file, storagePath);
    } catch (error) {
        console.error('ADMIN_UPLOAD_SESSION_CREATE_FAILED', { storagePath, error });
        throw error;
    }

    const fileRef = ref(storage, storagePath);
    const maxAttempts = 3;
    let lastError: unknown = null;
    const resolvedContentType = contentTypeOverride || file.type || undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const uploadTask = uploadBytesResumable(fileRef, file, {
                contentType: resolvedContentType,
                customMetadata: {
                    originalName: file.name,
                },
            });
            console.info('ADMIN_UPLOAD_TASK_CREATED', { storagePath, attempt, storageBucket: storage.app.options.storageBucket });
            console.info('ADMIN_UPLOAD_STARTED', { storagePath, attempt, storageBucket: storage.app.options.storageBucket });

            await new Promise<void>((resolve, reject) => {
                let firstByteReceived = false;
                const firstByteTimer = setTimeout(() => {
                    if (!firstByteReceived) {
                        console.error('ADMIN_UPLOAD_FIRST_BYTE_TIMEOUT', { storagePath, attempt, storageBucket: storage.app.options.storageBucket });
                        uploadTask.cancel();
                        reject(new Error('NETWORK_TIMEOUT: Upload stayed at 0% for more than 15 seconds. Check Firebase Auth, Storage rules, bucket, CORS, endpoint, and network.'));
                    }
                }, 15000);

                uploadTask.on('state_changed',
                    snapshot => {
                        if (snapshot.bytesTransferred > 0) {
                            firstByteReceived = true;
                            clearTimeout(firstByteTimer);
                        }
                        const percent = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
                        onProgress?.(percent);
                        console.info('ADMIN_UPLOAD_PROGRESS', { storagePath, attempt, percent, bytesTransferred: snapshot.bytesTransferred, totalBytes: snapshot.totalBytes });
                        if (logPrefix === 'ADMIN_AUDIO_UPLOAD') {
                            console.info('ADMIN_AUDIO_UPLOAD_PROGRESS', { storagePath, attempt, percent, bytesTransferred: snapshot.bytesTransferred, totalBytes: snapshot.totalBytes });
                        }
                    },
                    error => {
                        clearTimeout(firstByteTimer);
                        reject(error);
                    },
                    () => {
                        clearTimeout(firstByteTimer);
                        resolve();
                    }
                );
            });

            const downloadUrl = await getDownloadURL(fileRef);

            console.info('ADMIN_DOWNLOAD_URL_SUCCESS', { storagePath, url: downloadUrl });
            console.info('ADMIN_UPLOAD_SUCCESS', { storagePath, size: file.size, contentType: file.type });
            console.info('ADMIN_UPLOAD_VERIFIED_IN_STORAGE', { storagePath, url: downloadUrl });
            if (logPrefix === 'ADMIN_AUDIO_UPLOAD') {
                console.info('ADMIN_AUDIO_DOWNLOAD_URL_SUCCESS', { storagePath, url: downloadUrl });
            }

            return {
                url: downloadUrl,
                storagePath,
                size: file.size,
                contentType: resolvedContentType || 'application/octet-stream',
            };
        } catch (error) {
            lastError = error;
            const retryable = isRetryableStorageError(error);
            console.warn(`${logPrefix}_ATTEMPT_FAILED`, { storagePath, attempt, retryable, error });
            console.error('ADMIN_UPLOAD_FAILED', { storagePath, attempt, retryable, error });

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

type CourseAccessDraft = {
    accessLevel?: CourseAccessLevel;
    paidUpdateId?: string;
    paidUpdateTitle?: string;
    paidUpdatePrice?: string;
    paidUpdateCoinPrice?: string | number;
};

const CourseAccessControls: React.FC<{
    value: CourseAccessDraft;
    onChange: (patch: Partial<CourseAccessDraft>) => void;
    compact?: boolean;
}> = ({ value, onChange, compact = false }) => {
    const accessLevel = normaliseCourseAccessLevel(value.accessLevel);
    const isPaidUpdate = accessLevel === 'paidUpdate';

    return (
        <div className={`rounded-2xl border border-blue-100 bg-blue-50/70 ${compact ? 'p-3' : 'p-4'}`}>
            <label className={labelClass}>Course Player Access</label>
            <select
                value={accessLevel}
                onChange={event => onChange({ accessLevel: event.target.value as CourseAccessLevel })}
                className={fieldClass}
            >
                <option value="included">Included after base course purchase</option>
                <option value="paidUpdate">Locked paid content / latest update</option>
                <option value="hidden">Hidden from course player</option>
            </select>

            <p className="mt-2 text-xs font-bold leading-5 text-slate-600">
                Included = base course ke sath milega. Paid = user ko course player me locked dikhega aur purchase update button se unlock hoga. Hidden = admin me save rahega par user ko nahi dikhega.
            </p>

            {isPaidUpdate && (
                <div className={`mt-4 grid grid-cols-1 gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
                    <label>
                        <span className={labelClass}>Paid Content ID</span>
                        <input
                            value={value.paidUpdateId || ''}
                            onChange={event => onChange({ paidUpdateId: event.target.value })}
                            className={fieldClass}
                            placeholder="chapter-1-extra-notes"
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Button Title</span>
                        <input
                            value={value.paidUpdateTitle || ''}
                            onChange={event => onChange({ paidUpdateTitle: event.target.value })}
                            className={fieldClass}
                            placeholder="Purchase this update"
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Update Price ₹</span>
                        <input
                            value={String(value.paidUpdatePrice || '').replace('₹', '')}
                            onChange={event => onChange({ paidUpdatePrice: event.target.value })}
                            className={fieldClass}
                            inputMode="decimal"
                            placeholder="49"
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Update EduCoin Price</span>
                        <input
                            value={String(value.paidUpdateCoinPrice || '')}
                            onChange={event => onChange({ paidUpdateCoinPrice: event.target.value })}
                            className={fieldClass}
                            inputMode="numeric"
                            placeholder="250"
                        />
                    </label>
                </div>
            )}
        </div>
    );
};

const AdminOpenDocsBuilder: React.FC<{
    resourceName: string;
    pages: ProductDocPage[];
    activePageId: string;
    error: string;
    accessMeta: CourseAccessDraft;
    onAccessMetaChange: (patch: Partial<CourseAccessDraft>) => void;
    onResourceNameChange: (value: string) => void;
    onPagesChange: (pages: ProductDocPage[]) => void;
    onActivePageChange: (pageId: string) => void;
    onBack: () => void;
    onSave: () => void;
}> = ({ resourceName, pages, activePageId, error, accessMeta, onAccessMetaChange, onResourceNameChange, onPagesChange, onActivePageChange, onBack, onSave }) => {
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
                    <div className="mt-4">
                        <CourseAccessControls
                            value={accessMeta}
                            onChange={onAccessMetaChange}
                            compact
                        />
                    </div>
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
    const [formState, setFormState] = useState<ContentComposerFormState | null>(() => initialFile ? {
        type: initialFile.type,
        url: initialFile.url || '',
        name: initialFile.name || 'Learning Resource',
        content: initialFile.content || '',
        provider: resolveInitialMediaProvider(initialFile),
        accessLevel: normaliseCourseAccessLevel(initialFile.accessLevel),
        paidUpdateId: initialFile.paidUpdateId || '',
        paidUpdateTitle: initialFile.paidUpdateTitle || '',
        paidUpdatePrice: initialFile.paidUpdatePrice ? initialFile.paidUpdatePrice.replace('₹', '') : '',
        paidUpdateCoinPrice: initialFile.paidUpdateCoinPrice ? String(initialFile.paidUpdateCoinPrice) : '',
    } : null);
    const [docPages, setDocPages] = useState<ProductDocPage[]>(() => initialFile?.type === 'doc' ? (normaliseDocPages(initialFile) || []) : []);
    const [activeDocPageId, setActiveDocPageId] = useState(() => initialFile?.type === 'doc' ? (normaliseDocPages(initialFile)?.[0]?.id || '') : '');
    const [docError, setDocError] = useState('');
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() => initialFile?.quiz?.questions?.length ? normaliseQuizQuestions(initialFile.quiz.questions) : [{ prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [lastUploadRequest, setLastUploadRequest] = useState<{ file: File; config: { type: ProductFileType; accept: string } } | null>(null);
    const [uploadError, setUploadError] = useState('');
    const quizListRef = useRef<HTMLDivElement>(null);
    const previousQuizQuestionCountRef = useRef(quizQuestions.length);

    const buildContentAccessMeta = (state: ContentComposerFormState) => {
        const accessLevel = normaliseCourseAccessLevel(state.accessLevel);
        const updateId = String(state.paidUpdateId || '').trim();
        const updateTitle = String(state.paidUpdateTitle || '').trim();
        const updatePrice = String(state.paidUpdatePrice || '').trim();
        const updateCoinPrice = normalizeCoinPrice(state.paidUpdateCoinPrice).normalizedCoinPrice;

        return {
            accessLevel,
            paidUpdateId: accessLevel === 'paidUpdate' ? updateId : '',
            paidUpdateTitle: accessLevel === 'paidUpdate' ? updateTitle : '',
            paidUpdatePrice: accessLevel === 'paidUpdate' && updatePrice ? `₹${updatePrice.replace(/[^\d.]/g, '')}` : '',
            paidUpdateCoinPrice: accessLevel === 'paidUpdate' ? updateCoinPrice : 0,
        };
    };

    const contentTypes: Array<{ type: ProductFileType; title: string; description: string; icon: string; accept?: string; action?: 'docsUrl' | 'audioUrl' | 'videoUrl' | 'driveAudioUrl' | 'driveVideoUrl' | 'externalAudioUrl' | 'externalVideoUrl' }> = [
        { type: 'video', title: 'Video Upload', description: 'File upload requires Firebase Storage. Use URL media for now.', icon: '🎬', accept: 'video/*' },
        { type: 'video', title: 'Video URL', description: 'Paste direct MP4/WebM or hosted video URL.', icon: '🔗', action: 'videoUrl' },
        { type: 'video', title: 'Google Drive Video URL', description: 'Paste a public Drive video share link.', icon: '▶️', action: 'driveVideoUrl' },
        { type: 'youtube', title: 'YouTube Video', description: 'Embed a hosted YouTube lesson.', icon: '▶️' },
        { type: 'pdf', title: 'PDF', description: 'Attach worksheets, notes, or guides.', icon: '📄', accept: 'application/pdf' },
        { type: 'doc', title: 'Open Docs', description: 'Open a full-page builder for multi-page lesson notes.', icon: '🧠' },
        { type: 'pdf', title: 'PDF / Docs URL', description: 'Use Google Drive, hosted PDF, DOC/DOCX, or external docs links without Storage.', icon: '🌐', action: 'docsUrl' },
        { type: 'quiz', title: 'Quiz', description: 'Create interactive assessment questions.', icon: '✅' },
        { type: 'link', title: 'External Link', description: 'Reference any hosted resource.', icon: '🔗' },
        { type: 'sheet', title: 'Spreadsheet', description: 'Upload CSV/XLS study material.', icon: '📊', accept: '.csv,.xls,.xlsx' },
        { type: 'ebook', title: 'E-book', description: 'Upload EPUB or PDF book content.', icon: '📚', accept: '.epub,.pdf' },
        { type: 'audio', title: 'Audio Upload', description: 'File upload requires Firebase Storage. Use URL media for now.', icon: '🎧', accept: 'audio/*' },
        { type: 'audio', title: 'Audio URL', description: 'Paste direct MP3/M4A/WAV or hosted audio URL.', icon: '🎧', action: 'audioUrl' },
        { type: 'audio', title: 'Google Drive Audio URL', description: 'Paste a public Drive audio share link.', icon: '☁️', action: 'driveAudioUrl' },
        { type: 'audio', title: 'External Hosted Audio URL', description: 'Use a secure hosted audio link with fallback card.', icon: '🌐', action: 'externalAudioUrl' },
        { type: 'video', title: 'External Hosted Video URL', description: 'Use a secure hosted video link with fallback card.', icon: '🌐', action: 'externalVideoUrl' },
    ];

    const triggerFileUpload = (type: ProductFileType, accept: string) => {
        if (!isStorageUploadEnabled()) {
            setUploadError(getStorageDisabledMessage(type));
            setLastUploadRequest(null);
            return;
        }
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


    const showMediaUrlForm = (type: 'audio' | 'video', provider: MediaUrlProvider) => {
        setFormState({
            type,
            provider,
            url: '',
            name: type === 'audio' ? 'Audio lesson' : 'Video lesson',
            content: '',
        });
        setDocError('');
    };

    const showDocsUrlForm = () => {
        setFormState({
            type: 'pdf',
            provider: 'direct_pdf',
            url: '',
            name: 'PDF / Docs Resource',
            content: '',
        });
        setDocError('');
    };

    const updateHostedDocsProvider = (provider: HostedDocsProvider) => {
        setDocError('');
        setFormState(prev => prev ? {
            ...prev,
            provider,
            type: inferHostedDocsType(provider),
            url: provider === 'open_docs' ? '' : prev.url,
            name: prev.name === 'PDF / Docs Resource' ? hostedDocsProviderLabels[provider] : prev.name,
        } : prev);

        if (provider === 'open_docs') {
            const firstPage = createAdminDocPage('Page 1', '<h1>Open Docs Workspace</h1><p>Start building your lesson here.</p>');
            setDocPages([firstPage]);
            setActiveDocPageId(firstPage.id);
        }
    };

    const runFileUpload = async (file: File, selectedUploadConfig: { type: ProductFileType; accept: string }) => {
        const maxBytes = getAdminContentMaxBytes(selectedUploadConfig.type);
        setLastUploadRequest({ file, config: selectedUploadConfig });
        setUploadError('');

        console.info('ADMIN_UPLOAD_FILE_SELECTED', { productId, fileName: file.name, size: file.size, contentType: file.type, type: selectedUploadConfig.type });
        if (selectedUploadConfig.type === 'audio') {
            console.info('ADMIN_AUDIO_UPLOAD_SELECTED', { productId, fileName: file.name, size: file.size, contentType: file.type });
        }

        if (file.size > maxBytes) {
            const message = `${selectedUploadConfig.type} file is too large. Max allowed size is ${Math.round(maxBytes / (1024 * 1024))}MB.`;
            setUploadError(message);
            alert(message);
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
                provider: 'upload',
                createdAt: now,
                updatedAt: now,
                content: '',
                ...buildContentAccessMeta(formState),
                quiz: { questions: [] },
            });

            setLastUploadRequest(null);
            onClose();
        } catch (error) {
            const message = getFriendlyStorageErrorMessage(error);
            console.error('Admin content upload failed:', error);
            setUploadError(message);
            alert(message);
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        const selectedUploadConfig = uploadConfig;

        event.target.value = '';
        setUploadConfig(null);

        if (!file || !selectedUploadConfig) return;
        void runFileUpload(file, selectedUploadConfig);
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


    const previewMediaUrl = () => {
        if (!formState || !isMediaUrlProvider(formState.provider)) return;
        const trimmedUrl = formState.url.trim();
        if (!trimmedUrl || !trimmedUrl.startsWith('https://')) {
            setDocError('Please paste a valid https media URL.');
            return;
        }
        if ((formState.provider === 'google_drive_audio' || formState.provider === 'google_drive_video') && (!isGoogleDriveUrl(trimmedUrl) || !extractGoogleDriveFileId(trimmedUrl))) {
            setDocError('Google Drive file must be public or shared with anyone with the link.');
            return;
        }
        const directPlayable = formState.type === 'audio' ? isDirectAudioUrl(trimmedUrl) : isDirectVideoUrl(trimmedUrl);
        setDocError(directPlayable || formState.provider?.startsWith('google_drive') ? 'Media preview ready. Save to course when ready.' : 'This media link may not support direct playback. It will open in a secure preview card.');
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
                ...buildContentAccessMeta(formState),
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

            const now = Date.now();
            onAdd({
                name: trimmedName,
                type: 'doc',
                url: '',
                provider: formState.provider === 'open_docs' ? 'open_docs' : undefined,
                createdAt: initialFile?.createdAt || now,
                updatedAt: now,
                content: cleanPages[0]?.content || '',
                docPages: cleanPages,
                ...buildContentAccessMeta(formState),
                quiz: { questions: [] },
            });

            onClose();
            return;
        }

        const trimmedUrl = formState.url.trim();
        const provider = formState.provider;
        const isHostedDocs = isHostedDocsProvider(provider);

        if (formState.type === 'youtube') {
            const youtubeVideoId = extractYouTubeVideoId(trimmedUrl);

            if (!trimmedUrl) {
                setDocError('Enter a YouTube video URL before saving.');
                return;
            }

            if (!youtubeVideoId) {
                setDocError('Enter a valid YouTube video URL. Supported formats: watch, youtu.be, embed, shorts, live, or a valid 11-character video ID.');
                return;
            }

            const now = Date.now();
            const normalizedYouTubeUrl = normaliseYouTubeUrl(trimmedUrl);

            onAdd({
                name: trimmedName,
                type: 'youtube',
                url: normalizedYouTubeUrl,
                provider: 'external_url',
                sourceType: 'external_url',
                youtubeUrl: normalizedYouTubeUrl,
                youtubeVideoId,
                contentType: 'video/youtube',
                createdAt: initialFile?.createdAt || now,
                updatedAt: now,
                content: '',
                ...buildContentAccessMeta(formState),
                quiz: { questions: [] },
            });

            onClose();
            return;
        }

        if (isMediaUrlProvider(provider)) {
            if (!trimmedUrl || !trimmedUrl.startsWith('https://')) {
                setDocError('Please paste a valid https media URL.');
                return;
            }

            const isDriveProvider = provider === 'google_drive_audio' || provider === 'google_drive_video';
            if (isDriveProvider && (!isGoogleDriveUrl(trimmedUrl) || !extractGoogleDriveFileId(trimmedUrl))) {
                setDocError('Google Drive file must be public or shared with anyone with the link.');
                return;
            }

            const isDirectProvider = provider === 'direct_audio' || provider === 'direct_video';
            const isDirectPlayable = formState.type === 'audio' ? isDirectAudioUrl(trimmedUrl) : isDirectVideoUrl(trimmedUrl);
            const now = Date.now();
            const embedUrl = isDriveProvider ? toGoogleDrivePreviewUrl(trimmedUrl) : '';

            if (isDirectProvider && !isDirectPlayable) {
                const warningMessage = 'This media link may not support direct playback. Click Save again to save it as external hosted media, or paste a direct media file URL.';
                if (docError !== warningMessage) {
                    setDocError(warningMessage);
                    return;
                }
            }

            onAdd({
                name: trimmedName,
                type: formState.type,
                url: trimmedUrl,
                ...buildUrlMediaSource({ provider: isDirectProvider && !isDirectPlayable ? 'external' : mediaProviderToProductProvider(provider), url: trimmedUrl, embedUrl }),
                contentType: mediaProviderContentType(formState.type, provider, trimmedUrl),
                createdAt: initialFile?.createdAt || now,
                updatedAt: now,
                content: '',
                ...buildContentAccessMeta(formState),
                quiz: { questions: [] },
            });
            onClose();
            return;
        }

        if (trimmedUrl && !trimmedUrl.startsWith('https://')) {
            setDocError('Resource URL must start with https://');
            return;
        }

        if (isHostedDocs && provider !== 'open_docs') {
            if (!trimmedUrl) {
                setDocError('Enter a hosted PDF/docs URL before saving.');
                return;
            }

            if ((provider === 'google_drive_pdf' || provider === 'google_drive_doc') && (!isGoogleDriveUrl(trimmedUrl) || !extractGoogleDriveFileId(trimmedUrl))) {
                setDocError('Enter a valid Google Drive share link. Make sure sharing is set to Anyone with the link.');
                return;
            }
        }

        const now = Date.now();
        const normalizedUrl = provider === 'google_drive_pdf' || provider === 'google_drive_doc'
            ? toGoogleDrivePreviewUrl(trimmedUrl)
            : trimmedUrl;

        onAdd({
            name: trimmedName,
            type: formState.type,
            url: normalizedUrl,
            provider: provider || (formState.type === 'link' ? 'external_url' : undefined),
            contentType: provider === 'direct_pdf' || provider === 'google_drive_pdf' ? 'application/pdf' : undefined,
            createdAt: initialFile?.createdAt || now,
            updatedAt: now,
            content: '',
            ...buildContentAccessMeta(formState),
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
                            key={`${item.type}-${item.title}`}
                            type="button"
                            onClick={() => item.action === 'docsUrl' ? showDocsUrlForm() : item.action === 'audioUrl' ? showMediaUrlForm('audio', 'direct_audio') : item.action === 'videoUrl' ? showMediaUrlForm('video', 'direct_video') : item.action === 'driveAudioUrl' ? showMediaUrlForm('audio', 'google_drive_audio') : item.action === 'driveVideoUrl' ? showMediaUrlForm('video', 'google_drive_video') : item.action === 'externalAudioUrl' ? showMediaUrlForm('audio', 'external_media') : item.action === 'externalVideoUrl' ? showMediaUrlForm('video', 'external_media') : item.accept ? triggerFileUpload(item.type, item.accept) : showForm(item.type)}
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
                        accessMeta={formState}
                        onAccessMetaChange={patch => setFormState(prev => prev ? { ...prev, ...patch } : prev)}
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
                        accessMeta={formState}
                        onAccessMetaChange={patch => setFormState(prev => prev ? { ...prev, ...patch } : prev)}
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
                        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                            <label className={labelClass}>Course Player Access</label>
                            <select
                                value={formState.accessLevel || 'included'}
                                onChange={event => setFormState(prev => prev ? { ...prev, accessLevel: event.target.value as CourseAccessLevel } : prev)}
                                className={fieldClass}
                            >
                                <option value="included">Included after base purchase</option>
                                <option value="paidUpdate">Locked paid latest update</option>
                                <option value="hidden">Hidden from course player</option>
                            </select>

                            <p className="mt-2 text-xs font-bold leading-5 text-slate-600">
                                Included content opens after normal product purchase. Paid update content stays locked until user buys the latest update. Hidden content is saved for admin but not shown to users.
                            </p>

                            {(formState.accessLevel || 'included') === 'paidUpdate' && (
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <label>
                                        <span className={labelClass}>Update Group ID</span>
                                        <input value={formState.paidUpdateId || ''} onChange={event => setFormState(prev => prev ? { ...prev, paidUpdateId: event.target.value } : prev)} className={fieldClass} placeholder="chapter-2-update" />
                                    </label>
                                    <label>
                                        <span className={labelClass}>Update Button Title</span>
                                        <input value={formState.paidUpdateTitle || ''} onChange={event => setFormState(prev => prev ? { ...prev, paidUpdateTitle: event.target.value } : prev)} className={fieldClass} placeholder="Purchase the latest update" />
                                    </label>
                                    <label>
                                        <span className={labelClass}>Update Price ₹</span>
                                        <input value={formState.paidUpdatePrice || ''} onChange={event => setFormState(prev => prev ? { ...prev, paidUpdatePrice: event.target.value } : prev)} className={fieldClass} inputMode="decimal" placeholder="99" />
                                    </label>
                                    <label>
                                        <span className={labelClass}>EduCoin Price</span>
                                        <input value={formState.paidUpdateCoinPrice || ''} onChange={event => setFormState(prev => prev ? { ...prev, paidUpdateCoinPrice: event.target.value } : prev)} className={fieldClass} inputMode="numeric" placeholder="500" />
                                        <span className="mt-1 block text-xs font-bold text-slate-500">Leave empty or set 0 to disable EduCoin purchase. Empty/0 makes this content money only.</span>
                                    </label>
                                </div>
                            )}
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
                            <div className="space-y-4">
                                {isHostedDocsProvider(formState.provider) && (
                                    <div>
                                        <label className={labelClass}>Content Type</label>
                                        <select
                                            value={formState.provider}
                                            onChange={event => updateHostedDocsProvider(event.target.value as HostedDocsProvider)}
                                            className={fieldClass}
                                        >
                                            <option value="direct_pdf">PDF</option>
                                            <option value="google_drive_pdf">Google Drive PDF</option>
                                            <option value="google_drive_doc">Google Drive Doc</option>
                                            <option value="open_docs">Open Docs</option>
                                            <option value="external_docs_link">External Docs Link</option>
                                        </select>
                                    </div>
                                )}
                                {isMediaUrlProvider(formState.provider) && (
                                    <div className="rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] p-4">
                                        <label className={labelClass}>Provider type</label>
                                        <select
                                            value={formState.provider}
                                            onChange={event => {
                                                const nextProvider = event.target.value as MediaUrlProvider;
                                                const currentKind = formState.type === 'audio' ? 'audio' : 'video';
                                                setDocError('');
                                                setFormState(prev => prev ? { ...prev, provider: nextProvider, type: mediaProviderKind(nextProvider, currentKind) } : prev);
                                            }}
                                            className={fieldClass}
                                        >
                                            {mediaProviderOptions[formState.type === 'audio' ? 'audio' : 'video'].map(option => (
                                                <option key={`${formState.type}-${option.provider}`} value={option.provider}>{option.label}</option>
                                            ))}
                                        </select>
                                        <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{mediaProviderHelper(formState.provider, formState.type === 'audio' ? 'audio' : 'video')}</p>
                                    </div>
                                )}
                                {formState.provider !== 'open_docs' && (
                                    <div>
                                        {isMediaUrlProvider(formState.provider) ? (
                                            <PremiumMediaUrlInput kind={formState.type === 'audio' ? 'audio' : 'video'} value={formState.url} onChange={(url) => { setDocError(''); setFormState(prev => prev ? { ...prev, url } : prev); }} label={mediaProviderLabel(formState.provider, formState.type === 'audio' ? 'audio' : 'video')} helperText={mediaProviderHelper(formState.provider, formState.type === 'audio' ? 'audio' : 'video')} />
                                        ) : (<><label className={labelClass}>{formState.type === 'youtube' ? 'YouTube URL' : 'Resource URL'}</label>
                                        <input
                                            value={formState.url}
                                            onChange={event => {
                                                setDocError('');
                                                setFormState(prev => prev ? { ...prev, url: event.target.value } : prev);
                                            }}
                                            className={fieldClass}
                                            placeholder={formState.type === 'youtube' ? 'https://www.youtube.com/watch?v=VIDEO_ID' : 'https://example.com/resource'}
                                        /></>)}
                                        {isMediaUrlProvider(formState.provider) && (
                                            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                                                <p>Current mode: URL media. File upload requires Firebase Storage. Use URL media for now.</p>
                                                <p className="mt-1 text-xs text-blue-700">Drive links are normalized into a clean preview card. Private files show a clear fallback message.</p>
                                                <button type="button" onClick={previewMediaUrl} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white">Preview media</button>
                                            </div>
                                        )}
                                        {formState.type === 'youtube' && (
                                            <p className="mt-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                                Paste a public YouTube video link. Watch, youtu.be, embed, shorts, live, and raw video ID formats are supported.
                                            </p>
                                        )}
                                    </div>
                                )}
                                {isHostedDocsProvider(formState.provider) && formState.provider !== 'open_docs' && (
                                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                                        For Google Drive files, set sharing to Anyone with the link. URL-based PDFs/docs do not use Firebase Storage and only save metadata to the product.
                                    </p>
                                )}
                                {docError && <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{docError}</p>}
                            </div>
                        )}
                    </div>

                    <div className="shrink-0 border-t border-white/50 bg-white/80 p-4 backdrop-blur-xl sm:p-5">
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setFormState(null)} className="rounded-2xl border border-white/50 px-5 py-3 font-bold text-slate-600 hover:bg-white/80 hover:shadow-sm">
                                Back
                            </button>
                            <button type="button" onClick={handleFormSubmit} className="rounded-2xl bg-cyan-600 px-6 py-3 font-black text-white shadow-sm hover:bg-cyan-700">
                                {isMediaUrlProvider(formState.provider) ? 'Save to course' : isEditing ? 'Save Content' : 'Add Content'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <input ref={fileInputRef} type="file" accept={uploadConfig?.accept} onChange={handleFileSelected} className="hidden" />
            {isUploading && <p className="mt-4 text-sm font-bold text-cyan-700">Uploading content... {uploadProgress}% complete. Audio/video/PDF files are added only after Firebase Storage returns a download URL.</p>}
            {!isUploading && uploadError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm font-bold text-rose-700">{uploadError}</p>
                    {lastUploadRequest ? <button type="button" onClick={() => runFileUpload(lastUploadRequest.file, lastUploadRequest.config)} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white">Retry upload</button> : null}
                </div>
            ) : null}
        </div>
    );
};

const ModuleEditor: React.FC<{
    module: CourseModule;
    allModules: CourseModule[];
    level: number;
    onUpdate: (modules: CourseModule[]) => void;
    onAddChild: (parentId: string) => void;
    onDelete: (moduleId: string) => void;
    productId: number | string;
}> = ({ module, allModules, level, onUpdate, onAddChild, onDelete, productId }) => {
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
                    <div className="mt-3">
                        <CourseAccessControls
                            value={module}
                            compact
                            onChange={patch => updateModule(current => ({ ...current, ...patch }))}
                        />
                    </div>
                </div>
                <div className="flex gap-2 pt-6">
                    <button type="button" onClick={() => setIsAddingContent(true)} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 hover:bg-cyan-100">+ Content</button>
                    <button type="button" onClick={() => onAddChild(module.id)} className="rounded-2xl border border-white/50 px-4 py-3 text-sm font-black text-slate-600 hover:bg-white/80 hover:shadow-sm">+ Submodule</button>
                    <button type="button" onClick={() => onDelete(module.id)} aria-label={`Delete module ${module.title || ''}`} className="rounded-2xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm font-black text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-red-200">🗑 Delete</button>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {files.length > 0 ? (files || []).map(file => {
                    const accessLevel = normaliseCourseAccessLevel(file.accessLevel);
                    const badgeClass = accessLevel === 'paidUpdate'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : accessLevel === 'hidden'
                            ? 'bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200';

                    return (
                        <div key={file.id} className="rounded-2xl border border-white/50 bg-white/80 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-black text-slate-900">{file.name}</p>
                                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${badgeClass}`}>
                                            {accessLevel === 'paidUpdate' ? 'Paid Update' : accessLevel === 'hidden' ? 'Hidden' : 'Included'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-cyan-600">{file.type}{file.quiz?.questions?.length ? ` • ${file.quiz.questions.length} questions` : ''}</p>
                                    {accessLevel === 'paidUpdate' && (
                                        <p className="mt-1 text-xs font-bold text-amber-700">
                                            ID: {file.paidUpdateId || file.id} · Price: {file.paidUpdatePrice || 'Product price'}
                                        </p>
                                    )}
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

                            <div className="mt-3">
                                <CourseAccessControls
                                    value={file}
                                    compact
                                    onChange={patch => onUpdate(recursiveFileUpdate(allModules || [], module.id, currentFiles =>
                                        (currentFiles || []).map(currentFile => currentFile.id === file.id ? { ...currentFile, ...patch, updatedAt: Date.now() } : currentFile)
                                    ))}
                                />
                            </div>
                        </div>
                    );
                }) : <p className="rounded-2xl border border-dashed border-white/50 p-4 text-sm text-slate-600">No content yet. Add videos, PDFs, Open Docs, quizzes, and resource links here.</p>}
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
                        <ModuleEditor key={child.id} module={child} allModules={allModules} level={level + 1} onUpdate={onUpdate} onAddChild={onAddChild} onDelete={onDelete} productId={productId} />
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
    const [modules, setModules] = useState<CourseModule[]>(() => ensureEditableCourseIntroModule(product?.courseContent || initialProductState.courseContent || [], product?.title || formData.title));
    const [images, setImages] = useState<string[]>(() => product?.images || initialProductState.images || []);
    const [imageMode, setImageMode] = useState<'url' | 'upload' | 'ai'>('url');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [isUploadingProductImage, setIsUploadingProductImage] = useState(false);
    const [productImageUploadError, setProductImageUploadError] = useState('');
    const [productImageUploadProgress, setProductImageUploadProgress] = useState(0);
    const [productImageUrlStatus, setProductImageUrlStatus] = useState<PremiumImageUrlStatus>((product?.images || initialProductState.images || []).find(Boolean) ? 'checking' : 'empty');
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

    const buildProductImageMap = (imageUrl?: string) => {
        if (!imageUrl) return {};
        return {
            card: imageUrl,
            detailMobile: imageUrl,
            detailDesktop: imageUrl,
            homeTopRated: imageUrl,
            homeList: imageUrl,
            purchaseSquare: imageUrl,
            purchaseCard: imageUrl,
            galleryThumb: imageUrl,
        };
    };

    const handleProductImagesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        event.target.value = '';
        if (!file) return;

        const validation = validateProductImageUpload(file);
        if (!validation.valid) {
            setProductImageUploadError(validation.error || 'Please choose a valid image file.');
            return;
        }

        setProductImageUploadError('');
        setProductImageUploadProgress(0);
        setIsUploadingProductImage(true);

        try {
            const uploaded = await uploadAdminProductAsset(
                file,
                buildAdminImageStoragePath(file, 'product', draftProductIdRef.current),
                'ADMIN_PRODUCT_IMAGE_UPLOAD',
                (percent) => setProductImageUploadProgress(percent),
                getProductImageContentType(file)
            );
            setImages([uploaded.url]);
            setImageMode('upload');
            setProductImageUploadError('');
        } catch (error) {
            const message = classifyAdminUploadError(error);
            console.error('Product image upload failed:', error);
            setProductImageUploadError(message);
        } finally {
            setIsUploadingProductImage(false);
            setProductImageUploadProgress(0);
        }
    };


    const handleGenerateAiImage = async () => {
        const prompt = encodeURIComponent(`${formData.title || 'Education course'} ${formData.description || 'premium learning product'}`);
        setIsGeneratingImage(true);
        try {
            const aiImageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=768&nologo=true`;
            setProductImageUploadError('');
            setProductImageUploadProgress(0);
            setImages([aiImageUrl]);
            setImageMode('url');
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

    const deleteModule = (moduleId: string) => {
        if (!window.confirm('Delete this module and all its content?')) return;
        setModules(prev => recursiveModuleDelete(prev || [], moduleId));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isSavingProduct) return;
        const resolvedPaymentLink = formData.paymentLink.trim() || product?.paymentLink?.trim() || DEFAULT_PRODUCT_PAYMENT_LINK;

        const features = ((formData.featuresText || '').split('\n') || []).map(item => item.trim()).filter(Boolean);
        const tags = ((formData.tagsText || '').split(',') || []).map(item => item.trim()).filter(Boolean);
        const keywords = parseKeywordList(formData.searchKeywordsText);
        const formattedPrice = formData.price ? `₹${formData.price}` : '₹0';
        const formattedSalePrice = formData.salePrice ? `₹${formData.salePrice}` : undefined;

        const primaryImageCandidate = (images || []).find(Boolean);
        if (primaryImageCandidate && productImageUrlStatus !== 'valid' && imageMode === 'url') {
            setProductImageUploadError('Please paste a valid https image URL.');
            return;
        }

        setIsSavingProduct(true);

        const primaryImage = (images || []).find(Boolean);
        const productImageMap = buildProductImageMap(primaryImage);

        const saved = await onSave({
            imageSeed: formData.imageSeed || formData.title || `product-${Date.now()}`,
            images: primaryImage ? [primaryImage] : [],
            productImages: productImageMap,
            title: formData.title,
            description: formData.description,
            longDescription: formData.longDescription,
            features,
            tags,
            keywords,
            ...withProductSearchIndex({ title: formData.title, description: formData.description, longDescription: formData.longDescription, category: formData.category, tags, keywords, features, fileFormat: formData.fileFormat, dimensions: formData.dimensions, sku: formData.sku, courseContent: ensureEditableCourseIntroModule(modules || [], formData.title) }),
            price: formattedPrice,
            salePrice: formattedSalePrice,
            coinPrice: normalizeCoinPrice(formData.coinPrice).normalizedCoinPrice,
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
            courseContent: ensureEditableCourseIntroModule(modules || [], formData.title),
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
                                        <ModuleEditor key={module.id} module={module} allModules={modules || []} level={0} onUpdate={setModules} onAddChild={addChildModule} onDelete={deleteModule} productId={draftProductIdRef.current} />
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
                                    <div className="mt-4">
                                      <label className="mb-2 block text-sm font-semibold text-slate-700">EduCoin Price</label>
                                      <input type="number" min="0" value={formData.coinPrice} onChange={(event) => setFormData((previous) => ({ ...previous, coinPrice: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Example: 299" />
                                      <p className="mt-1 text-xs font-bold text-slate-500">Leave empty or set 0 to disable EduCoin purchase.</p>
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
                                    <div><label className={labelClass}>Search Keywords</label><textarea rows={3} value={formData.searchKeywordsText} onChange={event => setFormData(prev => ({ ...prev, searchKeywordsText: event.target.value }))} className={fieldClass} placeholder="class 10, physics, pcm, neet, pdf, notes" /><p className="mt-2 text-xs font-bold text-slate-500">Add words students may search for, like class 10, physics, pcm, neet, pdf, notes.</p></div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Image URL</h2>
                                <div className="mt-5 grid grid-cols-3 gap-2">
                                    <button type="button" onClick={() => setImageMode('url')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'url' ? 'bg-blue-600 text-white' : 'border border-white/50 text-slate-600'}`}>Image URL</button>
                                    <button type="button" onClick={() => setImageMode('upload')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'upload' ? 'bg-cyan-100 text-cyan-800' : 'border border-white/50 text-slate-600'}`}>Future Upload</button>
                                    <button type="button" onClick={() => setImageMode('ai')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'ai' ? 'bg-purple-300 text-slate-900' : 'border border-white/50 text-slate-600'}`}>AI Image</button>
                                </div>
                                <div className="mt-4">
                                    {imageMode === 'url' ? (
                                        <PremiumImageUrlInput value={(images || []).find(Boolean) || ''} onChange={(url) => setImages(url ? [url] : [])} onStatusChange={setProductImageUrlStatus} label="Product image URL" previewAlt="Primary product image" aspect="square" compact helperText="One valid https image URL will be saved into images and every productImages display slot." />
                                    ) : imageMode === 'upload' ? (
                                        <div className="rounded-3xl border border-dashed border-cyan-300/60 bg-cyan-50/70 p-5 text-center"><p className="font-black text-cyan-800">Storage upload is currently disabled. Please use an image URL.</p><button type="button" onClick={() => productImageInputRef.current?.click()} disabled className="mt-3 w-full rounded-2xl bg-slate-200 p-4 font-black text-slate-500">Firebase upload kept for future use</button></div>
                                    ) : (
                                        <button type="button" onClick={handleGenerateAiImage} disabled={isGeneratingImage} className="w-full rounded-3xl border border-dashed border-purple-300/40 bg-purple-400/5 p-8 text-center font-black text-purple-700 hover:bg-purple-400/10 disabled:opacity-60">{isGeneratingImage ? 'Generating...' : 'Generate from title + description'}</button>
                                    )}
                                    <input ref={productImageInputRef} type="file" accept="image/*" onChange={handleProductImagesUpload} className="hidden" />
                                    {isUploadingProductImage && (
                                        <p className="mt-3 text-sm font-bold text-cyan-700">Uploading image to Firebase... {productImageUploadProgress}% complete.</p>
                                    )}
                                    {productImageUploadError && (
                                        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{productImageUploadError}</p>
                                    )}
                                </div>
                                <div className="mt-4">
                                    {(images || []).find(Boolean) ? (
                                        <div className="group relative aspect-square overflow-hidden rounded-2xl border border-white/50 bg-white/80">
                                            <img src={(images || []).find(Boolean)} alt="Primary product" className="h-full w-full object-contain" />
                                            <button type="button" onClick={() => setImages([])} className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-sm font-black text-white opacity-90">×</button>
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm font-bold text-slate-500">
                                            No product image selected. Paste a valid https image URL or generate one primary image.
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4"><label className={labelClass}>Image Seed</label><input value={formData.imageSeed} onChange={event => setFormData(prev => ({ ...prev, imageSeed: event.target.value }))} className={fieldClass} placeholder="Fallback image seed" /></div>
                                <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm font-bold text-emerald-700">
                                    Only one valid image URL is saved across images and all productImages slots for product cards, detail pages, home, gallery, and purchase previews.
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
    const [productPendingDelete, setProductPendingDelete] = useState<ProductWithRating | null>(null);
    const [isDeletingProduct, setIsDeletingProduct] = useState(false);
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
            keywords: product.keywords || [],
            courseContent: normaliseModules(product.courseContent || []),
            priceHistory: product.priceHistory || [],
        });
        setViewState('edit');
    };

    const handleDeleteProductClick = (product: ProductWithRating) => {
        setProductPendingDelete(product);
    };

    const cancelDeleteProduct = () => {
        if (isDeletingProduct) return;
        setProductPendingDelete(null);
    };

    const confirmDeleteProduct = async () => {
        if (!productPendingDelete) return;
        setIsDeletingProduct(true);
        const deleted = await onDeleteProduct(productPendingDelete.id);
        setIsDeletingProduct(false);
        if (deleted) {
            setProductPendingDelete(null);
        }
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
            keywords: productData.keywords || [],
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
        <>
            {productPendingDelete && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
                    <div className="w-full max-w-md rounded-[2rem] border border-red-200 bg-white p-6 shadow-2xl">
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-red-600">Confirm delete</p>
                        <h2 id="delete-product-title" className="mt-2 text-2xl font-black text-slate-900">Delete product?</h2>
                        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                            This will permanently delete “{productPendingDelete.title || `product #${productPendingDelete.id}`}”. This action cannot be undone.
                        </p>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button type="button" onClick={cancelDeleteProduct} disabled={isDeletingProduct} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
                            <button type="button" onClick={confirmDeleteProduct} disabled={isDeletingProduct} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{isDeletingProduct ? 'Deleting…' : 'Delete product'}</button>
                        </div>
                    </div>
                </div>
            )}
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
                                                    <button onClick={() => handleDeleteProductClick(product)} className="rounded-2xl border border-red-300/30 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-400/10">Delete</button>
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
        </>
    );
};

export default ProductManagement;
