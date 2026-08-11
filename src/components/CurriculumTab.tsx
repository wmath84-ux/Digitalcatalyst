import type { Module } from "../types/course";
import { cn } from "../utils/cn";

interface CurriculumTabProps {
  modules: Module[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  expandedModules: Set<string>;
  onToggleModule: (id: string) => void;
  currentLessonId: string;
  onSelectLesson: (moduleId: string, lessonId: string) => void;
}

const typeIcon: Record<string, string> = {
  video: "▶",
  quiz: "?",
  reading: "≡",
};

export default function CurriculumTab({
  modules,
  searchQuery,
  onSearchChange,
  expandedModules,
  onToggleModule,
  currentLessonId,
  onSelectLesson,
}: CurriculumTabProps) {
  const query = searchQuery.trim().toLowerCase();

  const filteredModules = query
    ? modules
        .map((m) => ({
          ...m,
          lessons: m.lessons.filter(
            (l) =>
              l.title.toLowerCase().includes(query) ||
              m.title.toLowerCase().includes(query)
          ),
        }))
        .filter((m) => m.lessons.length > 0)
    : modules;

  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const completedLessons = modules.reduce(
    (acc, m) => acc + m.lessons.filter((l) => l.completed).length,
    0
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search lessons, topics, keywords..."
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-9 text-[13px] text-white placeholder:text-white/35 outline-none ring-0 focus:border-violet-400/50 focus:bg-white/[0.07]"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/60"
            aria-label="Clear search"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-0.5 text-[11px] text-white/45">
        <span>
          {completedLessons}/{totalLessons} lessons completed
        </span>
        {query && (
          <span>
            {filteredModules.reduce((acc, m) => acc + m.lessons.length, 0)} result
            {filteredModules.reduce((acc, m) => acc + m.lessons.length, 0) === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {filteredModules.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/40">
            No lessons match "{searchQuery}"
          </div>
        )}

        {filteredModules.map((module) => {
          const isExpanded = query ? true : expandedModules.has(module.id);
          const moduleCompleted = module.lessons.filter((l) => l.completed).length;

          return (
            <div
              key={module.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <button
                onClick={() => onToggleModule(module.id)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left active:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-white">{module.title}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {moduleCompleted}/{module.lessons.length} · {module.lessons.length} lessons
                  </p>
                </div>
                <svg
                  className={cn(
                    "shrink-0 text-white/50 transition-transform duration-300",
                    isExpanded && "rotate-180"
                  )}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-in-out",
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-white/10 px-2 py-1.5">
                    {module.lessons.map((lesson) => {
                      const isActive = lesson.id === currentLessonId;
                      return (
                        <button
                          key={lesson.id}
                          disabled={lesson.locked}
                          onClick={() => onSelectLesson(module.id, lesson.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors",
                            isActive && "bg-gradient-to-r from-violet-500/20 to-cyan-500/10 ring-1 ring-violet-400/30",
                            !isActive && !lesson.locked && "active:bg-white/5",
                            lesson.locked && "opacity-45"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                              lesson.completed && "bg-emerald-500/20 text-emerald-400",
                              !lesson.completed && isActive && "bg-violet-500/25 text-violet-300",
                              !lesson.completed && !isActive && !lesson.locked && "bg-white/10 text-white/60",
                              lesson.locked && "bg-white/5 text-white/30"
                            )}
                          >
                            {lesson.locked ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="5" y="11" width="14" height="9" rx="2" />
                                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                              </svg>
                            ) : lesson.completed ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : isActive ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            ) : (
                              typeIcon[lesson.type]
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-[13px] font-medium",
                                isActive ? "text-white" : lesson.locked ? "text-white/40" : "text-white/85"
                              )}
                            >
                              {lesson.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-white/40">
                              <span className="capitalize">{lesson.type}</span>
                              <span>·</span>
                              <span>{lesson.duration}</span>
                              {isActive && <span className="ml-1 rounded-full bg-violet-500/30 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200">NOW PLAYING</span>}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
