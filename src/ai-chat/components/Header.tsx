import { useEffect, useRef, useState } from "react";
import type { AIModel } from "../types";
import { ChevronDownIcon, CpuIcon, MenuIcon, PlusIcon, SparkleIcon } from "./icons";
import { cn } from "../utils/cn";

interface HeaderProps {
  onOpenSidebar: () => void;
  onNewChat: () => void;
  models: AIModel[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
}

export default function Header({
  onOpenSidebar,
  onNewChat,
  models,
  selectedModelId,
  onSelectModel,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === selectedModelId) ?? models[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header
      className="relative z-30 flex items-center justify-between gap-2 px-3 pb-2.5 bg-white/80 dark:bg-[#0b0c0f]/80 backdrop-blur-xl border-b border-zinc-100 dark:border-white/5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
    >
      <button
        onClick={onOpenSidebar}
        className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 active:scale-90 transition"
      >
        <MenuIcon width={21} height={21} />
      </button>

      <div ref={ref} className="relative flex-1 flex justify-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 transition active:scale-[0.98]"
        >
          <span className="bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 bg-clip-text text-transparent font-semibold text-[15.5px] tracking-tight">
            {selected?.name ?? "Select model"}
          </span>
          <ChevronDownIcon
            width={16}
            height={16}
            className={cn(
              "text-zinc-400 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[280px] rounded-2xl bg-white dark:bg-[#16171c] shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-pop-in origin-top">
            <div className="px-4 pt-3 pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Model for this chat
              </p>
            </div>
            <div className="max-h-[320px] overflow-y-auto pb-1.5">
              {models.map((m) => {
                const active = m.id === selectedModelId;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-2.5 text-left transition",
                      active
                        ? "bg-indigo-50 dark:bg-indigo-500/10"
                        : "hover:bg-zinc-50 dark:hover:bg-white/5"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                        active
                          ? "bg-gradient-to-br from-indigo-500 to-blue-500 text-white"
                          : "bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-300"
                      )}
                    >
                      {m.isCustom ? <CpuIcon width={14} height={14} /> : <SparkleIcon width={13} height={13} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[13.5px] font-medium truncate",
                            active
                              ? "text-indigo-600 dark:text-indigo-300"
                              : "text-zinc-800 dark:text-zinc-100"
                          )}
                        >
                          {m.name}
                        </span>
                        {m.isCustom && (
                          <span className="text-[9.5px] uppercase font-semibold tracking-wide text-purple-500 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                            Custom
                          </span>
                        )}
                      </span>
                      <span className="block text-[11.5px] text-zinc-400 truncate">
                        {m.provider}
                        {m.description ? ` · ${m.description}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onNewChat}
        className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 active:scale-90 transition"
      >
        <PlusIcon width={20} height={20} />
      </button>
    </header>
  );
}
