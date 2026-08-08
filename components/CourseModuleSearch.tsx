import React, { useMemo, useRef, useState } from 'react';
import type { CourseModuleSearchItem } from './CoursePlayer';

interface CourseModuleSearchProps {
  productTitle: string;
  items: CourseModuleSearchItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: CourseModuleSearchItem) => void;
  onClose: () => void;
}

const CourseModuleSearch: React.FC<CourseModuleSearchProps> = ({
  productTitle,
  items,
  query,
  onQueryChange,
  onSelect,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value: string) => !normalizedQuery || value.toLowerCase().includes(normalizedQuery);

  const modules = useMemo(() => items.filter(item => item.kind === 'module'), [items]);
  const lessons = useMemo(() => items.filter(item => item.kind === 'lesson'), [items]);

  const visibleModules = useMemo(() => modules.filter(module =>
    matches(module.title) || lessons.some(lesson => lesson.moduleId === module.id && matches(lesson.title))
  ), [modules, lessons, normalizedQuery]);

  const visibleLessonsForModule = (moduleId: string, moduleTitle: string) => {
    const moduleLessons = lessons.filter(lesson => lesson.moduleId === moduleId);
    if (normalizedQuery) return moduleLessons.filter(lesson => matches(lesson.title) || matches(moduleTitle));
    return expandedIds[moduleId] ? moduleLessons : [];
  };

  const totalMatches = useMemo(() => {
    if (!normalizedQuery) return items.length;
    return visibleModules.reduce((total, module) => total + 1 + visibleLessonsForModule(module.id, module.title).length, 0);
  }, [visibleModules, lessons, normalizedQuery]);

  React.useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  const toggleModule = (moduleId: string) => {
    setExpandedIds(previous => ({ ...previous, [moduleId]: !previous[moduleId] }));
  };

  return (
    <section className="course-module-search fixed inset-0 z-[85] flex min-h-0 flex-col bg-[#F4F6FF] text-[#0B1631] md:hidden" aria-label={`Search ${productTitle} modules`}>
      <style>{`
        @keyframes course-search-item-in {
          from { opacity: 0; transform: translateY(9px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .course-search-item-animate { animation: none !important; }
        }
      `}</style>
      <header className="sticky top-0 z-20 border-b border-[#DDE3F2] bg-white/96 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_10px_30px_rgba(11,22,49,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Close module search" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#DDE3F2] bg-white text-xl font-black text-[#0B1631] shadow-sm transition active:scale-95">←</button>
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#C9D4F0] bg-[#F8FAFF] px-3 focus-within:border-[#5B4BFF] focus-within:ring-4 focus-within:ring-[#5B4BFF]/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="11" cy="11" r="7" /><path d="M20.5 20.5l-4.35-4.35" /></svg>
            <input ref={inputRef} type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search lessons, topics or modules..." aria-label="Search course modules live" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-black outline-none placeholder:text-[#8A94A8]" />
            {query ? <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-black text-[#0B1631] shadow-sm">×</button> : null}
          </label>
        </div>
        <p className="mt-2 px-1 text-[11px] font-bold text-[#64708F]">Live search filters every lesson the moment you type — even a single letter.</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 custom-scrollbar">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-black text-[#0B1631]">{normalizedQuery ? 'Search results' : productTitle}</h2>
          <span className="text-xs font-black text-[#64708F]">{totalMatches} {totalMatches === 1 ? 'item' : 'items'}</span>
        </div>

        {visibleModules.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[#C9D4F0] bg-white px-5 py-14 text-center">
            <div className="text-4xl">🔎</div>
            <h3 className="mt-3 text-lg font-black text-[#0B1631]">No matching lessons</h3>
            <p className="mt-2 text-sm font-semibold text-[#64708F]">Try a shorter word, another spelling or a topic keyword.</p>
          </div>
        ) : (
          <div key={`course-search-${query}`} className="space-y-2">
            {visibleModules.map((module, moduleIndex) => {
              const isExpanded = Boolean(expandedIds[module.id]);
              const lessonRows = visibleLessonsForModule(module.id, module.title);
              return (
                <div key={module.id} className="course-search-item-animate" style={{ animation: 'course-search-item-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: `${moduleIndex * 28}ms` }}>
                  <button
                    type="button"
                    onClick={() => toggleModule(module.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#DDE3F2] bg-white px-3 py-2.5 text-left shadow-[0_8px_24px_rgba(11,22,49,0.05)] transition hover:border-[#C9C2FF] hover:bg-[#F7F5FF] active:scale-[0.995]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#F1EEFF] text-[#5B4BFF] ring-1 ring-[#C9C2FF]/60">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75h6.75v6.75H3.75V3.75zM13.5 3.75h6.75v6.75H13.5V3.75zM3.75 13.5h6.75v6.75H3.75V13.5zM13.5 13.5h6.75v6.75H13.5V13.5z" /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-black text-[#0B1631]">{module.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-bold text-[#64708F]">{module.subtitle}{module.locked ? ' · 🔒 Locked' : ''}</span>
                    </span>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F1EEFF] text-sm font-black text-[#5B4BFF] transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                  </button>

                  {lessonRows.length > 0 && (
                    <div className="mt-1.5 space-y-1.5 pl-3.5">
                      {lessonRows.map((lesson, lessonIndex) => (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => onSelect(lesson)}
                          disabled={Boolean(lesson.locked)}
                          className="course-search-item-animate flex w-full items-center gap-3 rounded-xl border border-[#E4E9F5] bg-white/95 px-3 py-2 text-left shadow-[0_6px_18px_rgba(11,22,49,0.04)] transition hover:border-[#5B4BFF] hover:bg-[#F7F5FF] active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-[#E4E9F5] disabled:hover:bg-white/95"
                          style={{ animation: 'course-search-item-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: `${(moduleIndex * 28) + (lessonIndex + 1) * 24}ms` }}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#F0F4FF] text-sm">{lesson.icon || '📄'}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] font-black ${lesson.active ? 'text-[#5B4BFF]' : 'text-[#0B1631]'}`}>{lesson.title}{lesson.active ? ' · Now' : ''}</span>
                            <span className="mt-0.5 block truncate text-[10px] font-bold text-[#8A94A8]">{lesson.subtitle}</span>
                          </span>
                          {lesson.locked ? <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">🔒</span> : <span className="shrink-0 text-[#5B4BFF]">›</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default CourseModuleSearch;
