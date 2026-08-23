import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveMyDayData } from "./lib/myDayClient";
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
import { useBranding } from "./context/BrandingContext";
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
  const { appName } = useBranding();
  const {
    hasAccess: hasMyDayAccess,
    canCreate: canCreateMyDay,
    freeLimit,
    uid,
    setAccess: setMyDayAccess,
    refresh: refreshMyDay,
  } = useMyDayAccess();
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
  const [savingMyDay, setSavingMyDay] = useState(false);

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

  // Non-subscribers may create the Admin-configured free number of items.
  // After today's allowance is consumed, My Day remains browseable and the
  // same polished subscription gate returns for every CREATE action.
  //
  // IMPORTANT: Editing and deleting existing items is ALWAYS allowed.
  // A user who has already created items (within their free limit or paid)
  // must be able to manage those items without hitting a paywall.
  const requireMyDayAccess = useCallback(() => {
    if (hasMyDayAccess || canCreateMyDay) return true;
    setPaywallOpen(true);
    return false;
  }, [canCreateMyDay, hasMyDayAccess]);

  // canSaveMyDay allows editing, deleting, toggling existing items.
  // Only creation of NEW items requires a check against free limit.
  const canSaveMyDay = useCallback(() => {
    // All users (free or paid) can save/edit/delete existing items.
    // The server will handle any creation limits server-side.
    return true;
  }, []);

  const applyCloudData = useCallback((data: { tasks: Task[]; schedule: ScheduleEvent[]; notes: QuickNote[]; reminders: Reminder[] }) => {
    setTasks(data.tasks);
    setSchedule(data.schedule);
    setNotes(data.notes);
    setReminders(data.reminders);
    try {
      localStorage.setItem("myday_tasks", JSON.stringify(data.tasks));
      localStorage.setItem("myday_schedule", JSON.stringify(data.schedule));
      localStorage.setItem("myday_notes", JSON.stringify(data.notes));
      localStorage.setItem("myday_reminders", JSON.stringify(data.reminders));
    } catch {
      // Cloud remains authoritative when local storage is unavailable.
    }
  }, []);

  // The API transaction is the only writer to the users/{uid}/myDay collection.
  const persistMyDay = useCallback(async (
    next: Partial<{ tasks: Task[]; schedule: ScheduleEvent[]; notes: QuickNote[]; reminders: Reminder[] }>,
  ): Promise<boolean> => {
    if (!uid || savingMyDay) return false;
    setSavingMyDay(true);
    try {
      const result = await saveMyDayData(next, {
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      applyCloudData(result.data);
      setMyDayAccess(result.access);
      setCloudLoaded(true);
      return true;
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
      if (code === "MYDAY_DAILY_FREE_USED") setPaywallOpen(true);
      addToast(err instanceof Error ? err.message : "My Day cloud save failed", "error");
      return false;
    } finally {
      setSavingMyDay(false);
    }
  }, [addToast, applyCloudData, savingMyDay, setMyDayAccess, uid]);

  useEffect(() => {
    if (!uid) { setCloudLoaded(false); return; }
    let cancelled = false;
    void refreshMyDay().then((result) => {
      if (cancelled || !result) return;
      applyCloudData(result.data);
      setCloudLoaded(true);
    });
    return () => { cancelled = true; };
  }, [applyCloudData, refreshMyDay, uid]);

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
    if (!canSaveMyDay()) return;
    const next = tasks.map((task) => task.id !== id ? task : {
      ...task,
      status: (task.status === "completed" ? "pending" : "completed") as TaskStatus,
    });
    const changed = next.find((task) => task.id === id);
    void persistMyDay({ tasks: next }).then((saved) => {
      if (!saved) return;
      if (changed?.status === "completed") { playSfxComplete(); addToast("Task completed"); }
      else playSfxToggle();
    });
  }, [addToast, canSaveMyDay, persistMyDay, tasks]);

  const handleCycleStatus = useCallback((id: string) => {
    if (!canSaveMyDay()) return;
    const cycle: TaskStatus[] = ["pending", "in-progress", "completed"];
    let changed: TaskStatus | null = null;
    const next = tasks.map((task) => {
      if (task.id !== id) return task;
      const status = cycle[(cycle.indexOf(task.status) + 1) % cycle.length];
      changed = status;
      return { ...task, status };
    });
    void persistMyDay({ tasks: next }).then((saved) => {
      if (!saved) return;
      if (changed === "completed") { playSfxComplete(); addToast("Task completed"); }
      else playSfxToggle();
    });
  }, [addToast, canSaveMyDay, persistMyDay, tasks]);

  const handleDeleteTask = useCallback((id: string) => {
    if (!canSaveMyDay()) return;
    showConfirm("Delete Task", "Are you sure you want to delete this task? This action cannot be undone.", () => {
      const next = tasks.filter((task) => task.id !== id);
      void persistMyDay({ tasks: next }).then((saved) => {
        if (!saved) return;
        playSfxRemove();
        addToast("Task deleted", "info");
        setConfirmOpen(false);
      });
    });
  }, [addToast, canSaveMyDay, persistMyDay, showConfirm, tasks]);

  const openAddTask = useCallback(() => {
    if (!requireMyDayAccess()) return;
    setEditingTask(null);
    setTaskModalOpen(true);
  }, [requireMyDayAccess]);

  const openEditTask = useCallback((task: Task) => {
    if (!canSaveMyDay()) return;
    setEditingTask(task);
    setTaskModalOpen(true);
  }, [canSaveMyDay]);

  const handleSaveTask = useCallback((task: Task) => {
    // Check access for NEW task creation only. Editing existing tasks is always allowed.
    const exists = tasks.some((current) => current.id === task.id);
    if (!exists && !requireMyDayAccess()) return;
    if (!canSaveMyDay()) return;
    const next = exists ? tasks.map((current) => current.id === task.id ? task : current) : [task, ...tasks];
    void persistMyDay({ tasks: next }).then((saved) => {
      if (!saved) return;
      setTaskModalOpen(false);
      playSfxSuccess();
      addToast(editingTask ? "Task updated successfully" : "New task created");
    });
  }, [addToast, canSaveMyDay, editingTask, persistMyDay, requireMyDayAccess, tasks]);

  const openAddEvent = useCallback(() => {
    if (!requireMyDayAccess()) return;
    setEditingEvent(null);
    setScheduleModalOpen(true);
  }, [requireMyDayAccess]);

  const openEditEvent = useCallback((event: ScheduleEvent) => {
    if (!canSaveMyDay()) return;
    setEditingEvent(event);
    setScheduleModalOpen(true);
  }, [canSaveMyDay]);

  const handleSaveEvent = useCallback((event: ScheduleEvent) => {
    // Check access for NEW event creation only. Editing existing events is always allowed.
    const exists = schedule.some((current) => current.id === event.id);
    if (!exists && !requireMyDayAccess()) return;
    if (!canSaveMyDay()) return;
    const next = exists ? schedule.map((current) => current.id === event.id ? event : current) : [...schedule, event];
    void persistMyDay({ schedule: next }).then((saved) => {
      if (!saved) return;
      setScheduleModalOpen(false);
      playSfxSuccess();
      addToast(editingEvent ? "Event updated" : "Event added to schedule");
    });
  }, [addToast, canSaveMyDay, editingEvent, persistMyDay, requireMyDayAccess, schedule]);

  const handleDeleteEvent = useCallback((id: string) => {
    if (!canSaveMyDay()) return;
    showConfirm("Delete Event", "Remove this event from your schedule?", () => {
      const next = schedule.filter((event) => event.id !== id);
      void persistMyDay({ schedule: next }).then((saved) => {
        if (!saved) return;
        playSfxRemove();
        addToast("Event removed", "info");
        setConfirmOpen(false);
      });
    });
  }, [addToast, canSaveMyDay, persistMyDay, schedule, showConfirm]);

  const handleAddNote = useCallback((noteText: string) => {
    // Check access for NEW note creation. Editing/deleting existing notes is always allowed.
    if (!requireMyDayAccess()) return;
    if (!canSaveMyDay()) return;
    const note: QuickNote = {
      id: crypto.randomUUID(),
      text: noteText,
      createdAt: Date.now(),
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    };
    void persistMyDay({ notes: [note, ...notes] }).then((saved) => {
      if (!saved) return;
      playSfxAdd();
      addToast("Note saved");
    });
  }, [addToast, canSaveMyDay, notes, persistMyDay, requireMyDayAccess]);

  const handleEditNote = useCallback((id: string, noteText: string) => {
    if (!canSaveMyDay()) return;
    const next = notes.map((note) => note.id === id ? { ...note, text: noteText } : note);
    void persistMyDay({ notes: next }).then((saved) => saved && addToast("Note updated"));
  }, [addToast, canSaveMyDay, notes, persistMyDay]);

  const handleDeleteNote = useCallback((id: string) => {
    if (!canSaveMyDay()) return;
    const next = notes.filter((note) => note.id !== id);
    void persistMyDay({ notes: next }).then((saved) => {
      if (!saved) return;
      playSfxRemove();
      addToast("Note deleted", "info");
    });
  }, [addToast, canSaveMyDay, notes, persistMyDay]);

  const handleAddReminder = useCallback((reminder: Reminder) => {
    // Check access for NEW reminder creation. Editing/deleting existing reminders is always allowed.
    if (!requireMyDayAccess()) return;
    if (!canSaveMyDay()) return;
    void persistMyDay({ reminders: [...reminders, reminder] }).then((saved) => {
      if (!saved) return;
      playSfxAdd();
      addToast("Reminder set");
    });
  }, [addToast, canSaveMyDay, persistMyDay, reminders, requireMyDayAccess]);

  const handleEditReminder = useCallback((reminder: Reminder) => {
    if (!canSaveMyDay()) return;
    const next = reminders.map((current) => current.id === reminder.id ? reminder : current);
    void persistMyDay({ reminders: next }).then((saved) => {
      if (!saved) return;
      playSfxSuccess();
      addToast("Reminder updated");
    });
  }, [addToast, canSaveMyDay, persistMyDay, reminders]);

  const handleToggleReminder = useCallback((id: string) => {
    if (!canSaveMyDay()) return;
    const next = reminders.map((reminder) => reminder.id !== id ? reminder : { ...reminder, done: !reminder.done });
    void persistMyDay({ reminders: next }).then((saved) => saved && playSfxToggle());
  }, [canSaveMyDay, persistMyDay, reminders]);

  const handleDeleteReminder = useCallback((id: string) => {
    if (!canSaveMyDay()) return;
    showConfirm("Delete Reminder", "Remove this reminder?", () => {
      const next = reminders.filter((reminder) => reminder.id !== id);
      void persistMyDay({ reminders: next }).then((saved) => {
        if (!saved) return;
        playSfxRemove();
        addToast("Reminder deleted", "info");
        setConfirmOpen(false);
      });
    });
  }, [addToast, canSaveMyDay, persistMyDay, reminders, showConfirm]);

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
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white lg:max-w-7xl">
        <StoreHeader
          cartCount={cartIds.size}
          notifCount={1}
          title={`${appName} Tasker`}
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
            {/* The free-creation allowance summary is deliberately NOT rendered
                here. It is account/usage information, so it lives on the
                Profile page inside MyDayAllowanceCard. My Day itself stays a
                clean planning surface; the PremiumGate below still explains
                the allowance at the exact moment a creation is blocked. */}
            {(!cloudLoaded || savingMyDay) && (
              <p className="mb-3 text-center text-[11px] font-semibold text-slate-400">{savingMyDay ? "Saving My Day securely…" : "Syncing My Day…"}</p>
            )}
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
        subtitle={`Cloud saving has ongoing server costs. Subscribe to save tasks, schedules and notes. You have used today’s ${freeLimit} free My Day creation${freeLimit === 1 ? "" : "s"}; your pages remain available to browse until the daily reset.`}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
