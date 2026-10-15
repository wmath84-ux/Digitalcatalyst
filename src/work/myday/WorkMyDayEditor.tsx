import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import NoteEditor, { type NoteEditorHandle } from "../../course/NoteEditor";
import { useDoubleTapToEdit } from "../../course/useDoubleTapToEdit";
import type { WorkMyDayItem, WorkMyDayItemDraft, WorkMyDayKind } from "../storage/workMyDay";
import type { WorkMyDayNotebook } from "../storage/workMyDay";
import type { WorkTheme } from "../storage/workPrefs";

export interface WorkMyDayEditorHandle {
  save: () => Promise<boolean>;
}

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

const EDITOR_LABEL: Record<WorkMyDayKind, string> = {
  task: "Task",
  scheduled: "Scheduled item",
  reminder: "Reminder",
  note: "Note",
};

const WorkMyDayEditor = forwardRef<WorkMyDayEditorHandle, {
  item: WorkMyDayItem;
  notebooks: WorkMyDayNotebook[];
  editing: boolean;
  theme: WorkTheme;
  onEdit: () => void;
  onPatch: (id: string, patch: WorkMyDayItemDraft) => Promise<unknown>;
}>(function WorkMyDayEditor({ item, notebooks, editing, theme, onEdit, onPatch }, ref) {
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const gesture = useDoubleTapToEdit(!editing, onEdit);

  const save = useCallback(async () => {
    try {
      const draft = editorRef.current?.read();
      if (draft) await onPatch(item.id, { title: draft.title, bodyHtml: draft.bodyHtml });
      editorRef.current?.markSaved();
      return true;
    } catch {
      return false;
    }
  }, [item.id, onPatch]);
  useImperativeHandle(ref, () => ({ save }), [save]);

  const setKind = (value: string) => {
    const kind = KIND_OPTIONS.some((option) => option.value === value) ? value as WorkMyDayKind : "task";
    void onPatch(item.id, { kind });
  };
  const setDueAt = (value: string) => {
    let dueAt: number | undefined;
    if (value && item.allDay) {
      const [year, month, day] = value.split("-").map(Number);
      dueAt = new Date(year, month - 1, day, 9, 0, 0, 0).getTime();
    } else if (value) {
      dueAt = new Date(value).getTime();
    }
    const recurrence = item.schedule?.recurrence || { freq: "once" as const };
    const timeZone = item.schedule?.timeZone || currentTimeZone();
    void onPatch(item.id, {
      dueAt: Number.isFinite(dueAt) ? dueAt : undefined,
      schedule: Number.isFinite(dueAt) ? { timeZone, recurrence } : undefined,
    });
  };
  const setRepeat = (value: string) => {
    const freq = ["once", "daily", "weekly", "monthly"].includes(value)
      ? value as "once" | "daily" | "weekly" | "monthly"
      : "once";
    if (!item.dueAt) return;
    void onPatch(item.id, {
      schedule: { timeZone: item.schedule?.timeZone || currentTimeZone(), recurrence: { freq } },
    });
  };

  return (
    <div className="work-myday-editor-body" data-work-page-body="myday-editor" data-work-myday-editor="">
      {editing ? (
        <div className="work-myday-editor-meta" data-no-swipe="">
          <label>
            <span>Type</span>
            <select value={item.kind} onChange={(event) => setKind(event.target.value)} aria-label="Item type">
              {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Notebook</span>
            <select value={item.notebookId || ""} onChange={(event) => void onPatch(item.id, { notebookId: event.target.value || undefined })} aria-label="Notebook">
              <option value="">No notebook</option>
              {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}
            </select>
          </label>
          <label>
            <span>{item.allDay ? "Date" : "Due date and time"}</span>
            <input
              type={item.allDay ? "date" : "datetime-local"}
              value={item.allDay ? localDateValue(item.dueAt) : localDateTimeValue(item.dueAt)}
              onChange={(event) => setDueAt(event.target.value)}
              aria-label={item.allDay ? "Due date" : "Due date and time"}
            />
          </label>
          {item.dueAt ? (
            <label className="work-myday-all-day">
              <input
                type="checkbox"
                checked={Boolean(item.allDay)}
                onChange={(event) => {
                  const allDay = event.target.checked;
                  if (allDay && item.dueAt) {
                    const dueDate = new Date(item.dueAt);
                    dueDate.setHours(9, 0, 0, 0);
                    void onPatch(item.id, { allDay, dueAt: dueDate.getTime() });
                  } else {
                    void onPatch(item.id, { allDay });
                  }
                }}
                aria-label="All day"
              />
              <span>All day</span>
            </label>
          ) : null}
          {item.dueAt ? (
            <label>
              <span>Repeat</span>
              <select value={item.schedule?.recurrence.freq || "once"} onChange={(event) => setRepeat(event.target.value)} aria-label="Repeat schedule">
                <option value="once">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <div className="work-myday-editor-readmeta">
          <span className="work-myday-kind-tag">{EDITOR_LABEL[item.kind]}</span>
          {item.notebookId ? <span>{notebooks.find((row) => row.id === item.notebookId)?.title || "Notebook"}</span> : null}
          {item.dueAt ? <span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(item.dueAt)}</span> : null}
          {item.schedule?.recurrence.freq && item.schedule.recurrence.freq !== "once" ? <span>Repeats {item.schedule.recurrence.freq}</span> : null}
        </div>
      )}

      <div
        className="work-myday-note-surface"
        tabIndex={editing ? -1 : 0}
        aria-label={editing ? undefined : "Note. Double tap or press Enter to edit."}
        {...(!editing ? gesture : {})}
      >
        <NoteEditor
          key={item.id}
          ref={editorRef}
          theme={theme}
          initialTitle={item.title || ""}
          initialBodyHtml={item.bodyHtml || ""}
          readOnly={!editing}
          autoFocus={false}
          ariaLabel={`${EDITOR_LABEL[item.kind]} editor`}
          dataAttribute="data-work-myday-note"
          onDraftChange={(draft) => { void onPatch(item.id, { title: draft.title, bodyHtml: draft.bodyHtml }); }}
        />
        {!editing && !item.title && !item.bodyText ? (
          <p className="work-myday-doubletap-hint" aria-hidden="true">Double-tap anywhere on this page to start writing</p>
        ) : null}
      </div>

      {editing && (item.kind === "reminder" || item.kind === "scheduled" || item.dueAt) ? (
        <p className="work-myday-reminder-disclosure">
          Your reminder is stored on this device. On the web it can alert only while Work is open; the installed app can schedule a local alarm.
        </p>
      ) : null}
    </div>
  );
});

export default WorkMyDayEditor;
