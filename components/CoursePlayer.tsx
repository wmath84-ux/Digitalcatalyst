// components/CoursePlayer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile, QuizAnswerState } from '../App';
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

const htmlFromPlainText = (value: string) => value.trim().startsWith('<') ? value : `<p>${value.replace(/\n/g, '<br />')}</p>`;

const SmartDocsWorkspace: React.FC<{ file: ProductFile; productId: number; }> = ({ file, productId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const storageKey = `smart-docs-workspace-${productId}-${file.id}`;
  const defaultContent = htmlFromPlainText(file.content || '<h1>Smart Docs Workspace</h1><p>Start writing here.</p>');
  const [savedAt, setSavedAt] = useState('Saved locally');

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (editorRef.current) editorRef.current.innerHTML = saved || defaultContent;
    setSavedAt(saved ? 'Restored from local autosave' : 'Loaded admin version');
  }, [storageKey, defaultContent]);

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    persist();
  };

  const persist = () => {
    localStorage.setItem(storageKey, editorRef.current?.innerHTML || '');
    setSavedAt(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100/60 text-slate-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/55 bg-white/45 p-3 shadow-sm backdrop-blur-xl">
        <span className="mr-2 rounded-full border border-white/70 bg-white/60 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600">Smart Docs Workspace</span>
        {[
          ['bold', 'B'], ['italic', 'I'], ['underline', 'U'],
        ].map(([cmd, label]) => <button key={cmd} type="button" onClick={() => runCommand(cmd)} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black shadow-sm hover:bg-white">{label}</button>)}
        <button type="button" onClick={() => runCommand('formatBlock', '<h1>')} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black hover:bg-white">H1</button>
        <button type="button" onClick={() => runCommand('formatBlock', '<h2>')} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black hover:bg-white">H2</button>
        <button type="button" onClick={() => runCommand('insertUnorderedList')} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black hover:bg-white">• List</button>
        <button type="button" onClick={() => runCommand('justifyLeft')} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black hover:bg-white">Left</button>
        <button type="button" onClick={() => runCommand('justifyCenter')} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black hover:bg-white">Center</button>
        <button type="button" onClick={() => runCommand('justifyRight')} className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 font-black hover:bg-white">Right</button>
        <span className="ml-auto text-xs font-bold text-slate-500">{savedAt}</span>
        <button type="button" onClick={() => window.print()} className="rounded-2xl bg-slate-950 px-4 py-2 font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800">Print / Save as PDF</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 md:p-10">
        <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={persist} className="smart-docs-page mx-auto min-h-full max-w-4xl rounded-sm bg-white px-8 py-10 text-lg leading-8 shadow-[0_25px_80px_rgba(15,23,42,0.18)] outline-none md:px-14" />
      </div>
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
  const [answers, setAnswers] = useState<QuizAnswerState>({});
  const score = questions.reduce((total, q, index) => total + (answers[index] === q.correctAnswer ? 1 : 0), 0);
  if (!questions.length) return <GlassDownloadCard file={file} headline="Quiz unavailable" />;
  return (
    <div className="h-full overflow-y-auto p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/25 bg-white/10 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="font-black uppercase tracking-[0.3em] text-cyan-100">Interactive Quiz</p><h2 className="mt-2 text-3xl font-black">{file.name}</h2></div>
          <div className="rounded-2xl border border-white/25 bg-white/15 px-5 py-3 text-lg font-black">Score: {score}/{questions.length}</div>
        </div>
        <div className="space-y-5">
          {questions.map((question, qIndex) => {
            const selected = answers[qIndex];
            const answered = selected !== undefined;
            return (
              <div key={`${question.prompt}-${qIndex}`} className="rounded-3xl border border-white/20 bg-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <h3 className="text-xl font-black">{qIndex + 1}. {question.prompt}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {question.options.map((option, oIndex) => {
                    const isCorrect = oIndex === question.correctAnswer;
                    const isSelected = selected === oIndex;
                    const stateClass = !answered ? 'border-white/25 bg-white/10 hover:bg-white/20' : isCorrect ? 'border-emerald-300 bg-emerald-400/25' : isSelected ? 'border-rose-300 bg-rose-400/25' : 'border-white/15 bg-white/5 opacity-70';
                    return <button key={`${option}-${oIndex}`} type="button" onClick={() => setAnswers(prev => ({ ...prev, [qIndex]: oIndex }))} className={`rounded-2xl border px-4 py-3 text-left font-bold transition ${stateClass}`}>{option}</button>;
                  })}
                </div>
                {answered && <p className={`mt-4 font-black ${selected === question.correctAnswer ? 'text-emerald-200' : 'text-rose-200'}`}>{selected === question.correctAnswer ? 'Correct! Great work.' : `Incorrect. Correct answer: ${question.options[question.correctAnswer]}`}</p>}
              </div>
            );
          })}
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
