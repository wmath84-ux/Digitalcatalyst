import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import "./work-myday.css";
import { ArrowLeft, CalendarDays, Check, Moon, NotebookPen, PanelLeft, PencilLine, Sun, Trash2 } from "lucide-react";
import WorkFooterNav, { type WorkNavCell } from "../WorkFooterNav";
import WorkMyDayEditor, { type WorkMyDayEditorHandle } from "./WorkMyDayEditor";
import WorkMyDayDrawer from "./WorkMyDayDrawer";
import WorkMyDayLibrary from "./WorkMyDayLibrary";
import { requestWorkReminderPermission, workRemindersRunInBackground } from "../storage/workReminders";
import { useWorkMyDayFilter, setWorkMyDayFilter } from "../storage/workPrefs";
import type { WorkMyDayController } from "../storage/useWorkMyDay";
import type { WorkMyDayItemDraft, WorkMyDayKind } from "../storage/workMyDay";
import type { WorkTheme } from "../storage/workPrefs";

const EDITOR_FOOTER_CELLS: WorkNavCell[] = [
  { id: "back", label: "Back", color: "#4f46e5", icon: ArrowLeft, title: "Save and return to the My Day library" },
  { id: "delete", label: "Delete", color: "#e11d48", icon: Trash2, title: "Move this item to the Work trash" },
];

/* The single editor header's three selectable boxes: item type, notebook,
   and the due schedule. The chosen value is what the box itself shows — no
   field captions anywhere. */
const KIND_OPTIONS: { value: WorkMyDayKind; label: string }[] = [
  { value: "task", label: "Task" },
  { value: "scheduled", label: "Scheduled" },
  { value: "reminder", label: "Reminder" },
  { value: "note", label: "Note" },
];

const localDateTimeValue = (stamp?: number): string => {
  if (!stamp) return "";
  const date = new Date(stamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const localDateValue = (stamp?: number): string => localDateTimeValue(stamp).slice(0, 10);

const currentTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

export interface WorkMyDayPageProps {
  slotKey: string;
  theme: WorkTheme;
  orientation: "row" | "column";
  controller: WorkMyDayController;
  view: "library" | "editor";
  selectedItemId: string | null;
  editing: boolean;
  showEditorFooter: boolean;
  onOpenItem: (id: string) => void;
  onCreateItem: (kind: WorkMyDayKind, notebookId?: string) => void;
  onBack: () => void;
  onDelete: () => void;
  onEditingChange: (editing: boolean) => void;
  onExit: () => void;
  onToggleTheme: () => void;
}

export default function WorkMyDayPage({
  slotKey,
  theme,
  orientation,
  controller,
  view,
  selectedItemId,
  editing,
  showEditorFooter,
  onOpenItem,
  onCreateItem,
  onBack,
  onDelete,
  onEditingChange,
  onExit,
  onToggleTheme,
}: WorkMyDayPageProps) {
  const filter = useWorkMyDayFilter();
  const editorRef = useRef<WorkMyDayEditorHandle | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const currentItem = controller.items.find((item) => item.id === selectedItemId) || null;
  const dark = theme === "dark";
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (view === "editor" && !currentItem && !controller.loading) onBack();
  }, [view, currentItem, controller.loading, onBack]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const onReminder = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      setToast(`Reminder: ${detail?.title || "My Day item"}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 3200);
    };
    window.addEventListener("dc:work-reminder", onReminder);
    return () => window.removeEventListener("dc:work-reminder", onReminder);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1900);
  }, []);

  const saveItem = useCallback(async () => {
    const saved = await editorRef.current?.save();
    if (!saved) {
      showToast("Could not save — your draft is still open");
      return false;
    }
    const latestItem = currentItem ? await controller.getItem(currentItem.id) : null;
    if (latestItem?.dueAt && workRemindersRunInBackground()) {
      const permitted = await requestWorkReminderPermission();
      if (!permitted) {
        showToast("Saved here · allow notifications for background alarms");
        return true;
      }
    }
    showToast("Saved on this device");
    return true;
  }, [controller, currentItem, showToast]);

  const toggleEditing = useCallback(async () => {
    if (!editing) {
      onEditingChange(true);
      return;
    }
    if (await saveItem()) onEditingChange(false);
  }, [editing, onEditingChange, saveItem]);

  /* The header boxes write through the same updateItem the editor body has
     always used (these handlers moved here with the single header). */
  const patchCurrent = useCallback((patch: WorkMyDayItemDraft) => {
    if (currentItem) void controller.updateItem(currentItem.id, patch);
  }, [controller, currentItem]);

  const setKind = (value: string) => {
    const kind = KIND_OPTIONS.some((option) => option.value === value) ? value as WorkMyDayKind : "task";
    patchCurrent({ kind });
  };
  const setDueAt = (value: string) => {
    if (!currentItem) return;
    let dueAt: number | undefined;
    if (value && currentItem.allDay) {
      const [year, month, day] = value.split("-").map(Number);
      dueAt = new Date(year, month - 1, day, 9, 0, 0, 0).getTime();
    } else if (value) {
      dueAt = new Date(value).getTime();
    }
    const recurrence = currentItem.schedule?.recurrence || { freq: "once" as const };
    const timeZone = currentItem.schedule?.timeZone || currentTimeZone();
    patchCurrent({
      dueAt: Number.isFinite(dueAt) ? dueAt : undefined,
      schedule: Number.isFinite(dueAt) ? { timeZone, recurrence } : undefined,
    });
  };
  const setRepeat = (value: string) => {
    if (!currentItem?.dueAt) return;
    const freq = ["once", "daily", "weekly", "monthly"].includes(value)
      ? value as "once" | "daily" | "weekly" | "monthly"
      : "once";
    patchCurrent({
      schedule: { timeZone: currentItem.schedule?.timeZone || currentTimeZone(), recurrence: { freq } },
    });
  };

  const openItem = (id: string) => {
    setDrawerOpen(false);
    onOpenItem(id);
  };

  const createItem = (kind: WorkMyDayKind) => {
    setDrawerOpen(false);
    onCreateItem(kind, selectedNotebookId || undefined);
  };

  const onTouchStartCapture = (event: TouchEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-no-swipe]")) return;
    const touch = event.touches[0];
    if (touch && touch.clientX < 28) touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEndCapture = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (start && touch && touch.clientX - start.x > 64 && Math.abs(touch.clientY - start.y) < 45) setDrawerOpen(true);
  };

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-bg)] text-[var(--text-primary)]"
      data-work-page-surface="myday"
      data-work-slot={slotKey}
      data-work-surface-theme={theme}
      data-work-orientation={orientation}
      onTouchStartCapture={onTouchStartCapture}
      onTouchEndCapture={onTouchEndCapture}
    >
      {view === "editor" && currentItem ? (
        /* ONE header for the editor (the old header row + meta row merged):
           the side-panel (drawer) button, the three selectable boxes whose
           own faces show the chosen values, and the single pencil/tick
           toggle — finishing editing through it IS the save, so there is no
           separate Save button. The header wears the page's background. */
        <header className="work-myday-header work-myday-editor-header" data-work-header-area="myday-editor" data-work-myday-editor-header>
          <button type="button" className="work-myday-icon-button" aria-label="Open notebooks and notes" title="Notebooks and notes" data-work-myday-side-panel-button onClick={() => setDrawerOpen(true)}>
            <PanelLeft size={17} aria-hidden="true" />
          </button>
          <div className="work-myday-editor-boxes" data-no-swipe="">
            <select
              className="work-myday-box work-myday-box-type"
              value={currentItem.kind}
              disabled={!editing}
              onChange={(event) => setKind(event.target.value)}
              aria-label="Item type"
              data-work-myday-box="type"
            >
              {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select
              className="work-myday-box work-myday-box-notebook"
              value={currentItem.notebookId || ""}
              disabled={!editing}
              onChange={(event) => patchCurrent({ notebookId: event.target.value || undefined })}
              aria-label="Notebook"
              data-work-myday-box="notebook"
            >
              <option value="">No notebook</option>
              {controller.notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}
            </select>
            <span className="work-myday-due-box">
              <input
                className="work-myday-box"
                type={currentItem.allDay ? "date" : "datetime-local"}
                value={currentItem.allDay ? localDateValue(currentItem.dueAt) : localDateTimeValue(currentItem.dueAt)}
                disabled={!editing}
                onChange={(event) => setDueAt(event.target.value)}
                aria-label={currentItem.allDay ? "Due date" : "Due date and time"}
                data-work-myday-box="due"
              />
              {currentItem.dueAt ? (
                <select
                  className="work-myday-box work-myday-box-repeat"
                  value={currentItem.schedule?.recurrence.freq || "once"}
                  disabled={!editing}
                  onChange={(event) => setRepeat(event.target.value)}
                  aria-label="Repeat schedule"
                  data-work-myday-box="repeat"
                >
                  <option value="once">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              ) : null}
              {currentItem.dueAt ? (
                <label className="work-myday-all-day">
                  <input
                    type="checkbox"
                    checked={Boolean(currentItem.allDay)}
                    disabled={!editing}
                    onChange={(event) => {
                      const allDay = event.target.checked;
                      if (allDay && currentItem.dueAt) {
                        const dueDate = new Date(currentItem.dueAt);
                        dueDate.setHours(9, 0, 0, 0);
                        patchCurrent({ allDay, dueAt: dueDate.getTime() });
                      } else {
                        patchCurrent({ allDay });
                      }
                    }}
                    aria-label="All day"
                  />
                  <span>All day</span>
                </label>
              ) : null}
            </span>
          </div>
          <button
            type="button"
            className={`work-myday-icon-button${editing ? " is-accent" : ""}`}
            aria-label={editing ? "Save and finish editing" : "Edit this item"}
            title={editing ? "Save and finish" : "Edit item"}
            aria-pressed={editing}
            data-work-myday-edit-toggle
            onClick={() => void toggleEditing()}
          >
            {editing ? <Check size={17} aria-hidden="true" /> : <PencilLine size={16} aria-hidden="true" />}
          </button>
        </header>
      ) : (
        <header className="work-myday-header" data-work-header-area="myday-library">
          <button type="button" className="work-myday-icon-button" aria-label="Leave Work and open Home" title="Home" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
          <span className="work-myday-header-icon" aria-hidden="true"><CalendarDays size={16} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13px] font-bold leading-tight text-[var(--text-primary)]">My Day</h1>
            <p className="truncate text-[10px] leading-tight text-[var(--text-tertiary)]">Private · this device</p>
          </div>
          <span className="hidden shrink-0 text-[9px] font-semibold text-[var(--text-tertiary)] md:inline-flex">Local only</span>
          <button type="button" className="work-myday-icon-button" aria-label="Open notebooks and notes" title="Notebooks" onClick={() => setDrawerOpen(true)}>
            <NotebookPen size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="work-myday-icon-button"
            aria-label={`Switch to ${dark ? "light" : "dark"} Work theme`}
            aria-pressed={dark}
            title={`${dark ? "Light" : "Dark"} theme`}
            data-work-theme-toggle=""
            onClick={onToggleTheme}
          >
            {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
        </header>
      )}

      {view === "editor" && currentItem ? (
        <WorkMyDayEditor
          ref={editorRef}
          item={currentItem}
          editing={editing}
          theme={theme}
          onEdit={() => onEditingChange(true)}
          onPatch={controller.updateItem}
        />
      ) : (
        <WorkMyDayLibrary
          items={controller.items}
          notebooks={controller.notebooks}
          filter={filter}
          selectedNotebookId={selectedNotebookId}
          loading={controller.loading}
          error={controller.error}
          onFilterChange={setWorkMyDayFilter}
          onOpenItem={openItem}
          onCreate={(kind) => createItem(kind)}
          onToggleComplete={(id) => { void controller.toggleComplete(id); }}
        />
      )}

      {view === "editor" && !editing ? (
        <>
          <p className="work-myday-editor-platform-note">{workRemindersRunInBackground() ? "Local alarms can run while the app is closed." : "Reminders on web work while Work is open; background alarms need the installed app."}</p>
          {showEditorFooter ? <WorkFooterNav
            label="My Day item actions"
            cells={EDITOR_FOOTER_CELLS}
            position="flow"
            variant="editor"
            measured={false}
            dataAttrs={{ "data-work-myday-editor-footer": "" }}
            onSelect={(action) => {
              if (action === "back") {
                void (async () => { if (await saveItem()) onBack(); })();
              } else if (action === "delete") {
                onDelete();
                showToast("Moved to this device's trash");
              }
            }}
          /> : null}
        </>
      ) : null}

      {toast ? <div className="work-myday-toast" role="status" aria-live="polite">{toast}</div> : null}

      <WorkMyDayDrawer
        theme={theme}
        open={drawerOpen}
        items={controller.items}
        notebooks={controller.notebooks}
        selectedNotebookId={selectedNotebookId}
        onClose={closeDrawer}
        onSelectNotebook={setSelectedNotebookId}
        onOpenItem={openItem}
        onCreateNote={() => createItem("note")}
        onCreateNotebook={(title) => { void controller.createNotebook(title); }}
        onExit={onExit}
      />
    </section>
  );
}
