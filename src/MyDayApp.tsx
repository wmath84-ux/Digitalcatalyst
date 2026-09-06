import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveMyDayData, type MyDayCloudData } from "./lib/myDayClient";
import {
  Bell,
  CalendarClock,
  ClipboardList,
  NotebookPen,
  Search,
  X,
} from "lucide-react";
import StoreHeader from "./components/Header";
import { useBranding } from "./context/BrandingContext";
import GreetingHeader from "./components/myday/GreetingHeader";
import CreateMenu from "./components/myday/CreateMenu";
import TaskList from "./components/myday/TaskList";
import TaskModal from "./components/myday/TaskModal";
import Timeline from "./components/myday/Timeline";
import ScheduleModal from "./components/myday/ScheduleModal";
import QuickNotes from "./components/myday/QuickNotes";
import Reminders from "./components/myday/Reminders";
import SideNav from "./components/myday/SideNav";
import BottomNav from "./components/myday/BottomNav";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import { GlassInput } from "./components/ui/glass-input";
import { GlassButton } from "./components/ui/glass-button";
import Toast from "./components/ui/Toast";
import type { ToastMessage } from "./components/ui/Toast";
import { OverlayBoundsProvider } from "./components/ui/overlayBounds";
import { initialNotes, initialReminders, initialSchedule, initialTasks } from "./data/sampleData";
import type { NoteColor, QuickNote, Reminder, ScheduleEvent, Task, TaskStatus } from "./types";
import { useCommerce } from "./context/CommerceContext";
import { useAuth } from "./context/AuthContext";
import { useMyDayAccess } from "./hooks/useMyDayAccess";
import { usePublishFeatureVisibility } from "./context/FeatureVisibilityContext";
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

const MYDAY_STORAGE_KEYS: Record<keyof MyDayCloudData, string> = {
  tasks: "myday_tasks",
  schedule: "myday_schedule",
  notes: "myday_notes",
  reminders: "myday_reminders",
};

/**
 * My Day is intentionally local-first: the learner taps a task/note/etc. and
 * sees it immediately, then we try to mirror it to Firestore through the
 * secure server endpoint. If the cloud save is unavailable (offline, dev
 * server without an API stub, old deploy, etc.) we still keep the change on
 * this device instead of showing an unreadable error and losing the work.
 */
function writeLocalMyDay(data: MyDayCloudData): void {
  try {
    Object.entries(MYDAY_STORAGE_KEYS).forEach(([key, storageKey]) => {
      localStorage.setItem(storageKey, JSON.stringify(data[key as keyof MyDayCloudData]));
    });
  } catch {
    // The in-memory state is still authoritative for this visit.
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
    hidden: myDayHidden,
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
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // The My Day working column (right of the sticky side navigation). Every
  // create/edit overlay (Modal / ConfirmDialog) clamps itself to this column's
  // on-screen rectangle on tablet + desktop widths via OverlayBoundsProvider,
  // so dialogs never cover the side panel or spill outside the app frame.
  const contentColumnRef = useRef<HTMLElement>(null);
  const [savingMyDay, setSavingMyDay] = useState(false);
  const [cloudSyncFailed, setCloudSyncFailed] = useState(false);

  // Latest full local snapshot. Used by the local-first save path so a cloud
  // failure never discards a change the learner already made on this device.
  const latestMyDayRef = useRef<MyDayCloudData | null>(null);
  // Guard against overlapping cloud writes. The React state is still used to
  // drive the "Saving My Day…" label, but the async guard must be a ref so the
  // saved-local-first path can queue the newest snapshot right after a write.
  const myDaySaveRunningRef = useRef(false);

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

  const applyCloudData = useCallback((data: MyDayCloudData) => {
    latestMyDayRef.current = data;
    setTasks(data.tasks);
    setSchedule(data.schedule);
    setNotes(data.notes);
    setReminders(data.reminders);
    writeLocalMyDay(data);
  }, []);

  /**
   * Apply a change to the device-first My Day state. This always succeeds and
   * is called before the cloud request so the learner never loses work when
   * the server is unreachable. Returns both the merged local snapshot and the
   * snapshot that existed before the change (used for a clean rollback when
   * the server rejects a daily-free-limit breach).
   */
  const applyLocalMyDay = useCallback((next: Partial<MyDayCloudData>) => {
    const previous = latestMyDayRef.current ?? { tasks, schedule, notes, reminders };
    const merged: MyDayCloudData = {
      tasks: next.tasks ?? previous.tasks,
      schedule: next.schedule ?? previous.schedule,
      notes: next.notes ?? previous.notes,
      reminders: next.reminders ?? previous.reminders,
    };
    latestMyDayRef.current = merged;
    setTasks(merged.tasks);
    setSchedule(merged.schedule);
    setNotes(merged.notes);
    setReminders(merged.reminders);
    writeLocalMyDay(merged);
    return { previous, merged };
  }, [notes, reminders, schedule, tasks]);

  // My Day saves are local-first. The device state is updated immediately;
  // the secure users/{uid}/myDay collection API is then asked to mirror it
  // to cloud.
  // If the server is unavailable the change still remains on this device and
  // we show a readable non-blocking notice instead of a solid red error box.
  const persistMyDay = useCallback(async (
    next: Partial<MyDayCloudData>,
  ): Promise<boolean> => {
    const { previous, merged } = applyLocalMyDay(next);
    setCloudLoaded(true);

    // Without a signed-in user we still let learners create items locally
    // (they persist on this device). This is the helpful fallback for a page
    // where auth has not finished restoring, and it is clearly communicated
    // to the user instead of silently failing.
    if (!uid) {
      setCloudSyncFailed(true);
      return true;
    }

    // A cloud save is already in flight. The change is already on this device;
    // the in-flight request won't overwrite it, and the finally block below
    // sends the newest snapshot once that request completes.
    if (myDaySaveRunningRef.current) {
      setCloudSyncFailed(false);
      return true;
    }

    myDaySaveRunningRef.current = true;
    setSavingMyDay(true);
    try {
      const result = await saveMyDayData(merged, {
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      // Keep the local-first snapshot as-is: a newer local change could have
      // been made while this request was in flight. Overwriting it here would
      // silently lose that device-only change.
      setMyDayAccess(result.access);
      setCloudSyncFailed(false);
      return true;
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
      if (code === "MYDAY_DAILY_FREE_USED") {
        // The server rejected the creation because today's free allowance is
        // exhausted. Keep the paywall contract real by restoring the state
        // that existed before this change.
        applyLocalMyDay(previous);
        setPaywallOpen(true);
        addToast(
          `Today's free My Day creation limit is reached. Subscribe for unlimited creation or try again after the daily reset.`,
          "info",
        );
        return false;
      }
      // Every other failure (offline, wrong deploy, missing env var) becomes a
      // device-only save instead of a lost task + unreadable red message.
      setCloudSyncFailed(true);
      addToast("Saved on this device. Cloud sync will be attempted again on your next save.", "info");
      return true;
    } finally {
      myDaySaveRunningRef.current = false;
      setSavingMyDay(false);
      // If the user made another change while this request was running, push
      // that newest snapshot now (the in-flight one stayed read-only for it).
      if (latestMyDayRef.current && latestMyDayRef.current !== merged) {
        void persistMyDay(latestMyDayRef.current);
      }
    }
  }, [addToast, applyLocalMyDay, setMyDayAccess, uid]);

  // Keep the local snapshot ref aligned with the rendered state so subsequent
  // local-first saves can compute "before" correctly and queue the newest
  // snapshot after a cloud write.
  useEffect(() => {
    latestMyDayRef.current = { tasks, schedule, notes, reminders };
  }, [notes, reminders, schedule, tasks]);

  useEffect(() => {
    if (!uid) { setCloudLoaded(false); return; }
    let cancelled = false;
    void refreshMyDay()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          // Cloud data is authoritative for this account — apply it (the
          // server normalises/validates every row) so the same tasks,
          // schedule, notes and reminders appear on every device the
          // learner signs in on.
          applyCloudData(result.data);
          setCloudSyncFailed(false);
        } else {
          // Status fetch failed (network). Keep showing this device's data
          // but mark the cloud as unavailable so saves surface the
          // "synced on this device" notice instead of pretending.
          setCloudSyncFailed(true);
        }
        setCloudLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCloudSyncFailed(true);
        setCloudLoaded(true);
      });
    return () => { cancelled = true; };
  }, [applyCloudData, refreshMyDay, uid]);

  // Phase-1: publish My Day's visibility into the shared context so the
  // desktop rail + bottom nav can remove the entry when admin has set the
  // feature to "hide" mode AND the user is not a subscriber. The hook
  // already short-circuits to { hidden: false } when not signed in.
  usePublishFeatureVisibility("myday", { hidden: Boolean(myDayHidden) });

  const handleNavigate = useCallback((id: string) => {
    if (id === "home") {
      window.location.hash = "#/home";
      return;
    }
    setActiveSection(id as DaySection);
    setHighlightId(null);
  }, []);

  // The big "+" hub on the overview: the CreateMenu component owns the
  // open/close lifecycle; the page only decides what a selection does —
  // the same access-gated section swap it has always done.
  const handleCreateSelect = useCallback((id: string) => {
    if (!requireMyDayAccess()) return;
    handleNavigate(id);
  }, [handleNavigate, requireMyDayAccess]);

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
    <OverlayBoundsProvider value={contentColumnRef}>
    <div className="dc-app-shell min-h-screen">
      <div data-app-frame data-myday-frame className="dc-app-frame mx-auto flex min-h-screen max-w-md flex-col overflow-hidden md:max-w-none md:rounded-none md:bg-transparent md:shadow-none md:border-0 lg:max-w-7xl">
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

        {/* The phone search strip is CHROME, so it wears the bar plate the
            shared header and the store's filter bar wear: `dc-scene-plate--bar`
            paints the strip's own box (there is no pack surface inside it) and
            `dc-scene-field` gives the pill a rim + a legible placeholder. A
            search that reads clearly is the one feature every My Day page is
            reached through. */}
        {showMobileSearch && (
          <div className="dc-scene-plate dc-scene-plate--bar animate-slideUp border-b border-white/10 bg-[var(--dc-chrome-glass)] px-4 pb-3 pt-2 [backdrop-filter:var(--dc-chrome-glass-blur)]">
            <div className="flex items-center gap-2">
              <GlassInput
                type="search"
                autoFocus
                className="dc-scene-field w-full"
                icon={<Search className="h-4 w-4" aria-hidden="true" />}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search tasks, notes..."
              />
              {globalSearch && (
                <GlassButton
                  type="button"
                  aria-label="Clear search"
                  onClick={() => { setGlobalSearch(""); setShowMobileSearch(false); }}
                  className="shrink-0 [&_.size-12]:size-10"
                >
                  <X className="h-4 w-4" />
                </GlassButton>
              )}
            </div>
          </div>
        )}

        {/* No horizontal tab strip here any more. My Day switches pages with
            the side rail (`SideNav`, from 768 px up) and the floating bottom
            pill on a phone — both drive the same `handleNavigate` section
            swap, so dropping the strip removes a duplicate row of buttons
            without stranding any page. */}

        <div data-myday-content className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pt-6 sm:px-6 md:gap-8 md:px-8 lg:px-10">
          <SideNav active={activeSection} onNavigate={handleNavigate} />

          <main ref={contentColumnRef} className="min-w-0 flex-1 pb-6">
            {/* The free-creation allowance summary is deliberately NOT rendered
                here. It is account/usage information, so it lives on the
                Profile page inside MyDayAllowanceCard. My Day itself stays a
                clean planning surface; the PremiumGate below still explains
                the allowance at the exact moment a creation is blocked. */}
            {/* Cloud-sync / device-saving status. This is the one line of My
                Day copy with no surface under it — it floats on the scene (and,
                from 1024px up, on the frame's 55% white veil), where `text-white/55`
                was the least legible text on the page. `dc-scene-ink` is the
                shared hook for exactly that: a per-glyph dark scrim plus the
                lifted ink floor. */}
            {(!cloudLoaded || savingMyDay || cloudSyncFailed) && (
              <div className="mb-3 text-center">
                <p className={cloudSyncFailed ? "dc-scene-ink text-[11px] font-bold text-amber-200" : "dc-scene-ink text-[11px] font-semibold text-white/55"}>
                  {savingMyDay
                    ? "Saving My Day…"
                    : cloudSyncFailed
                      ? uid
                        ? "Saved on this device — cloud sync will retry on your next save"
                        : "Saved on this device — sign in to sync to cloud"
                      : "Syncing My Day…"}
                </p>
              </div>
            )}
            <div key={activeSection} data-page-enter-panel="">
            {activeSection === "overview" && (
              <section className="space-y-8">
                <GreetingHeader
                  name={userName}
                  completed={completedCount}
                  total={tasks.length}
                  streak={12}
                />

                {/* The big "+" creation hub — button + compact drop-up menu
                    live in `CreateMenu`; the page only handles selection
                    (access check → section swap). The drop-up always opens
                    ABOVE the button and holds the same narrow menu width on
                    phone / tablet / desktop, so it reads well everywhere. */}
                <CreateMenu options={CREATE_OPTIONS} onSelect={handleCreateSelect} />
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
            </div>
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
    </OverlayBoundsProvider>
  );
}
