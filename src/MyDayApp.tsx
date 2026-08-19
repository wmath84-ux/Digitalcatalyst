import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  Bell,
  CalendarClock,
  ClipboardList,
  NotebookPen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "./utils/cn";
import StoreHeader from "./components/Header";
import GreetingHeader from "./components/myday/GreetingHeader";
import TaskList from "./components/myday/TaskList";
import TaskModal from "./components/myday/TaskModal";
import Timeline from "./components/myday/Timeline";
import ScheduleModal from "./components/myday/ScheduleModal";
import QuickNotes from "./components/myday/QuickNotes";
import Reminders from "./components/myday/Reminders";
import SideNav from "./components/myday/SideNav";
import BottomNav from "./components/myday/BottomNav";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Toast from "./components/ui/Toast";
import type { ToastMessage } from "./components/ui/Toast";
import { initialNotes, initialReminders, initialSchedule, initialTasks } from "./data/sampleData";
import type { NoteColor, QuickNote, Reminder, ScheduleEvent, Task, TaskStatus } from "./types";
import { useCommerce } from "./context/CommerceContext";
import { useAuth } from "./context/AuthContext";
import { useMyDayAccess } from "./hooks/useMyDayAccess";
import PremiumGate from "./components/subscription/PremiumGate";
import { playSfxAdd, playSfxComplete, playSfxRemove, playSfxSuccess, playSfxToggle } from "./utils/sfx";

const NOTE_COLORS: NoteColor[] = ["amber", "sky", "rose", "emerald", "violet"];
type DaySection = "overview" | "tasks" | "schedule" | "reminders" | "notes";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const CREATE_OPTIONS: { id: DaySection; label: string; hint: string; icon: typeof ClipboardList }[] = [
  { id: "tasks", label: "Today Task", hint: "Plan what you need to finish today", icon: ClipboardList },
  { id: "schedule", label: "Daily Schedule", hint: "Block time for classes and study", icon: CalendarClock },
  { id: "reminders", label: "Reminder", hint: "Get pinged at the right moment", icon: Bell },
  { id: "notes", label: "Quick Note", hint: "Capture a thought in seconds", icon: NotebookPen },
];

export default function App() {
  const { cartIds } = useCommerce();
  const { user } = useAuth();
  const { hasAccess: hasMyDayAccess, uid } = useMyDayAccess();
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(() => loadFromStorage("myday_tasks", initialTasks));
  const [schedule, setSchedule] = useState<ScheduleEvent[]>(() => loadFromStorage("myday_schedule", initialSchedule));
  const [notes, setNotes] = useState<QuickNote[]>(() => loadFromStorage("myday_notes", initialNotes));
  const [reminders, setReminders] = useState<Reminder[]>(() => loadFromStorage("myday_reminders", initialReminders));

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [activeSection, setActiveSection] = useState<DaySection>("overview");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const mutatedRef = useRef(false);

  const userName = user?.name?.split(" ")[0] || "Learner";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: ToastMessage["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Same beautiful premium gate for My Day – appears when user tries to create/save
  const requireMyDayAccess = useCallback(() => {
    if (hasMyDayAccess) return true;
    setPaywallOpen(true);
    return false;
  }, [hasMyDayAccess]);

  // Keep alias for older handlers
  const canSaveMyDay = requireMyDayAccess;

  const persistMyDay = useCallback(
    (next: Partial<{ tasks: Task[]; schedule: ScheduleEvent[]; notes: QuickNote[]; reminders: Reminder[] }>) => {
      mutatedRef.current = true;
      if (!uid || !hasMyDayAccess) return;
      setDoc(
        doc(db, "users", uid, "myDay", "current"),
        {
          ...(next.tasks ? { tasks: next.tasks } : {}),
          ...(next.schedule ? { schedule: next.schedule } : {}),
          ...(next.notes ? { notes: next.notes } : {}),
          ...(next.reminders ? { reminders: next.reminders } : {}),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {
        addToast("My Day cloud save failed", "error");
      });
    },
    [addToast, hasMyDayAccess, uid],
  );

  useEffect(() => {
    if (!uid || !hasMyDayAccess) { setCloudLoaded(false); return undefined; }
    let cancelled = false;
    void getDoc(doc(db, "users", uid, "myDay", "current")).then((snapshot) => {
      if (cancelled) return;
      const data = snapshot.data() || {};
      if (!mutatedRef.current) {
        if (!snapshot.exists()) { setTasks([]); setSchedule([]); setNotes([]); setReminders([]); }
        if (Array.isArray(data.tasks)) setTasks(data.tasks as Task[]);
        if (Array.isArray(data.schedule)) setSchedule(data.schedule as ScheduleEvent[]);
        if (Array.isArray(data.notes)) setNotes(data.notes as QuickNote[]);
        if (Array.isArray(data.reminders)) setReminders(data.reminders as Reminder[]);
      }
      setCloudLoaded(true);
    }).catch(() => setCloudLoaded(false));
    return () => { cancelled = true; };
  }, [hasMyDayAccess, uid]);

  useEffect(() => {
    if (!uid || !hasMyDayAccess || !cloudLoaded) return;
    setDoc(doc(db, "users", uid, "myDay", "current"), { tasks, schedule, notes, reminders, tzOffsetMinutes: new Date().getTimezoneOffset(), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {
      addToast("My Day cloud save failed", "error");
    });
  }, [addToast, cloudLoaded, hasMyDayAccess, notes, reminders, schedule, tasks, uid]);

  useEffect(() => {
    if (!createMenuOpen) return;
    const closeOnOutsidePointer = (event: Event) => {
      const target = event.target as Node | null;
      if (target && createMenuRef.current && !createMenuRef.current.contains(target)) setCreateMenuOpen(false);
    };
    const closeOnOutsideScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && createMenuRef.current && !createMenuRef.current.contains(target)) setCreateMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("touchstart", closeOnOutsidePointer, { passive: true });
    document.addEventListener("scroll", closeOnOutsideScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", closeOnOutsideScroll, { passive: true });
    window.addEventListener("wheel", closeOnOutsideScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("touchstart", closeOnOutsidePointer);
      document.removeEventListener("scroll", closeOnOutsideScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchmove", closeOnOutsideScroll);
      window.removeEventListener("wheel", closeOnOutsideScroll);
    };
  }, [createMenuOpen]);

  const handleNavigate = useCallback((id: string) => {
    if (id === "home") {
      window.location.hash = "#/home";
      return;
    }
    setCreateMenuOpen(false);
    setActiveSection(id as DaySection);
    setHighlightId(null);
  }, []);

  useEffect(() => {
    const applyDeepLink = () => {
      const hash = window.location.hash;
      const queryIndex = hash.indexOf("?");
      const params = queryIndex >= 0 ? new URLSearchParams(hash.slice(queryIndex + 1)) : null;
      const section = params?.get("section");
      if (section === "tasks" || section === "schedule" || section === "reminders" || section === "notes") {
        setActiveSection(section);
      }
      const item = params?.get("item");
      setHighlightId(item && item.trim() ? item.trim() : null);
    };
    applyDeepLink();
    window.addEventListener("hashchange", applyDeepLink);
    return () => window.removeEventListener("hashchange", applyDeepLink);
  }, []);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmConfig({ title, message, onConfirm });
    setConfirmOpen(true);
  }, []);

  const handleToggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const newStatus: TaskStatus = t.status === "completed" ? "pending" : "completed";
        if (newStatus === "completed") { playSfxComplete(); addToast("Task completed"); }
        else playSfxToggle();
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
        if (next === "completed" && t.status !== "completed") { playSfxComplete(); addToast("Task completed"); }
        else playSfxToggle();
        return { ...t, status: next };
      }),
    );
  }, [addToast]);

  const handleDeleteTask = useCallback((id: string) => {
    showConfirm("Delete Task", "Are you sure you want to delete this task? This action cannot be undone.", () => {
      const next = tasks.filter((t) => t.id !== id);
      setTasks(next);
      persistMyDay({ tasks: next });
      playSfxRemove();
      addToast("Task deleted", "info");
      setConfirmOpen(false);
    });
  }, [addToast, persistMyDay, showConfirm, tasks]);

  const openAddTask = useCallback(() => {
    if (!requireMyDayAccess()) return;
    setEditingTask(null);
    setTaskModalOpen(true);
  }, [requireMyDayAccess]);

  const openEditTask = useCallback((task: Task) => {
    if (!requireMyDayAccess()) return;
    setEditingTask(task);
    setTaskModalOpen(true);
  }, [requireMyDayAccess]);

  const handleSaveTask = useCallback((task: Task) => {
    if (!canSaveMyDay()) return;
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      if (exists) return prev.map((t) => (t.id === task.id ? task : t));
      return [task, ...prev];
    });
    setTaskModalOpen(false);
    playSfxSuccess();
    addToast(editingTask ? "Task updated successfully" : "New task created");
  }, [addToast, canSaveMyDay, editingTask]);

  const openAddEvent = useCallback(() => {
    if (!requireMyDayAccess()) return;
    setEditingEvent(null);
    setScheduleModalOpen(true);
  }, [requireMyDayAccess]);

  const openEditEvent = useCallback((event: ScheduleEvent) => {
    if (!requireMyDayAccess()) return;
    setEditingEvent(event);
    setScheduleModalOpen(true);
  }, [requireMyDayAccess]);

  const handleSaveEvent = useCallback((event: ScheduleEvent) => {
    if (!canSaveMyDay()) return;
    setSchedule((prev) => {
      const exists = prev.some((e) => e.id === event.id);
      if (exists) return prev.map((e) => (e.id === event.id ? event : e));
      return [...prev, event];
    });
    setScheduleModalOpen(false);
    playSfxSuccess();
    addToast(editingEvent ? "Event updated" : "Event added to schedule");
  }, [addToast, canSaveMyDay, editingEvent]);

  const handleDeleteEvent = useCallback((id: string) => {
    showConfirm("Delete Event", "Remove this event from your schedule?", () => {
      const next = schedule.filter((e) => e.id !== id);
      setSchedule(next);
      persistMyDay({ schedule: next });
      playSfxRemove();
      addToast("Event removed", "info");
      setConfirmOpen(false);
    });
  }, [addToast, persistMyDay, schedule, showConfirm]);

  const handleAddNote = useCallback((text: string) => {
    if (!canSaveMyDay()) return;
    const note: QuickNote = {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    };
    setNotes((prev) => [note, ...prev]);
    playSfxAdd();
    addToast("Note saved");
  }, [addToast, canSaveMyDay]);

  const handleEditNote = useCallback((id: string, text: string) => {
    if (!canSaveMyDay()) return;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
    addToast("Note updated");
  }, [addToast, canSaveMyDay]);

  const handleDeleteNote = useCallback((id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    persistMyDay({ notes: next });
    playSfxRemove();
    addToast("Note deleted", "info");
  }, [addToast, notes, persistMyDay]);

  const handleAddReminder = useCallback((reminder: Reminder) => {
    if (!canSaveMyDay()) return;
    setReminders((prev) => [...prev, reminder]);
    playSfxAdd();
    addToast("Reminder set");
  }, [addToast, canSaveMyDay]);

  const handleEditReminder = useCallback((reminder: Reminder) => {
    if (!canSaveMyDay()) return;
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? reminder : r)));
    playSfxSuccess();
    addToast("Reminder updated");
  }, [addToast, canSaveMyDay]);

  const handleToggleReminder = useCallback((id: string) => {
    setReminders((prev) => prev.map((r) => (r.id !== id ? r : { ...r, done: !r.done })));
    playSfxToggle();
  }, []);

  const handleDeleteReminder = useCallback((id: string) => {
    showConfirm("Delete Reminder", "Remove this reminder?", () => {
      const next = reminders.filter((r) => r.id !== id);
      setReminders(next);
      persistMyDay({ reminders: next });
      playSfxRemove();
      addToast("Reminder deleted", "info");
      setConfirmOpen(false);
    });
  }, [addToast, persistMyDay, reminders, showConfirm]);

  const completedCount = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);

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

    playSfxSuccess();
    addToast("Report downloaded");
  }, [schedule, reminders, completedCount, tasks, notes, addToast]);

  const [globalSearch, setGlobalSearch] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50/80">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50/80 lg:max-w-7xl">
        <StoreHeader
          cartCount={cartIds.size}
          notifCount={1}
          title="Eduvora Taskar"
          subtitle="My Day Activities"
          onDownloadReport={handleDownloadReport}
          onToggleSearch={() => setShowMobileSearch((s) => !s)}
          searchActive={showMobileSearch || Boolean(globalSearch)}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        {showMobileSearch && (
          <div className="animate-slideUp border-b border-indigo-100 bg-white px-4 pb-3 pt-2">
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3.5 py-2.5 ring-2 ring-indigo-100">
              <Search className="h-4 w-4 shrink-0 text-indigo-500" />
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

        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pt-6 sm:px-6 lg:px-8">
          <SideNav active={activeSection} onNavigate={handleNavigate} />

          <main className="min-w-0 flex-1 pb-6">
            {activeSection === "overview" && (
              <section className="space-y-8">
                <GreetingHeader
                  name={userName}
                  completed={completedCount}
                  total={tasks.length}
                  streak={12}
                />

                <div ref={createMenuRef} className="relative flex flex-col items-center pb-8">
                  <button
                    type="button"
                    aria-label="Create item"
                    onClick={() => setCreateMenuOpen((open) => !open)}
                    className={cn(
                      "flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-300/60 transition active:scale-95",
                      createMenuOpen && "rotate-45",
                    )}
                  >
                    <Plus className="h-10 w-10" strokeWidth={2.5} />
                  </button>
                  <p className="mt-3 text-sm font-semibold text-slate-500">Add to your day</p>

                  {createMenuOpen && (
                    <div className="absolute bottom-[7.5rem] z-20 w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-2 shadow-2xl shadow-slate-300/70">
                      {CREATE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              // When user selects what to create, check access immediately
                              if (!requireMyDayAccess()) { setCreateMenuOpen(false); return; }
                              handleNavigate(option.id);
                            }}
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50"
                          >
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-slate-900">{option.label}</span>
                              <span className="block text-xs text-slate-400">{option.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeSection === "tasks" && (
              <TaskList
                tasks={tasks}
                onToggle={handleToggleTask}
                onCycleStatus={handleCycleStatus}
                onEdit={openEditTask}
                onDelete={handleDeleteTask}
                onAdd={openAddTask}
                globalSearch={globalSearch}
                highlightId={highlightId}
              />
            )}

            {activeSection === "schedule" && (
              <Timeline
                events={schedule}
                onAdd={openAddEvent}
                onEdit={openEditEvent}
                onDelete={handleDeleteEvent}
                highlightId={highlightId}
              />
            )}

            {activeSection === "reminders" && (
              <Reminders
                reminders={reminders}
                onAdd={handleAddReminder}
                onEdit={handleEditReminder}
                onToggle={handleToggleReminder}
                onDelete={handleDeleteReminder}
                highlightId={highlightId}
                onRequireAccess={requireMyDayAccess}
              />
            )}

            {activeSection === "notes" && (
              <QuickNotes
                notes={notes}
                onAdd={handleAddNote}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
                globalSearch={globalSearch}
                onRequireAccess={requireMyDayAccess}
              />
            )}
          </main>
        </div>

        <BottomNav active={activeSection} onNavigate={handleNavigate} />
      </div>

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

      {/* Premium subscription gate for My Day – same beautiful design as Revision */}
      <PremiumGate
        variant="myday"
        userName={userName}
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onViewSubscription={() => {
          setPaywallOpen(false);
          window.location.hash = "#/subscription";
        }}
        subtitle="Cloud saving has ongoing server costs. Subscribe to save tasks, schedules and notes."
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
