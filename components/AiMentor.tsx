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
    const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const viewport = window.visualViewport;
        if (!viewport) return;

        let frame = 0;
        const updateViewport = () => {
            if (frame) window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const nextHeight = Math.max(320, Math.floor(viewport.height || window.innerHeight));
                setMobileViewportHeight(previous => previous === nextHeight ? previous : nextHeight);
            });
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);
        window.addEventListener('orientationchange', updateViewport);
        viewport.addEventListener('resize', updateViewport);
        viewport.addEventListener('scroll', updateViewport);

        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', updateViewport);
            window.removeEventListener('orientationchange', updateViewport);
            viewport.removeEventListener('resize', updateViewport);
            viewport.removeEventListener('scroll', updateViewport);
        };
    }, []);

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
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <button
                    onClick={createNewChat}
                    className="flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 active:scale-[0.99]"
                >
                    + New chat
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <p className="px-3 py-2 text-xs font-semibold text-slate-500">Chats</p>
                <div className="space-y-0.5">
                    {sessions.map(session => (
                        <button
                            key={session.id}
                            onClick={() => {
                                setActiveSessionId(session.id);
                                if (typeof window !== 'undefined' && window.innerWidth < 768) setIsHistoryOpen(false);
                            }}
                            className={`w-full rounded-lg px-3 py-3 text-left transition ${
                                session.id === activeSession?.id
                                    ? 'bg-slate-100 text-slate-950'
                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <span className="block truncate text-sm font-medium">{session.title}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );


    return (
        <div
            className="relative flex min-h-0 w-full flex-1 overflow-hidden bg-white text-slate-900"
            style={mobileViewportHeight ? { height: `${mobileViewportHeight}px` } : undefined}
        >
            <div
                onClick={() => setIsHistoryOpen(false)}
                className={`absolute inset-0 z-20 bg-slate-950/20 transition-opacity md:hidden ${
                    isHistoryOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden="true"
            />

            <aside
                className={`${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} absolute inset-y-0 left-0 z-30 flex w-[min(86vw,20rem)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-[16px_0_45px_rgba(15,23,42,0.12)] transition-transform duration-200 md:relative md:z-auto md:block md:shrink-0 md:translate-x-0 md:shadow-none md:w-72`}
                aria-label="Chats"
            >
                {historyPanel}
            </aside>

            <section className="flex min-w-0 min-h-0 flex-1 flex-col bg-white">
                <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                    <button
                        onClick={() => setIsHistoryOpen(value => !value)}
                        className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                        aria-label="Open chats"
                    >
                        Chat
                    </button>
                    <button
                        onClick={createNewChat}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                    >
                        New chat
                    </button>
                </header>

                <div
                    ref={chatContainerRef}
                    className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-5 sm:px-5"
                >
                    {messages.map((msg, index) => (
                        <div key={`${msg.createdAt}-${index}`} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className={`max-w-[92%] overflow-hidden rounded-2xl px-3 py-2.5 text-[15px] leading-6 sm:max-w-3xl ${
                                    msg.sender === 'user'
                                        ? 'bg-slate-100 text-slate-900'
                                        : 'bg-transparent text-slate-900'
                                }`}
                            >
                                <MarkdownMessage text={msg.text} />
                            </div>
                        </div>
                    ))}
                    {isChatLoading && <TypingIndicator />}
                </div>

                <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-2 py-1.5 shadow-sm">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Write a message..."
                            aria-label="Write a message"
                            className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                            disabled={isChatLoading}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={isChatLoading || !chatInput.trim()}
                            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Send
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );

};

export default AiMentor;
