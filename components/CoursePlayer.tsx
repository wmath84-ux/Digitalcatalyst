// components/CoursePlayer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile } from '../App';
import AiMentor from './AiMentor';

declare global {
    interface Window {
        jspdf: any;
    }
}

interface Note {
    id: string;
    timestamp: number | null;
    text: string;
    createdAt: string;
}

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

const VideoUnavailablePlaceholder: React.FC = () => (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full border-2 border-white/30 mb-4 bg-white/10">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h3 className="text-xl font-semibold">Video unavailable</h3>
        <p className="text-white/60 mt-1">This video is unavailable in this environment.</p>
    </div>
);

const ContentUnavailablePlaceholder: React.FC<{ file: ProductFile }> = ({ file }) => (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full border-2 border-white/30 mb-4 bg-white/10">
            <FileIcon className="h-8 w-8 text-white/70" />
        </div>
        <h3 className="text-xl font-semibold">Content Preview Unavailable</h3>
        <p className="text-white/60 mt-1">This '{file.type}' file cannot be previewed.</p>
         <a href={file.url} download={file.name} className="mt-6 bg-white/90 text-slate-950 font-semibold px-6 py-2 rounded-xl hover:bg-white transition-colors">Download File</a>
    </div>
);

const ModuleItem: React.FC<{ module: CourseModule; activeFile: ProductFile | null; onSelectFile: (file: ProductFile) => void; level?: number; }> = ({ module, activeFile, onSelectFile, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className={`${level > 0 ? "ml-4 border-l border-black/15 pl-3" : ""}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-4 text-left text-black transition hover:bg-white/30"
        aria-expanded={isExpanded}
      >
        <ModuleIcon className="h-5 w-5 shrink-0" />
        <span className="text-[15px] font-black leading-tight">{module.title}</span>
      </button>
      {isExpanded && (
        <div className="space-y-1 pb-2">
          {module.files.map((file) => (
            <button
              key={file.id}
              onClick={() => onSelectFile(file)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${activeFile?.id === file.id ? "border border-white/70 bg-white/45 font-black text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(255,255,255,0.15)]" : "font-medium text-black/90 hover:bg-white/25"}`}
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <FileIcon className="h-5 w-5 shrink-0" />
            </button>
          ))}
          {module.modules.map((subModule) => (
            <ModuleItem key={subModule.id} module={subModule} activeFile={activeFile} onSelectFile={onSelectFile} level={level + 1} />
          ))}
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
    if (matchIframe && matchIframe[1]) return matchIframe[1];
    return null;
};

const getCourseBackground = (product: ProductWithRating, activeFile: ProductFile | null) => {
  if (activeFile?.type === 'youtube') {
    const videoId = extractYouTubeID(activeFile.url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed || product.id}/1600/900`;
};

const CoursePlayer: React.FC<{ settings: WebsiteSettings; product: ProductWithRating; onBack: () => void; }> = ({ settings, product, onBack }) => {
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [mediaHasError, setMediaHasError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [activeActionTab, setActiveActionTab] = useState<'mentor' | 'notes' | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

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

  useEffect(() => {
    if (activeFile?.id) {
      const savedNotes = localStorage.getItem(`video-notes-${activeFile.id}`);
      setNotes(savedNotes ? JSON.parse(savedNotes) : []);
    } else {
      setNotes([]);
    }
  }, [activeFile]);

  useEffect(() => {
    if (activeFile?.id) {
      localStorage.setItem(`video-notes-${activeFile.id}`, JSON.stringify(notes));
    }
  }, [notes, activeFile?.id]);

  useEffect(() => {
      setMediaHasError(false);
  }, [activeFile]);

  const backgroundImage = useMemo(() => getCourseBackground(product, activeFile), [product, activeFile]);
  const accentGlow = settings.theme?.accentColor || '#a5f3fc';

  const onSelectFile = (file: ProductFile) => {
    setActiveFile(file);
    setIsSidebarOpen(false);
    setActiveActionTab(null);
  };

  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '';
    const date = new Date(0);
    date.setSeconds(seconds);
    const timeString = date.toISOString().substr(11, 8);
    return timeString.startsWith('00:') ? timeString.substr(3) : timeString;
  };

  const handleAddTimestampedNote = () => {
    const currentTime = videoRef.current?.currentTime ?? null;
    const newNote: Note = { id: `note-${Date.now()}`, timestamp: currentTime, text: '', createdAt: new Date().toISOString() };
    setNotes(prev => [newNote, ...prev]);
    setActiveActionTab('notes');
  };

  const handleDeleteNote = (id: string) => setNotes(prev => prev.filter(note => note.id !== id));
  const handleUpdateNoteText = (id: string, text: string) => setNotes(prev => prev.map(note => note.id === id ? { ...note, text } : note));
  const handleSeekToTime = (time: number) => { if (videoRef.current) videoRef.current.currentTime = time; };

  const handleDownloadNotes = () => {
    if (notes.length === 0) return;
    if (!window.jspdf) {
        alert('PDF generation library is not loaded. Please try again.');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const page_width = doc.internal.pageSize.getWidth();
    const margin = 15;
    const max_width = page_width - margin * 2;
    let y = 20;

    const checkPageEnd = (currentY: number) => {
        if (currentY > 280) {
            doc.addPage();
            return 20;
        }
        return currentY;
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(product.title, page_width / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100);
    doc.text(`Notes for: ${activeFile?.name || 'Content'}`, page_width / 2, y, { align: 'center' });
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(0);

    const sortedNotes = [...notes].sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity));
    sortedNotes.forEach((note, index) => {
        y = checkPageEnd(y);
        const noteHeader = note.timestamp !== null ? `Note at ${formatTime(note.timestamp)}` : `Note (created ${new Date(note.createdAt).toLocaleDateString()})`;
        doc.setFont("helvetica", "bold");
        doc.text(noteHeader, margin, y);
        y += 6;
        y = checkPageEnd(y);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(note.text || '(Empty note)', max_width);
        doc.text(lines, margin, y);
        y += (lines.length * 5) + 10;
        if(index < sortedNotes.length - 1) {
            y = checkPageEnd(y);
            doc.setDrawColor(200);
            doc.line(margin, y - 5, page_width - margin, y - 5);
        }
    });

    const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeFilename(product.title)}_${safeFilename(activeFile?.name || 'Notes')}.pdf`);
  };

  const renderMedia = () => {
    if (!activeFile) return <div className="flex h-full items-center justify-center bg-black text-white/70">Select content to begin.</div>;
    if (mediaHasError) return <ContentUnavailablePlaceholder file={activeFile} />;
    switch (activeFile.type) {
      case 'youtube': {
        const videoId = extractYouTubeID(activeFile.url);
        return videoId ? (
          <iframe
            key={activeFile.id}
            className="h-full w-full bg-black"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={activeFile.name}
            frameBorder="0"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onError={() => setMediaHasError(true)}
          />
        ) : <VideoUnavailablePlaceholder />;
      }
      case 'video': return <video ref={videoRef} key={activeFile.id} src={activeFile.url} controls className="h-full w-full bg-black object-contain" onError={() => setMediaHasError(true)} />;
      case 'audio': return <div className="flex h-full w-full flex-col items-center justify-center bg-black p-8 text-white"><svg xmlns="http://www.w3.org/2000/svg" className="mb-4 h-24 w-24 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" /></svg><h3 className="mb-6 max-w-full truncate text-xl font-semibold">{activeFile.name}</h3><audio key={activeFile.id} src={activeFile.url} controls className="w-full max-w-md" onError={() => setMediaHasError(true)} /></div>;
      case 'pdf': return <iframe src={activeFile.url} title={activeFile.name} className="h-full w-full border-0 bg-white" />;
      default: return <ContentUnavailablePlaceholder file={activeFile} />;
    }
  };

  const renderActionDrawer = () => {
    if (!activeActionTab) return null;
    return (
      <div className="absolute bottom-[88px] left-3 right-3 z-20 overflow-hidden rounded-2xl border border-white/60 bg-white/55 shadow-2xl backdrop-blur-2xl lg:left-[calc(23rem+1.5rem)]">
        <div className="flex items-center justify-between border-b border-white/50 px-4 py-3 text-black">
          <h3 className="font-black">{activeActionTab === 'mentor' ? '🧠 AI Mentor' : '📝 Notes'}</h3>
          <button onClick={() => setActiveActionTab(null)} className="rounded-full bg-white/50 px-3 py-1 font-black hover:bg-white">×</button>
        </div>
        <div className="h-72 overflow-hidden text-slate-900">
          {activeActionTab === 'mentor' ? (
            <AiMentor productTitle={product.title} activeContentName={activeFile?.name || null} />
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 gap-2 border-b border-white/50 p-3">
                <button onClick={handleAddTimestampedNote} className="flex-1 rounded-xl bg-black/80 py-2 text-sm font-bold text-white hover:bg-black">+ Add Note at Current Time</button>
                <button onClick={handleDownloadNotes} disabled={notes.length === 0} className="rounded-xl bg-white/70 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">PDF</button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {notes.length === 0 && <p className="p-8 text-center font-semibold text-black/60">No notes yet for this content.</p>}
                {notes.map(note => (
                  <div key={note.id} className="rounded-xl border border-white/60 bg-white/45 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-black/60">
                      {note.timestamp !== null ? <button onClick={() => handleSeekToTime(note.timestamp!)} className="rounded-lg bg-white/70 px-2 py-1 font-mono font-bold hover:bg-white">{formatTime(note.timestamp)}</button> : <span />}
                      <button onClick={() => handleDeleteNote(note.id)} className="p-1 text-lg font-black leading-none text-red-600">×</button>
                    </div>
                    <textarea value={note.text} onChange={(e) => handleUpdateNoteText(note.id, e.target.value)} placeholder="Type your note..." className="w-full resize-none rounded-lg bg-white/40 p-2 text-sm text-black outline-none focus:bg-white/70" rows={3} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-300 text-black">
      <div className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl" style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(255,255,255,0.78),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(207,250,254,0.9),transparent_18%),linear-gradient(135deg,rgba(148,163,184,0.7),rgba(226,232,240,0.55),rgba(100,116,139,0.65))]" />
      <div className="absolute -bottom-20 left-8 h-96 w-24 rotate-12 rounded-full opacity-50 blur-2xl" style={{ backgroundColor: accentGlow }} />
      <div className="absolute -top-12 right-12 h-72 w-72 rounded-full bg-white/45 blur-3xl" />

      <header className="lg:hidden relative z-30 flex items-center gap-3 border-b border-white/50 bg-white/45 p-3 shadow-sm backdrop-blur-xl">
        <button onClick={() => setIsSidebarOpen(true)} className="rounded-lg border border-white/60 bg-white/40 p-2"><svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        <h1 className="truncate text-lg font-black">{activeFile?.name || product.title}</h1>
      </header>

      <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 z-30 bg-black/45 backdrop-blur-sm transition lg:hidden ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />

      <main className="relative z-10 flex h-full flex-col gap-3 p-3 lg:p-3">
        <div className="hidden shrink-0 rounded-xl border border-white/55 bg-white/35 px-4 py-3 text-[22px] font-black leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:block">
          {activeFile?.name || product.title}
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

        <div className="relative shrink-0 rounded-[2rem] border border-white/55 bg-white/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_14px_36px_rgba(15,23,42,0.16)] backdrop-blur-2xl">
          {renderActionDrawer()}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button onClick={() => setActiveActionTab(activeActionTab === 'mentor' ? null : 'mentor')} className="rounded-2xl border border-white/70 bg-white/25 py-3 text-center font-black text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition hover:bg-white/45">🧠 AI Mentor</button>
            <button onClick={() => setActiveActionTab(activeActionTab === 'notes' ? null : 'notes')} className="rounded-2xl border border-white/70 bg-white/25 py-3 text-center font-black text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition hover:bg-white/45">📝 Notes</button>
          </div>
          <div className="pointer-events-none absolute -right-1 -top-5 hidden text-7xl text-white/65 drop-shadow-lg lg:block">✦</div>
        </div>
      </main>
    </div>
  );
};

export default CoursePlayer;
