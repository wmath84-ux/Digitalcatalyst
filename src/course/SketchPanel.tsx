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
// line with the canvas control (White / Dark / the pencil's full-RGB picker —
// `SketchCanvasControls.tsx`). It is NOT a drawing UI: every tool, the
// toolbar, the menus, undo/redo, zoom, the shape/colour pickers and the canvas
// gestures are Excalidraw's own official component — nothing here reimplements,
// hides or re-skins them.
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
// handed down by the hook) — never by the split, the pane size or the active
// tab, so resizing the deck can never recreate the canvas. Switching modules
// DOES change the key, because that is a different board.
//
// ── Canvas colour ────────────────────────────────────────────────────────
// The control writes TWO appState values, because one is not enough to render
// a colour: `theme` and the scene-space `viewBackgroundColor` the dark-mode
// filter is applied to (see `utils/sketchCanvas.js`). They are written through
// Excalidraw's own API, so the editor reports them back through `onChange` and
// the sketch pipeline persists them with the board. A colour change is also
// announced to the hook with `markSceneChanged()`, because the hook's change
// queue watches ELEMENTS (one write per stroke, never one per hover): a canvas
// choice must still reach the cloud even when the board is otherwise empty.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Must come first: it sets window.EXCALIDRAW_ASSET_PATH before the editor's
// font loader runs (see the file's header).
import "./excalidrawAssets";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { SketchSaveStatus } from "./useCourseSketch";
import type { SketchScene } from "../../utils/sketchScene";
import {
  SKETCH_CANVAS_DEFAULT,
  readSketchCanvasPreference,
  sketchCanvasAppState,
  sketchCanvasFromAppState,
  writeSketchCanvasPreference,
  type SketchCanvasTheme,
} from "../../utils/sketchCanvas";
import SketchCanvasControls from "./SketchCanvasControls";

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
  /** The learner — scopes the remembered canvas preference. */
  uid?: string | null;
  /**
   * Tell the hook the live scene changed in a way its element signature cannot
   * see — i.e. the canvas colour. Without it a colour-only change would sit in
   * the scene and never reach the cloud.
   */
  markSceneChanged?: () => void;
}

/** The pair of appState values that paints one canvas colour. */
interface CanvasChoice {
  theme: SketchCanvasTheme;
  sceneColor: string;
}

/**
 * The canvas a board OPENS with: its own remembered colour, else the learner's
 * preference (a new module, the next course), else the dark default — which is
 * Excalidraw's own default board, unchanged.
 */
function openingCanvas(appState: unknown, uid: string): CanvasChoice {
  const saved = sketchCanvasFromAppState(appState);
  if (saved) return { theme: saved.theme, sceneColor: saved.sceneColor };
  const preference = readSketchCanvasPreference(uid);
  const applied = preference ? sketchCanvasAppState(preference.color) : null;
  if (applied) return { theme: applied.theme, sceneColor: applied.viewBackgroundColor };
  const fallback = sketchCanvasAppState(SKETCH_CANVAS_DEFAULT.color);
  return fallback
    ? { theme: fallback.theme, sceneColor: fallback.viewBackgroundColor }
    : { theme: SKETCH_CANVAS_DEFAULT.theme, sceneColor: "#ffffff" };
}

/** The slim save line — the only chrome this panel adds. Never a banner. */
function SketchStatus({
  status,
  pendingSync,
  errorMessage,
  boardName,
  canvas,
  onPickCanvas,
  canvasReady,
}: {
  status: SketchSaveStatus;
  pendingSync: boolean;
  errorMessage: string | null;
  boardName?: string;
  canvas: CanvasChoice;
  onPickCanvas: (color: string) => void;
  canvasReady: boolean;
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
      <SketchCanvasControls
        theme={canvas.theme}
        sceneColor={canvas.sceneColor}
        onPick={onPickCanvas}
        ready={canvasReady}
      />
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
  uid,
  markSceneChanged,
}: SketchPanelProps) {
  const uidText = String(uid || "").trim();

  /** The canvas the row reports — the editor's live appState, mirrored. */
  // (No explicit type argument here on purpose: `<CanvasChoice>` would read as
  // a `<canvas>` element to the integration contract that forbids one.)
  const [canvas, setCanvas] = useState(() => openingCanvas(getScene().appState, uidText));
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  /** The live editor API, for the one thing a prop cannot do: change appState. */
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // A different board is a different canvas: re-read it when the scene
  // identity moves (module switch, or a late cloud board replacing this one).
  useEffect(() => {
    setCanvas(openingCanvas(getScene().appState, uidText));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  /**
   * The editor's own `onChange`, forwarded untouched — plus a cheap mirror of
   * the two appState fields the canvas row shows, so a theme toggled from
   * Excalidraw's own menu is reflected here too. It re-renders the panel only
   * when those two values actually change: never per stroke.
   */
  const handleChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      onChange(elements, appState, files);
      const next = sketchCanvasFromAppState(appState);
      if (!next) return;
      const previous = canvasRef.current;
      if (next.theme === previous.theme && next.sceneColor === previous.sceneColor) return;
      const value: CanvasChoice = { theme: next.theme, sceneColor: next.sceneColor };
      canvasRef.current = value;
      setCanvas(value);
    },
    [onChange],
  );

  const handleApi = useCallback((instance: ExcalidrawImperativeAPI | null) => {
    apiRef.current = instance;
    setCanvasReady(Boolean(instance));
  }, []);

  /** The learner picked a colour: paint it, remember it, persist it. */
  const pickCanvas = useCallback(
    (color: string) => {
      const applied = sketchCanvasAppState(color);
      if (!applied) return;
      const value: CanvasChoice = { theme: applied.theme, sceneColor: applied.viewBackgroundColor };
      canvasRef.current = value;
      setCanvas(value);
      // The learner's choice follows them to boards that never chose one.
      writeSketchCanvasPreference(uidText, color);
      const editor = apiRef.current;
      if (!editor) return;
      editor.updateScene({ appState: { theme: value.theme, viewBackgroundColor: value.sceneColor } });
      // The change queue watches elements; a colour must be able to save on
      // its own, so the board keeps the canvas it was last left with.
      markSceneChanged?.();
    },
    [uidText, markSceneChanged],
  );

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
    // A board that never chose a canvas colour opens with the learner's
    // remembered one (the White preset included) instead of the dark default.
    const opening = sketchCanvasFromAppState(saved) ? null : openingCanvas(saved, uidText);
    return {
      elements: scene.elements as never,
      appState: {
        // The player is a dark surface, so the board opens dark unless the
        // learner flipped Excalidraw's own theme toggle (which is persisted).
        theme: "dark",
        ...saved,
        // …and the colour and the theme that renders it are ONE choice, so
        // they are applied together — never a colour under the wrong theme.
        ...(opening ? { theme: opening.theme, viewBackgroundColor: opening.sceneColor } : {}),
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
      <SketchStatus
        status={status}
        pendingSync={pendingSync}
        errorMessage={errorMessage}
        boardName={boardName}
        canvas={canvas}
        onPickCanvas={pickCanvas}
        canvasReady={canvasReady && !loading}
      />

      {/* The canvas host: a positioned, flex-sized box. The editor is its
          absolutely-filled child, so its width and height always resolve from
          the study pane — whatever the split is doing. */}
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
              onChange={handleChange}
              onExcalidrawAPI={handleApi}
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
