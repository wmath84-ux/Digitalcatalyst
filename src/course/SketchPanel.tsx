// src/course/SketchPanel.tsx
//
// The Course Player's SKETCH tab — the official Excalidraw editor, hosted
// inside the Split Deck's study pane.
//
//   lecture / resource  ──┬── the deck's lesson pane (untouched)
//                         │   (the divider is the deck's own)
//   this component      ──┴── the deck's study pane
//
// ── What this file is, and is not ────────────────────────────────────────
// It is the HOST: it gives Excalidraw a box with a real, resolved width and
// height, hands it the scene the player loaded for this module, forwards every
// change to `useCourseSketch` (which owns persistence) and shows one slim save
// line. It is NOT a drawing UI: every tool, the toolbar, the menus, undo/redo,
// zoom, the shape/colour pickers and the canvas gestures are Excalidraw's own
// official component — nothing here reimplements, hides or re-skins them.
//
// ── Sizing (the one thing that breaks Excalidraw) ────────────────────────
// Excalidraw fills its parent, so the parent must RESOLVE a height. The pane
// is a flex column: the save line is `shrink-0`, the canvas host is
// `min-h-0 flex-1 relative`, and the editor sits in an `absolute inset-0`
// child of it. No percentage heights, no viewport units, no window.innerHeight
// — the pane's own box is the only source of truth, so every divider drag,
// orientation flip and browser resize simply re-lays the box out. Excalidraw
// re-measures itself through its own internal ResizeObserver, so there is no
// second observer here.
//
// ── Lifecycle ────────────────────────────────────────────────────────────
// The editor is keyed by the SCENE's identity (`sceneKey` = course+module, as
// handed down by the hook) — never by the split ratio, the pane size or the
// active tab, so resizing the deck can never recreate the canvas. Switching
// modules DOES change the key, because that is a different board.

import { useMemo } from "react";
// Must come first: it sets window.EXCALIDRAW_ASSET_PATH before the editor's
// font loader runs (see the file's header).
import "./excalidrawAssets";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { SketchSaveStatus } from "./useCourseSketch";
import type { SketchScene } from "../../utils/sketchScene";

export interface SketchPanelProps {
  /**
   * The live board, read once — when the editor mounts. A getter, not a
   * value: drawing does not re-render the player, so a plain prop could hand
   * a remounting editor a scene one quiet period out of date.
   */
  getScene: () => SketchScene;
  /** Scene identity — the editor's React key. Course + module, nothing else. */
  sceneKey: string;
  /** True until the board for this module is known (cloud or device copy). */
  loading: boolean;
  status: SketchSaveStatus;
  errorMessage: string | null;
  /** True while local edits have not reached the cloud yet. */
  pendingSync: boolean;
  /** False when there is no learner / module to scope a board to. */
  scoped: boolean;
  /** Excalidraw's own `onChange` — elements, appState, files. */
  onChange: (elements: unknown, appState: unknown, files: unknown) => void;
  /** The module this board belongs to (export filename + the save line). */
  boardName?: string;
}

/** The slim save line — the only chrome this panel adds. Never a banner. */
function SketchStatus({
  status,
  pendingSync,
  errorMessage,
  boardName,
}: {
  status: SketchSaveStatus;
  pendingSync: boolean;
  errorMessage: string | null;
  boardName?: string;
}) {
  let label = "Sketch";
  let tone: "muted" | "ok" | "warn" = "muted";
  if (status === "loading") {
    label = "Loading sketch…";
  } else if (status === "saving") {
    label = "Saving…";
  } else if (status === "error") {
    label = pendingSync ? "Offline draft — saved on this device" : "Sync paused";
    tone = "warn";
  } else if (status === "saved") {
    label = "Saved";
    tone = "ok";
  } else if (status === "ready") {
    label = "Ready";
  }
  const dot = tone === "warn" ? "bg-amber-400" : tone === "ok" ? "bg-emerald-400" : "bg-slate-400";
  const text = tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-white/55";
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1"
      data-course-sketch-status={status}
      data-course-sketch-pending={pendingSync ? "true" : "false"}
    >
      <span
        role="status"
        aria-live="polite"
        className={`flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold ${text}`}
        title={errorMessage ?? undefined}
      >
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </span>
      {boardName ? (
        <span className="ml-auto min-w-0 truncate text-[10px] font-semibold text-white/35" data-course-sketch-board>
          {boardName}
        </span>
      ) : null}
    </div>
  );
}

export default function SketchPanel({
  getScene,
  sceneKey,
  loading,
  status,
  errorMessage,
  pendingSync,
  scoped,
  onChange,
  boardName,
}: SketchPanelProps) {
  /**
   * Excalidraw reads `initialData` ONCE, on mount. It is therefore memoised
   * on the scene's identity — the same thing the editor is keyed by — so a
   * re-render caused by the save line (or by a divider drag) can never hand
   * the editor a new object and never remounts it.
   */
  const initialData = useMemo(() => {
    const scene = getScene();
    const saved = (scene.appState ?? {}) as Record<string, unknown>;
    // A board that was saved mid-pan reopens exactly where the learner left
    // it; a board with no remembered viewport is centred on its drawing.
    const hasViewport = Number.isFinite(saved.scrollX) && Number.isFinite(saved.scrollY);
    return {
      elements: scene.elements as never,
      appState: {
        // The player is a dark surface, so the board opens dark unless the
        // learner flipped Excalidraw's own theme toggle (which is persisted).
        theme: "dark",
        ...saved,
      } as never,
      files: scene.files as never,
      scrollToContent: !hasViewport,
    };
    // Deliberately keyed to the scene's identity, not to `scene`: Excalidraw
    // reads this once per mount and the hook mutates the live scene in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-course-sketch-panel
      data-sketch-scope={scoped ? "module" : "none"}
    >
      <SketchStatus status={status} pendingSync={pendingSync} errorMessage={errorMessage} boardName={boardName} />

      {/* The canvas host: a positioned, flex-sized box. The editor is its
          absolutely-filled child, so its width and height always resolve from
          the study pane — whatever the split ratio is doing. */}
      <div className="relative min-h-0 w-full flex-1" data-course-sketch-canvas>
        {loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <span
              aria-label="Loading sketch"
              className="block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-orange-400"
            />
          </div>
        ) : (
          <div className="absolute inset-0" data-course-sketch-host>
            <Excalidraw
              key={sceneKey}
              initialData={initialData}
              onChange={onChange}
              name={boardName || "Sketch"}
              // The player owns its own ⌘/Ctrl shortcuts: the editor only
              // takes the keyboard while the learner is actually in it.
              handleKeyboardGlobally={false}
              autoFocus={false}
            />
          </div>
        )}
        {!scoped && !loading ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded-full bg-black/60 px-3 py-1 text-[10px] font-semibold text-white/60"
            data-course-sketch-unscoped
          >
            Open a lesson to save this sketch with its module
          </div>
        ) : null}
      </div>
    </div>
  );
}
