
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';

interface Message {
    sender: 'user' | 'ai';
    text: string;
}

const GeminiAssistant: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { sender: 'ai', text: "Hello! I'm your AI assistant, powered by Gemini. How can I help you improve the website today? For example, you could ask me to 'add a new section to the homepage' or 'change the color of the header'." }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        if (input.trim() === '' || isLoading) return;

        const userMessage: Message = { sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            if (!process.env.API_KEY) {
                throw new Error("API_KEY environment variable not set.");
            }
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const systemInstruction = "You are an expert senior frontend engineer assisting an admin with their React/TypeScript e-commerce site built with Tailwind CSS. Your goal is to provide helpful explanations and complete, ready-to-use code snippets to fulfill their requests for changes. Always format code blocks with markdown backticks (```tsx ... ```). Be concise and helpful.";

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: `${systemInstruction}\n\nUser: ${input}`,
            });

            const aiMessage: Message = { sender: 'ai', text: response.text };
            setMessages(prev => [...prev, aiMessage]);

        } catch (err: any) {
            const errorMessage = "Sorry, I encountered an error. Please check the console for details or ensure your API key is correctly configured.";
            setError(errorMessage);
            setMessages(prev => [...prev, { sender: 'ai', text: errorMessage }]);
            console.error("Gemini API Error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full max-h-[calc(100vh-5rem)] bg-white rounded-lg shadow-md">
            <div className="p-4 border-b">
                <h1 className="text-2xl font-bold text-gray-800">AI Assistant</h1>
                 <div className="mt-2 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 rounded-r-lg" role="alert">
                    <p className="font-semibold">Disclaimer</p>
                    <p className="text-sm">This is an experimental AI assistant. It provides suggestions and code snippets but does **not** automatically apply changes to the website. Always review and test code before implementation.</p>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl lg:max-w-3xl p-3 rounded-lg ${msg.sender === 'user' ? 'bg-razorpay-light-blue text-white' : 'bg-gray-200 text-gray-800'}`}>
                            <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                        </div>
                    </div>
                ))}
                {isLoading && (
                     <div className="flex justify-start">
                        <div className="max-w-xl p-3 rounded-lg bg-gray-200 text-gray-800">
                           <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                           </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t bg-gray-50">
                {error && <p className="text-red-500 text-sm mb-2 text-center">{error}</p>}
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask for a change, e.g., 'Make all buttons green'"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-razorpay-light-blue focus:border-transparent transition"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading}
                        className="bg-razorpay-light-blue text-white font-bold px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Thinking...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GeminiAssistant;
