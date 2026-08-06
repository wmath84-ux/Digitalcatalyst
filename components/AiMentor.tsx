import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../utils/gemini';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

interface AiMentorProps {
    productTitle: string;
    activeContentName: string | null;
    productId?: string | number;
    courseId?: string | number;
    activeFileId?: string | number | null;
    activeFileType?: string | null;
    userId?: string;
    onClose?: () => void;
}

interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
    createdAt: string;
    providerUsed?: 'default' | 'custom' | 'local';
    modelUsed?: string;
}

interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
    createdAt: string;
    expiresAt: string;
    messages: ChatMessage[];
    providerUsed?: 'default' | 'custom' | 'local';
    modelUsed?: string;
    firestoreId?: string;
}

type AiProvider = 'gemini' | 'openai';

interface LocalAiSettings {
    provider: AiProvider;
    model: string;
    apiKey: string;
    useDefaultFallback: boolean;
    status: 'default' | 'custom' | 'invalid';
}

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const localSettingsKey = 'course-player-ai-mentor-byok-settings-v1';
const createExpiry = (date = new Date()) => new Date(date.getTime() + FIVE_DAYS_MS).toISOString();
const maskKey = (key: string) => key ? `${key.slice(0, 3)}••••••${key.slice(-4)}` : '';
const safePreview = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 140);
const defaultSettings: LocalAiSettings = { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: '', useDefaultFallback: true, status: 'default' };

const readLocalAiSettings = (): LocalAiSettings => {
    if (typeof window === 'undefined') return defaultSettings;
    try {
        const parsed = JSON.parse(localStorage.getItem(localSettingsKey) || 'null') as Partial<LocalAiSettings> | null;
        if (!parsed?.apiKey) return defaultSettings;
        return { ...defaultSettings, ...parsed, status: parsed.status === 'invalid' ? 'invalid' : 'custom' };
    } catch {
        return defaultSettings;
    }
};

const makeWelcomeMessage = (productTitle: string, activeContentName: string | null): ChatMessage => ({
    sender: 'ai',
    createdAt: new Date().toISOString(),
    text: `# Welcome\n\nI'm your AI mentor for **${productTitle}**. You are currently viewing **${activeContentName || 'the product details'}**.\n\nAsk me for summaries, examples, code explanations, quiz prep, or a study plan.`,
});

const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
    return <>{parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-cyan-700">{part.slice(1, -1)}</code>;
        return <React.Fragment key={index}>{part}</React.Fragment>;
    })}</>;
};

const MarkdownMessage: React.FC<{ text: string }> = ({ text }) => {
    const blocks = text.split(/\n{2,}/).filter(Boolean);
    return <div className="space-y-3 text-sm leading-7 text-slate-900/95">
        {blocks.map((block, blockIndex) => {
            const trimmed = block.trim();
            if (trimmed.startsWith('```')) {
                return <pre key={blockIndex} className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-4 text-xs text-cyan-700 shadow-inner"><code>{trimmed.replace(/^```\w*\n?/, '').replace(/```$/, '')}</code></pre>;
            }
            if (/^#{1,3}\s/.test(trimmed)) {
                const level = trimmed.match(/^#+/)?.[0].length || 3;
                const content = trimmed.replace(/^#{1,3}\s*/, '');
                const className = level === 1 ? 'text-2xl' : level === 2 ? 'text-xl' : 'text-lg';
                return <h3 key={blockIndex} className={`${className} font-black text-slate-900`}><InlineMarkdown text={content} /></h3>;
            }
            const lines = trimmed.split('\n').filter(Boolean);
            if (lines.every(line => /^[-*•]\s+/.test(line.trim()))) {
                return <ul key={blockIndex} className="list-disc space-y-1 pl-5 marker:text-cyan-700">{lines.map((line, lineIndex) => <li key={lineIndex}><InlineMarkdown text={line.replace(/^[-*•]\s+/, '')} /></li>)}</ul>;
            }
            if (lines.every(line => /^\d+\.\s+/.test(line.trim()))) {
                return <ol key={blockIndex} className="list-decimal space-y-1 pl-5 marker:text-cyan-700">{lines.map((line, lineIndex) => <li key={lineIndex}><InlineMarkdown text={line.replace(/^\d+\.\s+/, '')} /></li>)}</ol>;
            }
            return <p key={blockIndex}><InlineMarkdown text={trimmed} /></p>;
        })}
    </div>;
};

const TypingIndicator: React.FC = () => (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <span>AI is thinking</span>
        <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.24s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.12s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200" />
        </span>
    </div>
);

const AiMentor: React.FC<AiMentorProps> = ({ productTitle, activeContentName, productId, courseId, activeFileId, activeFileType, userId = '', onClose }) => {
    const storageKey = useMemo(() => `ai-mentor-sessions-${productTitle.replace(/\W+/g, '-').toLowerCase()}`, [productTitle]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(() => typeof window === 'undefined' ? true : window.innerWidth >= 768);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [aiSettings, setAiSettings] = useState<LocalAiSettings>(readLocalAiSettings);
    const [settingsDraft, setSettingsDraft] = useState<LocalAiSettings>(readLocalAiSettings);
    const [settingsNotice, setSettingsNotice] = useState('');
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as ChatSession[];
                const activeSaved = Array.isArray(parsed) ? parsed.filter(session => !session.expiresAt || new Date(session.expiresAt).getTime() > Date.now()) : [];
                if (activeSaved.length) {
                    setSessions(activeSaved);
                    setActiveSessionId(activeSaved[0].id);
                    return;
                }
            } catch (error) {
                console.warn('Unable to restore AI Mentor history.', error);
            }
        }
        const firstSession: ChatSession = {
            id: crypto.randomUUID(),
            title: activeContentName || productTitle,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            expiresAt: createExpiry(),
            messages: [makeWelcomeMessage(productTitle, activeContentName)],
        };
        setSessions([firstSession]);
        setActiveSessionId(firstSession.id);
    }, [activeContentName, productTitle, storageKey]);

    useEffect(() => {
        if (sessions.length) localStorage.setItem(storageKey, JSON.stringify(sessions));
    }, [sessions, storageKey]);

    useEffect(() => {
        if (!userId) return;
        const cleanupExpired = async () => {
            const now = new Date();
            const chatsRef = collection(db, 'users', userId, 'aiMentorChats');
            const expired = await getDocs(query(chatsRef, where('expiresAtMs', '<=', now.getTime()), limit(20)));
            await Promise.all(expired.docs.map(item => deleteDoc(item.ref)));
            const recent = await getDocs(query(chatsRef, where('source', '==', 'course_player_ai_mentor'), where('activeFileId', '==', String(activeFileId || '')), orderBy('updatedAtMs', 'desc'), limit(1)));
            const restored = recent.docs.map(item => ({ firestoreId: item.id, ...(item.data() as ChatSession & { expiresAtMs?: number }) })).find(item => !item.expiresAtMs || item.expiresAtMs > now.getTime());
            if (restored?.messages?.length) {
                setSessions(previous => previous.some(session => session.firestoreId === restored.firestoreId) ? previous : [{ ...restored, id: restored.id || restored.firestoreId || crypto.randomUUID() }, ...previous]);
                setActiveSessionId(restored.id || restored.firestoreId || '');
            }
        };
        cleanupExpired().catch(error => console.warn('AI Mentor chat cleanup/restore failed', error));
    }, [activeFileId, userId]);

    const activeSession = sessions.find(session => session.id === activeSessionId) || sessions[0];
    const messages = activeSession?.messages || [];

    useEffect(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }, [messages, isChatLoading]);

    const updateActiveSession = (updater: (session: ChatSession) => ChatSession) => {
        setSessions(previous => previous.map(session => session.id === activeSession?.id ? updater(session) : session));
    };

    const createNewChat = () => {
        const nextSession: ChatSession = {
            id: crypto.randomUUID(),
            title: activeContentName || 'New mentor chat',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            expiresAt: createExpiry(),
            messages: [makeWelcomeMessage(productTitle, activeContentName)],
        };
        setSessions(previous => [nextSession, ...previous]);
        setActiveSessionId(nextSession.id);
    };


    const persistChatToFirebase = async (session: ChatSession) => {
        if (!userId) return;
        const created = new Date(session.createdAt || new Date().toISOString());
        const expiresAt = session.expiresAt || createExpiry(created);
        const payload = {
            ...session,
            ownerId: userId,
            userId,
            courseId: String(courseId || productId || ''),
            productId: String(productId || courseId || ''),
            activeFileId: String(activeFileId || ''),
            activeFileName: activeContentName || '',
            activeFileType: activeFileType || '',
            source: 'course_player_ai_mentor',
            messageCount: session.messages.length,
            lastMessagePreview: safePreview(session.messages[session.messages.length - 1]?.text || ''),
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            createdAtMs: created.getTime(),
            updatedAtMs: new Date(session.updatedAt).getTime(),
            expiresAt,
            expiresAtMs: new Date(expiresAt).getTime(),
            serverUpdatedAt: serverTimestamp(),
        };
        if (session.firestoreId) await setDoc(doc(db, 'users', userId, 'aiMentorChats', session.firestoreId), payload, { merge: true });
        else {
            const docRef = await addDoc(collection(db, 'users', userId, 'aiMentorChats'), payload);
            setSessions(previous => previous.map(item => item.id === session.id ? { ...item, firestoreId: docRef.id } : item));
        }
    };

    const callCustomAi = async (prompt: string, historyContext: string, settings: LocalAiSettings) => {
        if (settings.provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
                body: JSON.stringify({ model: settings.model || 'gpt-4o-mini', messages: [{ role: 'system', content: `You are a premium AI Mentor for ${productTitle}. Current lesson: ${activeContentName || 'product details'}.` }, { role: 'user', content: `${historyContext}\n\n${prompt}` }] }),
            });
            if (!response.ok) throw new Error(response.status === 401 ? 'Invalid key.' : response.status === 429 ? 'Quota exceeded.' : 'Provider unavailable.');
            const data = await response.json();
            return data.choices?.[0]?.message?.content || 'No response returned.';
        }
        const ai = new GoogleGenAI({ apiKey: settings.apiKey });
        const response = await ai.models.generateContent({ model: settings.model || 'gemini-2.5-flash', contents: historyContext + `\n\nUser: ${prompt}` });
        return response.text || 'No response returned.';
    };

    const handleSendMessage = async () => {
        const prompt = chatInput.trim();
        if (!prompt || isChatLoading || !activeSession) return;

        const userMessage: ChatMessage = { sender: 'user', text: prompt, createdAt: new Date().toISOString() };
        updateActiveSession(session => ({
            ...session,
            title: session.messages.length <= 1 ? prompt.slice(0, 48) : session.title,
            updatedAt: new Date().toISOString(),
            messages: [...session.messages, userMessage],
        }));
        setChatInput('');
        setIsChatLoading(true);

        try {
            const historyContext = messages.slice(-8).map(message => `${message.sender === 'user' ? 'User' : 'AI'}: ${message.text}`).join('\n');
            const customSettings = readLocalAiSettings();
            if (customSettings.apiKey) {
                try {
                    const customReply = await callCustomAi(prompt, historyContext, customSettings);
                    updateActiveSession(session => { const next = { ...session, providerUsed: 'custom' as const, modelUsed: customSettings.model, updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai' as const, text: customReply, createdAt: new Date().toISOString(), providerUsed: 'custom' as const, modelUsed: customSettings.model }] }; void persistChatToFirebase(next); return next; });
                    setAiSettings({ ...customSettings, status: 'custom' });
                    return;
                } catch (customError) {
                    setAiSettings({ ...customSettings, status: 'invalid' });
                    if (!customSettings.useDefaultFallback) throw customError;
                }
            }
            const apiKey = getGeminiApiKey();
            if (!apiKey) {
                const demoReply = `## Demo study plan\n\n- Review **${activeContentName || productTitle}** in 20-minute focus blocks.\n- Write three key takeaways after every lesson.\n- Ask me for a quiz, summary, or code explanation once GEMINI_API_KEY is configured.\n\n\`Tip:\` Turn tough sections into flashcards.`;
                updateActiveSession(session => { const next = { ...session, providerUsed: 'local' as const, updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai' as const, text: demoReply, createdAt: new Date().toISOString(), providerUsed: 'local' as const }] }; void persistChatToFirebase(next); return next; });
                return;
            }
            const ai = new GoogleGenAI({ apiKey });
            const systemInstruction = `You are a premium AI Mentor for the product "${productTitle}". The user is currently viewing "${activeContentName || 'the main product page'}". Return structured Markdown with short sections, bullets, bold emphasis, and fenced code blocks when useful. Avoid walls of text.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemInstruction}\n\nRecent conversation:\n${historyContext}\n\nUser: ${prompt}`,
            });

            updateActiveSession(session => { const next = { ...session, providerUsed: 'default' as const, modelUsed: 'gemini-2.5-flash', updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai' as const, text: response.text || 'No response returned.', createdAt: new Date().toISOString(), providerUsed: 'default' as const, modelUsed: 'gemini-2.5-flash' }] }; void persistChatToFirebase(next); return next; });
        } catch (err) {
            console.error('Gemini API Error:', err);
            const fallbackMessage = err instanceof Error && err.message ? err.message : "Sorry, I couldn't connect. Please check your API key or try again later.";
            updateActiveSession(session => { const next = { ...session, updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai' as const, text: fallbackMessage, createdAt: new Date().toISOString() }] }; void persistChatToFirebase(next); return next; });
        } finally {
            setIsChatLoading(false);
        }
    };

    const historyPanel = (
        <div className="flex min-h-0 flex-1 flex-col p-4">
            <button onClick={createNewChat} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left font-black text-slate-900 transition hover:bg-slate-50 hover:shadow-sm">＋ New chat</button>
            <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {sessions.map(session => (
                    <button
                        key={session.id}
                        onClick={() => {
                            setActiveSessionId(session.id);
                            if (typeof window !== 'undefined' && window.innerWidth < 768) setIsHistoryOpen(false);
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${session.id === activeSession?.id ? 'border-cyan-200 bg-cyan-50 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:shadow-sm'}`}
                    >
                        <span className="block truncate text-sm font-black">{session.title}</span>
                        <span className="mt-1 block text-xs text-slate-600/70">{new Date(session.updatedAt).toLocaleDateString()}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="relative flex h-full min-h-0 overflow-hidden rounded-[1.25rem] border border-white bg-white text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-[1.75rem]">
            <div onClick={() => setIsHistoryOpen(false)} className={`absolute inset-0 z-20 bg-slate-950/30 backdrop-blur-sm transition-opacity md:hidden ${isHistoryOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden="true" />

            <aside className={`${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} absolute inset-y-0 left-0 z-30 flex w-[min(86vw,18rem)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-[16px_0_45px_rgba(15,23,42,0.16)] transition-transform duration-300 md:relative md:z-auto md:block md:shrink-0 md:translate-x-0 md:shadow-none ${isHistoryOpen ? 'md:w-72' : 'md:w-0'}`}>
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
                    <span className="text-sm font-black uppercase tracking-[0.2em] text-cyan-700/80">Chats</span>
                    <button onClick={() => setIsHistoryOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900">Close</button>
                </div>
                {historyPanel}
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
                <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                    <button onClick={() => setIsHistoryOpen(value => !value)} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 font-black text-slate-900 transition hover:bg-slate-50 hover:shadow-sm" aria-label="Open mentor chat history">☰</button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700/80 sm:text-xs sm:tracking-[0.32em]">Dedicated AI Workspace</p>
                        <h2 className="truncate text-base font-black text-slate-900 sm:text-xl">AI Mentor · {activeContentName || productTitle}</h2>
                    </div>
                    <button onClick={() => { setSettingsDraft(readLocalAiSettings()); setSettingsNotice(''); setIsSettingsOpen(true); }} aria-label="AI settings" title="AI Settings" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_8px_24px_rgba(123,97,255,0.16)] transition hover:-translate-y-0.5 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 active:translate-y-0 sm:h-11 sm:w-11 sm:rounded-2xl">⚙</button>
                    {onClose && <button onClick={onClose} aria-label="Close AI Mentor" className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900 transition hover:bg-slate-50 hover:shadow-sm sm:rounded-2xl sm:px-4 sm:text-base"><span className="sm:hidden">×</span><span className="hidden sm:inline">Close</span></button>}
                </header>

                <div ref={chatContainerRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:space-y-5 sm:px-4 sm:py-5 md:px-8">
                    {messages.map((msg, index) => (
                        <div key={`${msg.createdAt}-${index}`} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[92%] overflow-hidden rounded-[1.25rem] border p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:max-w-3xl sm:rounded-[1.5rem] sm:p-4 ${msg.sender === 'user' ? 'border-cyan-200 bg-cyan-50 text-slate-900' : 'border-slate-200 bg-white text-slate-900'}`}>
                                <MarkdownMessage text={msg.text} />
                            </div>
                        </div>
                    ))}
                    {isChatLoading && <TypingIndicator />}
                </div>



                {isSettingsOpen && <div className="absolute inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="AI settings panel">
                    <div className="w-full max-w-lg rounded-[1.5rem] border border-violet-100 bg-white p-4 text-slate-900 shadow-2xl sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div><p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">AI Settings</p><h3 className="text-xl font-black">Custom API key</h3></div>
                            <button onClick={() => setIsSettingsOpen(false)} className="h-10 w-10 rounded-2xl border border-slate-200 font-black" aria-label="Close AI settings">×</button>
                        </div>
                        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-3 text-sm font-bold text-violet-900">Status: {aiSettings.apiKey ? aiSettings.status === 'invalid' ? 'Key invalid' : `Custom key active (${maskKey(aiSettings.apiKey)})` : 'Using default AI / no custom key added'}</div>
                        <div className="mt-4 grid gap-3">
                            <label className="text-sm font-black">Provider<select value={settingsDraft.provider} onChange={e => setSettingsDraft(v => ({ ...v, provider: e.target.value as AiProvider, model: e.target.value === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash' }))} className="mt-1 w-full rounded-2xl border border-slate-200 p-3"><option value="gemini">Gemini</option><option value="openai">OpenAI</option></select></label>
                            <label className="text-sm font-black">Model<input value={settingsDraft.model} onChange={e => setSettingsDraft(v => ({ ...v, model: e.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 p-3" placeholder="gemini-2.5-flash" /></label>
                            <label className="text-sm font-black">API key<input value={settingsDraft.apiKey} onChange={e => setSettingsDraft(v => ({ ...v, apiKey: e.target.value }))} type="password" autoComplete="off" className="mt-1 w-full rounded-2xl border border-slate-200 p-3" placeholder="Paste your own key" /></label>
                            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settingsDraft.useDefaultFallback} onChange={e => setSettingsDraft(v => ({ ...v, useDefaultFallback: e.target.checked }))} /> Use default app AI if custom key fails</label>
                        </div>
                        <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">Privacy note: your custom key is stored only in this browser's local storage, never in Firebase chat documents, logs, or analytics. Clear it before sharing this device.</p>
                        {settingsNotice && <p className="mt-3 rounded-2xl bg-slate-100 p-3 text-sm font-bold text-slate-800">{settingsNotice}</p>}
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button onClick={() => { const next = { ...settingsDraft, status: settingsDraft.apiKey ? 'custom' as const : 'default' as const }; localStorage.setItem(localSettingsKey, JSON.stringify(next)); setAiSettings(next); setSettingsDraft(next); setSettingsNotice(`Saved locally. ${next.apiKey ? maskKey(next.apiKey) : 'Using default AI.'}`); }} className="rounded-2xl bg-violet-600 px-4 py-3 font-black text-white">Save key</button>
                            <button disabled={isTestingConnection || !settingsDraft.apiKey} onClick={async () => { setIsTestingConnection(true); setSettingsNotice('Testing connection…'); try { await callCustomAi('Reply with: connection successful', '', settingsDraft); setSettingsNotice('Connection successful.'); } catch { setSettingsNotice('Invalid key or provider unavailable.'); } finally { setIsTestingConnection(false); } }} className="rounded-2xl border border-violet-200 px-4 py-3 font-black text-violet-700 disabled:opacity-50">Test connection</button>
                            <button onClick={() => { localStorage.removeItem(localSettingsKey); setAiSettings(defaultSettings); setSettingsDraft(defaultSettings); setSettingsNotice('Custom key cleared. Default app AI will be used when available.'); }} className="rounded-2xl border border-rose-200 px-4 py-3 font-black text-rose-700">Clear key</button>
                        </div>
                    </div>
                </div>}

                <footer className="shrink-0 border-t border-slate-200 bg-white p-2.5 sm:p-4">
                    <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-inner sm:gap-3 sm:rounded-3xl">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ask for a summary, quiz, explanation, or study plan..."
                            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-600/60 sm:px-4 sm:text-base"
                            disabled={isChatLoading}
                        />
                        <button onClick={handleSendMessage} disabled={isChatLoading || !chatInput.trim()} className="shrink-0 rounded-2xl bg-cyan-200 px-4 py-3 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:text-base">Send</button>
                    </div>
                </footer>
            </section>
        </div>
    );
};

export default AiMentor;
