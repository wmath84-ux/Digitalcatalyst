import { useState, type ReactElement } from "react";
import type { Resource } from "../types/course";
import { cn } from "../utils/cn";

interface ResourcesTabProps {
  resources: Resource[];
  currentLessonId: string;
  lessonTitleById: Record<string, string>;
}

const typeMeta: Record<
  Resource["type"],
  { label: string; color: string; icon: ReactElement }
> = {
  pdf: {
    label: "PDF",
    color: "from-rose-500 to-orange-500",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    ),
  },
  drive: {
    label: "Drive",
    color: "from-emerald-500 to-teal-500",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 3 20h18L12 2z" />
      </svg>
    ),
  },
  zip: {
    label: "ZIP",
    color: "from-amber-500 to-yellow-400",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M12 4v16M9 8h1M9 12h1M9 16h1" />
      </svg>
    ),
  },
  link: {
    label: "LINK",
    color: "from-sky-500 to-indigo-500",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1" />
      </svg>
    ),
  },
};

export default function ResourcesTab({ resources, currentLessonId, lessonTitleById }: ResourcesTabProps) {
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "current">("all");

  const list = filter === "current" ? resources.filter((r) => r.lessonId === currentLessonId) : resources;

  const handleDownload = (id: string) => {
    setDownloaded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["all", "current"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors",
              filter === f ? "bg-white text-slate-900" : "bg-white/10 text-white/60"
            )}
          >
            {f === "all" ? "All Files" : "This Lesson"}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/40">
          No resources attached to this lesson yet.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {list.map((res) => {
          const meta = typeMeta[res.type];
          const isDone = downloaded.has(res.id);
          return (
            <div
              key={res.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white",
                  meta.color
                )}
              >
                {meta.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">{res.name}</p>
                <p className="mt-0.5 text-[10.5px] text-white/40">
                  {meta.label} · {res.size} · {lessonTitleById[res.lessonId] ?? "General"}
                </p>
              </div>
              <button
                onClick={() => handleDownload(res.id)}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  isDone ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/70 active:bg-white/20"
                )}
                aria-label={isDone ? "Downloaded" : "Download"}
              >
                {isDone ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
