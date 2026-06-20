// components/CoursePlayer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile, ProductDocPage, QuizAnswerState } from '../App';
import { EconomySettings } from '../utils/economy';
import AiMentor from './AiMentor';
import ProductMusicPlayer, { type AudioTrack } from './ProductMusicPlayer';

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


const formatActiveWatchTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-cyan-100 px-7 py-4 text-base font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-50 hover:shadow-sm">
          Click here to download <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
        </a>
      )}
    </div>
  </div>
);

const ModuleItem: React.FC<{ module: CourseModule; activeFile: ProductFile | null; onSelectFile: (file: ProductFile) => void; level?: number; }> = ({ module, activeFile, onSelectFile, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className={`${level > 0 ? "ml-4 border-l border-white/50 pl-3" : ""}`}>
      <button onClick={() => setIsExpanded(!isExpanded)} className="module-item-button flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-slate-900 transition hover:bg-[#f7f5ff] sm:py-4" aria-expanded={isExpanded}>
        <ModuleIcon className="h-5 w-5 shrink-0" />
        <span className="text-[15px] font-black leading-tight">{module.title}</span>
      </button>
      {isExpanded && (
        <div className="space-y-1 pb-2">
          {(module.files || []).map((file) => (
            <button key={file.id} onClick={() => onSelectFile(file)} className={`module-item-button flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition sm:py-3 ${activeFile?.id === file.id ? "bg-white border border-[#ded8ff] font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.10)]" : "font-medium text-slate-900/90 hover:bg-[#f7f5ff]"}`}>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              {file.type === 'quiz' ? <QuizIcon className="h-5 w-5 shrink-0" /> : <FileIcon className="h-5 w-5 shrink-0" />}
            </button>
          ))}
          {(module.modules || []).map((subModule) => <ModuleItem key={subModule.id} module={subModule} activeFile={activeFile} onSelectFile={onSelectFile} level={level + 1} />)}
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

const getCourseBackground = (product: ProductWithRating, activeFile: ProductFile | null) => {
  if (activeFile?.type === 'youtube') {
    const videoId = extractYouTubeID(activeFile.url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed || product.id}/1600/900`;
};

const htmlFromPlainText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith('<') ? trimmed : `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
};

type ReadingTheme = 'dark' | 'light' | 'sepia';
type ReadingFontSize = 'comfortable' | 'large' | 'immersive';
type ReadingLineSpacing = 'relaxed' | 'loose' | 'wide';
type ReadingFontStyle = 'sans' | 'serif' | 'mono';

const fontSizeClasses: Record<ReadingFontSize, string> = {
  comfortable: 'text-lg',
  large: 'text-xl',
  immersive: 'text-2xl',
};

const lineSpacingClasses: Record<ReadingLineSpacing, string> = {
  relaxed: 'leading-8',
  loose: 'leading-9',
  wide: 'leading-10',
};

const fontStyleClasses: Record<ReadingFontStyle, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};

const readingThemeClasses: Record<ReadingTheme, string> = {
  dark: 'border-white/50 bg-white/70 text-slate-900',
  light: 'border-slate-200/80 bg-slate-50/95 text-slate-900',
  sepia: 'border-amber-200/60 bg-[#f4ecd8]/95 text-[#352516]',
};

const RichTextButton: React.FC<{ active?: boolean; children: React.ReactNode; onClick: () => void; title?: string; }> = ({ active = false, children, onClick, title }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={`rounded-xl border px-3 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-sm ${active ? 'border-cyan-200 bg-cyan-300/25 shadow-sm' : 'border-white/50 bg-white/70'}`}
  >
    {children}
  </button>
);

const normalizeDocPages = (file: ProductFile): ProductDocPage[] => (file.docPages && file.docPages.length ? file.docPages : [{ id: 'page-1', title: file.name || 'Page 1', content: file.content || '<h1>Open Docs Workspace</h1><p>Start writing here.</p>' }]);

const SmartDocsWorkspace: React.FC<{ file: ProductFile; productId: number; }> = ({ file, productId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const legacyStorageKey = `smart-docs-workspace-${productId}-${file.id}`;
  const pagesStorageKey = `open-docs-pages-${productId}-${file.id}`;
  const defaultPages = useMemo(() => normalizeDocPages(file).map(page => ({ ...page, content: htmlFromPlainText(page.content) })), [file]);
  const [pages, setPages] = useState<ProductDocPage[]>(defaultPages);
  const [activePageId, setActivePageId] = useState(defaultPages[0]?.id || 'page-1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const activePage = pages.find(page => page.id === activePageId) || pages[0];
  const defaultContent = activePage?.content || '<h1>Open Docs Workspace</h1><p>Start writing here.</p>';
  const [html, setHtml] = useState(defaultContent);
  const [savedAt, setSavedAt] = useState('Saved locally');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.7);
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif'>('sans');
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark');

  useEffect(() => {
    const savedPages = localStorage.getItem(pagesStorageKey);
    const legacy = localStorage.getItem(legacyStorageKey);
    const nextPages = savedPages ? JSON.parse(savedPages) as ProductDocPage[] : defaultPages.map((page, index) => index === 0 && legacy ? { ...page, content: legacy } : page);
    setPages(nextPages);
    setActivePageId(nextPages[0]?.id || 'page-1');
    setSavedAt(savedPages || legacy ? 'Restored from local autosave' : 'Loaded admin version');
  }, [pagesStorageKey, legacyStorageKey, defaultPages]);

  useEffect(() => {
    const nextHtml = activePage?.content || defaultContent;
    setHtml(nextHtml);
    if (editorRef.current) editorRef.current.innerHTML = nextHtml;
  }, [activePageId, activePage?.content, defaultContent]);

  const saveSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range || !editorRef.current?.contains(range.commonAncestorContainer)) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const persist = () => {
    saveSelection();
    const nextContent = editorRef.current?.innerHTML || '';
    setHtml(nextContent);
    const nextPages = pages.map(page => page.id === activePageId ? { ...page, content: nextContent, updatedAt: Date.now() } : page);
    setPages(nextPages);
    localStorage.setItem(pagesStorageKey, JSON.stringify(nextPages));
    setSavedAt(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    try {
      document.execCommand(command, false, value);
      saveSelection();
      persist();
    } catch {
      setSavedAt('Formatting failed — click inside the page and try again');
    }
  };

  const readingTheme = {
    dark: 'bg-white/70 text-slate-900',
    sepia: 'bg-[#2b2118]/95 text-[#f7e7c6]',
    light: 'bg-slate-100/95 text-slate-900',
  }[theme];

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-white/70 text-slate-900 backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/50 bg-white/70 p-2 shadow-sm backdrop-blur-xl sm:gap-2 sm:p-3 custom-scrollbar">
        <button type="button" onClick={() => setIsSidebarOpen(value => !value)} className="mr-1 shrink-0 rounded-full border border-cyan-200 bg-white/80 px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-700 sm:mr-2 sm:px-3 sm:text-xs">Open Docs</button>
        <button type="button" onClick={() => setIsReadingMode(true)} className="rounded-2xl border border-cyan-200/30 bg-cyan-200/15 px-4 py-2 font-black text-cyan-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:bg-cyan-200/25">Reading Mode</button>
        {(smartDocToolbarCommands || []).map(([cmd, label]) => <button key={cmd} type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand(cmd)} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 shadow-sm transition active:scale-95 hover:bg-white/90 hover:shadow-sm">{label}</button>)}
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'H1')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">H1</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'H2')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">H2</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">• List</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyLeft')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Left</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyCenter')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Center</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyRight')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Right</button>
        <span className="ml-auto text-xs font-bold text-slate-600/80">{savedAt}</span>
        </div>
      <div className="flex min-h-0 flex-1"><aside className={`${isSidebarOpen ? 'block' : 'hidden'} w-64 shrink-0 overflow-y-auto border-r border-white/50 bg-white/60 p-3 custom-scrollbar`}><p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Saved on this device</p>{pages.map(page => <button key={page.id} type="button" onClick={() => setActivePageId(page.id)} className={`mb-2 w-full rounded-xl px-3 py-2 text-left text-sm font-bold ${page.id === activePageId ? 'bg-cyan-100 text-cyan-800' : 'bg-white/70 text-slate-700'}`}>{page.title}</button>)}<button type="button" onClick={() => { const title = prompt('Page title', `Page ${pages.length + 1}`)?.trim(); if (!title) return; const now = Date.now(); const page = { id: `page-${now}`, title, content: '<h1>New page</h1><p>Start writing here.</p>', createdAt: now, updatedAt: now }; const next = [...pages, page]; setPages(next); localStorage.setItem(pagesStorageKey, JSON.stringify(next)); setActivePageId(page.id); }} className="mt-2 w-full rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white">+ New page</button><button type="button" onClick={() => { const title = prompt('Rename page', activePage?.title || 'Page')?.trim(); if (!title || !activePage) return; const next = pages.map(page => page.id === activePage.id ? { ...page, title, updatedAt: Date.now() } : page); setPages(next); localStorage.setItem(pagesStorageKey, JSON.stringify(next)); }} className="mt-2 w-full rounded-xl bg-white/80 px-3 py-2 text-sm font-black text-slate-700">Rename</button>{pages.length > 1 && <button type="button" onClick={() => { if (!activePage || !confirm('Delete this docs page?')) return; const next = pages.filter(page => page.id !== activePage.id); setPages(next); localStorage.setItem(pagesStorageKey, JSON.stringify(next)); setActivePageId(next[0].id); }} className="mt-2 w-full rounded-xl bg-rose-100 px-3 py-2 text-sm font-black text-rose-700">Delete</button>}</aside><div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={persist}
          onBlur={persist}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onTouchEnd={saveSelection}
          onFocus={saveSelection}
          className="open-docs-page mx-auto min-h-full max-w-4xl rounded-[1.25rem] border border-white/50 bg-white/70 px-4 py-6 text-base leading-7 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] outline-none backdrop-blur-xl sm:rounded-[1.5rem] sm:px-8 sm:py-10 sm:text-lg sm:leading-8 md:px-14 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-3xl [&_h2]:font-black [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
        />
      </div></div>
      {isReadingMode && (
        <div className="absolute inset-2 z-20 flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl sm:inset-4 sm:rounded-[2rem]">
          <div className="open-docs-toolbar flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/50 bg-white/70 p-2 sm:gap-2 sm:p-3 custom-scrollbar">
            <span className="mr-auto shrink-0 text-sm font-black text-slate-900 sm:text-base">Reading Mode</span>
            <button type="button" onClick={() => setFontSize(value => Math.max(14, value - 2))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">A-</button>
            <button type="button" onClick={() => setFontSize(value => Math.min(28, value + 2))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">A+</button>
            <button type="button" onClick={() => setLineSpacing(value => Math.max(1.25, Number((value - 0.15).toFixed(2))))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Line -</button>
            <button type="button" onClick={() => setLineSpacing(value => Math.min(2.4, Number((value + 0.15).toFixed(2))))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Line +</button>
            <button type="button" onClick={() => setFontStyle(value => value === 'sans' ? 'serif' : 'sans')} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">{fontStyle === 'sans' ? 'Serif' : 'Sans'}</button>
            {(readingThemeOptions || []).map(option => <button key={option} type="button" onClick={() => setTheme(option)} className={`min-h-9 shrink-0 rounded-xl px-3 py-2 text-sm font-black capitalize ${theme === option ? 'bg-cyan-200 text-slate-900' : 'bg-white/75 hover:bg-white/90 hover:shadow-sm'}`}>{option}</button>)}
            <button type="button" onClick={() => setIsReadingMode(false)} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-4 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Close</button>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar ${readingTheme}`}>
            <style>{`.reader-content, .reader-content * { line-height: ${lineSpacing} !important; } .reader-content p, .reader-content li, .reader-content div, .reader-content span, .reader-content blockquote { font-size: ${fontSize}px !important; } .reader-content h1 { font-size: ${Math.round(fontSize * 2)}px !important; } .reader-content h2 { font-size: ${Math.round(fontSize * 1.65)}px !important; } .reader-content h3 { font-size: ${Math.round(fontSize * 1.35)}px !important; }`}</style>
            <article className={`reader-content mx-auto max-w-3xl ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'} [&_h1]:mb-5 [&_h1]:font-black [&_h2]:mb-4 [&_h2]:font-black [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6`} dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || defaultContent }} />
          </div>
        </div>
      )}
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

const CoursePlayer: React.FC<{ settings: WebsiteSettings; economySettings: EconomySettings; product: ProductWithRating; onBack: () => void; onWatchTimeMinutes?: (minutes: number, lessonTitle?: string) => void; onQuizReward?: (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => boolean; }> = ({ settings, economySettings, product, onBack, onWatchTimeMinutes, onQuizReward }) => {
  const viewport = useViewportSize();
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [mediaHasError, setMediaHasError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeWatchSeconds, setActiveWatchSeconds] = useState(0);
  const [sessionEarnedCoins, setSessionEarnedCoins] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isPlaybackWindowFocused, setIsPlaybackWindowFocused] = useState(() => typeof document === 'undefined' ? true : document.visibilityState === 'visible' && document.hasFocus());
  const [coinPulse, setCoinPulse] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const findFirst = (modules?: CourseModule[]): ProductFile | null => {
      if (!modules) return null;
      for (const m of modules) {
        if ((m.files || []).length) return (m.files || [])[0];
        const found = findFirst(m.modules || []);
        if (found) return found;
      }
      return null;
    };
    setActiveFile(findFirst(product.courseContent || []));
  }, [product]);

  useEffect(() => {
    setMediaHasError(false);
    setActiveWatchSeconds(0);
    setSessionEarnedCoins(0);
    setIsVideoPlaying(false);
    setCoinPulse(false);
  }, [activeFile]);

  useEffect(() => {
    const updateFocusState = () => {
      setIsPlaybackWindowFocused(document.visibilityState === 'visible' && document.hasFocus());
    };
    window.addEventListener('focus', updateFocusState);
    window.addEventListener('blur', updateFocusState);
    document.addEventListener('visibilitychange', updateFocusState);
    updateFocusState();
    return () => {
      window.removeEventListener('focus', updateFocusState);
      window.removeEventListener('blur', updateFocusState);
      document.removeEventListener('visibilitychange', updateFocusState);
    };
  }, []);

  const backgroundImage = useMemo(() => getCourseBackground(product, activeFile), [product, activeFile]);
  const isAudioExperience = activeFile?.type === 'audio';
  const accentGlow = settings.theme?.accentColor || '#a5f3fc';
  const forceOverlaySidebar = viewport.width < 900 || viewport.height < 560 || viewport.isTinyPlayer || viewport.isLandscapeCompact;
  const useDesktopSidebar = !forceOverlaySidebar && !isDesktopSidebarCollapsed;
  const compactPlayerChrome = viewport.isShortHeight || viewport.isTinyPlayer || viewport.isLandscapeCompact;

  const onSelectFile = (file: ProductFile) => {
    setActiveFile(file);
    setIsSidebarOpen(false);
    setIsMentorOpen(false);
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

  useEffect(() => {
    if (activeFile?.type !== 'video' || !isVideoPlaying || !isPlaybackWindowFocused) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const isActivelyPlaying = !!video && !video.paused && !video.ended && video.readyState >= 2 && document.visibilityState === 'visible' && document.hasFocus();
      if (!isActivelyPlaying) return;

      setActiveWatchSeconds((seconds) => {
        const nextSeconds = seconds + 1;
        if (nextSeconds % 60 === 0) {
          const earnedThisMinute = Math.max(0, Number(economySettings.coinPerVideoMinute));
          setSessionEarnedCoins((coins) => coins + earnedThisMinute);
          setCoinPulse(true);
          window.setTimeout(() => setCoinPulse(false), 1000);
          onWatchTimeMinutes?.(1, activeFile.name);
        }
        return nextSeconds;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeFile, economySettings.coinPerVideoMinute, isPlaybackWindowFocused, isVideoPlaying, onWatchTimeMinutes]);

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

  const ThreeDotMenuIcon = () => (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#ded8ff] bg-[#ece7ff] text-slate-950 shadow-[0_10px_30px_rgba(89,71,242,0.10)]" aria-hidden="true">
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
    </span>
  );

  const liveEarningHud = activeFile?.type === 'video' ? (
    <div className="bg-white/50 backdrop-blur-md border border-slate-200 shadow-sm rounded-full px-4 py-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800 transition-all whitespace-nowrap max-sm:px-3 max-sm:text-xs" aria-live="polite">
      <span>⏱️ {formatActiveWatchTime(activeWatchSeconds)} Mins</span>
      <span className="h-4 w-px bg-slate-300" />
      <span className={`text-amber-700 transition-all duration-300 ${coinPulse ? 'animate-bounce scale-110 text-amber-600 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]' : ''}`}>✦ +{sessionEarnedCoins} Coins</span>
    </div>
  ) : null;

  const renderMedia = () => {
    if (!activeFile) return <div className="flex h-full items-center justify-center bg-white/70 text-slate-900/70 backdrop-blur-xl">Select content to begin.</div>;
    if (mediaHasError) return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    switch (activeFile.type) {
      case 'youtube': {
        const videoId = extractYouTubeID(activeFile.url);
        return videoId ? <iframe key={activeFile.id} className="h-full w-full bg-white/70" src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`} title={activeFile.name} frameBorder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen onError={() => setMediaHasError(true)} /> : <VideoUnavailablePlaceholder />;
      }
      case 'video': return <video ref={videoRef} key={activeFile.id} src={activeFile.url} controls className="h-full w-full bg-white/70 object-contain" onPlay={() => setIsVideoPlaying(true)} onPause={() => setIsVideoPlaying(false)} onEnded={() => setIsVideoPlaying(false)} onError={() => { setIsVideoPlaying(false); setMediaHasError(true); }} />;
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
      case 'pdf': return <GlassDownloadCard file={activeFile} onDownloadRequest={triggerFileDownload} />;
      case 'sheet': return <GlassDownloadCard file={activeFile} />;
      case 'doc':
      case 'ebook': return <SmartDocsWorkspace file={activeFile} productId={product.id} />;
      case 'link': return <ExternalResourceCard file={activeFile} />;
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
        <button onClick={onBack} className={`${compactPlayerChrome ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} shrink-0 rounded-lg border border-[#ded8ff] bg-white font-black text-[#080b22] shadow-[0_10px_30px_rgba(89,71,242,0.08)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff]`} aria-label="Back to course details">← {viewport.isTinyPlayer ? '' : 'Back'}</button>
        <button onClick={() => setIsSidebarOpen(true)} className={`${compactPlayerChrome ? 'p-1.5' : 'p-2'} shrink-0 rounded-lg border border-[#ded8ff] bg-[#ece7ff]`} aria-label="Open modules"><svg className={`${compactPlayerChrome ? 'h-5 w-5' : 'h-6 w-6'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        <h1 className="min-w-0 flex-1 truncate text-base font-black sm:text-lg">{activeFile?.name || product.title}</h1>
        <div className="ml-auto flex max-w-[48vw] shrink-0 items-center gap-2 overflow-x-auto sm:max-w-none">
          {liveEarningHud}
          <button onClick={() => setIsMentorOpen(value => !value)} className={`${viewport.isTinyPlayer ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-xs sm:px-3 sm:text-sm'} rounded-xl border border-[#ded8ff] bg-white/80 font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.10)]`}>🧠 AI</button>
        </div>
      </header>

      <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 z-30 bg-white/70 backdrop-blur-sm transition ${useDesktopSidebar ? 'lg:hidden' : ''} ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />

      <main className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${compactPlayerChrome ? 'gap-1 p-1.5' : 'gap-2 p-2 sm:gap-3 sm:p-3 lg:p-3'}`} style={{ paddingLeft: 'max(0.375rem, env(safe-area-inset-left))', paddingRight: 'max(0.375rem, env(safe-area-inset-right))', paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
        <div className={`${forceOverlaySidebar ? 'hidden' : 'hidden lg:grid'} shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl border px-4 py-3 text-[22px] font-black leading-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl ${'border-[#ded8ff] bg-white/85'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onBack} className="shrink-0 rounded-2xl border border-[#ded8ff] bg-white px-5 py-3 text-base font-black text-[#080b22] shadow-[0_10px_30px_rgba(89,71,242,0.08)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff]" aria-label="Back to course details">← Back</button>
            <span className="truncate">{activeFile?.name || product.title}</span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setIsDesktopSidebarCollapsed(value => !value)} className="rounded-2xl border border-[#ded8ff] bg-white px-5 py-3 text-base font-black text-[#080b22] shadow-[0_10px_30px_rgba(89,71,242,0.08)] transition hover:-translate-y-0.5">{isDesktopSidebarCollapsed ? 'Show modules' : 'Minimize modules'}</button><button onClick={() => setIsMentorOpen(value => !value)} className="rounded-2xl border border-[#ded8ff] bg-white/85 px-6 py-3 text-base font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.12)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff]">🧠 {isMentorOpen ? 'Lesson View' : 'AI Mentor'}</button>
            {liveEarningHud}
          </div>
          <span className="truncate text-right text-sm font-bold text-[#50527a]/70">Welcome to the Course</span>
        </div>

        <section className={`${useDesktopSidebar ? 'lg:grid-cols-[var(--course-sidebar-width)_minmax(0,1fr)]' : 'grid-cols-1'} grid min-h-0 min-w-0 flex-1 overflow-hidden gap-2 sm:gap-3`} style={{ ['--course-sidebar-width' as any]: 'clamp(18rem, 28vw, 28rem)' }}>
          <aside className={`${useDesktopSidebar ? 'lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-2xl' : ''} fixed inset-y-0 left-0 z-40 w-[min(88svw,20rem)] max-w-full transform transition sm:w-80 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex h-full flex-col border-r border-[#ded8ff] bg-white/85 shadow-sm backdrop-blur-xl lg:rounded-2xl lg:border lg:border-[#ded8ff] lg:bg-white/85 lg:shadow-sm">
              <div className="shrink-0 border-b border-[#ded8ff] bg-white/85 px-4 py-4 shadow-sm lg:border-[#ded8ff] lg:py-5">
                <button onClick={onBack} className="mb-3 flex items-center gap-2 text-lg font-medium text-slate-900 hover:opacity-70 sm:mb-4 sm:text-[22px]">← <span>Back</span></button>
                <h2 className="text-xl font-black leading-tight text-slate-900 sm:text-[25px]">{product.title}</h2>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 sm:p-3">
                {(product.courseContent || []).length > 0 ? (product.courseContent || []).map(m => <ModuleItem key={m.id} module={m} activeFile={activeFile} onSelectFile={onSelectFile} />) : <p className="p-4 text-center font-semibold text-[#50527a]/70">No content added yet.</p>}
              </nav>
            </div>
          </aside>

          <div className={`relative min-h-0 min-w-0 overflow-hidden backdrop-blur-2xl ${isAudioExperience ? 'rounded-none border-0 bg-transparent shadow-none' : 'rounded-2xl border border-[#ded8ff] bg-white/72 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-3xl'}`}>
            {isMentorOpen ? <AiMentor productTitle={product.title} activeContentName={activeFile?.name || null} onClose={() => setIsMentorOpen(false)} /> : renderMedia()}
          </div>
        </section>
      </main>
    </div>
  );
};

export default CoursePlayer;
