import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Download, LayoutGrid, Search, X } from "lucide-react";
import { cn } from "./utils/cn";
import GreetingHeader from "./components/myday/GreetingHeader";
import TaskList from "./components/myday/TaskList";
import TaskModal from "./components/myday/TaskModal";
import Timeline from "./components/myday/Timeline";
import ScheduleModal from "./components/myday/ScheduleModal";
import QuickNotes from "./components/myday/QuickNotes";
import Reminders from "./components/myday/Reminders";
import EduCoins from "./components/myday/EduCoins";
import SideNav from "./components/myday/SideNav";
import BottomNav from "./components/myday/BottomNav";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Toast from "./components/ui/Toast";
import type { ToastMessage } from "./components/ui/Toast";
import { initialNotes, initialReminders, initialSchedule, initialTasks } from "./data/sampleData";
import type { NoteColor, QuickNote, Reminder, ScheduleEvent, Task, TaskStatus } from "./types";

// ─── Helpers ──────────────────────────────────────────────────
const NOTE_COLORS: NoteColor[] = ["amber", "sky", "rose", "emerald", "violet"];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

const COINS_PER_TASK = 15;
const COINS_PER_NOTE = 2;
const COINS_PER_REMINDER = 5;

// ─── Component ────────────────────────────────────────────────
export default function App() {
  // ── Core state ──────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>(() => loadFromStorage("myday_tasks", initialTasks));
  const [schedule, setSchedule] = useState<ScheduleEvent[]>(() => loadFromStorage("myday_schedule", initialSchedule));
  const [notes, setNotes] = useState<QuickNote[]>(() => loadFromStorage("myday_notes", initialNotes));
  const [reminders, setReminders] = useState<Reminder[]>(() => loadFromStorage("myday_reminders", initialReminders));
  const [bonusCoins, setBonusCoins] = useState<number>(() => loadFromStorage("myday_bonus_coins", 0));

  // ── UI state ────────────────────────────────────────────────
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [activeSection, setActiveSection] = useState("overview");

  // ── Confirm dialog state ────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // ── Toast state ─────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: ToastMessage["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Persist to localStorage ─────────────────────────────────
  useEffect(() => { persist("myday_tasks", tasks); }, [tasks]);
  useEffect(() => { persist("myday_schedule", schedule); }, [schedule]);
  useEffect(() => { persist("myday_notes", notes); }, [notes]);
  useEffect(() => { persist("myday_reminders", reminders); }, [reminders]);
  useEffect(() => { persist("myday_bonus_coins", bonusCoins); }, [bonusCoins]);

  // ── Scroll spy ──────────────────────────────────────────────
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    overview: useRef<HTMLDivElement>(null),
    tasks: useRef<HTMLDivElement>(null),
    schedule: useRef<HTMLDivElement>(null),
    notes: useRef<HTMLDivElement>(null),
    reminders: useRef<HTMLDivElement>(null),
    rewards: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    Object.values(sectionRefs).forEach((ref) => {
      if (ref.current) observer.observe(ref.current);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigate = useCallback((id: string) => {
    const ref = sectionRefs[id];
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Confirm wrapper ─────────────────────────────────────────
  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmConfig({ title, message, onConfirm });
    setConfirmOpen(true);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // TASK HANDLERS
  // ═══════════════════════════════════════════════════════════
  const handleToggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const newStatus: TaskStatus = t.status === "completed" ? "pending" : "completed";
        if (newStatus === "completed") {
          setBonusCoins((c) => c + COINS_PER_TASK);
          addToast(`+${COINS_PER_TASK} EduCoins earned! 🎉`);
        }
        return { ...t, status: newStatus };
      }),
    );
  }, [addToast]);

  const handleCycleStatus = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const cycle: TaskStatus[] = ["pending", "in-progress", "completed"];
        const idx = cycle.indexOf(t.status);
        const next = cycle[(idx + 1) % cycle.length];
        if (next === "completed" && t.status !== "completed") {
          setBonusCoins((c) => c + COINS_PER_TASK);
          addToast(`+${COINS_PER_TASK} EduCoins earned! 🎉`);
        }
        return { ...t, status: next };
      }),
    );
  }, [addToast]);

  const handleDeleteTask = useCallback((id: string) => {
    showConfirm("Delete Task", "Are you sure you want to delete this task? This action cannot be undone.", () => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      addToast("Task deleted", "info");
      setConfirmOpen(false);
    });
  }, [addToast, showConfirm]);

  const openAddTask = useCallback(() => {
    setEditingTask(null);
    setTaskModalOpen(true);
  }, []);

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskModalOpen(true);
  }, []);

  const handleSaveTask = useCallback((task: Task) => {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      if (exists) return prev.map((t) => (t.id === task.id ? task : t));
      setBonusCoins((c) => c + COINS_PER_TASK);
      return [task, ...prev];
    });
    setTaskModalOpen(false);
    addToast(editingTask ? "Task updated successfully" : "New task created! 🎯");
  }, [addToast, editingTask]);

  // ═══════════════════════════════════════════════════════════
  // SCHEDULE HANDLERS
  // ═══════════════════════════════════════════════════════════
  const openAddEvent = useCallback(() => {
    setEditingEvent(null);
    setScheduleModalOpen(true);
  }, []);

  const openEditEvent = useCallback((event: ScheduleEvent) => {
    setEditingEvent(event);
    setScheduleModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback((event: ScheduleEvent) => {
    setSchedule((prev) => {
      const exists = prev.some((e) => e.id === event.id);
      if (exists) return prev.map((e) => (e.id === event.id ? event : e));
      return [...prev, event];
    });
    setScheduleModalOpen(false);
    addToast(editingEvent ? "Event updated" : "Event added to schedule! 📅");
  }, [addToast, editingEvent]);

  const handleDeleteEvent = useCallback((id: string) => {
    showConfirm("Delete Event", "Remove this event from your schedule?", () => {
      setSchedule((prev) => prev.filter((e) => e.id !== id));
      addToast("Event removed", "info");
      setConfirmOpen(false);
    });
  }, [addToast, showConfirm]);

  // ═══════════════════════════════════════════════════════════
  // NOTE HANDLERS
  // ═══════════════════════════════════════════════════════════
  const handleAddNote = useCallback((text: string) => {
    const note: QuickNote = {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    };
    setNotes((prev) => [note, ...prev]);
    setBonusCoins((c) => c + COINS_PER_NOTE);
    addToast("Note saved ✏️");
  }, [addToast]);

  const handleEditNote = useCallback((id: string, text: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, text } : n)),
    );
    addToast("Note updated");
  }, [addToast]);

  const handleDeleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    addToast("Note deleted", "info");
  }, [addToast]);

  // ═══════════════════════════════════════════════════════════
  // REMINDER HANDLERS
  // ═══════════════════════════════════════════════════════════
  const handleAddReminder = useCallback((reminder: Reminder) => {
    setReminders((prev) => [...prev, reminder]);
    setBonusCoins((c) => c + COINS_PER_REMINDER);
    addToast("Reminder set! ⏰");
  }, [addToast]);

  const handleEditReminder = useCallback((reminder: Reminder) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === reminder.id ? reminder : r)),
    );
    addToast("Reminder updated");
  }, [addToast]);

  const handleToggleReminder = useCallback((id: string) => {
    setReminders((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (!r.done) {
          setBonusCoins((c) => c + COINS_PER_REMINDER);
          addToast(`+${COINS_PER_REMINDER} EduCoins! Reminder completed ✅`);
        }
        return { ...r, done: !r.done };
      }),
    );
  }, [addToast]);

  const handleDeleteReminder = useCallback((id: string) => {
    showConfirm("Delete Reminder", "Remove this reminder?", () => {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      addToast("Reminder deleted", "info");
      setConfirmOpen(false);
    });
  }, [addToast, showConfirm]);

  // ═══════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════
  const completedCount = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);
  const totalCoins = useMemo(() => 2480 + bonusCoins, [bonusCoins]);
  const earnedToday = useMemo(() => {
    const taskCoins = completedCount * COINS_PER_TASK;
    return taskCoins + bonusCoins;
  }, [completedCount, bonusCoins]);

  const handleDownloadReport = useCallback(() => {
    const date = new Date();
    const dateStamp = date.toISOString().split("T")[0];
    const printableDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const sortedSchedule = [...schedule].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const sortedReminders = [...reminders].sort((a, b) => a.time.localeCompare(b.time));

    const report = [
      "MY DAY REPORT",
      `Date: ${printableDate}`,
      "",
      "SUMMARY",
      `- Tasks completed: ${completedCount}/${tasks.length}`,
      `- EduCoins total: ${totalCoins}`,
      `- EduCoins earned today: ${earnedToday}`,
      `- Notes count: ${notes.length}`,
      `- Pending reminders: ${reminders.filter((r) => !r.done).length}`,
      `- Schedule events: ${schedule.length}`,
      "",
      "TASKS",
      ...tasks.map(
        (task, index) =>
          `${index + 1}. [${task.status.toUpperCase()}] ${task.title}${task.subject ? ` (${task.subject})` : ""}${task.time ? ` @ ${task.time}` : ""}`,
      ),
      "",
      "SCHEDULE",
      ...sortedSchedule.map(
        (event, index) =>
          `${index + 1}. ${event.startTime}-${event.endTime} [${event.type.toUpperCase()}] ${event.title}${event.detail ? ` - ${event.detail}` : ""}`,
      ),
      "",
      "REMINDERS",
      ...sortedReminders.map(
        (reminder, index) =>
          `${index + 1}. [${reminder.done ? "DONE" : "PENDING"}] ${reminder.time} - ${reminder.text}`,
      ),
      "",
      "QUICK NOTES",
      ...notes.map((note, index) => `${index + 1}. ${note.text}`),
    ].join("\n");

    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `my-day-report-${dateStamp}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    addToast("Report downloaded");
  }, [schedule, reminders, completedCount, tasks, totalCoins, earnedToday, notes, addToast]);

  // ── Global search ───────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50/80 pb-24 lg:pb-8">
      {/* ═══════ Top Bar ═══════ */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo (mobile) */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200">
              <LayoutGrid className="h-[18px] w-[18px]" />
            </div>
            <div>
              <span className="text-sm font-extrabold text-slate-900 tracking-tight">EduSpace</span>
              <p className="text-[10px] text-slate-400 font-medium -mt-0.5">My Day</p>
            </div>
          </div>

          {/* Title (desktop) */}
          <h1 className="hidden text-lg font-bold text-slate-900 lg:block">My Day</h1>

          {/* Search + Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile search button */}
            <button
              onClick={() => setShowMobileSearch((s) => !s)}
              aria-label="Search"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition sm:hidden",
                showMobileSearch || globalSearch
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              )}
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            {/* Desktop search */}
            <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 sm:flex transition-all focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 focus-within:shadow-sm">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search tasks, notes..."
                className="w-40 bg-transparent text-sm text-slate-600 outline-none placeholder:text-slate-400 lg:w-56"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch("")}
                  className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={handleDownloadReport}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-2.5 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-800 sm:px-3"
              aria-label="Download report"
            >
              <Download className="h-4 w-4" />
              <span className="hidden text-xs font-semibold sm:inline">Report</span>
            </button>
            <button
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            >
              <Bell className="h-[18px] w-[18px]" />
              {reminders.filter((r) => !r.done).length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
                  {reminders.filter((r) => !r.done).length}
                </span>
              )}
            </button>
            <div className="h-9 w-9 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 ring-2 ring-white shadow-md">
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                AV
              </div>
            </div>
          </div>
        </div>

        {/* Mobile search bar (expandable) */}
        {showMobileSearch && (
          <div className="px-4 pb-3 sm:hidden animate-slideUp">
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3.5 py-2.5 ring-2 ring-indigo-100">
              <Search className="h-4 w-4 text-indigo-500 shrink-0" />
              <input
                autoFocus
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search tasks, notes..."
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {globalSearch && (
                <button
                  onClick={() => { setGlobalSearch(""); setShowMobileSearch(false); }}
                  className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ═══════ Main Layout ═══════ */}
      <div className="mx-auto flex max-w-7xl gap-6 px-4 pt-6 sm:px-6 lg:px-8">
        <SideNav active={activeSection} onNavigate={handleNavigate} />

        <main className="min-w-0 flex-1 space-y-6">
          {/* ── Overview / Greeting ── */}
          <section id="overview" ref={sectionRefs.overview} className="scroll-mt-20">
            <GreetingHeader
              name="Aarav"
              completed={completedCount}
              total={tasks.length}
              streak={12}
              coins={totalCoins}
            />
          </section>

          {/* ── Main grid ── */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Left column */}
            <div className="space-y-6 xl:col-span-2">
              <section id="tasks" ref={sectionRefs.tasks} className="scroll-mt-20">
                <TaskList
                  tasks={tasks}
                  onToggle={handleToggleTask}
                  onCycleStatus={handleCycleStatus}
                  onEdit={openEditTask}
                  onDelete={handleDeleteTask}
                  onAdd={openAddTask}
                  globalSearch={globalSearch}
                />
              </section>

              <section id="schedule" ref={sectionRefs.schedule} className="scroll-mt-20">
                <Timeline
                  events={schedule}
                  onAdd={openAddEvent}
                  onEdit={openEditEvent}
                  onDelete={handleDeleteEvent}
                />
              </section>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <section id="rewards" ref={sectionRefs.rewards} className="scroll-mt-20">
                <EduCoins
                  totalCoins={totalCoins}
                  earnedToday={earnedToday}
                  streak={12}
                  tasksCompleted={completedCount}
                  totalTasks={tasks.length}
                  weeklyActivity={[60, 75, 45, 90, 65, 30, 20]}
                />
              </section>

              <section id="notes" ref={sectionRefs.notes} className="scroll-mt-20">
                <QuickNotes
                  notes={notes}
                  onAdd={handleAddNote}
                  onEdit={handleEditNote}
                  onDelete={handleDeleteNote}
                  globalSearch={globalSearch}
                />
              </section>

              <section id="reminders" ref={sectionRefs.reminders} className="scroll-mt-20">
                <Reminders
                  reminders={reminders}
                  onAdd={handleAddReminder}
                  onEdit={handleEditReminder}
                  onToggle={handleToggleReminder}
                  onDelete={handleDeleteReminder}
                />
              </section>
            </div>
          </div>
        </main>
      </div>

      {/* ═══════ Bottom Nav (mobile) ═══════ */}
      <BottomNav active={activeSection} onNavigate={handleNavigate} />

      {/* ═══════ Modals ═══════ */}
      <TaskModal
        open={taskModalOpen}
        initialTask={editingTask}
        onClose={() => setTaskModalOpen(false)}
        onSave={handleSaveTask}
      />

      <ScheduleModal
        open={scheduleModalOpen}
        initialEvent={editingEvent}
        onClose={() => setScheduleModalOpen(false)}
        onSave={handleSaveEvent}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
