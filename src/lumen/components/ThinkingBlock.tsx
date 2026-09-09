import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { ThinkingStep } from "../lib/types";
import { cn } from "../utils/cn";

/**
 * The thinking / reasoning surface.
 * - Live: auto-expands, shows an elapsed clock and reveals meaningful steps.
 * - Done: collapses to a single calm summary line ("Thought for 8 seconds").
 * Occupies minimal space when collapsed; never breaks the conversation flow.
 */
export default function ThinkingBlock({
  steps,
  live,
  open,
  ms,
  startedAt,
  onToggle,
}: {
  steps: ThinkingStep[];
  live: boolean;
  open: boolean;
  ms?: number;
  startedAt: number;
  onToggle: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!live) return;
    const now = () => Date.now() - startedAt;
    setElapsed(now());
    const t = window.setInterval(() => setElapsed(now()), 250);
    return () => window.clearInterval(t);
  }, [live, startedAt]);

  const secs = Math.max(1, Math.round((live ? elapsed : ms ?? 0) / 1000));
  const label = live ? "Thinking…" : `Thought for ${secs} second${secs === 1 ? "" : "s"}`;

  return (
    <div className={cn("thinking anim-fade-up mb-3 max-w-[560px]", live && "is-live")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={live ? "Thinking details" : "Show reasoning details"}
        className="thinking__head focus-ring"
      >
        {live ? (
          <span className="pulse-dot" aria-hidden="true" />
        ) : (
          <span className="flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-[--accent-soft]" aria-hidden="true">
            <Check size={10} strokeWidth={3} className="text-[--accent-ink]" />
          </span>
        )}
        <span className={cn("min-w-0 flex-1 truncate font-medium", live && "shimmer-text")}>{label}</span>
        {live && <span className="mono flex-none text-[11px] tabular-nums text-[--ink-3]">{secs}s</span>}
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn("flex-none text-[--ink-3] transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="thinking__body" aria-live="polite">
          {steps.map((s, i) => (
            <div key={i} className={cn("think-step", s.status === "done" && "is-done", s.status === "pending" && "is-pending")}>
              <span className="think-step__icon" aria-hidden="true">
                {s.status === "done" ? (
                  <Check size={13} strokeWidth={2.5} className="text-[--ink-4]" />
                ) : s.status === "active" ? (
                  <span className="spin-arc" />
                ) : (
                  <span className="block h-[5px] w-[5px] rounded-full bg-[--border-2]" />
                )}
              </span>
              <span className={cn("think-step__label", s.status === "active" && "shimmer-text font-medium")}>
                {s.label}
                {s.detail && <span className="think-step__detail">{s.detail}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
