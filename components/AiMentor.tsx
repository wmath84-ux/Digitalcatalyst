import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';

interface AiMentorProps {
    productTitle: string;
    activeContentName: string | null;
}

interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
}

const AiMentor: React.FC<AiMentorProps> = ({ productTitle, activeContentName }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages([{ 
            sender: 'ai', 
            text: `Welcome! I'm your AI mentor for "${productTitle}". You are currently viewing "${activeContentName || 'the product details'}". How can I help you?` 
        }]);
    }, [productTitle, activeContentName]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async () => {
        if (chatInput.trim() === '' || isChatLoading) return;

        const userMessage: ChatMessage = { sender: 'user', text: chatInput };
        setMessages(prev => [...prev, userMessage]);
        setChatInput('');
        setIsChatLoading(true);

        try {
            if (!process.env.API_KEY) {
                throw new Error("API_KEY not configured.");
            }
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const systemInstruction = `You are a helpful AI Mentor for the product "${productTitle}". The user is currently viewing content titled "${activeContentName || 'the main product page'}". Your role is to answer questions about this topic, the product, and related subjects to help the user learn and succeed. Be encouraging and clear.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemInstruction}\n\nUser: ${chatInput}`,
            });

            setMessages(prev => [...prev, { sender: 'ai', text: response.text }]);
        } catch (err) {
            console.error("Gemini API Error:", err);
            setMessages(prev => [...prev, { sender: 'ai', text: "Sorry, I couldn't connect. Please check your API key or try again later." }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e293b] text-white overflow-hidden rounded-lg shadow-inner">
            <div className="p-4 border-b border-gray-700 flex-shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-300" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    AI Mentor
                </h3>
            </div>
            <div ref={chatContainerRef} className="flex-1 p-4 space-y-4 overflow-y-auto">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl p-3 rounded-lg animate-fade-in ${msg.sender === 'user' ? 'bg-primary' : 'bg-slate-600'}`}>
                            <pre className="whitespace-pre-wrap font-sans text-sm">{msg.text}</pre>
                        </div>
                    </div>
                ))}
                {isChatLoading && (
                    <div className="flex justify-start">
                        <div className="max-w-xl p-3 rounded-lg bg-slate-600">
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-4 border-t border-gray-700 bg-slate-800 flex-shrink-0">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask a question..."
                        className="w-full p-2 border border-slate-600 rounded-lg bg-slate-700 text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        disabled={isChatLoading}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={isChatLoading || !chatInput.trim()}
                        className="bg-primary text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-all active:scale-95 disabled:bg-gray-500"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AiMentor;
