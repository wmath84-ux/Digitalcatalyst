import { useEffect, useMemo, useState } from "react";
import VideoPlayer from "./components/VideoPlayer";
import CircularProgress from "./components/CircularProgress";
import CurriculumTab from "./components/CurriculumTab";
import ResourcesTab from "./components/ResourcesTab";
import NotesTab from "./components/NotesTab";
import QnaTab from "./components/QnaTab";
import {
  courseSubtitle,
  courseTitle,
  initialModules,
  initialQuestions,
  initialResources,
} from "./data/mockCourse";
import type { Module, Note, Question } from "./types/course";
import { cn } from "./utils/cn";

type TabKey = "curriculum" | "resources" | "notes" | "qna";

const TABS: { key: TabKey; label: string }[] = [
  { key: "curriculum", label: "Curriculum" },
  { key: "resources", label: "Resources" },
  { key: "notes", label: "Notes" },
  { key: "qna", label: "Q&A" },
];

function flattenLessons(modules: Module[]) {
  return modules.flatMap((m) => m.lessons.map((l) => ({ moduleId: m.id, lesson: l })));
}

function findFirstActiveLesson(modules: Module[]) {
  const flat = flattenLessons(modules);
  const firstIncomplete = flat.find((f) => !f.lesson.completed && !f.lesson.locked);
  return firstIncomplete ?? flat[0];
}

let noteIdCounter = 1;
let questionIdCounter = 1;

export default function App() {
  const [modules, setModules] = useState<Module[]>(initialModules);
  const initial = useMemo(() => findFirstActiveLesson(initialModules), []);
  const [currentLessonId, setCurrentLessonId] = useState(initial.lesson.id);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set([initial.moduleId]));
  const [activeTab, setActiveTab] = useState<TabKey>("curriculum");
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const flat = useMemo(() => flattenLessons(modules), [modules]);
  const currentIndex = flat.findIndex((f) => f.lesson.id === currentLessonId);
  const currentEntry = flat[currentIndex] ?? flat[0];
  const currentModule = modules.find((m) => m.id === currentEntry.moduleId)!;
  const currentLesson = currentEntry.lesson;

  const totalLessons = flat.length;
  const completedCount = flat.filter((f) => f.lesson.completed).length;
  const progressPercent = totalLessons ? (completedCount / totalLessons) * 100 : 0;

  const lessonTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    flat.forEach((f) => (map[f.lesson.id] = f.lesson.title));
    return map;
  }, [flat]);

  const currentNotes = notes
    .filter((n) => n.lessonId === currentLesson.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  const currentQuestions = questions.filter((q) => q.lessonId === currentLesson.id);

  const selectLesson = (moduleId: string, lessonId: string) => {
    const targetModule = modules.find((m) => m.id === moduleId);
    const targetLesson = targetModule?.lessons.find((l) => l.id === lessonId);
    if (!targetLesson) return;
    if (targetLesson.locked) {
      setToast("Complete previous lessons to unlock this one");
      return;
    }
    setCurrentLessonId(lessonId);
    setExpandedModules((prev) => new Set(prev).add(moduleId));
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  const markLessonComplete = (lessonId: string, opts?: { silent?: boolean }) => {
    setModules((prevModules) => {
      const flatPrev = flattenLessons(prevModules);
      const idx = flatPrev.findIndex((f) => f.lesson.id === lessonId);
      if (idx === -1) return prevModules;
      const nextEntry = flatPrev[idx + 1];

      return prevModules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => {
          if (l.id === lessonId) return { ...l, completed: true };
          if (nextEntry && l.id === nextEntry.lesson.id) return { ...l, locked: false };
          return l;
        }),
      }));
    });
    if (!opts?.silent) setToast("Lesson marked as complete 🎉");
  };

  const handleMarkComplete = () => {
    if (currentLesson.completed) {
      setModules((prev) =>
        prev.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => (l.id === currentLesson.id ? { ...l, completed: false } : l)),
        }))
      );
      setToast("Marked as incomplete");
      return;
    }
    markLessonComplete(currentLesson.id);
  };

  const goToOffset = (offset: number) => {
    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= flat.length) return;
    const target = flat[targetIndex];
    if (target.lesson.locked) {
      setToast("Finish the current lesson to unlock the next one");
      return;
    }
    setCurrentLessonId(target.lesson.id);
    setExpandedModules((prev) => new Set(prev).add(target.moduleId));
  };

  const handleAddNote = (text: string) => {
    const newNote: Note = {
      id: `note-${noteIdCounter++}`,
      lessonId: currentLesson.id,
      text,
      timestamp: new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      createdAt: Date.now(),
    };
    setNotes((prev) => [newNote, ...prev]);
  };

  const handleUpdateNote = (id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleAskQuestion = (text: string) => {
    const newQuestion: Question = {
      id: `question-${questionIdCounter++}`,
      lessonId: currentLesson.id,
      author: "You",
      avatarColor: "#8b5cf6",
      text,
      timeAgo: "Just now",
      likes: 0,
      liked: false,
      replies: [],
    };
    setQuestions((prev) => [newQuestion, ...prev]);
  };

  const handleToggleLike = (id: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, liked: !q.liked } : q)));
  };

  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= flat.length - 1;

  return (
    <div className="min-h-screen w-full bg-[#050509] font-[system-ui] sm:flex sm:items-center sm:justify-center sm:p-6">
      <div className="relative mx-auto flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#0c0c14] text-white sm:h-[860px] sm:rounded-[2.75rem] sm:ring-[10px] sm:ring-black/70 sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        {/* Mock status bar */}
        <div className="hidden shrink-0 items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-white sm:flex">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <svg width="14" height="10" viewBox="0 0 16 12" fill="currentColor"><rect width="3" height="5" y="7" rx="0.5"/><rect width="3" height="7" x="4.5" y="5" rx="0.5"/><rect width="3" height="9" x="9" y="3" rx="0.5"/><rect width="3" height="12" x="13" y="0" rx="0.5"/></svg>
            <svg width="14" height="10" viewBox="0 0 24 16" fill="currentColor"><path d="M12 4c3.5 0 6.6 1.4 8.8 3.7l-2 2A9 9 0 0 0 12 7a9 9 0 0 0-6.8 2.7l-2-2C5.4 5.4 8.5 4 12 4Zm0 5c1.8 0 3.4.7 4.6 1.9l-2 2A4 4 0 0 0 12 12a4 4 0 0 0-2.6 1l-2-2A6.5 6.5 0 0 1 12 9Zm0 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z"/></svg>
            <svg width="22" height="11" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="20" height="11" rx="2.5" stroke="currentColor"/><rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor"/><rect x="22" y="4" width="2" height="4" rx="1" fill="currentColor"/></svg>
          </div>
        </div>

        {/* Video Player */}
        <VideoPlayer
          key={currentLesson.id}
          lesson={currentLesson}
          moduleTitle={currentModule.title}
          onAutoComplete={() => markLessonComplete(currentLesson.id, { silent: true })}
        />

        {/* Header: title + progress */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-3">
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 active:bg-white/10"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight text-white">{courseTitle}</p>
            <p className="truncate text-[11px] text-white/40">{courseSubtitle}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <CircularProgress percent={progressPercent} />
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-b border-white/8 px-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative shrink-0 px-3.5 py-3 text-[13px] font-semibold transition-colors",
                  activeTab === tab.key ? "text-white" : "text-white/40"
                )}
              >
                {tab.label}
                {tab.key === "notes" && currentNotes.length > 0 && (
                  <span className="ml-1 rounded-full bg-violet-500/30 px-1.5 py-0.5 text-[9px] text-violet-200">
                    {currentNotes.length}
                  </span>
                )}
                {tab.key === "qna" && currentQuestions.length > 0 && (
                  <span className="ml-1 rounded-full bg-cyan-500/30 px-1.5 py-0.5 text-[9px] text-cyan-200">
                    {currentQuestions.length}
                  </span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-2 -bottom-[1px] h-[2.5px] rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {activeTab === "curriculum" && (
            <CurriculumTab
              modules={modules}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              expandedModules={expandedModules}
              onToggleModule={toggleModule}
              currentLessonId={currentLesson.id}
              onSelectLesson={selectLesson}
            />
          )}
          {activeTab === "resources" && (
            <ResourcesTab
              resources={initialResources}
              currentLessonId={currentLesson.id}
              lessonTitleById={lessonTitleById}
            />
          )}
          {activeTab === "notes" && (
            <NotesTab
              notes={currentNotes}
              lessonTitle={currentLesson.title}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
            />
          )}
          {activeTab === "qna" && (
            <QnaTab
              questions={currentQuestions}
              lessonTitle={currentLesson.title}
              onAskQuestion={handleAskQuestion}
              onToggleLike={handleToggleLike}
            />
          )}
        </div>

        {/* Bottom progression controls */}
        <div className="shrink-0 border-t border-white/8 bg-[#0c0c14]/95 px-4 py-3 backdrop-blur">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <button
              onClick={() => goToOffset(-1)}
              disabled={isFirst}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/70 disabled:opacity-30 active:bg-white/10"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Previous
            </button>

            <button
              onClick={handleMarkComplete}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold shadow-lg transition-all active:scale-[0.98]",
                currentLesson.completed
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/40"
                  : "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-violet-900/40"
              )}
            >
              {currentLesson.completed ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Completed
                </>
              ) : (
                "Mark as Complete"
              )}
            </button>

            <button
              onClick={() => goToOffset(1)}
              disabled={isLast}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/70 disabled:opacity-30 active:bg-white/10"
            >
              Next
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[10.5px] text-white/30">
            Lesson {currentIndex + 1} of {flat.length} · {completedCount} completed · {Math.round(progressPercent)}% course progress
          </p>
        </div>

        {/* Toast */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-24 flex justify-center transition-all duration-300",
            toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          )}
        >
          <div className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-slate-900 shadow-xl">
            {toast}
          </div>
        </div>
      </div>
    </div>
  );
}
