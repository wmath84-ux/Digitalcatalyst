import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../utils/gemini';

interface AiMentorProps {
    productTitle: string;
    activeContentName: string | null;
    onClose?: () => void;
}

interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
    createdAt: string;
}

interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
    messages: ChatMessage[];
}

const makeWelcomeMessage = (productTitle: string, activeContentName: string | null): ChatMessage => ({
    sender: 'ai',
    createdAt: new Date().toISOString(),
    text: `# Welcome\n\nI'm your AI mentor for **${productTitle}**. You are currently viewing **${activeContentName || 'the product details'}**.\n\nAsk me for summaries, examples, code explanations, quiz prep, or a study plan.`,
});

const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
    return <>{parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded-md border border-white/50 bg-white/70 px-1.5 py-0.5 text-cyan-700">{part.slice(1, -1)}</code>;
        return <React.Fragment key={index}>{part}</React.Fragment>;
    })}</>;
};

const MarkdownMessage: React.FC<{ text: string; isAi?: boolean }> = ({ text, isAi = false }) => {
    const blocks = text.split(/\n{2,}/).filter(Boolean);
    return <div className={`${isAi ? 'space-y-4 text-base leading-8 sm:space-y-3 sm:text-sm sm:leading-7' : 'space-y-3 text-sm leading-7'} text-slate-900/95`}>
        {blocks.map((block, blockIndex) => {
            const trimmed = block.trim();
            if (trimmed.startsWith('```')) {
                return <pre key={blockIndex} className="overflow-x-auto rounded-2xl border border-white/50 bg-white/70 p-4 text-xs text-cyan-700 shadow-inner"><code>{trimmed.replace(/^```\w*\n?/, '').replace(/```$/, '')}</code></pre>;
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
    <div className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
        <span>AI is thinking</span>
        <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.24s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.12s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200" />
        </span>
    </div>
);

const AiMentor: React.FC<AiMentorProps> = ({ productTitle, activeContentName, onClose }) => {
    const storageKey = useMemo(() => `ai-mentor-sessions-${productTitle.replace(/\W+/g, '-').toLowerCase()}`, [productTitle]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(() => typeof window === 'undefined' ? true : window.innerWidth >= 768);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as ChatSession[];
                if (Array.isArray(parsed) && parsed.length) {
                    setSessions(parsed);
                    setActiveSessionId(parsed[0].id);
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
            messages: [makeWelcomeMessage(productTitle, activeContentName)],
        };
        setSessions([firstSession]);
        setActiveSessionId(firstSession.id);
    }, [activeContentName, productTitle, storageKey]);

    useEffect(() => {
        if (sessions.length) localStorage.setItem(storageKey, JSON.stringify(sessions));
    }, [sessions, storageKey]);

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
            messages: [makeWelcomeMessage(productTitle, activeContentName)],
        };
        setSessions(previous => [nextSession, ...previous]);
        setActiveSessionId(nextSession.id);
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
            const apiKey = getGeminiApiKey();
            if (!apiKey) {
                const demoReply = `## Demo study plan\n\n- Review **${activeContentName || productTitle}** in 20-minute focus blocks.\n- Write three key takeaways after every lesson.\n- Ask me for a quiz, summary, or code explanation once GEMINI_API_KEY is configured.\n\n\`Tip:\` Turn tough sections into flashcards.`;
                updateActiveSession(session => ({ ...session, updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai', text: demoReply, createdAt: new Date().toISOString() }] }));
                return;
            }
            const ai = new GoogleGenAI({ apiKey });
            const historyContext = messages.slice(-8).map(message => `${message.sender === 'user' ? 'User' : 'AI'}: ${message.text}`).join('\n');
            const systemInstruction = `You are a premium AI Mentor for the product "${productTitle}". The user is currently viewing "${activeContentName || 'the main product page'}". Return structured Markdown with short sections, bullets, bold emphasis, and fenced code blocks when useful. Avoid walls of text.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemInstruction}\n\nRecent conversation:\n${historyContext}\n\nUser: ${prompt}`,
            });

            updateActiveSession(session => ({ ...session, updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai', text: response.text, createdAt: new Date().toISOString() }] }));
        } catch (err) {
            console.error('Gemini API Error:', err);
            const fallbackMessage = err instanceof Error && err.message ? err.message : "Sorry, I couldn't connect. Please check your API key or try again later.";
            updateActiveSession(session => ({ ...session, updatedAt: new Date().toISOString(), messages: [...session.messages, { sender: 'ai', text: fallbackMessage, createdAt: new Date().toISOString() }] }));
        } finally {
            setIsChatLoading(false);
        }
    };

    const historyPanel = (
        <div className="flex min-h-0 flex-1 flex-col p-4">
            <button onClick={createNewChat} className="rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-left font-black text-slate-900 transition hover:bg-white/80 hover:shadow-sm">＋ New chat</button>
            <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {sessions.map(session => (
                    <button
                        key={session.id}
                        onClick={() => {
                            setActiveSessionId(session.id);
                            if (typeof window !== 'undefined' && window.innerWidth < 768) setIsHistoryOpen(false);
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${session.id === activeSession?.id ? 'border-cyan-200/50 bg-cyan-200/15 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)]' : 'border-white/50 bg-white/70 text-slate-600 hover:bg-white/80 hover:shadow-sm'}`}
                    >
                        <span className="block truncate text-sm font-black">{session.title}</span>
                        <span className="mt-1 block text-xs text-slate-600/70">{new Date(session.updatedAt).toLocaleDateString()}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="relative flex h-full min-h-0 overflow-hidden rounded-[1.25rem] border border-white/50 bg-white/70 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl sm:rounded-[1.75rem]">
            <div onClick={() => setIsHistoryOpen(false)} className={`absolute inset-0 z-20 bg-slate-950/30 backdrop-blur-sm transition-opacity md:hidden ${isHistoryOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden="true" />

            <aside className={`${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} absolute inset-y-0 left-0 z-30 flex w-[min(86vw,18rem)] flex-col overflow-hidden border-r border-white/50 bg-white/90 shadow-[16px_0_45px_rgba(15,23,42,0.16)] backdrop-blur-2xl transition-transform duration-300 md:relative md:z-auto md:block md:shrink-0 md:translate-x-0 md:shadow-none ${isHistoryOpen ? 'md:w-72' : 'md:w-0'}`}>
                <div className="flex items-center justify-between border-b border-white/50 bg-white/70 px-4 py-3 md:hidden">
                    <span className="text-sm font-black uppercase tracking-[0.2em] text-cyan-700/80">Chats</span>
                    <button onClick={() => setIsHistoryOpen(false)} className="rounded-xl border border-white/50 bg-white/80 px-3 py-2 text-sm font-black text-slate-900">Close</button>
                </div>
                {historyPanel}
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
                <header className="flex shrink-0 items-center gap-2 border-b border-white/50 bg-white/70 px-3 py-2.5 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3">
                    <button onClick={() => setIsHistoryOpen(value => !value)} className="shrink-0 rounded-xl border border-white/50 bg-white/70 px-3 py-2 font-black text-slate-900 transition hover:bg-white/80 hover:shadow-sm" aria-label="Open mentor chat history">☰</button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700/80 sm:text-xs sm:tracking-[0.32em]">Dedicated AI Workspace</p>
                        <h2 className="truncate text-base font-black text-slate-900 sm:text-xl">AI Mentor · {activeContentName || productTitle}</h2>
                    </div>
                    {onClose && <button onClick={onClose} className="shrink-0 rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-sm font-black text-slate-900 transition hover:bg-white/80 hover:shadow-sm sm:rounded-2xl sm:px-4 sm:text-base">Close</button>}
                </header>

                <div ref={chatContainerRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:space-y-5 sm:px-4 sm:py-5 md:px-8">
                    {messages.map((msg, index) => (
                        <div key={`${msg.createdAt}-${index}`} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`${msg.sender === 'ai' ? 'max-w-[98%] p-4' : 'max-w-[92%] p-3'} overflow-hidden rounded-[1.25rem] border shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:max-w-3xl sm:rounded-[1.5rem] sm:p-4 ${msg.sender === 'user' ? 'border-cyan-200/50 bg-cyan-100/80 text-slate-900' : 'border-white/50 bg-white/70 text-slate-900'}`}>
                                <MarkdownMessage text={msg.text} isAi={msg.sender === 'ai'} />
                            </div>
                        </div>
                    ))}
                    {isChatLoading && <TypingIndicator />}
                </div>

                <footer className="shrink-0 border-t border-white/50 bg-white/70 p-2.5 backdrop-blur-xl sm:p-4">
                    <div className="flex gap-2 rounded-2xl border border-white/50 bg-white/70 p-2 shadow-inner sm:gap-3 sm:rounded-3xl">
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
