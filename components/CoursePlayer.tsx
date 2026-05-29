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
  const addNote = () => setNotes(prev => [{ id: `n-${Date.now()}`, timestamp: videoRef.current ? Math.floor(videoRef.current.currentTime) : null, text: '', createdAt: new Date().toISOString() }, ...prev]);
  const updateNote = (id: string, text: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));
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
    if (activeFile.type === 'doc') return <div className="h-full w-full bg-white p-4 md:p-8 overflow-y-auto"><div className="mx-auto max-w-4xl rounded-2xl border bg-white shadow p-4"><div className="mb-3 text-xs uppercase tracking-wider text-slate-500">Google Docs style editor</div><div contentEditable suppressContentEditableWarning onInput={e=>activeFile && localStorage.setItem(`doc-edit-${activeFile.id}`, (e.target as HTMLDivElement).innerHTML)} className="min-h-[60vh] rounded-xl border p-4 outline-none" dangerouslySetInnerHTML={{__html: localStorage.getItem(`doc-edit-${activeFile.id}`) || activeFile.content || '<h1>Rich Notes</h1><p>Start editing...</p>'}} /></div></div>;
    if (activeFile.type === 'pdf') return <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6"><div className="max-w-xl rounded-3xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-2xl"><h3 className="text-2xl font-black">PDF Learning File</h3><p className="mt-2 text-slate-200">Download your PDF using these 2 steps:</p><ol className="mt-3 list-decimal pl-6 space-y-2 text-slate-100"><li>Click the download/open link below.</li><li>Use Chrome menu (top-right) → Print / Save as PDF.</li></ol><a href={activeFile.url} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Open / Download PDF</a></div></div>;
    return <div className="h-full flex items-center justify-center text-white">Preview unavailable</div>;
  };

  return <div className="h-screen w-screen bg-gray-900 flex flex-col lg:flex-row">
    <header className=" bg-black p-4 flex items-center gap-4 text-white"><button onClick={() => setIsSidebarOpen(true)}>☰</button><h1 className="font-semibold truncate">{activeFile?.name || product.title}</h1></header>
    <div onClick={() => setIsSidebarOpen(false)} className={`fixed inset-0 bg-black/60 z-30  ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
    <aside className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r transform transition lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="p-4 border-b bg-slate-900 text-white"><button onClick={onBack}>← Back</button><h2 className="font-black mt-2">{product.title}</h2></div><nav className="p-2 overflow-y-auto h-[calc(100%-80px)]">{product.courseContent?.map(m => <ModuleItem key={m.id} module={m} activeFile={activeFile} onSelectFile={onSelectFile} />)}</nav></aside>
    <div className="flex-1 min-w-0"><main className="bg-black relative overflow-hidden h-full">{renderMedia()}</main></div>

    <div className="fixed inset-x-3 bottom-3 z-[55]  rounded-2xl border border-white/20 bg-white/20 p-2 backdrop-blur-2xl"><div className="grid grid-cols-2 gap-2"><button onClick={() => setMobileDockPanel(mobileDockPanel === 'mentor' ? 'none' : 'mentor')} className="rounded-xl bg-white/70 py-2 text-sm font-black">🤖 AI Mentor</button><button onClick={() => setMobileDockPanel(mobileDockPanel === 'notes' ? 'none' : 'notes')} className="rounded-xl bg-white/70 py-2 text-sm font-black">📝 Notes</button></div></div>
    <div className={`fixed inset-0 z-[54]  bg-slate-950/35 backdrop-blur-md transition ${mobileDockPanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'}`} />
    <section className={`fixed inset-x-3 bottom-20 z-[56]  rounded-3xl border border-white/30 bg-white/75 backdrop-blur-2xl transition-all duration-300 ${mobileDockPanel === 'none' ? 'pointer-events-none translate-y-6 opacity-0' : 'translate-y-0 opacity-100'}`}><div className="max-h-[58vh] overflow-y-auto p-4">{mobileDockPanel === 'mentor' ? <div className="space-y-3"><div className="rounded-2xl bg-white/70 p-3"><p className="text-xs font-black uppercase tracking-widest text-indigo-500">AI Mentor</p><p className="mt-1 text-sm text-slate-600">Ask anything. Chat is auto-saved.</p></div><div className="space-y-2">{mobileChat.map(msg => <div key={msg.id} className={`rounded-2xl p-3 text-sm ${msg.sender === 'user' ? 'ml-8 bg-indigo-600 text-white' : 'mr-8 bg-white text-slate-800 border border-slate-200'}`}>{msg.text}</div>)} </div>{mobileChatLoading && <div className="mr-8 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm"><span className="inline-block h-3 w-3 animate-ping rounded-full bg-indigo-500"></span><span>AI is thinking...</span></div>}<div className="flex gap-2"><input value={mobileChatInput} onChange={e => setMobileChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMobileChat()} className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Ask your doubt..." /><button onClick={sendMobileChat} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Send</button></div></div> : <div className="space-y-3"><div className="rounded-2xl bg-white/70 p-3"><p className="text-xs font-black uppercase tracking-widest text-emerald-500">Quick Notes</p><p className="mt-1 text-sm text-slate-600">Auto-saved and resumed.</p></div><button onClick={addNote} className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-black text-white">+ Add Note</button><div className="space-y-2">{notes.map(note => <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{note.timestamp !== null ? `${Math.floor(note.timestamp/60)}:${String(note.timestamp%60).padStart(2,'0')}` : 'General note'}</span><button onClick={() => deleteNote(note.id)} className="font-bold text-red-500">Delete</button></div><textarea value={note.text} onChange={e => updateNote(note.id, e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-slate-200 p-2 text-sm" /></div>)}</div></div>}</div></section>
  </div>;
}
