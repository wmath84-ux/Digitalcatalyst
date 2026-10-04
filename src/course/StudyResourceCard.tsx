import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { AlertCircle, ArrowUpRight, Check, Clock3, FileText, LoaderCircle, Network, Trash2, X } from "lucide-react";
import { GlassCard } from "../components/ui/GlassCard";
import { formatStudyTimestamp } from "./studyResourceContext";
import "./study-resource-card.css";

export type StudyResourceKind = "note" | "mind-map";

export interface StudyResourceCardProps {
  kind: StudyResourceKind;
  resourceId: string;
  title: string;
  contextPath?: string[];
  contextDetail?: string;
  topic?: string;
  topicLabel?: string;
  metadata?: string[];
  sourceLabel?: string;
  updatedAt?: number | null;
  createdAt?: number | null;
  active?: boolean;
  onOpen: () => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
  deleteLabel?: string;
}

const doubleTapWindow = (pointerType: string) => pointerType === "mouse" ? 520 : 340;

/**
 * Shared Note / Mind Map card. The full card is the primary button; the only
 * secondary control is the destructive action. A short click delay is
 * necessary to distinguish a single activation from a double-click/double-tap
 * rename without opening an editor on the first tap.
 */
export function StudyResourceCard({
  kind,
  resourceId,
  title,
  contextPath = [],
  contextDetail,
  topic,
  topicLabel = "Topic",
  metadata = [],
  sourceLabel = "Self",
  updatedAt,
  createdAt,
  active = false,
  onOpen,
  onRename,
  onDelete,
  deleteLabel,
}: StudyResourceCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const lastClickAtRef = useRef(0);
  const pointerTypeRef = useRef("mouse");
  const renamingRef = useRef(false);
  const editId = useId();
  const helpId = `${editId}-rename-help`;
  const coursePath = contextPath.filter(Boolean);
  const kindLabel = kind === "note" ? "NOTE" : "MIND MAP";
  const updatedTimestamp = formatStudyTimestamp(updatedAt);
  const timestamp = updatedTimestamp || formatStudyTimestamp(createdAt);
  const timestampPrefix = updatedTimestamp ? "Updated" : "Saved";
  const timestampValue = updatedTimestamp ? Number(updatedAt) : Number(createdAt);
  const openLabel = [
    kindLabel,
    title,
    sourceLabel,
    coursePath.join(" / "),
    contextDetail,
    topic ? `${topicLabel}: ${topic}` : "",
    ...metadata,
    timestamp ? `${timestampPrefix} ${timestamp.full}` : "",
    `Open in ${kind === "note" ? "Note Editor" : "Mind Map Editor"}. Double-click or double-tap to rename; press F2 or Shift+Enter.`,
  ].filter(Boolean).join(". ");

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const beginRename = useCallback(() => {
    if (!onRename || renamingRef.current) return;
    clearOpenTimer();
    lastClickAtRef.current = 0;
    renamingRef.current = true;
    setDraftTitle(title);
    setRenaming(true);
  }, [clearOpenTimer, onRename, title]);

  const finishRename = useCallback(() => {
    if (!renamingRef.current) return;
    const nextTitle = draftTitle.trim();
    renamingRef.current = false;
    setRenaming(false);
    if (nextTitle && nextTitle !== title) onRename?.(nextTitle);
  }, [draftTitle, onRename, title]);

  const cancelRename = useCallback(() => {
    if (!renamingRef.current) return;
    renamingRef.current = false;
    setRenaming(false);
    setDraftTitle(title);
  }, [title]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  useEffect(() => () => clearOpenTimer(), [clearOpenTimer]);

  const handleOpenClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (renamingRef.current) {
      event.preventDefault();
      return;
    }
    // Keyboard activation is unambiguous; F2 / Shift+Enter below provide an
    // equally keyboard-accessible route into the inline title editor.
    if (event.detail === 0 || !onRename) {
      clearOpenTimer();
      onOpen();
      return;
    }

    const now = Date.now();
    const repeatedClick = lastClickAtRef.current > 0
      && now - lastClickAtRef.current <= doubleTapWindow(pointerTypeRef.current);
    if (event.detail >= 2 || repeatedClick) {
      beginRename();
      return;
    }

    lastClickAtRef.current = now;
    clearOpenTimer();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      lastClickAtRef.current = 0;
      if (!renamingRef.current) onOpen();
    }, doubleTapWindow(pointerTypeRef.current));
  };

  const handleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onRename) return;
    event.preventDefault();
    beginRename();
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "F2" || (event.key === "Enter" && event.shiftKey)) {
      event.preventDefault();
      beginRename();
    }
  };

  const handleEditBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    finishRename();
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const rootAttributes = kind === "note"
    ? { "data-course-note": "", "data-note-id": resourceId }
    : { "data-course-mindmap-map-card": "", "data-map-key": resourceId };
  const openAttributes = kind === "note"
    ? { "data-course-note-open": "", "data-course-note-edit": "" }
    : { "data-course-mindmap-open-map": resourceId };
  const deleteAttributes = kind === "note"
    ? { "data-course-note-delete": "" }
    : { "data-course-mindmap-delete-map": "" };

  return (
    <GlassCard
      className={`study-resource-card h-full w-full ${kind === "mind-map" ? "study-resource-card--mind-map" : "study-resource-card--note"}`}
      contentClassName="h-full p-0"
      data-study-resource-card
      data-resource-kind={kind}
      data-resource-id={resourceId}
      data-active={active ? "true" : "false"}
      {...rootAttributes}
    >
      {renaming ? (
        <div
          className="study-resource-card__rename"
          onBlur={handleEditBlur}
          data-study-resource-rename
        >
          <p className="study-resource-card__rename-label">Rename {kind === "note" ? "note" : "mind map"}</p>
          <label className="sr-only" htmlFor={editId}>Resource title</label>
          <input
            ref={inputRef}
            id={editId}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={handleEditKeyDown}
            maxLength={120}
            autoComplete="off"
            className="study-resource-card__rename-input"
            aria-describedby={helpId}
            data-study-resource-rename-input
            {...(kind === "note" ? { "data-course-note-rename-input": "" } : { "data-course-mindmap-rename-input": "" })}
          />
          <p id={helpId} className="study-resource-card__rename-help">Enter saves · Escape cancels · leaving the field saves</p>
          <div className="study-resource-card__rename-actions">
            <button type="button" onClick={cancelRename} data-study-resource-rename-cancel>
              <X size={15} aria-hidden="true" /> Cancel
            </button>
            <button type="button" onClick={finishRename} data-study-resource-rename-save>
              <Check size={15} aria-hidden="true" /> Save title
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="study-resource-card__open"
            onPointerDown={(event) => { pointerTypeRef.current = event.pointerType || "mouse"; }}
            onClick={handleOpenClick}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleCardKeyDown}
            aria-label={openLabel}
            aria-describedby={helpId}
            {...openAttributes}
          >
            <span className="study-resource-card__topline">
              <span className="study-resource-card__type-icon" aria-hidden="true">
                {kind === "note" ? <FileText size={17} strokeWidth={2.2} /> : <Network size={17} strokeWidth={2.2} />}
              </span>
              <span className="study-resource-card__type">{kindLabel}</span>
              <span className="study-resource-card__source" data-resource-source={sourceLabel.toLowerCase()}>{sourceLabel}</span>
              {active ? <span className="study-resource-card__active">OPEN</span> : null}
            </span>
            <span className="study-resource-card__title" data-study-resource-title>{title}</span>
            {coursePath.length ? (
              <span className="study-resource-card__context" aria-label="Course and module path" data-study-resource-context>
                {coursePath.map((part, index) => (
                  <span className="study-resource-card__crumb" key={`${index}:${part}`}>
                    {index > 0 ? <span aria-hidden="true" className="study-resource-card__separator">/</span> : null}
                    <span>{part}</span>
                  </span>
                ))}
              </span>
            ) : null}
            {contextDetail ? <span className="study-resource-card__detail" data-study-resource-detail>{contextDetail}</span> : null}
            {topic ? (
              <span className="study-resource-card__topic" data-study-resource-topic>
                <span className="study-resource-card__topic-label">{topicLabel}</span>
                <span className="study-resource-card__topic-value">{topic}</span>
              </span>
            ) : null}
            {metadata.length ? (
              <span className="study-resource-card__metadata" data-study-resource-metadata>
                {metadata.filter(Boolean).map((item, index) => (
                  <span className="study-resource-card__metadata-item" key={`${index}:${item}`}>{item}</span>
                ))}
              </span>
            ) : null}
            <span className="study-resource-card__footer">
              <span className="study-resource-card__timestamp">
                {timestamp ? (
                  <>
                    <Clock3 size={13} aria-hidden="true" />
                    <time dateTime={new Date(timestampValue).toISOString()} title={`${timestampPrefix} ${timestamp.full}`}>
                      {timestampPrefix} {timestamp.short}
                    </time>
                  </>
                ) : <span>Saved in this course</span>}
              </span>
              <span className="study-resource-card__open-hint">
                {kind === "note" ? "Open editor" : "Open map"}
                <ArrowUpRight size={15} aria-hidden="true" />
              </span>
            </span>
            <span className="sr-only" data-study-resource-rename-instructions>
              Double-click or double-tap this card to rename. On a keyboard, focus this card and press F2 or Shift plus Enter.
            </span>
          </button>
          {onDelete ? (
            <button
              type="button"
              className="study-resource-card__delete"
              onClick={(event) => { event.stopPropagation(); onDelete(); }}
              aria-label={deleteLabel || `Delete ${kind === "note" ? "note" : "mind map"} ${title}`}
              title={deleteLabel || "Delete resource"}
              {...deleteAttributes}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : null}
          <span className="sr-only" id={helpId}>
            Double-click or double-tap to rename this {kind === "note" ? "note" : "mind map"}. Press F2 or Shift plus Enter from the card.
          </span>
        </>
      )}
    </GlassCard>
  );
}

export function StudyResourceCardSkeleton({ kind }: { kind: StudyResourceKind }) {
  return (
    <GlassCard
      className={`study-resource-card study-resource-card--skeleton h-full w-full study-resource-card--${kind}`}
      contentClassName="h-full p-0"
      aria-hidden="true"
      data-study-resource-skeleton
      data-resource-kind={kind}
    >
      <span className="study-resource-card__skeleton-body">
        <span className="study-resource-card__skeleton-type" />
        <span className="study-resource-card__skeleton-title" />
        <span className="study-resource-card__skeleton-line" />
        <span className="study-resource-card__skeleton-line study-resource-card__skeleton-line--short" />
        <span className="study-resource-card__skeleton-footer" />
      </span>
    </GlassCard>
  );
}

export function StudyLibraryEmptyState({
  kind,
  title,
  description,
}: {
  kind: StudyResourceKind;
  title: string;
  description: string;
}) {
  const Icon = kind === "note" ? FileText : Network;
  return (
    <div className="study-library-empty" data-study-library-empty data-resource-kind={kind}>
      <span className="study-library-empty__icon" aria-hidden="true"><Icon size={23} strokeWidth={1.9} /></span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function StudyLibraryNotice({
  state,
  title,
  message,
  onRetry,
}: {
  state: "loading" | "error";
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const icon = state === "loading"
    ? <LoaderCircle size={16} aria-hidden="true" />
    : <AlertCircle size={16} aria-hidden="true" />;
  return (
    <div className={`study-library-notice study-library-notice--${state}`} role={state === "error" ? "alert" : "status"} data-study-library-notice={state}>
      <span className="study-library-notice__icon" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="study-library-notice__title">{title}</p>
        <p className="study-library-notice__message">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="study-library-notice__retry" data-study-library-retry>
          Try again
        </button>
      ) : null}
    </div>
  );
}
