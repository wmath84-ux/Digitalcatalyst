import { useState } from "react";
import type { Question } from "../types/course";
import { cn } from "../utils/cn";

interface QnaTabProps {
  questions: Question[];
  lessonTitle: string;
  onAskQuestion: (text: string) => void;
  onToggleLike: (id: string) => void;
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

export default function QnaTab({ questions, lessonTitle, onAskQuestion, onToggleLike }: QnaTabProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAsk = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAskQuestion(trimmed);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[11px] font-medium text-white/40">
          Ask about <span className="text-white/70">{lessonTitle}</span>
        </p>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question or share a doubt..."
            rows={2}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-2.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50"
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => { window.location.hash = "#/ai-chat"; }}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-3 py-1.5 text-[12px] font-bold text-white shadow-lg shadow-fuchsia-500/30 active:scale-95 transition"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Tap to Gemini 3.1 Flash
          </button>
          <button
            onClick={handleAsk}
            disabled={!draft.trim()}
            className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow shadow-cyan-900/40 disabled:opacity-40"
          >
            Post Question
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[12.5px] text-white/35">
            No discussion yet. Be the first to ask!
          </div>
        )}

        {questions.map((q) => {
          const isExpanded = expanded.has(q.id);
          return (
            <div key={q.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex gap-2.5">
                <Avatar name={q.author} color={q.avatarColor} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12.5px] font-semibold text-white">{q.author}</p>
                    <span className="shrink-0 text-[10px] text-white/35">{q.timeAgo}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/80">{q.text}</p>

                  <div className="mt-2 flex items-center gap-4">
                    <button
                      onClick={() => onToggleLike(q.id)}
                      className={cn(
                        "flex items-center gap-1 text-[11px] font-medium transition-colors",
                        q.liked ? "text-rose-400" : "text-white/45"
                      )}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={q.liked ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                      </svg>
                      {q.likes + (q.liked ? 1 : 0)}
                    </button>
                    {q.replies.length > 0 && (
                      <button
                        onClick={() => toggleExpand(q.id)}
                        className="text-[11px] font-medium text-cyan-300/80"
                      >
                        {isExpanded ? "Hide" : "View"} {q.replies.length} repl
                        {q.replies.length === 1 ? "y" : "ies"}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 flex flex-col gap-2.5 border-l-2 border-white/10 pl-3">
                      {q.replies.map((rep) => (
                        <div key={rep.id} className="flex gap-2">
                          <Avatar name={rep.author} color={rep.avatarColor} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[11.5px] font-semibold text-white/90">{rep.author}</p>
                              <span className="shrink-0 text-[9.5px] text-white/30">{rep.timeAgo}</span>
                            </div>
                            <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/70">{rep.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
