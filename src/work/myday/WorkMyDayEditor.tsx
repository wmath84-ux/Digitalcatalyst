import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import NoteEditor, { type NoteEditorHandle } from "../../course/NoteEditor";
import { useDoubleTapToEdit } from "../../course/useDoubleTapToEdit";
import type { WorkMyDayItem, WorkMyDayItemDraft, WorkMyDayKind } from "../storage/workMyDay";
import type { WorkTheme } from "../storage/workPrefs";

export interface WorkMyDayEditorHandle {
  save: () => Promise<boolean>;
}

const EDITOR_LABEL: Record<WorkMyDayKind, string> = {
  task: "Task",
  scheduled: "Scheduled item",
  reminder: "Reminder",
  note: "Note",
};

/**
 * The editor body is the Course Player's Note Editor itself, unchanged: the
 * type / notebook / schedule boxes that used to sit above it as their own
 * labelled rows now live in WorkMyDayPage's single editor header, so the
 * surface below the header is exactly the note page (with its own docked
 * formatting toolbar while editing).
 */
const WorkMyDayEditor = forwardRef<WorkMyDayEditorHandle, {
  item: WorkMyDayItem;
  editing: boolean;
  theme: WorkTheme;
  onEdit: () => void;
  onPatch: (id: string, patch: WorkMyDayItemDraft) => Promise<unknown>;
}>(function WorkMyDayEditor({ item, editing, theme, onEdit, onPatch }, ref) {
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

  return (
    <div className="work-myday-editor-body" data-work-page-body="myday-editor" data-work-myday-editor="">
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
