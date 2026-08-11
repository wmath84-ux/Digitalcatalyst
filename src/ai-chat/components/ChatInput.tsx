import { useEffect, useRef } from "react";
import type { SuggestionChip } from "../types";
import { AttachIcon, GearIcon, MicIcon, SendIcon } from "./icons";
import { cn } from "../utils/cn";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  suggestions: SuggestionChip[];
  onSuggestion: (prompt: string) => void;
  onOpenSettings: () => void;
  showSuggestions: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  suggestions,
  onSuggestion,
  onOpenSettings,
  showSuggestions,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      className="border-t border-zinc-100 dark:border-white/5 bg-white/90 dark:bg-[#0b0c0f]/90 backdrop-blur-xl px-3 pt-2.5"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
    >
      {showSuggestions && (
        <div className="flex gap-2 overflow-x-auto pb-2.5 -mx-0.5 px-0.5 no-scrollbar">
          {suggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => onSuggestion(s.prompt)}
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 py-1.5 text-[12.5px] font-medium text-zinc-600 dark:text-zinc-300 active:scale-95 transition whitespace-nowrap"
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="mb-1 h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5 active:scale-90 transition"
        >
          <GearIcon width={19} height={19} />
        </button>

        <div className="flex-1 flex items-end gap-1.5 rounded-3xl bg-zinc-100 dark:bg-white/[0.06] px-2 py-1.5">
          <button className="h-8 w-8 mb-0.5 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition">
            <AttachIcon width={18} height={18} />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Gemini..."
            className="flex-1 resize-none bg-transparent outline-none text-[14.5px] leading-6 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 py-1.5 max-h-[140px]"
          />
          <button className="h-8 w-8 mb-0.5 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition">
            <MicIcon width={18} height={18} />
          </button>
        </div>

        <button
          onClick={onSend}
          disabled={!value.trim()}
          className={cn(
            "mb-1 h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition active:scale-90",
            value.trim()
              ? "bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-500/30"
              : "bg-zinc-100 dark:bg-white/5 text-zinc-300 dark:text-zinc-600"
          )}
        >
          <SendIcon width={18} height={18} />
        </button>
      </div>
    </div>
  );
}
