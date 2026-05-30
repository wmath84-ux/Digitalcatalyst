// components/CoursePlayer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile } from '../App';
import AiMentor from './AiMentor';

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

const VideoUnavailablePlaceholder: React.FC = () => (
  <div className="flex h-full w-full flex-col items-center justify-center bg-black p-4 text-center text-white">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
    <h3 className="text-xl font-semibold">Video unavailable</h3>
    <p className="mt-1 text-white/60">This video is unavailable in this environment.</p>
  </div>
);

const GlassDownloadCard: React.FC<{ file: ProductFile; headline?: string }> = ({ file, headline = 'Your download is ready' }) => (
  <div className="flex h-full w-full items-center justify-center overflow-hidden bg-slate-950/20 p-6 text-white">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.32),transparent_26%),radial-gradient(circle_at_75%_70%,rgba(125,211,252,0.28),transparent_24%)]" />
    <div className="relative w-full max-w-lg rounded-[2rem] border border-white/25 bg-white/10 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_30px_80px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl border border-white/30 bg-white/15 shadow-[0_0_45px_rgba(255,255,255,0.22)]">
        <FileIcon className="h-12 w-12 text-white" />
      </div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-100/90">PDF / Document</p>
      <h2 className="mt-3 text-3xl font-black leading-tight text-white">{headline}</h2>
      <p className="mx-auto mt-3 max-w-sm truncate text-base font-semibold text-white/80" title={file.name}>{file.name}</p>
      <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-white px-7 py-4 text-base font-black text-slate-950 shadow-[0_18px_45px_rgba(255,255,255,0.28)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-100 hover:shadow-[0_24px_70px_rgba(125,211,252,0.38)]">
        Click here to download <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
      </a>
    </div>
  </div>
);

const ModuleItem: React.FC<{ module: CourseModule; activeFile: ProductFile | null; onSelectFile: (file: ProductFile) => void; level?: number; }> = ({ module, activeFile, onSelectFile, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className={`${level > 0 ? "ml-4 border-l border-black/15 pl-3" : ""}`}>
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex w-full items-center gap-2 rounded-xl px-3 py-4 text-left text-black transition hover:bg-white/30" aria-expanded={isExpanded}>
        <ModuleIcon className="h-5 w-5 shrink-0" />
        <span className="text-[15px] font-black leading-tight">{module.title}</span>
      </button>
      {isExpanded && (
        <div className="space-y-1 pb-2">
          {module.files.map((file) => (
            <button key={file.id} onClick={() => onSelectFile(file)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${activeFile?.id === file.id ? "border border-white/70 bg-white/45 font-black text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(255,255,255,0.15)]" : "font-medium text-black/90 hover:bg-white/25"}`}>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              {file.type === 'quiz' ? <QuizIcon className="h-5 w-5 shrink-0" /> : <FileIcon className="h-5 w-5 shrink-0" />}
            </button>
          ))}
          {module.modules.map((subModule) => <ModuleItem key={subModule.id} module={subModule} activeFile={activeFile} onSelectFile={onSelectFile} level={level + 1} />)}
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
  dark: 'border-white/10 bg-slate-950/95 text-slate-100',
  light: 'border-slate-200/80 bg-slate-50/95 text-slate-950',
  sepia: 'border-amber-200/60 bg-[#f4ecd8]/95 text-[#352516]',
};

const RichTextButton: React.FC<{ active?: boolean; children: React.ReactNode; onClick: () => void; title?: string; }> = ({ active = false, children, onClick, title }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={`rounded-xl border px-3 py-2 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-white/20 ${active ? 'border-cyan-200 bg-cyan-300/25 shadow-[0_0_24px_rgba(125,211,252,0.25)]' : 'border-white/15 bg-white/10'}`}
  >
    {children}
  </button>
);

const SmartDocsWorkspace: React.FC<{ file: ProductFile; productId: number; }> = ({ file, productId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const storageKey = `smart-docs-workspace-${productId}-${file.id}`;
  const defaultContent = useMemo(() => htmlFromPlainText(file.content || '<h1>Smart Docs Workspace</h1><p>Start writing here.</p>'), [file.content]);
  const [html, setHtml] = useState(defaultContent);
  const [savedAt, setSavedAt] = useState('Saved locally');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSize, setFontSize] = useState<ReadingFontSize>('large');
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>('dark');
  const [lineSpacing, setLineSpacing] = useState<ReadingLineSpacing>('loose');
  const [fontStyle, setFontStyle] = useState<ReadingFontStyle>('serif');
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const nextHtml = saved || defaultContent;
    setHtml(nextHtml);
    if (editorRef.current) editorRef.current.innerHTML = nextHtml;
    setSavedAt(saved ? 'Restored from local autosave' : 'Loaded admin version');
  }, [storageKey, defaultContent]);

  const persist = (updateReadingPreview = false) => {
    const nextHtml = editorRef.current?.innerHTML || '';
    localStorage.setItem(storageKey, nextHtml);
    if (updateReadingPreview || isReadingMode) setHtml(nextHtml);
    setSavedAt(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    persist();
  };

  const openReadingMode = () => {
    setHtml(editorRef.current?.innerHTML || html);
    setIsReadingMode(true);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const richHtml = event.clipboardData.getData('text/html');
    if (!richHtml) return;
    event.preventDefault();
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, richHtml);
    persist();
  };

  const applyBlock = (tagName: string) => runCommand('formatBlock', tagName);
  const readingArticleClass = `${fontSizeClasses[fontSize]} ${lineSpacingClasses[lineSpacing]} ${fontStyleClasses[fontStyle]} ${readingThemeClasses[readingTheme]} ${focusMode ? 'mx-auto max-w-2xl' : 'mx-auto max-w-4xl'}`;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_30px_90px_rgba(2,6,23,0.38)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-950/35 p-3 shadow-[0_10px_40px_rgba(2,6,23,0.22)] backdrop-blur-2xl">
        <button type="button" onClick={openReadingMode} className="mr-2 rounded-2xl border border-cyan-200/40 bg-cyan-300/20 px-4 py-2 text-sm font-black uppercase tracking-[0.18em] text-cyan-50 shadow-[0_0_32px_rgba(125,211,252,0.22)] transition hover:-translate-y-0.5 hover:bg-cyan-300/30">Reading Mode</button>
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/80">Smart Docs Workspace</span>
        <select aria-label="Heading style" onChange={(event) => applyBlock(event.target.value)} defaultValue="P" className="rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm font-black text-white outline-none transition hover:bg-slate-900">
          <option value="P">Paragraph</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
        </select>
        <RichTextButton onClick={() => runCommand('bold')} title="Bold">B</RichTextButton>
        <RichTextButton onClick={() => runCommand('italic')} title="Italic"><span className="italic">I</span></RichTextButton>
        <RichTextButton onClick={() => runCommand('underline')} title="Underline"><span className="underline">U</span></RichTextButton>
        <RichTextButton onClick={() => runCommand('insertUnorderedList')} title="Bulleted list">• List</RichTextButton>
        <RichTextButton onClick={() => runCommand('insertOrderedList')} title="Numbered list">1. List</RichTextButton>
        <select aria-label="Text color" onChange={(event) => runCommand('foreColor', event.target.value)} defaultValue="" className="rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm font-black text-white outline-none transition hover:bg-slate-900">
          <option value="" disabled>Color</option>
          <option value="#ffffff">White</option>
          <option value="#67e8f9">Cyan</option>
          <option value="#a7f3d0">Emerald</option>
          <option value="#fde68a">Amber</option>
          <option value="#fda4af">Rose</option>
        </select>
        <RichTextButton onClick={() => runCommand('justifyLeft')} title="Align left">Left</RichTextButton>
        <RichTextButton onClick={() => runCommand('justifyCenter')} title="Align center">Center</RichTextButton>
        <RichTextButton onClick={() => runCommand('justifyRight')} title="Align right">Right</RichTextButton>
        <span className="ml-auto rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white/65">{savedAt}</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.18),transparent_28%),radial-gradient(circle_at_80%_5%,rgba(255,255,255,0.12),transparent_26%)] p-4 md:p-8">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={persist}
          onPaste={handlePaste}
          className="mx-auto min-h-full max-w-4xl rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-6 py-8 text-lg leading-8 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_30px_80px_rgba(2,6,23,0.35)] outline-none backdrop-blur-2xl md:px-12 [&_*]:max-w-full [&_a]:text-cyan-200 [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-200/60 [&_blockquote]:pl-5 [&_h1]:mb-5 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:mb-4 [&_h2]:text-3xl [&_h2]:font-black [&_h3]:mb-3 [&_h3]:text-2xl [&_h3]:font-black [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-8 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-8"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {isReadingMode && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-slate-950/78 p-4 backdrop-blur-2xl md:p-8">
          <div className="mx-auto flex min-h-full max-w-6xl flex-col rounded-[2rem] border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_30px_90px_rgba(2,6,23,0.55)] backdrop-blur-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-100">Reading Mode</p>
                <h2 className="text-2xl font-black text-white">{file.name}</h2>
              </div>
              <button type="button" onClick={() => setIsReadingMode(false)} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-2xl font-black leading-none text-white transition hover:bg-white/20">×</button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="space-y-5 rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-4 text-white">
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.22em] text-white/55">Font Size</label>
                  <div className="mt-2 grid gap-2">
                    {(['comfortable', 'large', 'immersive'] as ReadingFontSize[]).map((option) => <button key={option} type="button" onClick={() => setFontSize(option)} className={`rounded-xl border px-3 py-2 text-left font-bold capitalize transition ${fontSize === option ? 'border-cyan-200 bg-cyan-300/20 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}>{option}</button>)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.22em] text-white/55">Dark/Light/Sepia Theme</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(['dark', 'light', 'sepia'] as ReadingTheme[]).map((option) => <button key={option} type="button" onClick={() => setReadingTheme(option)} className={`rounded-xl border px-3 py-2 text-sm font-bold capitalize transition ${readingTheme === option ? 'border-cyan-200 bg-cyan-300/20 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}>{option}</button>)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.22em] text-white/55">Line Spacing</label>
                  <div className="mt-2 grid gap-2">
                    {(['relaxed', 'loose', 'wide'] as ReadingLineSpacing[]).map((option) => <button key={option} type="button" onClick={() => setLineSpacing(option)} className={`rounded-xl border px-3 py-2 text-left font-bold capitalize transition ${lineSpacing === option ? 'border-cyan-200 bg-cyan-300/20 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}>{option}</button>)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.22em] text-white/55">Font Style</label>
                  <div className="mt-2 grid gap-2">
                    {(['sans', 'serif', 'mono'] as ReadingFontStyle[]).map((option) => <button key={option} type="button" onClick={() => setFontStyle(option)} className={`rounded-xl border px-3 py-2 text-left font-bold capitalize transition ${fontStyle === option ? 'border-cyan-200 bg-cyan-300/20 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}>{option}</button>)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-[0.22em] text-white/55">Focus Mode</label>
                  <button type="button" onClick={() => setFocusMode(prev => !prev)} className={`mt-2 w-full rounded-xl border px-3 py-2 text-left font-bold transition ${focusMode ? 'border-cyan-200 bg-cyan-300/20 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}>{focusMode ? 'Enabled' : 'Disabled'}</button>
                </div>
              </aside>

              <article className={`overflow-y-auto rounded-[1.5rem] border p-6 shadow-[0_24px_70px_rgba(2,6,23,0.35)] md:p-10 [&_a]:text-cyan-400 [&_blockquote]:border-l-4 [&_blockquote]:border-current [&_blockquote]:pl-5 [&_h1]:mb-5 [&_h1]:text-5xl [&_h1]:font-black [&_h2]:mb-4 [&_h2]:text-4xl [&_h2]:font-black [&_h3]:mb-3 [&_h3]:text-3xl [&_h3]:font-black [&_li]:my-2 [&_ol]:list-decimal [&_ol]:pl-8 [&_p]:mb-5 [&_ul]:list-disc [&_ul]:pl-8 ${readingArticleClass}`} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ExternalResourceCard: React.FC<{ file: ProductFile }> = ({ file }) => (
  <div className="flex h-full items-center justify-center p-6 text-white">
    <div className="w-full max-w-2xl rounded-[2rem] border border-white/25 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-xl">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 text-4xl">↗</div>
      <p className="font-black uppercase tracking-[0.25em] text-cyan-100">External Resource</p>
      <h2 className="mt-3 text-3xl font-black">{file.name}</h2>
      <p className="mt-3 break-all text-white/75">{file.url}</p>
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex rounded-2xl bg-white px-7 py-4 font-black text-slate-950 transition hover:-translate-y-1 hover:bg-cyan-100">Open resource</a>
    </div>
  </div>
);

const QuizPlayer: React.FC<{ file: ProductFile }> = ({ file }) => {
  const questions = file.quiz?.questions || [];
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    setCurrentQuestionIndex(0);
    setAnswers({});
  }, [file.id]);

  if (!questions.length) return <GlassDownloadCard file={file} headline="Quiz unavailable" />;

  const currentQuestion = questions[currentQuestionIndex];
  const selectedAnswer = answers[currentQuestionIndex];
  const hasAnswered = selectedAnswer !== undefined;
  const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
  const score = questions.reduce((total, question, index) => total + (answers[index] === question.correctAnswer ? 1 : 0), 0);
  const progressPercent = ((currentQuestionIndex + 1) / questions.length) * 100;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const moveNext = () => {
    if (!hasAnswered) return;
    if (!isLastQuestion) setCurrentQuestionIndex(prev => prev + 1);
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_80%_85%,rgba(16,185,129,0.14),transparent_28%)] p-4 text-white md:p-8">
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_30px_110px_rgba(2,6,23,0.55),0_0_80px_rgba(125,211,252,0.12)] backdrop-blur-3xl md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />

        <div className="relative mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-100/90">Interactive Quiz</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-white md:text-4xl">{file.name}</h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Score</p>
            <p className="text-2xl font-black text-white">{score}/{questions.length}</p>
          </div>
        </div>

        <div className="relative mb-8">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm font-black text-slate-200">
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{Math.round(progressPercent)}% complete</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 shadow-[0_0_24px_rgba(125,211,252,0.55)] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="relative rounded-[1.75rem] border border-white/10 bg-slate-950/30 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:p-7">
          <h3 className="text-2xl font-black leading-snug text-white md:text-3xl">{currentQuestion.prompt}</h3>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {currentQuestion.options.map((option, optionIndex) => {
              const optionIsCorrect = optionIndex === currentQuestion.correctAnswer;
              const optionIsSelected = selectedAnswer === optionIndex;
              const feedbackClass = !hasAnswered
                ? 'border-white/10 bg-white/[0.07] text-slate-100 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/20 hover:text-white'
                : optionIsCorrect
                  ? 'border-emerald-300 bg-emerald-400/20 text-emerald-50 shadow-[0_0_32px_rgba(52,211,153,0.25)]'
                  : optionIsSelected
                    ? 'border-rose-300 bg-rose-500/20 text-rose-50 shadow-[0_0_32px_rgba(251,113,133,0.22)]'
                    : 'border-white/10 bg-white/[0.04] text-slate-400 opacity-70';

              return (
                <button
                  key={`${option}-${optionIndex}`}
                  type="button"
                  onClick={() => setAnswers(prev => hasAnswered ? prev : ({ ...prev, [currentQuestionIndex]: optionIndex }))}
                  className={`group flex min-h-20 items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all duration-300 ${feedbackClass}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-black text-white/80 transition group-hover:bg-white/15">{String.fromCharCode(65 + optionIndex)}</span>
                  <span className="text-base font-bold leading-relaxed md:text-lg">{option}</span>
                </button>
              );
            })}
          </div>

          {hasAnswered && (
            <div className={`mt-6 rounded-2xl border px-5 py-4 font-black ${isCorrect ? 'border-emerald-300/70 bg-emerald-400/15 text-emerald-100 shadow-[0_0_28px_rgba(52,211,153,0.18)]' : 'border-rose-300/70 bg-rose-500/15 text-rose-100 shadow-[0_0_28px_rgba(251,113,133,0.16)]'}`}>
              {isCorrect ? 'Correct! Beautiful work.' : `Incorrect. Correct answer: ${currentQuestion.options[currentQuestion.correctAnswer]}`}
            </div>
          )}
        </div>

        <div className="relative mt-8 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35">Previous</button>
          <button type="button" onClick={moveNext} disabled={!hasAnswered || isLastQuestion} className="rounded-2xl bg-gradient-to-r from-cyan-200 to-emerald-200 px-6 py-3 font-black text-slate-950 shadow-[0_18px_45px_rgba(125,211,252,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(125,211,252,0.34)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
            {isLastQuestion ? 'Quiz Complete' : 'Next Question'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CoursePlayer: React.FC<{ settings: WebsiteSettings; product: ProductWithRating; onBack: () => void; }> = ({ settings, product, onBack }) => {
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [mediaHasError, setMediaHasError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const findFirst = (modules?: CourseModule[]): ProductFile | null => {
      if (!modules) return null;
      for (const m of modules) {
        if (m.files.length) return m.files[0];
        const found = findFirst(m.modules);
        if (found) return found;
      }
      return null;
    };
    setActiveFile(findFirst(product.courseContent));
  }, [product]);

  useEffect(() => setMediaHasError(false), [activeFile]);

  const backgroundImage = useMemo(() => getCourseBackground(product, activeFile), [product, activeFile]);
  const accentGlow = settings.theme?.accentColor || '#a5f3fc';

  const onSelectFile = (file: ProductFile) => {
    setActiveFile(file);
    setIsSidebarOpen(false);
  };

  const renderMedia = () => {
    if (!activeFile) return <div className="flex h-full items-center justify-center bg-black text-white/70">Select content to begin.</div>;
    if (mediaHasError) return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    switch (activeFile.type) {
      case 'youtube': {
        const videoId = extractYouTubeID(activeFile.url);
        return videoId ? <iframe key={activeFile.id} className="h-full w-full bg-black" src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`} title={activeFile.name} frameBorder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen onError={() => setMediaHasError(true)} /> : <VideoUnavailablePlaceholder />;
      }
      case 'video': return <video ref={videoRef} key={activeFile.id} src={activeFile.url} controls className="h-full w-full bg-black object-contain" onError={() => setMediaHasError(true)} />;
      case 'audio': return <div className="flex h-full w-full flex-col items-center justify-center bg-black p-8 text-white"><svg xmlns="http://www.w3.org/2000/svg" className="mb-4 h-24 w-24 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" /></svg><h3 className="mb-6 max-w-full truncate text-xl font-semibold">{activeFile.name}</h3><audio key={activeFile.id} src={activeFile.url} controls className="w-full max-w-md" onError={() => setMediaHasError(true)} /></div>;
      case 'pdf':
      case 'sheet': return <GlassDownloadCard file={activeFile} />;
      case 'doc':
      case 'ebook': return <SmartDocsWorkspace file={activeFile} productId={product.id} />;
      case 'link': return <ExternalResourceCard file={activeFile} />;
      case 'quiz': return <QuizPlayer file={activeFile} />;
      default: return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-300 text-black">
      <div className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl" style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(255,255,255,0.78),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(207,250,254,0.9),transparent_18%),linear-gradient(135deg,rgba(148,163,184,0.7),rgba(226,232,240,0.55),rgba(100,116,139,0.65))]" />
      <div className="absolute -bottom-20 left-8 h-96 w-24 rotate-12 rounded-full opacity-50 blur-2xl" style={{ backgroundColor: accentGlow }} />
      <div className="absolute -top-12 right-12 h-72 w-72 rounded-full bg-white/45 blur-3xl" />

      <header className="relative z-30 flex items-center gap-3 border-b border-white/50 bg-white/45 p-3 shadow-sm backdrop-blur-xl lg:hidden">
        <button onClick={() => setIsSidebarOpen(true)} className="rounded-lg border border-white/60 bg-white/40 p-2"><svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        <h1 className="truncate text-lg font-black">{activeFile?.name || product.title}</h1>
        <button onClick={() => setIsMentorOpen(true)} className="ml-auto rounded-xl border border-white/70 bg-white/40 px-3 py-2 text-sm font-black shadow-sm">🧠 AI</button>
      </header>

      <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 z-30 bg-black/45 backdrop-blur-sm transition lg:hidden ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />

      <main className="relative z-10 flex h-full flex-col gap-3 p-3 lg:p-3">
        <div className="hidden shrink-0 grid-cols-[1fr_auto_1fr] items-center rounded-xl border border-white/55 bg-white/35 px-4 py-3 text-[22px] font-black leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:grid">
          <span className="truncate">{activeFile?.name || product.title}</span>
          <button onClick={() => setIsMentorOpen(true)} className="rounded-2xl border border-white/70 bg-white/40 px-6 py-3 text-base font-black text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_12px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-white/60">🧠 AI Mentor</button>
          <span className="truncate text-right text-sm font-bold text-black/60">Welcome to the Course</span>
        </div>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[28rem_minmax(0,1fr)]">
          <aside className={`fixed inset-y-0 left-0 z-40 w-80 transform border-r border-white/50 bg-white/45 shadow-2xl backdrop-blur-2xl transition lg:relative lg:inset-auto lg:w-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_18px_45px_rgba(15,23,42,0.16)] ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex h-full flex-col">
              <div className="shrink-0 border-b border-black/25 px-4 py-5">
                <button onClick={onBack} className="mb-4 flex items-center gap-2 text-[22px] font-medium text-black hover:opacity-70">← <span>Back</span></button>
                <h2 className="text-[25px] font-black leading-tight text-black">{product.title}</h2>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">
                {product.courseContent?.map(m => <ModuleItem key={m.id} module={m} activeFile={activeFile} onSelectFile={onSelectFile} />) || <p className="p-4 text-center font-semibold text-black/60">No content added yet.</p>}
              </nav>
            </div>
          </aside>

          <div className="min-h-0 overflow-hidden rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_20px_50px_rgba(15,23,42,0.22)] backdrop-blur-xl">
            {renderMedia()}
          </div>
        </section>
      </main>

      {isMentorOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-lg">
          <div className="relative h-[min(760px,92vh)] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/25 bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_30px_90px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/25 bg-white/20 px-5 py-4">
              <div><p className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Floating Glass Assistant</p><h3 className="text-2xl font-black text-white">🧠 AI Mentor</h3></div>
              <button onClick={() => setIsMentorOpen(false)} className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-2xl font-black leading-none text-white transition hover:bg-white/35">×</button>
            </div>
            <div className="h-[calc(100%-76px)] bg-white/70 text-slate-950">
              <AiMentor productTitle={product.title} activeContentName={activeFile?.name || null} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoursePlayer;
