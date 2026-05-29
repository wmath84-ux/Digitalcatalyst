import React, { useEffect, useState, useRef } from 'react';
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile } from '../App';
import AiMentor from './AiMentor';
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../utils/gemini';

declare global { interface Window { jspdf: any; } }
interface Note { id: string; timestamp: number | null; text: string; createdAt: string; }
interface ChatMessage { id: string; sender: 'user' | 'ai'; text: string; createdAt: string; }

const ModuleItem: React.FC<{ module: CourseModule; activeFile: ProductFile | null; onSelectFile: (file: ProductFile) => void; level?: number; }> = ({ module, activeFile, onSelectFile, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  return <div className={`mt-2 ${level > 0 ? 'pl-3 border-l-2 border-gray-200' : ''}`}>
    <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-left flex items-center justify-between p-2 rounded hover:bg-gray-100"><span className="font-bold text-gray-800">{module.title}</span></button>
    {isExpanded && <div className="pl-2 mt-1">{module.files.map(file => <button key={file.id} onClick={() => onSelectFile(file)} className={`flex w-full text-left p-2 my-1 rounded text-sm ${activeFile?.id === file.id ? 'bg-blue-100 text-primary font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}>{file.name}</button>)}{module.modules.map(sub => <ModuleItem key={sub.id} module={sub} activeFile={activeFile} onSelectFile={onSelectFile} level={level + 1} />)}</div>}
  </div>;
};

const extractYouTubeID = (url: string): string | null => {
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
};

export default function CoursePlayer({ settings, product, onBack }: { settings: WebsiteSettings; product: ProductWithRating; onBack: () => void; }) {
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeActionTab, setActiveActionTab] = useState<'mentor' | 'notes'>('mentor');
  const [notes, setNotes] = useState<Note[]>([]);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'mentor' | 'notes'>('none');


  // Find first piece of content on product load
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

  // Load notes from localStorage when active file changes
  useEffect(() => {
    if (activeFile?.id) {
      const savedNotes = localStorage.getItem(`video-notes-${activeFile.id}`);
      setNotes(savedNotes ? JSON.parse(savedNotes) : []);
    } else {
      setNotes([]);
    }
  }, [activeFile]);

  // Save notes to localStorage when they change
  useEffect(() => {
    if (activeFile?.id) {
      localStorage.setItem(`video-notes-${activeFile.id}`, JSON.stringify(notes));
    }
  }, [notes, activeFile?.id]);

  useEffect(() => {
      setMediaError(false);
  }, [activeFile]);

  // Handle resizing the panel
  useEffect(() => {
    const mainEl = mainContentRef.current;
    const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging || !mainEl) return;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const mainRect = mainEl.getBoundingClientRect();
        if (mainRect.height === 0) return;
        const newHeight = ((clientY - mainRect.top) / mainRect.height) * 100;
        setMediaPanelHeight(Math.max(20, Math.min(newHeight, 80)));
    };
    const handleDragEnd = () => setIsDragging(false);
    if (isDragging) {
        window.addEventListener('mousemove', handleMove); window.addEventListener('touchmove', handleMove);
        window.addEventListener('mouseup', handleDragEnd); window.addEventListener('touchend', handleDragEnd);
        document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
    }
    return () => {
        window.removeEventListener('mousemove', handleMove); window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('mouseup', handleDragEnd); window.removeEventListener('touchend', handleDragEnd);
        document.body.style.userSelect = ''; document.body.style.cursor = '';
    };
  }, [isDragging]);

  const onSelectFile = (file: ProductFile) => { setActiveFile(file); setIsSidebarOpen(false); };
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); setIsDragging(true); };

  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '';
    const date = new Date(0);
    date.setSeconds(seconds);
    const timeString = date.toISOString().substr(11, 8);
    return timeString.startsWith('00:') ? timeString.substr(3) : timeString;
  };

  const handleAddTimestampedNote = () => {
    if (videoRef.current) {
        const currentTime = videoRef.current.currentTime;
        const newNote: Note = { id: `note-${Date.now()}`, timestamp: currentTime, text: '', createdAt: new Date().toISOString() };
        setNotes(prev => [newNote, ...prev]);
        setActiveActionTab('notes');
    }
  };

  const renderMedia = () => {
    if (!activeFile) return <div className="h-full flex items-center justify-center text-gray-400">Select content</div>;
    if (activeFile.type === 'youtube') { const id = extractYouTubeID(activeFile.url); return id ? <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`} title={activeFile.name} allowFullScreen /> : <div className="h-full flex items-center justify-center text-white">Invalid YouTube link</div>; }
    if (activeFile.type === 'video') return <video ref={videoRef} src={activeFile.url} controls className="w-full h-full object-contain bg-black" />;
    if (activeFile.type === 'doc') return <div className="h-full w-full bg-white p-4 md:p-8 overflow-y-auto"><div className="mx-auto max-w-4xl rounded-2xl border bg-white shadow p-4"><div className="mb-3 text-xs uppercase tracking-wider text-slate-500">Google Docs style editor</div><div contentEditable suppressContentEditableWarning onInput={e=>activeFile && localStorage.setItem(`doc-edit-${activeFile.id}`, (e.target as HTMLDivElement).innerHTML)} className="min-h-[60vh] rounded-xl border p-4 outline-none" dangerouslySetInnerHTML={{__html: localStorage.getItem(`doc-edit-${activeFile.id}`) || activeFile.content || '<h1>Rich Notes</h1><p>Start editing...</p>'}} /></div></div>;
    if (activeFile.type === 'pdf') return <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6"><div className="max-w-xl rounded-3xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-2xl"><h3 className="text-2xl font-black">PDF Learning File</h3><p className="mt-2 text-slate-200">Download your PDF using these 2 steps:</p><ol className="mt-3 list-decimal pl-6 space-y-2 text-slate-100"><li>Click the download/open link below.</li><li>Use Chrome menu (top-right) → Print / Save as PDF.</li></ol><a href={activeFile.url} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Open / Download PDF</a></div></div>;
    return <div className="h-full flex items-center justify-center text-white">Preview unavailable</div>;
  };

  const renderActionPanel = () => (
    <div className="flex flex-col h-full bg-[#0f172a] text-white overflow-hidden rounded-t-lg shadow-inner">
      <div className="p-2 border-b border-gray-700 flex-shrink-0 bg-[#1e293b]">
        <div className="flex items-center justify-between gap-2 mb-2 px-2 text-xs text-blue-100">
          <span className="font-bold uppercase tracking-wider">Study cockpit</span>
          <span>AI + timestamp notes + PDF export</span>
        </div>
        <div className="flex items-center bg-slate-900/70 rounded-lg p-1">
          <button onClick={() => setActiveActionTab('mentor')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-1/2 ${activeActionTab === 'mentor' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>AI Mentor</button>
          <button onClick={() => setActiveActionTab('notes')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-1/2 ${activeActionTab === 'notes' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Notes</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className={`w-full h-full absolute top-0 left-0 transition-opacity duration-300 ${activeActionTab === 'mentor' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <AiMentor productTitle={product.title} activeContentName={activeFile?.name || null} />
        </div>
        <div className={`w-full h-full absolute top-0 left-0 flex flex-col transition-opacity duration-300 ${activeActionTab === 'notes' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="p-3 border-b border-gray-700 flex-shrink-0 flex items-center gap-2">
            <button
              onClick={handleAddTimestampedNote}
              disabled={activeFile?.type !== 'video'}
              className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >+ Add Note at Current Time</button>
            <button
                onClick={handleDownloadNotes}
                disabled={notes.length === 0}
                className="flex-shrink-0 bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center gap-2"
                title="Download Notes as PDF"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                PDF
            </button>
          </div>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {notes.length === 0 && <p className="text-center text-gray-400 p-8">No notes yet for this content.</p>}
            {notes.map(note => (
              <div key={note.id} className="bg-slate-700 p-3 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                  {note.timestamp !== null ? (
                    <button onClick={() => handleSeekToTime(note.timestamp!)} className="font-mono bg-slate-800 px-2 py-1 rounded hover:bg-slate-900">
                      {formatTime(note.timestamp)}
                    </button>
                  ) : <span />}
                  <button onClick={() => handleDeleteNote(note.id)} className="text-red-400 hover:text-red-300 font-bold text-lg leading-none p-1">&times;</button>
                </div>
                <textarea
                  value={note.text}
                  onChange={(e) => handleUpdateNoteText(note.id, e.target.value)}
                  placeholder="Type your note..."
                  className="w-full bg-transparent text-sm text-gray-200 resize-none focus:outline-none"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-gray-800 flex flex-col lg:flex-row">
      <header className="lg:hidden bg-black p-4 flex items-center space-x-4 text-white"><button onClick={() => setIsSidebarOpen(true)} className="p-1"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"></path></svg></button><h1 className="font-semibold text-lg truncate">{activeFile?.name || product.title}</h1></header>
      <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 bg-black/60 z-30 lg:hidden transition ${isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} />
      <aside className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r transform transition lg:relative lg:translate-x-0 lg:flex-shrink-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
            <div className="p-4 border-b flex-shrink-0 bg-gradient-to-br from-slate-950 to-blue-950 text-white"><button onClick={onBack} className="text-blue-200 hover:text-white font-semibold mb-2">← Back</button><h2 className="text-xl font-black">{product.title}</h2><p className="text-xs text-blue-100 mt-2">Private video classroom with nested modules, AI chat, and learner notes.</p></div>
            <nav className="p-2 overflow-y-auto flex-grow">{product.courseContent?.map(m => <ModuleItem key={m.id} module={m} activeFile={activeFile} onSelectFile={onSelectFile} />) || <p className="p-4 text-center text-gray-500">No content added yet.</p>}</nav>
        </div>
      </aside>
      <div className="flex-1 grid min-w-0 lg:grid-cols-[1fr_420px]">
          <main ref={mainContentRef} className="bg-black relative flex flex-col overflow-hidden">
              <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none hidden md:flex items-center justify-between text-white">
                <div className="bg-black/45 backdrop-blur rounded-2xl px-4 py-2 border border-white/10">
                  <p className="text-xs uppercase tracking-widest text-blue-200">Now learning</p>
                  <p className="font-bold truncate max-w-[42rem]">{activeFile?.name || product.title}</p>
                </div>
                <div className="bg-emerald-500/20 backdrop-blur rounded-2xl px-4 py-2 border border-emerald-300/20 text-sm font-bold">Progress auto-saved locally</div>
              </div>
              <div className="w-full flex-1 bg-black overflow-hidden"><div key={activeFile?.id} className="w-full h-full animate-fade-in">{renderMedia()}</div></div>
              <div className="lg:hidden flex-1 min-h-[320px] flex flex-col rounded-t-lg overflow-hidden">{renderActionPanel()}</div>
          </main>
          <aside className="hidden lg:flex min-h-0 border-l border-white/10 bg-white/10 p-3 backdrop-blur-2xl">
            <div className="h-full w-full rounded-[1.5rem] border border-white/15 bg-slate-950/80 p-2 shadow-2xl">{renderActionPanel()}</div>
          </aside>
      </div>
    </div>
  );
}


export default CoursePlayer;
