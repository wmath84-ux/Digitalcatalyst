// src/classroom3d/RoomSheet.tsx
//
// THE FLOATING PANEL THAT OPENS INSIDE THE ROOM.
//
// The owner's brief, in their words: tap the module key on the right and a
// floating panel opens in the CENTRE of the classroom that you scroll with a
// finger to switch module — and the same for the note library and the mind
// map library. What it must never do is become the place the content itself
// lives: whatever you pick renders on a BOARD.
//
//   sheet  = the chooser. Modules / lessons, the note library, the map
//            library. It floats over the room, it scrolls with a thumb, and
//            it closes the moment you pick something.
//   boards = the content. The lesson plays on the big front board, notes are
//            written on the notes wall, the map is drawn (with its toolbar)
//            on the mind wall.
//
// So this file deliberately contains NO viewer, NO editor and NO canvas. It
// is a list that turns a tap into "show this on that wall, and get out of the
// way".
//
// It floats above the WebGL canvas rather than on a slab because a chooser
// you are actively reading and scrolling should be crisp, upright and the
// same size on a phone as on a desktop — a slab-mounted chooser would be
// perspective-skewed and unreadable exactly when you need it. The room stays
// visible and lit behind it, so it reads as a panel summoned into the room.

import { memo, useMemo, type ReactNode } from "react";
import { BookOpen, ChevronRight, LockKeyhole, Network, NotebookPen, Plus, X } from "lucide-react";
import { FILE_KIND_LABEL, type FlatModule } from "./state";
import { useDragScroll } from "./useSurfaceScroll";

export type RoomSheetKind = "modules" | "notes" | "mind";

/** One note, as the room's chooser needs it (the wall owns the real editor). */
export interface RoomNoteItem {
  id: string;
  title: string;
  preview: string;
}

/** One mind map, as the room's chooser needs it. */
export interface RoomMapItem {
  mapKey: string;
  title: string;
  nodeCount: number;
}

/**
 * The accent, pre-mixed into the four tints the sheet needs.
 *
 * Deliberately NOT `color-mix()`: this app's browserslist floor is Chrome 96 /
 * Safari 15 (see vite.config.ts), and `color-mix` needs Chrome 111 / Safari
 * 16.2. Lightning CSS can lower a `color-mix` of two literal colours, but not
 * one that reads a CSS variable — it would ship as-is and be dropped whole on
 * an older engine, taking the row background and the button border with it.
 * Mixing here, in JS, keeps the sheet correct on every engine the app ships to.
 */
const accentTints = (accent: string) => {
  const hex = accent.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const int = Number.parseInt(full, 16);
  const rgb = Number.isFinite(int)
    ? `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
    : "139, 92, 246";
  return {
    "--dc-sheet-accent": accent,
    "--dc-sheet-accent-wash": `rgba(${rgb}, 0.16)`,
    "--dc-sheet-accent-fill": `rgba(${rgb}, 0.3)`,
    "--dc-sheet-accent-line": `rgba(${rgb}, 0.55)`,
  } as React.CSSProperties;
};

/* ── The shell ─────────────────────────────────────────────────────────── */

export const RoomSheet = memo(function RoomSheet({
  title,
  hint,
  accent,
  onClose,
  action,
  children,
}: {
  title: string;
  hint: string;
  accent: string;
  onClose: () => void;
  /** Optional primary action in the header (New note / New map). */
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  // The room is `touch-action: none` end to end, so even this upright panel
  // needs the room's own drag scrolling (surfaceScroll.ts) to move a list.
  const body = useDragScroll<HTMLDivElement>();
  const tints = useMemo(() => accentTints(accent), [accent]);

  return (
    <div className="dc-room-sheet-layer" data-classroom-room-sheet>
      {/* Tapping the room behind the sheet dismisses it — the room is never
          locked away behind a modal. */}
      <button
        type="button"
        className="dc-room-sheet-scrim"
        aria-label="Close"
        data-classroom-room-sheet-scrim
        onClick={onClose}
      />
      <section
        className="dc-room-sheet"
        style={tints}
        role="dialog"
        aria-label={title}
      >
        <header className="dc-room-sheet-head">
          <div className="min-w-0 flex-1">
            <p className="dc-room-sheet-title">{title}</p>
            <p className="dc-room-sheet-hint">{hint}</p>
          </div>
          {action && (
            <button
              type="button"
              className="dc-room-sheet-action"
              onClick={action.onClick}
              data-classroom-room-sheet-action
            >
              <Plus size={14} /> {action.label}
            </button>
          )}
          <button
            type="button"
            className="dc-room-sheet-close"
            onClick={onClose}
            aria-label="Close"
            data-classroom-room-sheet-close
          >
            <X size={16} />
          </button>
        </header>
        <div ref={body} className="dc-room-sheet-body" data-classroom-room-sheet-body>
          {children}
        </div>
      </section>
    </div>
  );
});

/* ── Module / lesson chooser ───────────────────────────────────────────── */

export const ModuleSheetBody = memo(function ModuleSheetBody({
  modules,
  browseIndex,
  playingModuleIndex,
  playingFileIndex,
  onBrowseModule,
  onOpenFile,
}: {
  modules: FlatModule[];
  browseIndex: number;
  playingModuleIndex: number;
  playingFileIndex: number;
  onBrowseModule: (index: number) => void;
  onOpenFile: (moduleIndex: number, fileIndex: number) => void;
}) {
  if (modules.length === 0) {
    return <p className="dc-room-sheet-empty">No modules in this course yet.</p>;
  }

  return (
    <ul className="dc-room-sheet-list">
      {modules.map((module, moduleIndex) => {
        const expanded = moduleIndex === browseIndex;
        const playing = moduleIndex === playingModuleIndex;
        return (
          <li key={module.id}>
            <button
              type="button"
              className="dc-room-sheet-row"
              data-expanded={expanded ? "true" : "false"}
              data-classroom-sheet-module
              onClick={() => onBrowseModule(expanded ? -1 : moduleIndex)}
            >
              <span className="dc-room-sheet-row-icon">
                {module.locked ? <LockKeyhole size={15} /> : <BookOpen size={15} />}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="dc-room-sheet-row-title">{module.title}</span>
                <span className="dc-room-sheet-row-sub">
                  {module.locked
                    ? "Locked · tap a lesson to unlock"
                    : `${module.files.length} lesson${module.files.length === 1 ? "" : "s"}`}
                </span>
              </span>
              {playing && <span className="dc-room-sheet-playing" aria-label="Playing" />}
              <ChevronRight size={15} className={expanded ? "rotate-90 transition" : "transition"} />
            </button>

            {expanded && (
              <ul className="dc-room-sheet-sublist">
                {module.files.length === 0 && (
                  <li className="dc-room-sheet-empty">This module has no playable file.</li>
                )}
                {module.files.map((file, fileIndex) => {
                  const active = playing && fileIndex === playingFileIndex;
                  return (
                    <li key={file.id}>
                      <button
                        type="button"
                        className="dc-room-sheet-lesson"
                        data-active={active ? "true" : "false"}
                        data-classroom-sheet-lesson
                        onClick={() => onOpenFile(moduleIndex, fileIndex)}
                      >
                        <span className="dc-room-sheet-lesson-index">
                          {module.locked ? <LockKeyhole size={11} /> : fileIndex + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="dc-room-sheet-row-title">{file.name}</span>
                          <span className="dc-room-sheet-row-sub">
                            {FILE_KIND_LABEL[file.type] || file.type}
                          </span>
                        </span>
                        <span className="dc-room-sheet-goto">Board</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
});

/* ── Note library chooser ──────────────────────────────────────────────── */

export const NoteSheetBody = memo(function NoteSheetBody({
  notes,
  onOpenNote,
}: {
  notes: RoomNoteItem[];
  onOpenNote: (id: string) => void;
}) {
  if (notes.length === 0) {
    return (
      <p className="dc-room-sheet-empty">
        No notes yet — tap “New note” and write it on the notes wall.
      </p>
    );
  }
  return (
    <ul className="dc-room-sheet-list">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            className="dc-room-sheet-row"
            data-classroom-sheet-note
            onClick={() => onOpenNote(note.id)}
          >
            <span className="dc-room-sheet-row-icon">
              <NotebookPen size={15} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="dc-room-sheet-row-title">{note.title || "Untitled note"}</span>
              <span className="dc-room-sheet-row-sub">{note.preview || "Empty note"}</span>
            </span>
            <span className="dc-room-sheet-goto">Wall</span>
          </button>
        </li>
      ))}
    </ul>
  );
});

/* ── Mind map library chooser ──────────────────────────────────────────── */

export const MapSheetBody = memo(function MapSheetBody({
  maps,
  activeMapKey,
  onOpenMap,
}: {
  maps: RoomMapItem[];
  activeMapKey?: string | null;
  onOpenMap: (mapKey: string) => void;
}) {
  if (maps.length === 0) {
    return (
      <p className="dc-room-sheet-empty">
        No mind maps in this module yet — tap “New map” and draw it on the mind wall.
      </p>
    );
  }
  return (
    <ul className="dc-room-sheet-list">
      {maps.map((map) => (
        <li key={map.mapKey}>
          <button
            type="button"
            className="dc-room-sheet-row"
            data-active={map.mapKey === activeMapKey ? "true" : "false"}
            data-classroom-sheet-map
            onClick={() => onOpenMap(map.mapKey)}
          >
            <span className="dc-room-sheet-row-icon">
              <Network size={15} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="dc-room-sheet-row-title">{map.title || "Untitled map"}</span>
              <span className="dc-room-sheet-row-sub">
                {map.nodeCount} node{map.nodeCount === 1 ? "" : "s"}
              </span>
            </span>
            <span className="dc-room-sheet-goto">Wall</span>
          </button>
        </li>
      ))}
    </ul>
  );
});
