import { useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import type { AIModel, Tier } from "../lib/types";
import { cn } from "../utils/cn";
import Dropdown from "./Dropdown";

export default function ModelSelector({
  modelId, models, disabled,
  tier,
  onSelect,
}: {
  models: AIModel[];
  disabled: boolean;
  modelId: string;
  tier: Tier;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const model = models.find((m) => m.id === modelId) ?? { id: "offline", name: "AI disabled", short: "AI disabled" };
  const tiny = tier === "xxs";

  return (
    <div className="relative flex-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${model.name}. Change model`}
        title={`Model: ${model.name}`}
        className={cn(
          "focus-ring flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[--border] bg-[--surface] pr-2 text-[13px] font-medium text-[--ink] shadow-[var(--sh-xs)] transition-colors hover:border-[--border-2] hover:bg-[--hover]",
          tiny ? "w-[30px] justify-center px-0 pr-0" : "pl-2.5",
          open && "border-[--ring-strong] bg-[--hover]"
        )}
      >
        <Sparkles size={tiny ? 13 : 13.5} className="flex-none text-[--accent-ink]" aria-hidden="true" />
        {!tiny && <span className="max-w-[110px] truncate">{model.short}</span>}
        {!tiny && <ChevronDown size={13.5} className={cn("flex-none text-[--ink-3] transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} align="right" ariaLabel="Choose AI source" className="w-[min(264px,calc(100vw-20px))]">
        <div className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[--ink-3]">AI source · Revision configuration</div>
        {models.map((m) => {
          const active = m.id === model.id;
          return (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                onSelect(m.id);
                setOpen(false);
              }}
              className={cn(
                "focus-ring flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors",
                active ? "bg-[--accent-soft]" : "hover:bg-[--hover]"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-[13.5px] font-medium", active ? "text-[--accent-ink]" : "text-[--ink]")}>{m.name}</span>
                  {m.badge && (
                    <span
                      className={cn(
                        "flex-none rounded-full border px-1.5 py-px text-[10px] font-semibold tracking-wide",
                        active ? "border-[--accent-soft-2] bg-[--surface] text-[--accent-ink]" : "border-[--border] bg-[--hover] text-[--ink-3]"
                      )}
                    >
                      {m.badge}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] break-words leading-snug text-[--ink-3]">{m.desc}</div>
              </div>
              {active && <Check size={15} className="mt-0.5 flex-none text-[--accent-ink]" aria-hidden="true" />}
            </button>
          );
        })}
        <a href="#/revision/ai-settings" className="block min-h-11 px-3 py-3 text-xs underline">Revision → AI Configuration</a>
      </Dropdown>
    </div>
  );
}
