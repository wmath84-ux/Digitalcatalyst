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

    {isNotesFullscreen && (
      <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xl p-3 md:p-6">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-3xl border border-white/30 bg-white/90 shadow-2xl">
          <div className="flex items-center justify-between border-b p-4"><h3 className="text-lg font-black text-slate-800">Full Notes Editor</h3><button onClick={() => setIsNotesFullscreen(false)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Done</button></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {notes.map(note => <div key={`full-${note.id}`} className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{note.timestamp !== null ? `${Math.floor(note.timestamp/60)}:${String(note.timestamp%60).padStart(2,'0')}` : 'General note'}</span><button onClick={() => deleteNote(note.id)} className="font-bold text-red-500">Delete</button></div><div contentEditable suppressContentEditableWarning onInput={e => updateNote(note.id, (e.target as HTMLDivElement).innerHTML)} className="min-h-[220px] rounded-lg border border-slate-200 p-4 text-base leading-7" dangerouslySetInnerHTML={{ __html: note.text || '' }} /></div>)}
          </div>
        </div>
      </div>
    )}
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
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isNotesFullscreen, setIsNotesFullscreen] = useState(false);
  const [mobileDockPanel, setMobileDockPanel] = useState<'none'|'mentor'|'notes'>('none');
  const [mobileChatInput, setMobileChatInput] = useState('');
  const [mobileChatLoading, setMobileChatLoading] = useState(false);
  const [mobileChat, setMobileChat] = useState<ChatMessage[]>([]);

  useEffect(() => { const findFirst = (mods?: CourseModule[]): ProductFile | null => { if (!mods) return null; for (const m of mods) { if (m.files.length) return m.files[0]; const f = findFirst(m.modules); if (f) return f; } return null; }; setActiveFile(findFirst(product.courseContent)); }, [product]);
  useEffect(() => { if (!activeFile?.id) return; const saved = localStorage.getItem(`video-notes-${activeFile.id}`); setNotes(saved ? JSON.parse(saved) : []); }, [activeFile?.id]);
  useEffect(() => { if (activeFile?.id) localStorage.setItem(`video-notes-${activeFile.id}`, JSON.stringify(notes)); }, [notes, activeFile?.id]);
  useEffect(() => { if (!activeFile?.id) return; const saved = localStorage.getItem(`video-chat-${activeFile.id}`); setMobileChat(saved ? JSON.parse(saved) : [{ id: `welcome-${activeFile.id}`, sender: 'ai', text: `Hi! I'm your AI mentor for ${product.title}. Ask your doubts from ${activeFile.name}.`, createdAt: new Date().toISOString() }]); }, [activeFile?.id, product.title]);
  useEffect(() => { if (activeFile?.id) localStorage.setItem(`video-chat-${activeFile.id}`, JSON.stringify(mobileChat)); }, [mobileChat, activeFile?.id]);

  const onSelectFile = (f: ProductFile) => { setActiveFile(f); setIsSidebarOpen(false); };
  const addNote = () => {
    const id = `n-${Date.now()}`;
    setMobileDockPanel('notes');
    setIsNotesFullscreen(true);
    setActiveNoteId(id);
    setNotes(prev => [{ id, timestamp: videoRef.current ? Math.floor(videoRef.current.currentTime) : null, text: '', createdAt: new Date().toISOString() }, ...prev]);
  };
  const updateNote = (id: string, text: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));

  const renderStructuredText = (text: string) => {
    const blocks = text.split(/\n\n+/).filter(Boolean);
    return blocks.map((b, i) => {
      const lines = b.split('\n');
      if (lines.every(l => /^[-*•]/.test(l.trim()))) return <ul key={i} className="list-disc pl-5 space-y-1">{lines.map((l,j)=><li key={j}>{l.replace(/^[-*•]\s*/, '')}</li>)}</ul>;
      if (/^#{1,3}\s/.test(lines[0])) return <h4 key={i} className="font-black text-slate-800">{lines[0].replace(/^#{1,3}\s*/, '')}</h4>;
      return <p key={i} className="leading-7">{b}</p>;
    });
  };

  const applyDocFormat = (cmd: string) => {
    document.execCommand(cmd, false);
  };

  const sendMobileChat = async () => {
    if (!mobileChatInput.trim() || mobileChatLoading) return;
    const text = mobileChatInput.trim();
    setMobileChatInput('');
    setMobileChat(prev => [...prev, { id: `${Date.now()}-u`, sender: 'user', text, createdAt: new Date().toISOString() }]);
    setMobileChatLoading(true);
    try {
      const key = getGeminiApiKey();
      if (!key) { setMobileChat(prev => [...prev, { id: `${Date.now()}-a`, sender: 'ai', text: `Demo AI: revise ${activeFile?.name || 'this lesson'} and write 3 key points.`, createdAt: new Date().toISOString() }]); return; }
      const ai = new GoogleGenAI({ apiKey: key });
      const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: `Mentor for ${product.title}. lesson ${activeFile?.name || ''}. User: ${text}` });
      setMobileChat(prev => [...prev, { id: `${Date.now()}-a`, sender: 'ai', text: r.text, createdAt: new Date().toISOString() }]);
    } catch { setMobileChat(prev => [...prev, { id: `${Date.now()}-a`, sender: 'ai', text: 'Please try again.', createdAt: new Date().toISOString() }]); } finally { setMobileChatLoading(false); }
  };

  const renderMedia = () => {
    if (!activeFile) return <div className="h-full flex items-center justify-center text-gray-400">Select content</div>;
    if (activeFile.type === 'youtube') { const id = extractYouTubeID(activeFile.url); return id ? <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`} title={activeFile.name} allowFullScreen /> : <div className="h-full flex items-center justify-center text-white">Invalid YouTube link</div>; }
    if (activeFile.type === 'video') return <video ref={videoRef} src={activeFile.url} controls className="w-full h-full object-contain bg-black" />;
    if (activeFile.type === 'doc') return <div className="h-full w-full bg-[#f1f3f4] overflow-hidden"><div className="h-full grid grid-cols-1 lg:grid-cols-[300px_1fr]"><aside className="hidden lg:block border-r border-slate-300 bg-white/80 p-4"><h3 className="font-black text-slate-700">Document tabs</h3><div className="mt-4 space-y-2 text-sm"><div className="rounded-lg bg-blue-50 p-2 font-semibold">{activeFile.name}</div><div className="rounded-lg p-2 text-slate-500">Rich notes</div></div></aside><div className="min-w-0 p-3 md:p-5"><div className="rounded-2xl border border-slate-300 bg-white shadow"><div className="border-b bg-slate-50 p-2"><div className="flex flex-wrap items-center gap-2"><button onClick={() => applyDocFormat('undo')} className="rounded border px-2 py-1 text-xs">↺</button><button onClick={() => applyDocFormat('redo')} className="rounded border px-2 py-1 text-xs">↻</button><button onClick={() => applyDocFormat('bold')} className="rounded border px-2 py-1 text-xs font-bold">B</button><button onClick={() => applyDocFormat('italic')} className="rounded border px-2 py-1 text-xs italic">I</button><button onClick={() => applyDocFormat('underline')} className="rounded border px-2 py-1 text-xs underline">U</button><button onClick={() => applyDocFormat('insertUnorderedList')} className="rounded border px-2 py-1 text-xs">• List</button><button onClick={() => applyDocFormat('insertOrderedList')} className="rounded border px-2 py-1 text-xs">1. List</button><button onClick={() => applyDocFormat('justifyLeft')} className="rounded border px-2 py-1 text-xs">Left</button><button onClick={() => applyDocFormat('justifyCenter')} className="rounded border px-2 py-1 text-xs">Center</button></div></div><div className="bg-[#e9edf1] p-4 md:p-8"><div contentEditable suppressContentEditableWarning onInput={e=>activeFile && localStorage.setItem(`doc-edit-${activeFile.id}`, (e.target as HTMLDivElement).innerHTML)} className="mx-auto min-h-[70vh] max-w-4xl rounded-sm border bg-white p-8 outline-none text-[18px] leading-8 shadow" dangerouslySetInnerHTML={{__html: localStorage.getItem(`doc-edit-${activeFile.id}`) || activeFile.content || '<h1>Rich Notes</h1><p>Start writing...</p>'}} /></div></div></div></div></div>;
    if (activeFile.type === 'pdf') return <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6"><div className="max-w-xl rounded-3xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-2xl"><h3 className="text-2xl font-black">PDF Learning File</h3><p className="mt-2 text-slate-200">Download your PDF using these 2 steps:</p><ol className="mt-3 list-decimal pl-6 space-y-2 text-slate-100"><li>Click the download/open link below.</li><li>Use Chrome menu (top-right) → Print / Save as PDF.</li></ol><a href={activeFile.url} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Open / Download PDF</a></div></div>;
    return <div className="h-full flex items-center justify-center text-white">Preview unavailable</div>;
  };

  return <div className="h-screen w-screen bg-gray-900 flex flex-col">
    <header className="bg-black p-4 flex items-center gap-4 text-white"><button onClick={() => setIsSidebarOpen(true)} className="lg:hidden">☰</button><h1 className="font-semibold truncate">{activeFile?.name || product.title}</h1></header>
    <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 bg-black/60 z-30  ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
    <div className="flex-1 min-h-0 flex">
    <aside className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r transform transition lg:static lg:inset-auto lg:z-auto lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="p-4 border-b bg-slate-900 text-white"><button onClick={onBack}>← Back</button><h2 className="font-black mt-2">{product.title}</h2></div><nav className="p-2 overflow-y-auto h-[calc(100%-80px)]">{product.courseContent?.map(m => <ModuleItem key={m.id} module={m} activeFile={activeFile} onSelectFile={onSelectFile} />)}</nav></aside>
    <div className="flex-1 min-w-0 min-h-0"><main className="bg-black relative overflow-hidden h-full">{renderMedia()}</main></div>
    </div>

    <div className="fixed inset-x-3 bottom-3 z-[55]  rounded-2xl border border-white/20 bg-white/20 p-2 backdrop-blur-2xl"><div className="grid grid-cols-2 gap-2"><button onClick={() => setMobileDockPanel(mobileDockPanel === 'mentor' ? 'none' : 'mentor')} className="rounded-xl bg-white/70 py-2 text-sm font-black">🤖 AI Mentor</button><button onClick={() => setMobileDockPanel(mobileDockPanel === 'notes' ? 'none' : 'notes')} className="rounded-xl bg-white/70 py-2 text-sm font-black">📝 Notes</button></div></div>
    <div className={`fixed inset-0 z-[54]  bg-slate-950/35 backdrop-blur-md transition ${mobileDockPanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'}`} />
    <section className={`fixed inset-x-3 bottom-20 z-[56]  rounded-3xl border border-white/30 bg-white/75 backdrop-blur-2xl transition-all duration-300 ${mobileDockPanel === 'none' ? 'pointer-events-none translate-y-6 opacity-0' : 'translate-y-0 opacity-100'}`}><div className="max-h-[58vh] overflow-y-auto p-4">{mobileDockPanel === 'mentor' ? <div className="space-y-3"><div className="rounded-2xl bg-white/70 p-3"><p className="text-xs font-black uppercase tracking-widest text-indigo-500">AI Mentor</p><p className="mt-1 text-sm text-slate-600">Ask anything. Chat is auto-saved.</p></div><div className="space-y-2">{mobileChat.map(msg => <div key={msg.id} className={`rounded-2xl p-3 text-sm ${msg.sender === 'user' ? 'ml-8 bg-indigo-600 text-white' : 'mr-8 bg-white text-slate-800 border border-slate-200'}`}><div className="space-y-2">{renderStructuredText(msg.text)}</div></div>)} </div>{mobileChatLoading && <div className="mr-8 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm"><span className="inline-block h-3 w-3 animate-ping rounded-full bg-indigo-500"></span><span>AI is thinking...</span></div>}<div className="flex gap-2"><input value={mobileChatInput} onChange={e => setMobileChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMobileChat()} className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Ask your doubt..." /><button onClick={sendMobileChat} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Send</button></div></div> : <div className="space-y-3"><div className="rounded-2xl bg-white/70 p-3"><p className="text-xs font-black uppercase tracking-widest text-emerald-500">Quick Notes</p><p className="mt-1 text-sm text-slate-600">Auto-saved and resumed.</p></div><button onClick={addNote} className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-black text-white">+ Add Note</button><div className="space-y-2">{notes.map(note => <div key={note.id} onClick={() => { setMobileDockPanel('notes'); setActiveNoteId(note.id); }} className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{note.timestamp !== null ? `${Math.floor(note.timestamp/60)}:${String(note.timestamp%60).padStart(2,'0')}` : 'General note'}</span><button onClick={() => deleteNote(note.id)} className="font-bold text-red-500">Delete</button></div><div contentEditable suppressContentEditableWarning onFocus={() => { setMobileDockPanel('notes'); setActiveNoteId(note.id); }} onClick={() => { setMobileDockPanel('notes'); setActiveNoteId(note.id); }} onInput={e => updateNote(note.id, (e.target as HTMLDivElement).innerHTML)} className={`w-full rounded-lg border border-slate-200 p-3 text-sm bg-white ${activeNoteId === note.id ? 'min-h-[220px]' : 'min-h-[110px]'}`} dangerouslySetInnerHTML={{ __html: note.text || '' }} /></div>)}</div></div>}</div></section>

    {isNotesFullscreen && (
      <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xl p-3 md:p-6">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-3xl border border-white/30 bg-white/90 shadow-2xl">
          <div className="flex items-center justify-between border-b p-4"><h3 className="text-lg font-black text-slate-800">Full Notes Editor</h3><button onClick={() => setIsNotesFullscreen(false)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Done</button></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {notes.map(note => <div key={`full-${note.id}`} className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{note.timestamp !== null ? `${Math.floor(note.timestamp/60)}:${String(note.timestamp%60).padStart(2,'0')}` : 'General note'}</span><button onClick={() => deleteNote(note.id)} className="font-bold text-red-500">Delete</button></div><div contentEditable suppressContentEditableWarning onInput={e => updateNote(note.id, (e.target as HTMLDivElement).innerHTML)} className="min-h-[220px] rounded-lg border border-slate-200 p-4 text-base leading-7" dangerouslySetInnerHTML={{ __html: note.text || '' }} /></div>)}
          </div>
        </div>
      </div>
    )}
  </div>;
}
