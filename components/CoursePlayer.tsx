// components/CoursePlayer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile, QuizAnswerState } from '../App';
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
    <p className="mt-1 text-slate-900/60">This video is unavailable in this environment.</p>
  </div>
);


const formatActiveWatchTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const GlassDownloadCard: React.FC<{ file: ProductFile; headline?: string }> = ({ file, headline = 'Your download is ready' }) => (
  <div className="flex h-full w-full items-center justify-center overflow-hidden bg-white/70 p-6 text-slate-900">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.32),transparent_26%),radial-gradient(circle_at_75%_70%,rgba(125,211,252,0.28),transparent_24%)]" />
    <div className="relative w-full max-w-lg rounded-[2rem] border border-white/50 bg-white/70 p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl border border-white/50 bg-white/15 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <FileIcon className="h-12 w-12 text-slate-900" />
      </div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-700/90">PDF / Document</p>
      <h2 className="mt-3 text-3xl font-black leading-tight text-slate-900">{headline}</h2>
      <p className="mx-auto mt-3 max-w-sm truncate text-base font-semibold text-slate-900/80" title={file.name}>{file.name}</p>
      <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-cyan-100 px-7 py-4 text-base font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-50 hover:shadow-sm">
        Click here to download <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
      </a>
    </div>
  </div>
);

const ModuleItem: React.FC<{ module: CourseModule; activeFile: ProductFile | null; onSelectFile: (file: ProductFile) => void; level?: number; }> = ({ module, activeFile, onSelectFile, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className={`${level > 0 ? "ml-4 border-l border-white/50 pl-3" : ""}`}>
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex w-full items-center gap-2 rounded-xl px-3 py-4 text-left text-slate-900 transition hover:bg-cyan-50/30" aria-expanded={isExpanded}>
        <ModuleIcon className="h-5 w-5 shrink-0" />
        <span className="text-[15px] font-black leading-tight">{module.title}</span>
      </button>
      {isExpanded && (
        <div className="space-y-1 pb-2">
          {(module.files || []).map((file) => (
            <button key={file.id} onClick={() => onSelectFile(file)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${activeFile?.id === file.id ? "bg-white border border-slate-200 font-black text-slate-900 shadow-sm shadow-slate-200/50" : "font-medium text-slate-900/90 hover:bg-cyan-50/25"}`}>
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

const SmartDocsWorkspace: React.FC<{ file: ProductFile; productId: number; }> = ({ file, productId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const storageKey = `smart-docs-workspace-${productId}-${file.id}`;
  const defaultContent = useMemo(() => htmlFromPlainText(file.content || '<h1>Smart Docs Workspace</h1><p>Start writing here.</p>'), [file.content]);
  const [html, setHtml] = useState(defaultContent);
  const [savedAt, setSavedAt] = useState('Saved locally');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.7);
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif'>('sans');
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const nextHtml = saved || defaultContent;
    setHtml(nextHtml);
    if (editorRef.current) editorRef.current.innerHTML = nextHtml;
    setSavedAt(saved ? 'Restored from local autosave' : 'Loaded admin version');
  }, [storageKey, defaultContent]);

  const persist = () => {
    localStorage.setItem(storageKey, editorRef.current?.innerHTML || '');
    setSavedAt(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    persist();
  };

  const readingTheme = {
    dark: 'bg-white/70 text-slate-900',
    sepia: 'bg-[#2b2118]/95 text-[#f7e7c6]',
    light: 'bg-slate-100/95 text-slate-900',
  }[theme];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white/70 text-slate-900 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/50 bg-white/70 p-3 shadow-sm backdrop-blur-xl">
        <span className="mr-2 rounded-full border border-white/50 bg-white/70 px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-700">Smart Docs Workspace</span>
        {(smartDocToolbarCommands || []).map(([cmd, label]) => <button key={cmd} type="button" onClick={() => runCommand(cmd)} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 shadow-sm hover:bg-white/80 hover:shadow-sm">{label}</button>)}
        <button type="button" onClick={() => runCommand('formatBlock', 'H1')} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 hover:bg-white/80 hover:shadow-sm">H1</button>
        <button type="button" onClick={() => runCommand('formatBlock', 'H2')} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 hover:bg-white/80 hover:shadow-sm">H2</button>
        <button type="button" onClick={() => runCommand('insertUnorderedList')} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 hover:bg-white/80 hover:shadow-sm">• List</button>
        <button type="button" onClick={() => runCommand('justifyLeft')} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 hover:bg-white/80 hover:shadow-sm">Left</button>
        <button type="button" onClick={() => runCommand('justifyCenter')} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 hover:bg-white/80 hover:shadow-sm">Center</button>
        <button type="button" onClick={() => runCommand('justifyRight')} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 hover:bg-white/80 hover:shadow-sm">Right</button>
        <span className="ml-auto text-xs font-bold text-slate-600/80">{savedAt}</span>
        <button type="button" onClick={() => setIsReadingMode(true)} className="rounded-2xl border border-cyan-200/30 bg-cyan-200/15 px-4 py-2 font-black text-cyan-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:bg-cyan-200/25">Reading Mode</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 md:p-10">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={persist}
          onBlur={persist}
          className="smart-docs-page mx-auto min-h-full max-w-4xl rounded-[1.5rem] border border-white/50 bg-white/70 px-8 py-10 text-lg leading-8 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] outline-none backdrop-blur-xl md:px-14 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-3xl [&_h2]:font-black [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
        />
      </div>
      {isReadingMode && (
        <div className="absolute inset-4 z-20 flex flex-col overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/50 bg-white/70 p-3">
            <span className="mr-auto font-black text-slate-900">Reading Mode</span>
            <button type="button" onClick={() => setFontSize(value => Math.max(14, value - 2))} className="rounded-xl bg-white/70 px-3 py-2 font-black hover:bg-white/80 hover:shadow-sm">A-</button>
            <button type="button" onClick={() => setFontSize(value => Math.min(28, value + 2))} className="rounded-xl bg-white/70 px-3 py-2 font-black hover:bg-white/80 hover:shadow-sm">A+</button>
            <button type="button" onClick={() => setLineSpacing(value => Math.max(1.25, Number((value - 0.15).toFixed(2))))} className="rounded-xl bg-white/70 px-3 py-2 font-black hover:bg-white/80 hover:shadow-sm">Line -</button>
            <button type="button" onClick={() => setLineSpacing(value => Math.min(2.4, Number((value + 0.15).toFixed(2))))} className="rounded-xl bg-white/70 px-3 py-2 font-black hover:bg-white/80 hover:shadow-sm">Line +</button>
            <button type="button" onClick={() => setFontStyle(value => value === 'sans' ? 'serif' : 'sans')} className="rounded-xl bg-white/70 px-3 py-2 font-black hover:bg-white/80 hover:shadow-sm">{fontStyle === 'sans' ? 'Serif' : 'Sans'}</button>
            {(readingThemeOptions || []).map(option => <button key={option} type="button" onClick={() => setTheme(option)} className={`rounded-xl px-3 py-2 font-black capitalize ${theme === option ? 'bg-cyan-200 text-slate-900' : 'bg-white/70 hover:bg-white/80 hover:shadow-sm'}`}>{option}</button>)}
            <button type="button" onClick={() => setIsReadingMode(false)} className="rounded-xl border border-white/50 bg-white/70 px-4 py-2 font-black hover:bg-white/80 hover:shadow-sm">Close</button>
          </div>
          <div className={`flex-1 overflow-y-auto p-6 md:p-10 ${readingTheme}`}>
            <style>{`.reader-content, .reader-content * { line-height: ${lineSpacing} !important; } .reader-content p, .reader-content li, .reader-content div, .reader-content span, .reader-content blockquote { font-size: ${fontSize}px !important; } .reader-content h1 { font-size: ${Math.round(fontSize * 2)}px !important; } .reader-content h2 { font-size: ${Math.round(fontSize * 1.65)}px !important; } .reader-content h3 { font-size: ${Math.round(fontSize * 1.35)}px !important; }`}</style>
            <article className={`reader-content mx-auto max-w-3xl ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'} [&_h1]:mb-5 [&_h1]:font-black [&_h2]:mb-4 [&_h2]:font-black [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6`} dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || defaultContent }} />
          </div>
        </div>
      )}
    </div>
  );
};

const ExternalResourceCard: React.FC<{ file: ProductFile }> = ({ file }) => (
  <div className="flex h-full items-center justify-center p-6 text-slate-900">
    <div className="w-full max-w-2xl rounded-[2rem] border border-white/50 bg-white/70 p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
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
  const score = questions.reduce((total, q, index) => total + (answers[index] === q.correctAnswer ? 1 : 0), 0);
  if (!questions.length) return <GlassDownloadCard file={file} headline="Quiz unavailable" />;

  const question = questions[currentQuestion];
  const selected = answers[currentQuestion];
  const answered = selected !== undefined;
  const isLastQuestion = currentQuestion === questions.length - 1;
  const allAnswered = questions.every((_, index) => answers[index] !== undefined);

  const submitQuiz = () => {
    const coins = score * Math.max(0, Number(economySettings.coinPerQuizCorrect));
    setSubmitted(true);
    setRewardCoins(coins);
    if (coins > 0 && onQuizReward) setRewardClaimed(onQuizReward(file.id, file.name, score, coins));
  };

  return (
    <div className="h-full overflow-y-auto p-4 text-slate-900 md:p-8 custom-scrollbar">
      <div className="mx-auto w-full max-w-4xl rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl md:p-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-black uppercase tracking-[0.3em] text-cyan-700">Interactive Quiz</p>
            <h2 className="mt-2 text-3xl font-black text-slate-900">{file.name}</h2>
          </div>
          <div className="rounded-2xl border border-white/50 bg-white/70 px-5 py-3 text-lg font-black text-slate-900">Score: {score}/{questions.length}</div>
        </div>

        <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/70">
          <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }} />
        </div>

        {questions.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2 rounded-3xl border border-white/50 bg-white/70 p-3">
            {questions.map((_, index) => {
              const isActive = currentQuestion === index;
              const isAnswered = answers[index] !== undefined;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentQuestion(index)}
                  className={`rounded-2xl px-4 py-2 text-sm font-black transition ${isActive ? 'bg-cyan-200 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5' : isAnswered ? 'border border-emerald-300/40 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20' : 'border border-white/50 bg-white/70 text-slate-600 hover:bg-white/80 hover:shadow-sm'}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  Q{index + 1}
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-3xl border border-white/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-7">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-slate-600">Question {currentQuestion + 1} of {questions.length}</p>
          <h3 className="text-2xl font-black leading-tight text-slate-900">{question.prompt}</h3>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
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
              return <button key={`${option}-${oIndex}`} type="button" onClick={() => !answered && setAnswers(prev => ({ ...prev, [currentQuestion]: oIndex }))} className={`rounded-2xl border px-5 py-4 text-left font-bold transition ${stateClass}`}>{option}</button>;
            })}
          </div>
          {answered && <div className={`mt-6 rounded-2xl border p-4 font-black ${selected === question.correctAnswer ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-700' : 'border-rose-300/50 bg-rose-400/15 text-rose-100'}`}>{selected === question.correctAnswer ? 'Correct! Great work.' : `Incorrect. Correct answer: ${question.options[question.correctAnswer]}`}</div>}
        </div>

        {submitted && (
          <div className="mt-6 rounded-3xl border border-emerald-200/70 bg-emerald-50/80 p-5 shadow-sm backdrop-blur-xl">
            <p className="text-xl font-black text-emerald-800">Quiz submitted: {score}/{questions.length}</p>
            <p className="mt-2 text-sm font-bold text-emerald-700">{rewardClaimed ? `✦ +${rewardCoins} EduCoins credited to your wallet.` : rewardCoins > 0 ? 'Reward already claimed for this quiz.' : 'No coin reward this time — revise and try another quiz.'}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <button type="button" disabled={currentQuestion === 0} onClick={() => setCurrentQuestion(index => Math.max(0, index - 1))} className="rounded-2xl border border-white/50 bg-white/70 px-5 py-3 font-black text-slate-900 transition hover:bg-white/80 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
          <div className="flex gap-3">
            <button type="button" onClick={() => isLastQuestion ? setCurrentQuestion(0) : setCurrentQuestion(index => Math.min(questions.length - 1, index + 1))} className="rounded-2xl bg-cyan-200 px-6 py-3 font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50">{isLastQuestion ? 'Review Quiz' : 'Next Question'}</button>
            <button type="button" disabled={!allAnswered || submitted} onClick={submitQuiz} className="rounded-2xl bg-gradient-to-r from-indigo-500 to-amber-400 px-6 py-3 font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">Submit & Claim Coins</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CoursePlayer: React.FC<{ settings: WebsiteSettings; economySettings: EconomySettings; product: ProductWithRating; onBack: () => void; onWatchTimeMinutes?: (minutes: number, lessonTitle?: string) => void; onQuizReward?: (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => boolean; }> = ({ settings, economySettings, product, onBack, onWatchTimeMinutes, onQuizReward }) => {
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [mediaHasError, setMediaHasError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeWatchSeconds, setActiveWatchSeconds] = useState(0);
  const [sessionEarnedCoins, setSessionEarnedCoins] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isPlaybackWindowFocused, setIsPlaybackWindowFocused] = useState(() => typeof document === 'undefined' ? true : document.visibilityState === 'visible' && document.hasFocus());
  const [coinPulse, setCoinPulse] = useState(false);

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
  const accentGlow = settings.theme?.accentColor || '#a5f3fc';

  const onSelectFile = (file: ProductFile) => {
    setActiveFile(file);
    setIsSidebarOpen(false);
    setIsMentorOpen(false);
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
        const audioTracks: AudioTrack[] = [{
          id: activeFile.id,
          title: activeFile.name || 'Course audio',
          subtitle: product.title,
          url: activeFile.url,
          cover: backgroundImage,
        }];
        return (
          <div className="flex h-full w-full items-center justify-center bg-white/70 p-4 text-slate-900 sm:p-8">
            <ProductMusicPlayer
              tracks={audioTracks}
              title={activeFile.name || product.title}
              variant="full"
              className="w-full max-w-4xl"
              initialTrackId={activeFile.id}
              onError={() => setMediaHasError(true)}
            />
          </div>
        );
      }
      case 'pdf':
      case 'sheet': return <GlassDownloadCard file={activeFile} />;
      case 'doc':
      case 'ebook': return <SmartDocsWorkspace file={activeFile} productId={product.id} />;
      case 'link': return <ExternalResourceCard file={activeFile} />;
      case 'quiz': return <QuizPlayer file={activeFile} economySettings={economySettings} onQuizReward={onQuizReward} />;
      default: return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
      <div className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-2xl" style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(99,102,241,0.28),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.16),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.82),rgba(238,242,255,0.72),rgba(248,250,252,0.94))]" />
      <div className="absolute -bottom-20 left-8 h-96 w-24 rotate-12 rounded-full opacity-50 blur-2xl" style={{ backgroundColor: accentGlow }} />
      <div className="absolute -top-12 right-12 h-72 w-72 rounded-full bg-indigo-300/15 blur-3xl" />

      <header className="relative z-30 flex items-center gap-3 border-b border-white/50 bg-white/70 p-3 shadow-sm backdrop-blur-xl lg:hidden">
        <button onClick={() => setIsSidebarOpen(true)} className="shrink-0 rounded-lg border border-white/60 bg-white/40 p-2"><svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-black">{activeFile?.name || product.title}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2 overflow-x-auto">
          {liveEarningHud}
          <button onClick={() => setIsMentorOpen(value => !value)} className="rounded-xl border border-cyan-200/30 bg-cyan-200/15 px-3 py-2 text-sm font-black shadow-sm">🧠 AI</button>
        </div>
      </header>

      <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 z-30 bg-white/70 backdrop-blur-sm transition lg:hidden ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />

      <main className="relative z-10 flex h-full flex-col gap-3 p-3 lg:p-3">
        <div className="hidden shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-white/50 bg-white/70 px-4 py-3 text-[22px] font-black leading-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl lg:grid">
          <span className="truncate">{activeFile?.name || product.title}</span>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setIsMentorOpen(value => !value)} className="rounded-2xl border border-cyan-200/30 bg-cyan-200/15 px-6 py-3 text-base font-black text-cyan-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:bg-cyan-200/25">🧠 {isMentorOpen ? 'Lesson View' : 'AI Mentor'}</button>
            {liveEarningHud}
          </div>
          <span className="truncate text-right text-sm font-bold text-slate-900/60">Welcome to the Course</span>
        </div>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[28rem_minmax(0,1fr)]">
          <aside className={`fixed inset-y-0 left-0 z-40 w-80 transform bg-slate-900/[0.04] backdrop-blur-3xl border-r border-slate-200/50 shadow-[4px_0_30px_rgba(0,0,0,0.02)] transition lg:relative lg:inset-auto lg:w-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-2xl lg:border ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex h-full flex-col">
              <div className="shrink-0 border-b border-white/50 px-4 py-5">
                <button onClick={onBack} className="mb-4 flex items-center gap-2 text-[22px] font-medium text-slate-900 hover:opacity-70">← <span>Back</span></button>
                <h2 className="text-[25px] font-black leading-tight text-slate-900">{product.title}</h2>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">
                {(product.courseContent || []).length > 0 ? (product.courseContent || []).map(m => <ModuleItem key={m.id} module={m} activeFile={activeFile} onSelectFile={onSelectFile} />) : <p className="p-4 text-center font-semibold text-slate-900/60">No content added yet.</p>}
              </nav>
            </div>
          </aside>

          <div className="relative min-h-0 overflow-hidden bg-white/40 backdrop-blur-2xl border border-slate-200/60 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.05)]">
            {isMentorOpen ? <AiMentor productTitle={product.title} activeContentName={activeFile?.name || null} onClose={() => setIsMentorOpen(false)} /> : renderMedia()}
          </div>
        </section>
      </main>

    </div>
  );
};

export default CoursePlayer;
