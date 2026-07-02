// components/CoursePlayer.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile, ProductDocPage, QuizAnswerState, User, ProductAccessState, CourseAccessMeta, CourseAccessLevel } from '../App';
import { EconomySettings } from '../utils/economy';
import {
  creditWatchSessionCoins,
  EDUCOIN_SECONDS_PER_COIN,
  markWatchSessionPaused,
  startWatchSession,
} from '../utils/coinWallet';
import AiMentor from './AiMentor';
import ProductMusicPlayer, { type AudioTrack } from './ProductMusicPlayer';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}


const hostedDocsProviders = ['direct_pdf', 'google_drive_pdf', 'google_drive_doc', 'external_docs_link'] as const;

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
const toGoogleDrivePreviewUrl = (value: string) => {
  const fileId = extractGoogleDriveFileId(value);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : value.trim();
};
const isHostedDocsFile = (file: ProductFile) => {
  if (hostedDocsProviders.includes(file.provider as typeof hostedDocsProviders[number])) return true;
  if (file.type === 'pdf' && Boolean(file.url)) return true;
  return file.type === 'link' && Boolean(file.url) && (isGoogleDriveUrl(file.url) || /\.(pdf|doc|docx)(?:$|[?#])/i.test(file.url));
};

const getHostedDocsPreviewUrl = (file: ProductFile) => {
  if ((file.provider === 'google_drive_pdf' || file.provider === 'google_drive_doc' || isGoogleDriveUrl(file.url)) && extractGoogleDriveFileId(file.url)) {
    return toGoogleDrivePreviewUrl(file.url);
  }
  return file.url;
};

const FileIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const ModuleIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75h6.75v6.75H3.75V3.75zM13.5 3.75h6.75v6.75H13.5V3.75zM3.75 13.5h6.75v6.75H3.75V13.5zM13.5 13.5h6.75v6.75H13.5V13.5z" />
  </svg>
);

const QuizIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
  </svg>
);

const smartDocToolbarCommands: Array<[string, string]> | undefined = [['bold', 'B'], ['italic', 'I'], ['underline', 'U']];
const readingThemeOptions: Array<'dark' | 'sepia' | 'light'> | undefined = ['dark', 'sepia', 'light'];

const VideoUnavailablePlaceholder: React.FC = () => (
  <div className="flex h-full w-full flex-col items-center justify-center bg-white/70 p-4 text-center text-slate-900 backdrop-blur-xl">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/50 bg-white/70">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-900/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
    <h3 className="text-xl font-semibold">Video unavailable</h3>
    <p className="mt-1 text-[#50527a]/70">This video is unavailable in this environment.</p>
  </div>
);

const getViewportMetrics = () => {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 };
  }
  const viewport = window.visualViewport;
  return {
    width: Math.floor(viewport?.width || window.innerWidth || 1024),
    height: Math.floor(viewport?.height || window.innerHeight || 768),
  };
};

const useViewportSize = () => {
  const [size, setSize] = useState(getViewportMetrics);

  useEffect(() => {
    const update = () => setSize(getViewportMetrics());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  const width = size.width;
  const height = size.height;
  return {
    width,
    height,
    isCompactWidth: width < 640,
    isShortHeight: height < 560,
    isTinyPlayer: width < 430 || height < 460,
    isLandscapeCompact: width > height && height < 520,
  };
};



const GlassDownloadCard: React.FC<{ file: ProductFile; headline?: string; onDownloadRequest?: (file: ProductFile) => void; }> = ({ file, headline = 'Your download is ready', onDownloadRequest }) => (
  <div className="flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-white/70 p-3 text-slate-900 sm:p-6 custom-scrollbar">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.32),transparent_26%),radial-gradient(circle_at_75%_70%,rgba(125,211,252,0.28),transparent_24%)]" />
    <div className="relative w-full max-w-lg rounded-[1.5rem] border border-white/50 bg-white/70 p-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/50 bg-white/15 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:mb-5 sm:h-24 sm:w-24">
        <FileIcon className="h-12 w-12 text-slate-900" />
      </div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-700/90">PDF / Document</p>
      <h2 className="mt-3 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{headline}</h2>
      <p className="mx-auto mt-3 max-w-sm truncate text-base font-semibold text-slate-900/80" title={file.name}>{file.name}</p>
      {onDownloadRequest ? (
        <button type="button" onClick={() => onDownloadRequest(file)} className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-cyan-100 px-7 py-4 text-base font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-50 hover:shadow-sm">
          Click here to download <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
        </button>
      ) : (
        <a
          href={file.url}
          download={file.name}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (file.type === 'pdf') {
              console.info('PDF download started. Reward will be claimed by download handler if connected.');
            }
          }}
          className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-cyan-100 px-7 py-4 text-base font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-50 hover:shadow-sm"
        >
          Download PDF • Earn coins <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
        </a>
      )}
    </div>
  </div>
);

const getCoursePlayerAccessLevel = (item?: Partial<CourseAccessMeta> | null): CourseAccessLevel => {
  if (item?.accessLevel === 'paidUpdate' || item?.accessLevel === 'hidden') return item.accessLevel;
  return 'included';
};

const resolveCoursePlayerUpdateId = (productId: number, item: Partial<CourseAccessMeta> & { id?: string }) =>
  String(item.paidUpdateId || `product-${productId}-update-${item.id || 'content'}`).trim();

const isCoursePlayerItemHidden = (item: Partial<CourseAccessMeta>) =>
  getCoursePlayerAccessLevel(item) === 'hidden';

const hasCoursePlayerItemAccess = (
  productId: number,
  item: Partial<CourseAccessMeta> & { id?: string },
  productAccess?: ProductAccessState | null
) => {
  const accessLevel = getCoursePlayerAccessLevel(item);

  if (accessLevel === 'hidden') return false;
  if (accessLevel === 'included') return true;
  if (!productAccess?.hasBaseAccess) return false;

  const updateId = resolveCoursePlayerUpdateId(productId, item);
  return productAccess.ownedUpdateIds.includes(updateId);
};

const ModuleItem: React.FC<{
  module: CourseModule;
  productId: number;
  productAccess?: ProductAccessState | null;
  activeFile: ProductFile | null;
  onSelectFile: (file: ProductFile) => void;
  onPurchaseLatestUpdate?: () => void;
  level?: number;
}> = ({ module, productId, productAccess, activeFile, onSelectFile, onPurchaseLatestUpdate, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const moduleHidden = isCoursePlayerItemHidden(module);
  const moduleUnlocked = hasCoursePlayerItemAccess(productId, module, productAccess);

  if (moduleHidden) return null;

  return (
    <div className={`${level > 0 ? "ml-4 border-l border-white/50 pl-3" : ""}`}>
      <button onClick={() => setIsExpanded(!isExpanded)} className="module-item-button flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-slate-900 transition hover:bg-[#f7f5ff] sm:py-4" aria-expanded={isExpanded}>
        <ModuleIcon className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 text-[15px] font-black leading-tight">{module.title}</span>
        {!moduleUnlocked && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">Locked</span>}
      </button>

      {isExpanded && (
        <div className="space-y-1 pb-2">
          {!moduleUnlocked ? (
            <div className="mx-2 mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold leading-5 text-amber-800">This module is part of the latest paid update.</p>
              {onPurchaseLatestUpdate && (
                <button type="button" onClick={onPurchaseLatestUpdate} className="mt-2 w-full rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white shadow-sm">
                  Purchase the latest update
                </button>
              )}
            </div>
          ) : (
            <>
              {(module.files || []).filter(file => !isCoursePlayerItemHidden(file)).map((file) => {
                const fileUnlocked = hasCoursePlayerItemAccess(productId, file, productAccess);

                return (
                  <button
                    key={file.id}
                    disabled={!fileUnlocked}
                    onClick={() => fileUnlocked ? onSelectFile(file) : onPurchaseLatestUpdate?.()}
                    className={`module-item-button flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition sm:py-3 ${
                      activeFile?.id === file.id
                        ? "bg-white border border-[#ded8ff] font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.10)]"
                        : fileUnlocked
                          ? "font-medium text-slate-900/90 hover:bg-[#f7f5ff]"
                          : "cursor-pointer border border-amber-200 bg-amber-50 font-black text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    {!fileUnlocked ? <span className="shrink-0 text-xs">🔒 Update</span> : file.type === 'quiz' ? <QuizIcon className="h-5 w-5 shrink-0" /> : <FileIcon className="h-5 w-5 shrink-0" />}
                  </button>
                );
              })}

              {(module.modules || []).map((subModule) => (
                <ModuleItem
                  key={subModule.id}
                  module={subModule}
                  productId={productId}
                  productAccess={productAccess}
                  activeFile={activeFile}
                  onSelectFile={onSelectFile}
                  onPurchaseLatestUpdate={onPurchaseLatestUpdate}
                  level={level + 1}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const extractYouTubeID = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) return match[2];
  const matchIframe = url.match(/youtube\.com\/embed\/([^"?]+)/);
  return matchIframe?.[1] || null;
};

const ensureYouTubeIframeApi = (): Promise<void> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.body.appendChild(script);
  });
};

const getCourseBackground = (product: ProductWithRating, activeFile: ProductFile | null) => {
  if (activeFile?.type === 'youtube') {
    const videoId = extractYouTubeID(activeFile.url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed || product.id}/1600/900`;
};

const OPEN_DOCS_DEFAULT_HTML = '<h1>Open Docs Workspace</h1><p>Start writing here.</p>';
const OPEN_DOCS_NOTES_COLLECTION = 'open_docs_notes';

const htmlFromPlainText = (value: string) => {
  const trimmed = (value || '').trim();
  return trimmed.startsWith('<') ? trimmed : `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
};

const getMeaningfulDocText = (html: string) =>
  (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

const createOpenDocsPage = (title: string, content = OPEN_DOCS_DEFAULT_HTML): ProductDocPage => {
  const now = Date.now();
  return {
    id: `open-doc-page-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: title.trim() || 'Untitled Page',
    content,
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeDocPages = (file: ProductFile): ProductDocPage[] => {
  const pages = (file.docPages || [])
    .filter(page => page && page.id && page.title)
    .map(page => ({
      ...page,
      title: page.title.trim() || 'Untitled Page',
      content: htmlFromPlainText(page.content || OPEN_DOCS_DEFAULT_HTML),
    }));

  if (pages.length > 0) return pages;

  return [
    {
      id: 'page-1',
      title: file.name || 'Page 1',
      content: htmlFromPlainText(file.content || OPEN_DOCS_DEFAULT_HTML),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
};

const readOpenDocsPagesFromStorage = (storageKey: string, fallback: ProductDocPage[]): ProductDocPage[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as ProductDocPage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

    return parsed
      .filter(page => page && page.id && page.title)
      .map(page => ({
        ...page,
        title: page.title.trim() || 'Untitled Page',
        content: htmlFromPlainText(page.content || OPEN_DOCS_DEFAULT_HTML),
      }));
  } catch {
    return fallback;
  }
};

const writeOpenDocsPagesToStorage = (storageKey: string, pages: ProductDocPage[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pages));
  } catch {
    // Keep editor usable even if browser storage is full.
  }
};

const normalizeStoredOpenDocsPages = (value: unknown, fallback: ProductDocPage[]): ProductDocPage[] => {
  const source = Array.isArray(value) ? value : [];

  const pages = source
    .filter((page): page is ProductDocPage => Boolean(page && typeof page === 'object'))
    .map(page => {
      const now = Date.now();

      return {
        id: String(page.id || `open-doc-page-${now}-${Math.random().toString(36).slice(2, 7)}`),
        title: String(page.title || 'Untitled Page').trim() || 'Untitled Page',
        content: htmlFromPlainText(String(page.content || OPEN_DOCS_DEFAULT_HTML)),
        createdAt: Number(page.createdAt) || now,
        updatedAt: Number(page.updatedAt) || now,
      };
    });

  return pages.length ? pages : fallback;
};

const cleanOpenDocsPagesForSave = (pages: ProductDocPage[], fallback: ProductDocPage[]): ProductDocPage[] =>
  normalizeStoredOpenDocsPages(pages, fallback).map(page => ({
    id: page.id,
    title: page.title.trim() || 'Untitled Page',
    content: htmlFromPlainText(page.content || OPEN_DOCS_DEFAULT_HTML),
    createdAt: Number(page.createdAt) || Date.now(),
    updatedAt: Number(page.updatedAt) || Date.now(),
  }));

const sanitizeOpenDocsDocIdPart = (value: string | number) =>
  String(value || 'unknown').replace(/[^\w-]/g, '_').slice(0, 80);

const buildOpenDocsCloudDocId = (uid: string, productId: number, fileId: string) =>
  `${sanitizeOpenDocsDocIdPart(uid)}_${sanitizeOpenDocsDocIdPart(productId)}_${sanitizeOpenDocsDocIdPart(fileId)}`;

const saveEditorSelection = (editor: HTMLDivElement | null, selectionRef: React.MutableRefObject<Range | null>) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !editor) return;

  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) {
    selectionRef.current = range.cloneRange();
  }
};

const restoreEditorSelection = (editor: HTMLDivElement | null, selectionRef: React.MutableRefObject<Range | null>) => {
  const selection = window.getSelection();
  const range = selectionRef.current;
  if (!selection || !range || !editor || !editor.contains(range.commonAncestorContainer)) return;

  selection.removeAllRanges();
  selection.addRange(range);
};

const runBrowserRichTextCommand = (
  editor: HTMLDivElement | null,
  selectionRef: React.MutableRefObject<Range | null>,
  command: string,
  value?: string
) => {
  if (!editor) return false;

  editor.focus();
  restoreEditorSelection(editor, selectionRef);

  try {
    const supported = typeof document.queryCommandSupported === 'function'
      ? document.queryCommandSupported(command)
      : true;

    if (!supported && command !== 'formatBlock') return false;

    const ok = document.execCommand(command, false, value);
    saveEditorSelection(editor, selectionRef);
    return ok;
  } catch {
    return false;
  }
};

const SmartDocsWorkspace: React.FC<{ file: ProductFile; productId: number; }> = ({ file, productId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  const legacyStorageKey = `smart-docs-workspace-${productId}-${file.id}`;
  const pagesStorageKey = `open-docs-pages-${productId}-${file.id}`;

  const defaultPages = useMemo(() => normalizeDocPages(file), [file]);
  const [pages, setPages] = useState<ProductDocPage[]>(defaultPages);
  const [activePageId, setActivePageId] = useState(defaultPages[0]?.id || 'page-1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [savedAt, setSavedAt] = useState('Loaded admin version');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.7);
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif'>('sans');
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [learnerUid, setLearnerUid] = useState(() => auth.currentUser?.uid || '');
  const cloudSaveTimerRef = useRef<number | null>(null);
  const cloudDocId = useMemo(
    () => learnerUid ? buildOpenDocsCloudDocId(learnerUid, productId, file.id) : '',
    [learnerUid, productId, file.id]
  );
  const docsViewport = useViewportSize();
  const isCompactDocs = docsViewport.width < 768;
  const editorShellClass = isSidebarOpen && !isCompactDocs
    ? 'pl-[19.75rem]'
    : '';
  const editorPageWidthClass = isSidebarOpen && !isCompactDocs
    ? 'max-w-4xl'
    : 'max-w-[min(96rem,calc(100vw-2rem))] xl:max-w-[104rem]';

  const activePage = pages.find(page => page.id === activePageId) || pages[0];
  const activeContent = activePage?.content || OPEN_DOCS_DEFAULT_HTML;

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setLearnerUid(user?.uid || '');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoredPages = readOpenDocsPagesFromStorage(pagesStorageKey, defaultPages);
    const legacyHtml = localStorage.getItem(legacyStorageKey);

    const nextPages = legacyHtml && !localStorage.getItem(pagesStorageKey)
      ? restoredPages.map((page, index) => index === 0 ? { ...page, content: legacyHtml, updatedAt: Date.now() } : page)
      : restoredPages;

    const cleanLocalPages = cleanOpenDocsPagesForSave(nextPages, defaultPages);

    setPages(cleanLocalPages);
    setActivePageId(cleanLocalPages[0]?.id || 'page-1');
    setSavedAt(legacyHtml || localStorage.getItem(pagesStorageKey) ? 'Restored from this device' : 'Loaded admin version');

    if (!learnerUid || !cloudDocId) return () => {
      cancelled = true;
    };

    getDoc(doc(db, OPEN_DOCS_NOTES_COLLECTION, cloudDocId))
      .then(snapshot => {
        if (cancelled || !snapshot.exists()) return;

        const cloudPages = normalizeStoredOpenDocsPages(snapshot.data()?.pages, cleanLocalPages);
        const cleanCloudPages = cleanOpenDocsPagesForSave(cloudPages, cleanLocalPages);

        setPages(cleanCloudPages);
        setActivePageId(cleanCloudPages[0]?.id || 'page-1');
        writeOpenDocsPagesToStorage(pagesStorageKey, cleanCloudPages);
        setSavedAt('Synced from your account');
      })
      .catch(() => {
        if (!cancelled) setSavedAt('Local mode · cloud sync unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [pagesStorageKey, legacyStorageKey, defaultPages, learnerUid, cloudDocId]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== activeContent) {
      editorRef.current.innerHTML = activeContent;
    }
  }, [activePageId, activeContent]);

  const persistPages = (nextPages: ProductDocPage[], status = 'Saved locally') => {
    const cleanPages = cleanOpenDocsPagesForSave(nextPages, defaultPages);

    setPages(cleanPages);
    writeOpenDocsPagesToStorage(pagesStorageKey, cleanPages);
    setSavedAt(status);

    if (!learnerUid || !cloudDocId) return;

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    cloudSaveTimerRef.current = window.setTimeout(() => {
      setDoc(doc(db, OPEN_DOCS_NOTES_COLLECTION, cloudDocId), {
        ownerId: learnerUid,
        productId,
        fileId: file.id,
        fileName: file.name,
        pages: cleanPages,
        updatedAt: Date.now(),
      }, { merge: true })
        .then(() => setSavedAt('Saved to your account'))
        .catch(() => setSavedAt('Saved on this device · cloud sync failed'));
    }, 700);
  };

  useEffect(() => {
    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, []);

  const saveCurrentPage = () => {
    const nextContent = editorRef.current?.innerHTML || activeContent;
    const now = Date.now();

    const nextPages = pages.map(page =>
      page.id === activePageId
        ? { ...page, content: nextContent, updatedAt: now }
        : page
    );

    persistPages(nextPages, `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const selectPage = (pageId: string) => {
    saveCurrentPage();
    setActivePageId(pageId);
  };

  const addPage = () => {
    saveCurrentPage();
    const title = prompt('New Open Docs page title', `Page ${pages.length + 1}`)?.trim();
    if (!title) return;

    const nextPage = createOpenDocsPage(title);
    const nextPages = [...pages, nextPage];

    persistPages(nextPages, 'New page created locally');
    setActivePageId(nextPage.id);
    setIsSidebarOpen(true);
  };

  const renamePage = () => {
    if (!activePage) return;

    const title = prompt('Rename Open Docs page', activePage.title)?.trim();
    if (!title) return;

    const nextPages = pages.map(page =>
      page.id === activePage.id ? { ...page, title, updatedAt: Date.now() } : page
    );

    persistPages(nextPages, 'Page renamed locally');
  };

  const deletePage = () => {
    if (!activePage || pages.length <= 1) return;
    if (!confirm('Delete this Open Docs page from this device?')) return;

    const nextPages = pages.filter(page => page.id !== activePage.id);
    persistPages(nextPages, 'Page deleted locally');
    setActivePageId(nextPages[0]?.id || 'page-1');
  };

  const runCommand = (command: string, value?: string) => {
    const ok = runBrowserRichTextCommand(editorRef.current, selectionRef, command, value);
    if (!ok) {
      setSavedAt('Formatting failed — click inside the page and try again');
      return;
    }
    saveCurrentPage();
  };

  const readingThemeClass = {
    dark: 'bg-white/70 text-slate-900',
    sepia: 'bg-[#2b2118]/95 text-[#f7e7c6]',
    light: 'bg-slate-100/95 text-slate-900',
  }[theme];

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-white/70 text-slate-900 backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/50 bg-white/70 p-2 shadow-sm backdrop-blur-xl sm:gap-2 sm:p-3 custom-scrollbar">
        <button type="button" onClick={() => setIsSidebarOpen(value => !value)} className="shrink-0 rounded-full border border-cyan-200 bg-white/90 px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-50 hover:shadow-md" aria-expanded={isSidebarOpen}>Open Docs</button>
        <button type="button" onClick={() => { saveCurrentPage(); setIsReadingMode(true); }} className="shrink-0 rounded-full border border-cyan-200/60 bg-cyan-200/20 px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-200/30 hover:shadow-md">Reading Mode</button>
        {(smartDocToolbarCommands || []).map(([cmd, label]) => (<button key={cmd} type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand(cmd)} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 shadow-sm transition active:scale-95 hover:bg-white/90 hover:shadow-sm">{label}</button>))}
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', '<h1>')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">H1</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', '<h2>')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">H2</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">• List</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyLeft')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Left</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyCenter')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Center</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyRight')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Right</button>
        <span className="ml-auto shrink-0 rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-slate-600/90">{savedAt}</span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isSidebarOpen && (
          <div className={`${isCompactDocs ? 'absolute inset-x-2 top-2 z-20 max-h-[70vh] rounded-[1.5rem] border border-cyan-100 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-2xl' : 'absolute left-3 top-3 z-20 h-[calc(100%-1.5rem)] w-72 rounded-[1.5rem] border border-white/60 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl'} flex min-h-0 flex-col overflow-hidden`}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 p-3">
              <button type="button" onClick={() => setIsSidebarOpen(false)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50">← Back</button>
              <p className="min-w-0 flex-1 truncate text-right text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Open Docs</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Pages on this device</p>
              <div className="space-y-2">{pages.map(page => (<button key={page.id} type="button" onClick={() => { selectPage(page.id); if (isCompactDocs) setIsSidebarOpen(false); }} className={`w-full rounded-xl px-3 py-3 text-left text-sm font-bold transition ${page.id === activePageId ? 'bg-cyan-100 text-cyan-800 shadow-sm' : 'bg-white/80 text-slate-700 hover:bg-white'}`}><span className="block truncate">{page.title}</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{getMeaningfulDocText(page.content).slice(0, 42) || 'Empty page'}</span></button>))}</div>
              <button type="button" onClick={addPage} className="mt-4 w-full rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-cyan-700">+ New page</button>
              <button type="button" onClick={renamePage} className="mt-2 w-full rounded-xl bg-white/90 px-3 py-2 text-sm font-black text-slate-700 hover:bg-white">Rename page</button>
              {pages.length > 1 && (<button type="button" onClick={deletePage} className="mt-2 w-full rounded-xl bg-rose-100 px-3 py-2 text-sm font-black text-rose-700 hover:bg-rose-200">Delete page</button>)}
              <p className="mt-4 rounded-xl bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800">Learner-created pages are saved locally in this browser for this product file.</p>
            </div>
          </div>
        )}
        {isSidebarOpen && isCompactDocs && (<button type="button" aria-label="Close Open Docs panel" onClick={() => setIsSidebarOpen(false)} className="absolute inset-0 z-10 bg-slate-950/20 backdrop-blur-[1px]" />)}
        <div className={`h-full min-h-0 overflow-y-auto p-3 transition-[padding] duration-300 sm:p-4 md:p-8 custom-scrollbar ${editorShellClass}`}>
          <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={saveCurrentPage} onBlur={saveCurrentPage} onKeyUp={() => saveEditorSelection(editorRef.current, selectionRef)} onMouseUp={() => saveEditorSelection(editorRef.current, selectionRef)} onTouchEnd={() => saveEditorSelection(editorRef.current, selectionRef)} onFocus={() => saveEditorSelection(editorRef.current, selectionRef)} className={`open-docs-page mx-auto min-h-full w-full ${editorPageWidthClass} rounded-[1.25rem] border border-white/50 bg-white/80 px-4 py-6 text-base leading-7 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] outline-none backdrop-blur-xl transition-[max-width] duration-300 sm:rounded-[1.5rem] sm:px-8 sm:py-10 sm:text-lg sm:leading-8 md:px-14 [&_h1]:text-3xl sm:[&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-2xl sm:[&_h2]:text-3xl [&_h2]:font-black [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6`} />
        </div>
      </div>

      {isReadingMode && (
        <div className="absolute inset-2 z-20 flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl sm:inset-4 sm:rounded-[2rem]">
          <div className="open-docs-toolbar flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/50 bg-white/70 p-2 sm:gap-2 sm:p-3 custom-scrollbar">
            <span className="mr-auto shrink-0 text-sm font-black text-slate-900 sm:text-base">Reading Mode</span>
            <button type="button" onClick={() => setFontSize(value => Math.max(14, value - 2))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">A-</button>
            <button type="button" onClick={() => setFontSize(value => Math.min(28, value + 2))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">A+</button>
            <button type="button" onClick={() => setLineSpacing(value => Math.max(1.25, Number((value - 0.15).toFixed(2))))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Line -</button>
            <button type="button" onClick={() => setLineSpacing(value => Math.min(2.4, Number((value + 0.15).toFixed(2))))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Line +</button>
            <button type="button" onClick={() => setFontStyle(value => value === 'sans' ? 'serif' : 'sans')} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">{fontStyle === 'sans' ? 'Serif' : 'Sans'}</button>
            {(readingThemeOptions || []).map(option => (<button key={option} type="button" onClick={() => setTheme(option)} className={`min-h-9 shrink-0 rounded-xl px-3 py-2 text-sm font-black capitalize ${theme === option ? 'bg-cyan-200 text-slate-900' : 'bg-white/75 hover:bg-white/90 hover:shadow-sm'}`}>{option}</button>))}
            <button type="button" onClick={() => setIsReadingMode(false)} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-4 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Close</button>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar ${readingThemeClass}`}>
            <style>{`.reader-content, .reader-content * { line-height: ${lineSpacing} !important; } .reader-content p, .reader-content li, .reader-content div, .reader-content span, .reader-content blockquote { font-size: ${fontSize}px !important; } .reader-content h1 { font-size: ${Math.round(fontSize * 2)}px !important; } .reader-content h2 { font-size: ${Math.round(fontSize * 1.65)}px !important; } .reader-content h3 { font-size: ${Math.round(fontSize * 1.35)}px !important; }`}</style>
            <article className={`reader-content mx-auto max-w-3xl ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'} [&_h1]:mb-5 [&_h1]:font-black [&_h2]:mb-4 [&_h2]:font-black [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6`} dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || activeContent }} />
          </div>
        </div>
      )}
    </div>
  );
};


const HostedDocumentViewer: React.FC<{ file: ProductFile }> = ({ file }) => {
  const previewUrl = getHostedDocsPreviewUrl(file);
  const isDrive = file.provider === 'google_drive_pdf' || file.provider === 'google_drive_doc' || isGoogleDriveUrl(file.url);
  const fallbackLabel = isDrive ? 'Open in Google Drive' : file.type === 'pdf' || file.provider === 'direct_pdf' ? 'Open PDF' : 'Open in new tab';
  const badge = isDrive ? 'Google Drive Preview' : file.type === 'pdf' || file.provider === 'direct_pdf' ? 'PDF Viewer' : 'Hosted Docs';

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white/70 text-slate-900">
      <div className="flex shrink-0 flex-col gap-3 border-b border-white/60 bg-white/80 p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-700">{badge}</p>
          <h2 className="truncate text-lg font-black text-slate-900 sm:text-2xl">{file.name}</h2>
          {isDrive && <p className="mt-1 text-xs font-bold text-amber-700">If preview is blocked, make sure Google Drive sharing is set to Anyone with the link.</p>}
        </div>
        <a href={file.url || previewUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-2xl bg-cyan-100 px-5 py-3 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50">
          {fallbackLabel}
        </a>
      </div>
      <div className="min-h-0 flex-1 bg-slate-100/70 p-2 sm:p-4">
        {previewUrl ? (
          <iframe
            title={file.name || 'Document preview'}
            src={previewUrl}
            className="h-full w-full rounded-[1.5rem] border border-white/70 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
            allow="fullscreen"
          />
        ) : (
          <GlassDownloadCard file={file} headline="Document preview unavailable" />
        )}
      </div>
    </div>
  );
};

const ExternalResourceCard: React.FC<{ file: ProductFile }> = ({ file }) => (
  <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-3 text-slate-900 sm:p-6 custom-scrollbar">
    <div className="w-full max-w-2xl rounded-[1.5rem] border border-white/50 bg-white/70 p-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 text-4xl">↗</div>
      <p className="font-black uppercase tracking-[0.25em] text-cyan-700">External Resource</p>
      <h2 className="mt-3 text-3xl font-black">{file.name}</h2>
      <p className="mt-3 break-all text-slate-900/75">{file.url}</p>
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex rounded-2xl bg-cyan-100 px-7 py-4 font-black text-slate-900 transition hover:-translate-y-1 hover:bg-cyan-50">Open resource</a>
    </div>
  </div>
);

const QuizPlayer: React.FC<{ file: ProductFile; economySettings: EconomySettings; onQuizReward?: (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => boolean; }> = ({ file, economySettings, onQuizReward }) => {
  const questions = file.quiz?.questions || [];
  const [answers, setAnswers] = useState<QuizAnswerState>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [rewardCoins, setRewardCoins] = useState(0);
  const quizViewport = useViewportSize();
  const compactQuiz = quizViewport.isShortHeight || quizViewport.isTinyPlayer || quizViewport.isLandscapeCompact || quizViewport.width < 640;
  const veryCompactQuiz = quizViewport.isTinyPlayer || quizViewport.height < 620;
  const score = questions.reduce((total, q, index) => total + (answers[index] === q.correctAnswer ? 1 : 0), 0);
  if (!questions.length) return <GlassDownloadCard file={file} headline="Quiz unavailable" />;

  const question = questions[currentQuestion];
  const selected = answers[currentQuestion];
  const answered = selected !== undefined;
  const isLastQuestion = currentQuestion === questions.length - 1;
  const allAnswered = questions.every((_, index) => answers[index] !== undefined);

  const desktopQuizLayout = !compactQuiz && quizViewport.width >= 1024;

  const submitQuiz = () => {
    const coins = score * Math.max(0, Number(economySettings.coinPerQuizCorrect));
    setSubmitted(true);
    setRewardCoins(coins);
    if (coins > 0 && onQuizReward) setRewardClaimed(onQuizReward(file.id, file.name, score, coins));
  };

  return (
    <div className={`flex h-full min-h-0 overflow-hidden text-slate-900 ${compactQuiz ? 'p-0.5 sm:p-1.5' : 'p-3 sm:p-5 md:p-6'}`}>
      <div className={`mx-auto grid h-full min-h-0 w-full rounded-[1.25rem] border border-white/50 bg-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl sm:rounded-[2rem] ${compactQuiz ? 'grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-1.5 p-1.5' : desktopQuizLayout ? 'max-w-none grid-cols-[minmax(180px,0.45fr)_minmax(0,2.1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-3 p-3 md:p-4 xl:p-5' : 'max-w-5xl grid-rows-[auto_auto_auto_minmax(0,1fr)_auto_auto] gap-4 p-4 sm:p-6 md:p-8'}`}>
        <div className={`${compactQuiz ? 'flex-row items-center gap-1.5' : desktopQuizLayout ? 'col-start-1 row-start-1 flex-col gap-2 rounded-[1.25rem] border border-white/50 bg-white/70 p-3 shadow-sm xl:p-4' : 'gap-4 sm:flex-row sm:items-center sm:justify-between'} flex shrink-0 justify-between`}>
          <div className="min-w-0 flex-1">
            <p className={`${veryCompactQuiz ? 'hidden' : 'block'} text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700 sm:text-xs sm:tracking-[0.3em]`}>Interactive Quiz</p>
            <h2 className={`${compactQuiz ? 'mt-0 text-base' : desktopQuizLayout ? 'mt-1 text-xl xl:text-2xl' : 'mt-2 text-2xl sm:text-3xl'} truncate font-black text-slate-900`}>{file.name}</h2>
          </div>
          <div className={`${compactQuiz ? 'rounded-lg px-2 py-1 text-xs' : desktopQuizLayout ? 'rounded-2xl px-3 py-2 text-sm xl:text-base' : 'rounded-2xl px-4 py-2 text-base sm:px-5 sm:py-3 sm:text-lg'} shrink-0 border border-white/50 bg-white/70 font-black text-slate-900`}>Score: {score}/{questions.length}</div>
        </div>

        <div className={`${compactQuiz ? 'h-1' : desktopQuizLayout ? 'col-start-1 row-start-2 h-2' : 'h-2'} shrink-0 overflow-hidden rounded-full bg-white/70`}>
          <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }} />
        </div>

        {questions.length > 1 && (
          <div className={`${compactQuiz ? 'h-[5.25rem] flex-nowrap items-start gap-1.5 overflow-x-auto rounded-[1.1rem] p-1.5' : desktopQuizLayout ? 'col-start-1 row-start-3 content-start gap-1.5 overflow-y-auto p-2' : 'max-h-28 flex-wrap gap-2 overflow-y-auto p-3'} flex shrink-0 rounded-2xl border border-white/50 bg-white/70 custom-scrollbar`}>
            {questions.map((_, index) => {
              const isActive = currentQuestion === index;
              const isAnswered = answers[index] !== undefined;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentQuestion(index)}
                  className={`${compactQuiz ? 'h-16 min-w-10 rounded-full px-2 py-0 text-[11px] leading-none' : 'rounded-2xl px-4 py-2 text-sm'} shrink-0 font-black transition ${isActive ? 'bg-cyan-200 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5' : isAnswered ? 'border border-emerald-300/40 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20' : 'border border-white/50 bg-white/70 text-slate-600 hover:bg-white/80 hover:shadow-sm'}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  Q{index + 1}
                </button>
              );
            })}
          </div>
        )}

        <div className={`${compactQuiz ? 'rounded-[1.15rem] p-3' : desktopQuizLayout ? 'col-start-2 row-span-5 row-start-1 rounded-[1.75rem] p-6 xl:p-8 2xl:p-10' : 'rounded-[1.5rem] p-3 sm:rounded-3xl sm:p-5 md:p-7'} min-h-0 overflow-y-auto border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] custom-scrollbar`}>
          <p className={`${compactQuiz ? 'mb-1.5 text-[10px]' : 'mb-3 text-sm'} font-black uppercase tracking-[0.24em] text-slate-600`}>Question {currentQuestion + 1} of {questions.length}</p>
          <h3 className={`${compactQuiz ? 'text-base' : 'text-xl sm:text-2xl'} font-black leading-tight text-slate-900`}>{question.prompt}</h3>
          <div className={`${compactQuiz ? 'mt-3 gap-2' : 'mt-5 gap-3'} grid md:grid-cols-2`}>
            {(question.options || []).map((option, oIndex) => {
              const isCorrect = oIndex === question.correctAnswer;
              const isSelected = selected === oIndex;
              const stateClass = !answered
                ? 'border-white/50 bg-white/70 text-slate-900 hover:bg-white/80 hover:shadow-sm hover:shadow-sm'
                : isCorrect
                  ? 'border-emerald-300/80 bg-emerald-400/25 text-emerald-700 shadow-sm'
                  : isSelected
                    ? 'border-rose-300/80 bg-rose-400/25 text-rose-700 shadow-sm'
                    : 'border-white/50 bg-white/70 text-slate-600/70';
              return <button key={`${option}-${oIndex}`} type="button" onClick={() => !answered && setAnswers(prev => ({ ...prev, [currentQuestion]: oIndex }))} className={`${compactQuiz ? 'rounded-xl px-3 py-3 text-sm' : 'rounded-2xl px-4 py-4 sm:px-5'} border text-left font-bold transition ${stateClass}`}>{option}</button>;
            })}
          </div>
          {answered && <div className={`${compactQuiz ? 'mt-3 rounded-xl p-3 text-sm' : 'mt-6 rounded-2xl p-4'} border font-black ${selected === question.correctAnswer ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-700' : 'border-rose-300/50 bg-rose-400/15 text-rose-100'}`}>{selected === question.correctAnswer ? 'Correct! Great work.' : `Incorrect. Correct answer: ${question.options[question.correctAnswer]}`}</div>}
        </div>

        {submitted && (
          <div className={`${compactQuiz ? 'rounded-[1.15rem] p-3' : desktopQuizLayout ? 'col-start-1 row-start-4 rounded-3xl p-4' : 'rounded-3xl p-5'} shrink-0 border border-emerald-200/70 bg-emerald-50/80 shadow-sm backdrop-blur-xl`}>
            <p className={`${compactQuiz ? 'text-base' : 'text-xl'} font-black text-emerald-800`}>Quiz submitted: {score}/{questions.length}</p>
            <p className={`${compactQuiz ? 'mt-1 text-xs' : 'mt-2 text-sm'} font-bold text-emerald-700`}>{rewardClaimed ? `✦ +${rewardCoins} EduCoins credited to your wallet.` : rewardCoins > 0 ? 'Reward already claimed for this quiz.' : 'No coin reward this time — revise and try another quiz.'}</p>
          </div>
        )}

        <div className={`${compactQuiz ? 'grid grid-cols-3 gap-1' : desktopQuizLayout ? 'col-start-1 row-start-5 grid gap-2 self-end' : 'flex gap-3 sm:items-center sm:justify-between sm:gap-4'} shrink-0`}>
          <button type="button" disabled={currentQuestion === 0} onClick={() => setCurrentQuestion(index => Math.max(0, index - 1))} className={`${compactQuiz ? 'rounded-lg px-1.5 py-1.5 text-[11px]' : desktopQuizLayout ? 'rounded-2xl px-4 py-2.5 text-sm' : 'rounded-2xl px-5 py-3'} border border-white/50 bg-white/70 font-black text-slate-900 transition hover:bg-white/80 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40`}>Previous</button>
          <div className={`${compactQuiz ? 'contents' : desktopQuizLayout ? 'grid gap-3' : 'grid gap-3 sm:flex'}`}>
            <button type="button" onClick={() => isLastQuestion ? setCurrentQuestion(0) : setCurrentQuestion(index => Math.min(questions.length - 1, index + 1))} className={`${compactQuiz ? 'rounded-lg px-1.5 py-1.5 text-[11px]' : desktopQuizLayout ? 'rounded-2xl px-4 py-2.5 text-sm' : 'rounded-2xl px-6 py-3'} bg-cyan-200 font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50`}>{isLastQuestion ? 'Review' : 'Next'}</button>
            <button type="button" disabled={!allAnswered || submitted} onClick={submitQuiz} className={`${compactQuiz ? 'rounded-lg px-1.5 py-1.5 text-[11px]' : desktopQuizLayout ? 'rounded-2xl px-4 py-2.5 text-sm' : 'rounded-2xl px-6 py-3'} bg-gradient-to-r from-indigo-500 to-amber-400 font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50`}>Submit</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CoursePlayer: React.FC<{
  settings: WebsiteSettings;
  economySettings: EconomySettings;
  product: ProductWithRating;
  currentUser?: User | null;
  onBack: () => void;
  onQuizReward?: (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => boolean;
  productAccess?: ProductAccessState | null;
  onPurchaseLatestUpdate?: (product: ProductWithRating) => void;
}> = ({ settings, economySettings, product, currentUser = null, onBack, onQuizReward, productAccess = null, onPurchaseLatestUpdate }) => {
  const viewport = useViewportSize();
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [mediaHasError, setMediaHasError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeTickTimerRef = useRef<number | null>(null);
  const youtubeSessionRef = useRef<{
    sessionId: string;
    userId: string;
    courseId: string;
    videoId: string;
    youtubeVideoId: string;
    validWatchedSeconds: number;
    lastPlaybackPosition: number;
    isFlushing: boolean;
  } | null>(null);
  const [youtubeRewardNotice, setYoutubeRewardNotice] = useState('');
  const [youtubeWatchSeconds, setYoutubeWatchSeconds] = useState(0);

  const currentUserId = currentUser?.uid || (currentUser?.id ? String(currentUser.id) : '');

  const stopYoutubeTickTimer = useCallback(() => {
    if (youtubeTickTimerRef.current !== null) {
      window.clearInterval(youtubeTickTimerRef.current);
      youtubeTickTimerRef.current = null;
    }
  }, []);

  const flushYoutubeCoins = useCallback(async (nextStatus: 'paused' | 'closed' | 'credited' = 'closed') => {
    const session = youtubeSessionRef.current;
    if (!session || session.isFlushing) return 0;

    session.isFlushing = true;
    stopYoutubeTickTimer();

    try {
      const player = youtubePlayerRef.current;
      const lastPosition = Number(player?.getCurrentTime?.() || session.lastPlaybackPosition || 0);
      session.lastPlaybackPosition = Math.max(session.lastPlaybackPosition, lastPosition);

      const creditedCoins = await creditWatchSessionCoins({
        sessionId: session.sessionId,
        userId: session.userId,
        courseId: session.courseId,
        videoId: session.videoId,
        youtubeVideoId: session.youtubeVideoId,
        validWatchedSeconds: session.validWatchedSeconds,
        lastPlaybackPosition: session.lastPlaybackPosition,
      });

      if (nextStatus === 'paused') {
        await markWatchSessionPaused(session.sessionId).catch(() => undefined);
      }

      if (creditedCoins > 0) {
        setYoutubeRewardNotice(`+${creditedCoins} EduCoin credited for ${creditedCoins * EDUCOIN_SECONDS_PER_COIN}s valid YouTube watch time.`);
      }

      return creditedCoins;
    } catch (error) {
      console.warn('YouTube EduCoin flush failed:', error);
      return 0;
    } finally {
      session.isFlushing = false;
    }
  }, [stopYoutubeTickTimer]);

  const handlePlayerBack = () => {
    void flushYoutubeCoins('closed');
    onBack();
  };

  useEffect(() => {
    const findFirst = (modules?: CourseModule[]): ProductFile | null => {
      if (!modules) return null;

      for (const m of modules) {
        if (!hasCoursePlayerItemAccess(product.id, m, productAccess)) continue;

        const firstUnlockedFile = (m.files || []).find(file => hasCoursePlayerItemAccess(product.id, file, productAccess));
        if (firstUnlockedFile) return firstUnlockedFile;

        const found = findFirst(m.modules || []);
        if (found) return found;
      }

      return null;
    };

    setActiveFile(findFirst(product.courseContent || []));
  }, [product, productAccess]);

  useEffect(() => {
    setMediaHasError(false);
  }, [activeFile]);

  const backgroundImage = useMemo(() => getCourseBackground(product, activeFile), [product, activeFile]);
  const isAudioExperience = activeFile?.type === 'audio';
  const accentGlow = settings.theme?.accentColor || '#a5f3fc';
  const forceOverlaySidebar = viewport.width < 900 || viewport.height < 560 || viewport.isTinyPlayer || viewport.isLandscapeCompact;
  const useDesktopSidebar = !forceOverlaySidebar && !isDesktopSidebarCollapsed;
  const compactPlayerChrome = viewport.isShortHeight || viewport.isTinyPlayer || viewport.isLandscapeCompact;

  const youtubeFrameId = useMemo(() => {
    if (activeFile?.type !== 'youtube') return '';
    return `youtube-player-${product.id}-${activeFile.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }, [activeFile?.id, activeFile?.type, product.id]);

  useEffect(() => {
    if (showWelcome || activeFile?.type !== 'youtube') return undefined;

    const youtubeVideoId = extractYouTubeID(activeFile.url);
    if (!youtubeVideoId || !currentUserId || !youtubeFrameId) return undefined;

    let cancelled = false;
    const sessionId = `${currentUserId}_${product.id}_${activeFile.id}_${Date.now()}`;

    youtubeSessionRef.current = {
      sessionId,
      userId: currentUserId,
      courseId: String(product.id),
      videoId: activeFile.id,
      youtubeVideoId,
      validWatchedSeconds: 0,
      lastPlaybackPosition: 0,
      isFlushing: false,
    };
    setYoutubeWatchSeconds(0);
    setYoutubeRewardNotice('');

    startWatchSession({
      sessionId,
      userId: currentUserId,
      courseId: String(product.id),
      videoId: activeFile.id,
      youtubeVideoId,
    }).catch((error) => console.warn('YouTube watch session start failed:', error));

    ensureYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT?.Player) return;

      youtubePlayerRef.current = new window.YT.Player(youtubeFrameId, {
        events: {
          onStateChange: (event: any) => {
            const playerState = event?.data;
            const playing = playerState === window.YT.PlayerState.PLAYING;
            const paused = playerState === window.YT.PlayerState.PAUSED;
            const ended = playerState === window.YT.PlayerState.ENDED;

            if (playing) {
              stopYoutubeTickTimer();
              youtubeTickTimerRef.current = window.setInterval(() => {
                const session = youtubeSessionRef.current;
                const player = youtubePlayerRef.current;
                if (!session || !player?.getCurrentTime) return;

                const currentPosition = Number(player.getCurrentTime() || 0);
                const delta = currentPosition - session.lastPlaybackPosition;

                if (delta > 0 && delta < 3) {
                  session.validWatchedSeconds += delta;
                  setYoutubeWatchSeconds(Math.floor(session.validWatchedSeconds));
                }

                session.lastPlaybackPosition = Math.max(session.lastPlaybackPosition, currentPosition);
              }, 1000);
            }

            if (paused) {
              void flushYoutubeCoins('paused');
            }

            if (ended) {
              void flushYoutubeCoins('credited');
            }
          },
        },
      });
    });

    const handleBeforeUnload = () => {
      void flushYoutubeCoins('closed');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void flushYoutubeCoins('closed');
      try {
        youtubePlayerRef.current?.destroy?.();
      } catch {
        // Ignore YouTube iframe destroy errors.
      }
      youtubePlayerRef.current = null;
      youtubeSessionRef.current = null;
      stopYoutubeTickTimer();
    };
  }, [activeFile, currentUserId, flushYoutubeCoins, product.id, showWelcome, stopYoutubeTickTimer, youtubeFrameId]);

  const onSelectFile = (file: ProductFile) => {
    void flushYoutubeCoins('closed');
    setActiveFile(file);
    setYoutubeRewardNotice('');
    setYoutubeWatchSeconds(0);
    setIsSidebarOpen(false);
    setIsMentorOpen(false);
  };

  const requestPdfDownload = (file: ProductFile) => {
    triggerFileDownload(file);
  };

  const triggerFileDownload = (file: ProductFile) => {
    if (typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const completedYoutubeCoins = Math.floor(youtubeWatchSeconds / EDUCOIN_SECONDS_PER_COIN);

  const activeAudioTracks = useMemo<AudioTrack[]>(() => {
    if (activeFile?.type !== 'audio') return [];

    return [{
      id: activeFile.id,
      title: activeFile.name || 'Course audio',
      subtitle: product.title,
      url: activeFile.url,
      cover: backgroundImage,
    }];
  }, [activeFile, backgroundImage, product.title]);

  const YoutubeRewardMeter = () => {
    if (activeFile?.type !== 'youtube') return null;

    return (
      <div className="mx-2 mt-2 rounded-2xl border border-[#ded8ff] bg-white/85 px-4 py-3 text-sm font-bold text-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Valid YouTube watch: {youtubeWatchSeconds}s</span>
          <span>Earned blocks: {completedYoutubeCoins} / every {EDUCOIN_SECONDS_PER_COIN}s</span>
        </div>
        {youtubeRewardNotice && <p className="mt-2 text-emerald-700">{youtubeRewardNotice}</p>}
      </div>
    );
  };

  const ThreeDotMenuIcon = () => (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#ded8ff] bg-[#ece7ff] text-slate-950 shadow-[0_10px_30px_rgba(89,71,242,0.10)]" aria-hidden="true">
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
    </span>
  );

  const renderMedia = () => {
    if (!activeFile) return <div className="flex h-full items-center justify-center bg-white/70 text-slate-900/70 backdrop-blur-xl">Select content to begin.</div>;
    if (mediaHasError) return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    switch (activeFile.type) {
      case 'youtube': {
        const videoId = extractYouTubeID(activeFile.url);
        return videoId ? (
          <iframe
            key={activeFile.id}
            id={youtubeFrameId}
            className="h-full w-full bg-white/70"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
            title={activeFile.name}
            frameBorder="0"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onError={() => setMediaHasError(true)}
          />
        ) : <VideoUnavailablePlaceholder />;
      }
      case 'video': return <video key={activeFile.id} src={activeFile.url} controls className="h-full w-full bg-white/70 object-contain" onError={() => setMediaHasError(true)} />;
      case 'audio': {
        return (
          <div className="flex h-full min-h-0 w-full bg-[#d5fbff]/70 text-slate-900">
            <ProductMusicPlayer
              tracks={activeAudioTracks}
              title={activeFile.name || product.title}
              variant="full"
              className="h-full w-full"
              initialTrackId={activeFile.id}
              onError={() => setMediaHasError(true)}
              density={viewport.width < 760 || viewport.height < 720 ? 'compact' : 'comfortable'}
            />
          </div>
        );
      }
      case 'pdf': return activeFile.url ? <HostedDocumentViewer file={activeFile} /> : <GlassDownloadCard file={activeFile} onDownloadRequest={requestPdfDownload} />;
      case 'sheet': return <GlassDownloadCard file={activeFile} />;
      case 'doc':
      case 'ebook': return <SmartDocsWorkspace file={activeFile} productId={product.id} />;
      case 'link': return isHostedDocsFile(activeFile) ? <HostedDocumentViewer file={activeFile} /> : <ExternalResourceCard file={activeFile} />;
      case 'quiz': return <QuizPlayer file={activeFile} economySettings={economySettings} onQuizReward={onQuizReward} />;
      default: return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    }
  };

  if (showWelcome) {
    return (
      <div className="course-player-mobile-scope relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#f3f0ff] p-4 text-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(89,71,242,0.18),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(125,211,252,0.22),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.95),rgba(238,233,255,0.95))]" />
        <div className="relative w-full max-w-3xl rounded-[2rem] border border-white/70 bg-white/80 p-6 text-center shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-2xl sm:p-10">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-white shadow-sm"><ThreeDotMenuIcon /></div>
          <p className="text-sm font-black uppercase tracking-[0.32em] text-[#5947f2]">Welcome to {product.title}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">Now start your learning</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-semibold leading-8 text-slate-700 sm:text-lg">You are entering a focused learning space. Move step by step, take notes, and give every lesson your full attention so today’s session turns into practical progress.</p>
          <div className="mx-auto mt-6 flex max-w-xl items-center gap-4 rounded-3xl border border-[#ded8ff] bg-[#f7f5ff] p-4 text-left">
            <ThreeDotMenuIcon />
            <p className="text-sm font-bold leading-6 text-slate-700 sm:text-base">Open the three-line menu in the course player header to choose modules and start studying your content in order.</p>
          </div>
          <button type="button" onClick={() => setShowWelcome(false)} className="mt-8 w-full rounded-2xl bg-[#5947f2] px-7 py-4 text-base font-black text-white shadow-[0_18px_44px_rgba(89,71,242,0.28)] transition hover:-translate-y-0.5 sm:w-auto">Start learning</button>
        </div>
      </div>
    );
  }

  return (
    <div className="course-player-mobile-scope relative flex h-[100dvh] min-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden text-slate-900 bg-[#f3f0ff]">
      <div className={`absolute inset-0 scale-110 bg-cover bg-center blur-2xl ${isAudioExperience ? 'opacity-[0.08]' : 'opacity-10'}`} style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className={isAudioExperience ? "absolute inset-0 bg-[linear-gradient(180deg,#d5fbff_0%,#c9f8ff_48%,#d8fbff_100%)]" : "absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(111,82,255,0.16),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(199,190,255,0.32),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.9),rgba(246,243,255,0.86),rgba(238,233,255,0.94))]"} />
      <div className="absolute -bottom-20 left-8 h-96 w-24 rotate-12 rounded-full opacity-50 blur-2xl" style={{ backgroundColor: isAudioExperience ? '#bdf7ff' : '#8b75ff' }} />
      <div className={`absolute -top-12 right-12 h-72 w-72 rounded-full blur-3xl ${isAudioExperience ? 'bg-[#c9f8ff]/70' : 'bg-[#d9d2ff]/45'}`} />

      <header className={`relative z-30 min-w-0 items-center gap-2 border-b shadow-sm backdrop-blur-xl ${forceOverlaySidebar ? 'flex' : 'flex lg:hidden'} ${compactPlayerChrome ? 'p-1.5' : 'p-2.5 sm:gap-3 sm:p-3'} ${'border-[#ded8ff] bg-white/85'}`} style={{ paddingLeft: 'max(0.375rem, env(safe-area-inset-left))', paddingRight: 'max(0.375rem, env(safe-area-inset-right))' }}>
        <button onClick={handlePlayerBack} className={`${compactPlayerChrome ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} shrink-0 rounded-lg border border-[#ded8ff] bg-white font-black text-[#080b22] shadow-[0_10px_30px_rgba(89,71,242,0.08)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff]`} aria-label="Back to course details">← {viewport.isTinyPlayer ? '' : 'Back'}</button>
        <button onClick={() => setIsSidebarOpen(true)} className={`${compactPlayerChrome ? 'p-1.5' : 'p-2'} shrink-0 rounded-lg border border-[#ded8ff] bg-[#ece7ff]`} aria-label="Open modules"><svg className={`${compactPlayerChrome ? 'h-5 w-5' : 'h-6 w-6'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        <h1 className="min-w-0 flex-1 truncate text-base font-black sm:text-lg">{activeFile?.name || product.title}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button onClick={() => setIsMentorOpen(value => !value)} className={`${viewport.isTinyPlayer ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-xs sm:px-3 sm:text-sm'} rounded-xl border border-[#ded8ff] bg-white/80 font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.10)]`}>🧠 AI</button>
          {productAccess?.hasPaidLockedUpdates && onPurchaseLatestUpdate && (
            <button onClick={() => onPurchaseLatestUpdate(product)} className={`${viewport.isTinyPlayer ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-xs sm:px-3 sm:text-sm'} rounded-xl border border-emerald-200 bg-emerald-50 font-black text-emerald-700 shadow-[0_10px_30px_rgba(16,185,129,0.10)]`}>
              Latest Update
            </button>
          )}
        </div>
      </header>

      <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 z-30 bg-white/70 backdrop-blur-sm transition ${useDesktopSidebar ? 'lg:hidden' : ''} ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />

      <main className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${compactPlayerChrome ? 'gap-1 p-1.5' : 'gap-2 p-2 sm:gap-3 sm:p-3 lg:p-3'}`} style={{ paddingLeft: 'max(0.375rem, env(safe-area-inset-left))', paddingRight: 'max(0.375rem, env(safe-area-inset-right))', paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
        <div className={`${forceOverlaySidebar ? 'hidden' : 'hidden lg:grid'} shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl border px-4 py-3 text-[22px] font-black leading-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl ${'border-[#ded8ff] bg-white/85'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={handlePlayerBack} className="shrink-0 rounded-2xl border border-[#ded8ff] bg-white px-5 py-3 text-base font-black text-[#080b22] shadow-[0_10px_30px_rgba(89,71,242,0.08)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff]" aria-label="Back to course details">← Back</button>
            <span className="truncate">{activeFile?.name || product.title}</span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setIsDesktopSidebarCollapsed(value => !value)} className="rounded-2xl border border-[#ded8ff] bg-white px-5 py-3 text-base font-black text-[#080b22] shadow-[0_10px_30px_rgba(89,71,242,0.08)] transition hover:-translate-y-0.5">{isDesktopSidebarCollapsed ? 'Show modules' : 'Minimize modules'}</button><button onClick={() => setIsMentorOpen(value => !value)} className="rounded-2xl border border-[#ded8ff] bg-white/85 px-6 py-3 text-base font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.12)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff]">🧠 {isMentorOpen ? 'Lesson View' : 'AI Mentor'}</button>
          </div>
          <span className="truncate text-right text-sm font-bold text-[#50527a]/70">Welcome to the Course</span>
        </div>

        <section className={`${useDesktopSidebar ? 'lg:grid-cols-[var(--course-sidebar-width)_minmax(0,1fr)]' : 'grid-cols-1'} grid min-h-0 min-w-0 flex-1 overflow-hidden gap-2 sm:gap-3`} style={{ ['--course-sidebar-width' as any]: 'clamp(18rem, 28vw, 28rem)' }}>
          <aside className={`${useDesktopSidebar ? 'lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-2xl' : ''} fixed inset-y-0 left-0 z-40 w-[min(88svw,20rem)] max-w-full transform transition sm:w-80 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex h-full flex-col border-r border-[#ded8ff] bg-white/85 shadow-sm backdrop-blur-xl lg:rounded-2xl lg:border lg:border-[#ded8ff] lg:bg-white/85 lg:shadow-sm">
              <div className="shrink-0 border-b border-[#ded8ff] bg-white/85 px-4 py-4 shadow-sm lg:border-[#ded8ff] lg:py-5">
                <button onClick={handlePlayerBack} className="mb-3 flex items-center gap-2 text-lg font-medium text-slate-900 hover:opacity-70 sm:mb-4 sm:text-[22px]">← <span>Back</span></button>
                <h2 className="text-xl font-black leading-tight text-slate-900 sm:text-[25px]">{product.title}</h2>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 sm:p-3">
                {(product.courseContent || []).length > 0 ? (product.courseContent || []).map(m => (
                  <ModuleItem
                    key={m.id}
                    module={m}
                    productId={product.id}
                    productAccess={productAccess}
                    activeFile={activeFile}
                    onSelectFile={onSelectFile}
                    onPurchaseLatestUpdate={onPurchaseLatestUpdate ? () => onPurchaseLatestUpdate(product) : undefined}
                  />
                )) : <p className="p-4 text-center font-semibold text-[#50527a]/70">No content added yet.</p>}
              </nav>
            </div>
          </aside>

          <div className={`relative min-h-0 min-w-0 overflow-hidden backdrop-blur-2xl ${isAudioExperience ? 'rounded-none border-0 bg-transparent shadow-none' : 'rounded-2xl border border-[#ded8ff] bg-white/72 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-3xl'}`}>
            {isMentorOpen ? <AiMentor productTitle={product.title} activeContentName={activeFile?.name || null} onClose={() => setIsMentorOpen(false)} /> : renderMedia()}
          </div>
          <YoutubeRewardMeter />
        </section>
      </main>

    </div>
  );
};

export default CoursePlayer;
