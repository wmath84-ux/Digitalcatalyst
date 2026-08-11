import { useEffect, useRef } from "react";
import type { AIModel, Chat, SuggestionChip } from "../types";
import MessageBubble from "./MessageBubble";
import { SparkleIcon } from "./icons";

interface ChatAreaProps {
  chat: Chat;
  model?: AIModel;
  isTyping: boolean;
  suggestions: SuggestionChip[];
  onSuggestion: (prompt: string) => void;
}

export default function ChatArea({ chat, model, isTyping, suggestions, onSuggestion }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages.length, isTyping, chat.id]);

  if (chat.messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-5 flex flex-col items-center justify-center text-center">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4 animate-fade-in-up">
          <SparkleIcon width={26} height={26} className="text-white" />
        </div>
        <h1 className="text-[21px] font-semibold text-zinc-800 dark:text-zinc-50 tracking-tight animate-fade-in-up">
          How can I help you today?
        </h1>
        <p className="text-[13.5px] text-zinc-400 mt-1.5 max-w-[260px] animate-fade-in-up">
          Chatting with{" "}
          <span className="font-medium text-zinc-500 dark:text-zinc-300">{model?.name}</span>. Ask
          anything, or try a suggestion below.
        </p>

        <div className="grid grid-cols-2 gap-2.5 mt-7 w-full max-w-[360px]">
          {suggestions.map((s, i) => (
            <button
              key={s.label}
              onClick={() => onSuggestion(s.prompt)}
              style={{ animationDelay: `${i * 40}ms` }}
              className="animate-fade-in-up flex flex-col items-start gap-2 text-left rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-3.5 active:scale-[0.97] transition shadow-sm"
            >
              <span className="text-lg">{s.icon}</span>
              <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
      {chat.messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {isTyping && (
        <div className="flex items-end gap-2.5 animate-fade-in-up">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 flex items-center justify-center shrink-0 shadow-sm">
            <SparkleIcon width={13} height={13} className="text-white" />
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-white/[0.07] rounded-2xl rounded-bl-md px-4 py-3.5">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-typing-dot" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-typing-dot" style={{ animationDelay: "160ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-typing-dot" style={{ animationDelay: "320ms" }} />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
