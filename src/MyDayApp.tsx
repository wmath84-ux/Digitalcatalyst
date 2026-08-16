import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  Bell,
  CalendarClock,
  ClipboardList,
  Download,
  LayoutGrid,
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
import { useMyDayAccess } from "./hooks/useMyDayAccess";
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
  // Item id a notification deep-linked to (via #/my-day?section=…&item=…).
  // The section opens and the matching card is scrolled into view + ringed.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  // Set true once the user mutates My Day locally (add/edit/delete/toggle).
  // Prevents the in-flight cloud load from clobbering a change the user made
  // before the initial Firestore read finished.
  const mutatedRef = useRef(false);

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

  const canSaveMyDay = useCallback(() => {
    if (hasMyDayAccess) return true;
    setPaywallOpen(true);
    return false;
  }, [hasMyDayAccess]);

  // Write the current My Day arrays to Firestore. Used as write-through on
  // deletes (and any mutation) so a removal is persisted to the cloud
  // immediately — not just reflected in local state. Best-effort: a failed
  // write must never block the UI.
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
        // A failed cloud write must never block the UI, but it must also
        // never fail silently — otherwise a My Day save can be lost without
        // the user ever knowing. Surface it so this class of bug can't
        // regress invisibly again.
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
      // If the user already made a change (e.g. deleted an item) while the
      // read was in flight, keep their local state — do not resurrect a
      // just-deleted item from the older cloud snapshot.
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

  // Close the "Add to your day" menu when the user taps/clicks outside it, or
  // scrolls anywhere outside the menu (page scroll, a scroll container, or a
  // touch drag). Selecting an option already closes it via handleNavigate.
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

  // Notification deep links land on #/my-day?section=<tab>&item=<id>. Apply
  // the section on mount and whenever the hash changes (e.g. the user taps a
  // notification from another tab of the same app), and hand the item id to
  // the section component so it can scroll to + highlight the exact item.
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
    setEditingTask(null);
    setTaskModalOpen(true);
  }, []);

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskModalOpen(true);
  }, []);

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
    setEditingEvent(null);
    setScheduleModalOpen(true);
  }, []);

  const openEditEvent = useCallback((event: ScheduleEvent) => {
    setEditingEvent(event);
    setScheduleModalOpen(true);
  }, []);

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
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? reminder : r)));
    playSfxSuccess();
    addToast("Reminder updated");
  }, [addToast]);

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
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        {/* The My Day toolbar remains independently sticky directly below
            the 68px store header, so neither header covers the other. */}
        <header className="sticky top-[68px] z-20 border-b border-slate-100 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200">
                <LayoutGrid className="h-[18px] w-[18px]" />
              </div>
              <div>
                <span className="text-sm font-extrabold tracking-tight text-slate-900">Eduvora Tasker</span>
                <p className="-mt-0.5 text-[10px] font-medium text-slate-400">My Day</p>
              </div>
            </div>

            <h1 className="hidden text-lg font-bold text-slate-900 lg:block">My Day</h1>

            <div className="flex items-center gap-2 sm:gap-3">
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
              <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 transition-all focus-within:bg-white focus-within:shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 sm:flex">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
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
                onClick={() => { window.location.hash = "#/notifications"; }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <Bell className="h-[18px] w-[18px]" />
                {reminders.filter((r) => !r.done).length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
                    {reminders.filter((r) => !r.done).length}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label="Profile"
                onClick={() => { window.location.hash = "#/profile"; }}
                className="h-9 w-9 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-md ring-2 ring-white"
              >
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                  AV
                </div>
              </button>
            </div>
          </div>

          {showMobileSearch && (
            <div className="animate-slideUp px-4 pb-3 sm:hidden">
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
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pt-6 sm:px-6 lg:px-8">
          <SideNav active={activeSection} onNavigate={handleNavigate} />

          <main className="min-w-0 flex-1 pb-6">
            {activeSection === "overview" && (
              <section className="space-y-8">
                <GreetingHeader
                  name="Aarav"
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
                            onClick={() => handleNavigate(option.id)}
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
              />
            )}

            {activeSection === "notes" && (
              <QuickNotes
                notes={notes}
                onAdd={handleAddNote}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
                globalSearch={globalSearch}
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

      {paywallOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 px-5" onClick={() => setPaywallOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900">My Day cloud saving</h2>
            <p className="mt-2 text-sm leading-5 text-slate-500">Cloud saving has ongoing server costs. Subscribe to save tasks, schedules and notes.</p>
            <button onClick={() => { window.location.hash = "#/subscription"; }} className="mt-5 w-full rounded-2xl bg-violet-600 py-3 text-sm font-black text-white">View subscription</button>
            <button onClick={() => setPaywallOpen(false)} className="mt-2 w-full py-2 text-xs font-bold text-slate-400">Not now</button>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
