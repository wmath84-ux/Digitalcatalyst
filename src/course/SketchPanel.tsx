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
// The ONE piece of host chrome on the canvas itself: the save line's colour
// cluster — the theme-default (dark) swatch, the WHITE swatch, and a pencil
// that opens a full-RGB picker (R/G/B sliders + hex). Excalidraw ships a theme
// toggle but no canvas-colour control, so the host offers it. A pick is
// applied through the editor's imperative API (what you pick is what you see —
// a chosen colour also flips the board to the light theme, because the dark
// theme inverts the canvas colour) and persisted by the hook, two ways: on the
// board itself (appState `theme` + `viewBackgroundColor`) and as the learner's
// device preference, so reopening — this board or a fresh one — shows the
// same canvas.
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

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
// Must come first: it sets window.EXCALIDRAW_ASSET_PATH before the editor's
// font loader runs (see the file's header).
import "./excalidrawAssets";
import { Excalidraw } from "@excalidraw/excalidraw";
// A second import line on purpose: the integration contract pins the FIRST
// line's exact text, and the editor's library hook is the only other symbol
// this panel needs from the package.
import { useHandleLibrary } from "@excalidraw/excalidraw";
// A third line for the menu / sidebar surface the Course Player customises in
// Clean / Optimised Look (and to drop Excalidraw's "Excalidraw links" social
// group — GitHub / Follow Us / Discord — per Part 1 §24).
import { MainMenu, Sidebar } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { BookMarked, ChevronLeft, ChevronRight, Eraser, Eye, Layers, Menu, Pencil, PenLine, Plus, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import type { SketchBoardSummary, SketchSaveStatus } from "./useCourseSketch";
import type { CoursePlayerTheme } from "./playerPreferences";
import type { SketchScene } from "../../utils/sketchScene";
// The learner's PERSONAL LIBRARY (the editor ships the panel but no storage —
// see the hook's header) plus the "Add to Excalidraw" return link it installs.
import { useSketchLibrary, type SketchLibraryDeviceStore } from "./useSketchLibrary";
import { isAllowedExcalidrawLibraryUrl } from "../../utils/excalidrawLibraryLink.js";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import PerfectFreehandSketch from "../components/PerfectFreehandSketch";
// The ONE listing system — the same rows the notes library and the mind map
// library use: one clean line per item, no pencil / trash on the row, and the
// row's own actions (Rename in place, Delete) behind a long press.
import BranchedMenu, { type BranchedMenuItem } from "../components/branched-menu/BranchedMenu";
// `CaptureUpdateAction` is the editor's own history flag: "Clear canvas" with
// it is ONE undoable step — the same semantics as the editor's clear action.
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { useCourseFooterInset } from "./useCourseFooterInset";
import { COURSE_FOOTER_INSET_PROPERTY } from "./courseFooterInset";
import { SKETCH_DEFAULT_KEY } from "../../utils/sketchScene";
import "./sketchLibrary.css";

/** Read mode's tray hides on ONE tap, and the next tap brings it back. */
const READ_TAP_SLOP_PX = 10;
/** This library is one flat list of canvases — it has no folding sections. */
const NO_SECTIONS: ReadonlySet<string> = new Set<string>();
const noopToggle = () => {};

/**
 * The editor's imperative API, derived from the component's own props type
 * (never a subpath import that could drift between editor builds).
 */
type ExcalidrawAPI = NonNullable<
  Parameters<
    NonNullable<ComponentProps<typeof Excalidraw>["onExcalidrawAPI"]>
  >[0]
>;

/** One full-RGB colour, 0–255 per channel. */
interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#a1b2c3` → channels. Anything unparsable opens the picker on white. */
const hexToRgb = (hex: string | null): Rgb => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!match) return { r: 255, g: 255, b: 255 };
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  const value = Number.parseInt(digits, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

const rgbToHex = (rgb: Rgb) =>
  `#${[rgb.r, rgb.g, rgb.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/** The hex field's own input: valid only when it is a real hex colour. */
const parseHexInput = (text: string): Rgb | null => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  return match ? hexToRgb(`#${match[1]}`) : null;
};

/** True when a hex colour is light enough to want a dark icon on top of it. */
const isLightColour = (hex: string | null) => {
  if (!hex) return false;
  const { r, g, b } = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

/**
 * The FULL-RGB canvas colour picker behind the pencil icon: one slider per
 * channel (0–255) plus a hex field. Sliding previews the canvas live; the
 * choice is COMMITTED (persisted) on release / blur / Enter, so a long drag
 * costs one save, not one per tick.
 */
function SketchColourPicker({
  initial,
  onPick,
}: {
  /** The colour to open on (null = the theme default → open on white). */
  initial: string | null;
  /** `commit` true = persist; false = live canvas preview only. */
  onPick: (hex: string | null, commit: boolean) => void;
}) {
  const [rgb, setRgb] = useState<Rgb>(() => hexToRgb(initial));
  const [draft, setDraft] = useState<string>(() => rgbToHex(hexToRgb(initial)));

  const CHANNELS: Array<{ key: keyof Rgb; accent: string }> = [
    { key: "r", accent: "accent-rose-500" },
    { key: "g", accent: "accent-emerald-500" },
    { key: "b", accent: "accent-sky-500" },
  ];

  const setChannel = (key: keyof Rgb, value: number) => {
    const next = { ...rgb, [key]: value };
    setRgb(next);
    onPick(rgbToHex(next), false);
  };

  const commitHex = (text: string) => {
    const parsed = parseHexInput(text);
    if (parsed) {
      setRgb(parsed);
      setDraft(rgbToHex(parsed));
      onPick(rgbToHex(parsed), true);
    } else {
      setDraft(rgbToHex(rgb));
    }
  };

  return (
    <div
      className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-white/10 bg-[#1b1b21]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-md"
      data-course-sketch-picker
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
          Canvas colour
        </span>
        <span
          aria-hidden
          className="h-4 w-6 rounded-sm border border-white/25"
          style={{ background: rgbToHex(rgb) }}
        />
      </div>
      {CHANNELS.map(({ key, accent }) => (
        <label key={key} className="mb-2 flex items-center gap-2">
          <span className="w-3 text-[10px] font-bold text-white/55">{key.toUpperCase()}</span>
          <input
            type="range"
            min={0}
            max={255}
            step={1}
            value={rgb[key]}
            aria-label={`Canvas colour ${key.toUpperCase()} channel`}
            className={`h-1.5 w-full cursor-pointer ${accent}`}
            onChange={(event) => setChannel(key, Number(event.currentTarget.value))}
            onPointerUp={() => onPick(rgbToHex(rgb), true)}
            onKeyUp={() => onPick(rgbToHex(rgb), true)}
            onBlur={() => onPick(rgbToHex(rgb), true)}
          />
          <span className="w-7 text-right text-[10px] font-semibold tabular-nums text-white/70">
            {rgb[key]}
          </span>
        </label>
      ))}
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            const parsed = parseHexInput(event.currentTarget.value);
            if (parsed) onPick(rgbToHex(parsed), false);
          }}
          onBlur={(event) => commitHex(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitHex(event.currentTarget.value);
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Canvas colour as hex, like 1a2b3c"
          className="w-24 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-[11px] font-semibold text-white outline-none focus:border-white/40"
        />
        <button
          type="button"
          onClick={() => onPick(null, true)}
          className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          Theme
        </button>
      </div>
    </div>
  );
}

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
  /**
   * Excalidraw's own `onChange` — elements, appState, files — plus the
   * `sceneKey` the editor was mounted for (stale editors are ignored).
   */
  onChange: (elements: unknown, appState: unknown, files: unknown, forSceneKey?: string) => void;
  /**
   * The colour this board opens with: its own saved colour, else the
   * learner's last-used device colour, else `null` (the theme default).
   * Drives both the editor's initial canvas and the swatch highlight.
   */
  canvasColor: string | null;
  /** Persist the learner's canvas colour choice (board + device preference). */
  onCanvasColorChange: (color: string | null) => void;
  /** The module this board belongs to (export filename + the save line). */
  boardName?: string;
  /**
   * The signed-in learner — scopes their PERSONAL LIBRARY document
   * (`users/{uid}/sketchLibraries/main`). Absent/null = no library storage.
   */
  uid?: string | null;
  /** False when even the device copy could not be written (storage full). */
  deviceSaved?: boolean;
  /** Retry a failed read/write now (the save line's Retry). */
  onRetry?: () => void;
  /** The module's boards (canvas switcher), first board first. */
  boards?: SketchBoardSummary[];
  /** The board on screen. */
  activeBoardKey?: string;
  activeBoardTitle?: string;
  /** Open another board of this module. */
  onSelectBoard?: (sketchKey: string) => void;
  /** "+" — create a fresh blank board, register it and open it. */
  onCreateBoard?: () => string | null;
  /** False when there is no module scope or the module is at its limit. */
  canCreateBoard?: boolean;
  /** Delete the active canvas (Part 1 §30); returns whether one was removed. */
  onDeleteActive?: () => boolean;
  /** True when the active module holds more than one canvas. */
  /**
   * Rename ONE canvas — the panel's long-press Rename, editing that row's own
   * label in place (the notes library's gesture, on this page's library).
   */
  onRenameBoard?: (sketchKey: string, title: string) => boolean | void;
  /**
   * Delete ONE canvas (the panel's long-press Delete → the confirmation
   * dialog). The guaranteed first canvas is never deletable.
   */
  onDeleteBoard?: (sketchKey: string) => boolean | void;
  /** "Clean / Optimised Look" (Part 1 §26): header hidden, toolbar on top,
   *  useful header actions in the left sidebar, canvas maximised. */
  cleanLook?: boolean;
  /** Product ID for Quick Sketch persistence */
  productId?: string | number | null;
  /** Module ID for Quick Sketch persistence */
  moduleId?: string | number | null;
  /** Resource ID for Quick Sketch association */
  resourceId?: string | null;
  /** Resource name for Quick Sketch association */
  resourceName?: string | null;
  /** Player chrome theme for the shared delete dialog; independent of canvasColor. */
  playerTheme?: CoursePlayerTheme;
  /** Keep the scene, files and personal library on this device only. */
  storageOnly?: boolean;
  /** IndexedDB adapter used by Work for the potentially large library. */
  libraryDeviceStore?: SketchLibraryDeviceStore;
}

/**
 * The module's canvases, listed the way the notes library lists its notes: ONE
 * clean line per canvas — no pencil, no trash — and the row's own actions,
 * Rename (editing that row's label in place) and Delete, behind a long press
 * (a secondary click and the keyboard menu key work too). `BranchedMenu` is the
 * shared listing system, so this library reads exactly like the note and mind
 * map ones.
 */
function SketchCanvasList({
  boards,
  activeBoardKey,
  onSelectBoard,
  onRenameBoard,
  onRequestDelete,
  canDelete,
}: {
  boards: SketchBoardSummary[];
  activeBoardKey: string;
  onSelectBoard?: (sketchKey: string) => void;
  onRenameBoard?: (sketchKey: string, title: string) => void;
  /** Ask to delete ONE canvas (the page confirms it first — never the row). */
  onRequestDelete?: (sketchKey: string) => void;
  /** False when this module must keep every canvas it has. */
  canDelete: boolean;
}) {
  const items = useMemo<BranchedMenuItem[]>(
    () =>
      boards.map((board) => ({
        value: `canvas:${board.sketchKey}`,
        label: board.title,
        icon: <Layers size={15} aria-hidden />,
        description: `${board.title} — ${board.elementCount > 0 ? `${board.elementCount} item${board.elementCount === 1 ? "" : "s"}` : "blank"}`,
        meta: (
          <span className="sketch-library-menu__count">
            {board.elementCount > 0 ? `${board.elementCount} item${board.elementCount === 1 ? "" : "s"}` : "Blank"}
          </span>
        ),
        onRename: onRenameBoard ? (nextLabel: string) => onRenameBoard(board.sketchKey, nextLabel) : undefined,
        onDelete:
          canDelete && board.sketchKey !== SKETCH_DEFAULT_KEY && onRequestDelete
            ? () => onRequestDelete(board.sketchKey)
            : undefined,
        dataAttrs: {
          "data-course-sketch-canvas-row": board.sketchKey,
          "data-course-sketch-board-option": board.sketchKey,
        },
      })),
    [boards, canDelete, onRenameBoard, onRequestDelete],
  );

  return (
    <BranchedMenu
      items={items}
      openValues={NO_SECTIONS}
      onToggle={noopToggle}
      activeValue={`canvas:${activeBoardKey}`}
      onSelect={(value) => {
        const key = value.startsWith("canvas:") ? value.slice("canvas:".length) : "";
        if (key && key !== activeBoardKey) onSelectBoard?.(key);
      }}
      ariaLabel="Your sketch canvases"
      fullWidth
      rowHeight={44}
      leafActionMenu="long-press"
      className="sketch-library-menu"
    />
  );
}

/**
 * The canvas-colour cluster (theme swatch, white swatch, pencil → full RGB).
 * Extracted so the SAME controls live in the normal save line AND in the Clean
 * Look's left sidebar without a second implementation (Part 1 §26C).
 */
function SketchColourCluster({
  canvasColour,
  onPick,
}: {
  canvasColour: string | null;
  onPick: (hex: string | null, commit: boolean) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const isCustomColour = canvasColour !== null && canvasColour.toLowerCase() !== "#ffffff";

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDocumentClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [pickerOpen]);

  return (
    <div className="flex items-center gap-1.5" data-course-sketch-colour-cluster>
      <button
        type="button"
        aria-label="Default white canvas"
        aria-pressed={canvasColour === null}
        onClick={() => onPick(null, true)}
        data-course-sketch-swatch="theme"
        className={`h-4 w-4 rounded-full border border-slate-300 bg-white transition-shadow ${
          canvasColour === null ? "ring-2 ring-white/70 ring-offset-1 ring-offset-[#0c0c12]" : "hover:ring-1 hover:ring-white/40"
        }`}
      />
      <button
        type="button"
        aria-label="White canvas"
        aria-pressed={canvasColour?.toLowerCase() === "#ffffff"}
        onClick={() => onPick("#ffffff", true)}
        data-course-sketch-swatch="white"
        className={`h-4 w-4 rounded-full border border-white/40 bg-white transition-shadow ${
          canvasColour?.toLowerCase() === "#ffffff" ? "ring-2 ring-white/70 ring-offset-1 ring-offset-[#0c0c12]" : "hover:ring-1 hover:ring-white/40"
        }`}
      />
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          aria-label="Custom canvas colour (RGB)"
          aria-pressed={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
          data-course-sketch-pen
          style={
            isCustomColour
              ? { background: canvasColour, color: isLightColour(canvasColour) ? "#141416" : "#ffffff" }
              : undefined
          }
          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            isCustomColour
              ? "border-white/40"
              : pickerOpen
                ? "border-transparent bg-white/15 text-white"
                : "border-transparent text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Pencil aria-hidden size={12} />
        </button>
        {pickerOpen ? <SketchColourPicker initial={canvasColour} onPick={onPick} /> : null}
      </div>
    </div>
  );
}

/** Library account state lives in the panel's options (and Clean Look's sidebar). */
function SketchLibraryPill({ library, storageOnly = false }: { library: ReturnType<typeof useSketchLibrary>; storageOnly?: boolean }) {
  return (
    <span
      data-course-sketch-library={library.state}
      data-course-sketch-library-count={library.itemCount}
      title={library.importError || library.error || (storageOnly
        ? "Your personal library is stored only on this device."
        : "Your personal library — saved to your account and synced to your other devices")}
      className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
        library.importState === "importing"
          ? "border-white/25 text-white/70"
          : library.importError || library.error
            ? "border-amber-400/40 text-amber-300"
            : "border-white/15 text-white/55"
      }`}
    >
      {library.importState === "importing" ? (
        <span aria-hidden className="block h-2.5 w-2.5 animate-spin rounded-full border border-white/25 border-t-white/80" />
      ) : (
        <BookMarked aria-hidden size={11} />
      )}
      <span className="tabular-nums">
        {library.importState === "importing"
          ? "Adding library…"
          : library.importState === "imported"
            ? "Library added"
            : library.itemCount > 0
              ? `Library ${library.itemCount}`
              : "Library"}
      </span>
    </span>
  );
}

/**
 * The page's ONE piece of chrome that is not a tray or the panel: a QUIET
 * status chip, centred at the top, that holds no button at all — exactly the
 * notes page's own status chip. Retry lives in the panel's options, and the
 * chip never blocks the canvas.
 */
function sketchStatusText({
  status,
  pendingSync,
  storageOnly,
  scoped,
  deviceSaved,
}: {
  status: SketchSaveStatus;
  pendingSync: boolean;
  storageOnly: boolean;
  scoped: boolean;
  deviceSaved: boolean;
}): { label: string; tone: "muted" | "ok" | "warn" } {
  if (storageOnly) {
    if (status === "loading") return { label: "Loading from this device…", tone: "muted" };
    if (status === "pending" || status === "saving") return { label: "Saving on this device…", tone: "muted" };
    if (status === "error") return { label: "Device save needs attention", tone: "warn" };
    if (status === "saved") return { label: "Saved on this device", tone: "ok" };
    return { label: "Device only · ready", tone: "muted" };
  }
  if (!scoped) return { label: "Kept on this device", tone: "muted" };
  if (status === "loading") return { label: "Loading sketch…", tone: "muted" };
  if (status === "pending") return { label: "Unsaved changes…", tone: "muted" };
  if (status === "saving") return { label: "Saving…", tone: "muted" };
  if (status === "error") {
    return {
      label: !deviceSaved ? "Not saved yet — retrying" : pendingSync ? "Offline draft — saved on this device" : "Sync paused",
      tone: "warn",
    };
  }
  if (status === "saved") return { label: "Saved", tone: "ok" };
  return { label: "Ready", tone: "muted" };
}

function SketchStatusChip({
  status,
  pendingSync,
  errorMessage,
  storageOnly,
  scoped,
  deviceSaved,
}: {
  status: SketchSaveStatus;
  pendingSync: boolean;
  errorMessage: string | null;
  storageOnly: boolean;
  scoped: boolean;
  deviceSaved: boolean;
}) {
  const { label, tone } = sketchStatusText({ status, pendingSync, storageOnly, scoped, deviceSaved });
  const dot = tone === "warn" ? "bg-amber-400" : tone === "ok" ? "bg-emerald-400" : "bg-slate-400";
  const text = tone === "warn" ? "text-amber-200" : tone === "ok" ? "text-emerald-200" : "text-white/70";
  return (
    <span
      role="status"
      aria-live="polite"
      title={errorMessage ?? undefined}
      data-course-sketch-status={status}
      data-course-sketch-pending={pendingSync ? "true" : "false"}
      className={`inline-flex max-w-[60vw] items-center gap-1.5 truncate rounded-full border border-white/10 bg-[#141419]/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur ${text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </span>
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
  canvasColor,
  onCanvasColorChange,
  boardName,
  uid = null,
  deviceSaved = true,
  onRetry,
  boards = [],
  activeBoardKey = "main",
  activeBoardTitle = "Canvas 1",
  onSelectBoard,
  onCreateBoard,
  canCreateBoard = false,
  onDeleteActive,
  onRenameBoard,
  onDeleteBoard,
  cleanLook = false,
  productId = null,
  moduleId = null,
  resourceId = null,
  resourceName = null,
  playerTheme = "light",
  storageOnly = false,
  libraryDeviceStore,
}: SketchPanelProps) {
  /** The editor's imperative API (canvas colour + the library adapter). */
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  /**
   * The same API in state: `useHandleLibrary` below only wires itself up once
   * it receives a non-null API, and state is what re-runs it. Passing the ref
   * would leave the library adapter mounted with a null editor.
   */
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawAPI | null>(null);
  /** The learner's own library — cloud-backed in Courses, Dexie-only in Work. */
  const library = useSketchLibrary({ uid, storageOnly, deviceStore: libraryDeviceStore });
  /** The canvas colour as the learner currently sees it (null = theme). */
  const [canvasColour, setCanvasColour] = useState<string | null>(canvasColor);
  /**
   * §30 deletion is a two-step act. The panel's row asks for it; this is the
   * canvas it names, and only the red confirm removes THAT one.
   */
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const pendingDeleteTitle = boards.find((board) => board.sketchKey === pendingDeleteKey)?.title ?? activeBoardTitle;
  /**
   * The page's ONE side panel — the module's canvases plus every option a
   * header used to hold. It opens from the bottom tray's own panel button
   * (read mode's, exactly like the notes page, or the editor's), and any click
   * outside it — the visible strip, the canvas — hides it again.
   */
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sidePanelOpen) return undefined;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sidePanelRef.current?.contains(target)) return;
      // Every tray button that opens this panel is a toggle, never an
      // "outside click" — the same rule the notes page follows.
      if ((event.target as HTMLElement | null)?.closest?.("[data-course-sketch-panel-toggle]")) return;
      setSidePanelOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSidePanelOpen(false); setPendingDeleteKey(null); }
    };
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [sidePanelOpen]);
  // A different board (or mode) never inherits an open side panel.
  useEffect(() => { setSidePanelOpen(false); }, [sceneKey, activeBoardKey]);
  /**
   * Quick Sketch mode (perfect-freehand) vs Full Editor (Excalidraw). The
   * two coexist: switching to Quick Sketch hides the editor but keeps its
   * state intact, so the learner can pop back with their work preserved.
   */
  const [mode, setMode] = useState<"editor" | "quick-sketch">("editor");
  /**
   * The same fact as a boolean, deliberately: inside the Excalidraw branch
   * TypeScript has already narrowed `mode` to `"editor"`, so comparing it to
   * `"quick-sketch"` there is an impossible comparison. A boolean keeps the
   * shared chrome readable from both branches.
   */
  const quickMode = mode === "quick-sketch";
  /**
   * READ FIRST, always (the notes page's rule, and the owner's brief): a
   * sketch opens VIEW ONLY — the canvas takes no marks and Excalidraw runs in
   * its own view mode — and the eye in the editing tray, or the tray's pencil,
   * is the only door between the two. Opening another canvas, or switching
   * between the two editors, starts reading again.
   */
  const [readOnlySketch, setReadOnlySketch] = useState(true);
  const editing = !readOnlySketch;
  const enterEditMode = useCallback(() => {
    setReadChromeVisible(true);
    setReadOnlySketch(false);
  }, []);
  const enterReadMode = useCallback(() => {
    setReadOnlySketch(true);
    setReadChromeVisible(true);
  }, []);
  /**
   * Read mode's chrome — the bottom tray, its side-panel button included. ONE
   * tap on the canvas hides it and the next tap brings it straight back, so a
   * drawing can be read whole (the same gesture, and the same rule, as the
   * notes page and the mind map).
   */
  const [readChromeVisible, setReadChromeVisible] = useState(true);
  const readTapStartRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setReadOnlySketch(true);
    setReadChromeVisible(true);
    setPendingDeleteKey(null);
  }, [sceneKey, mode]);
  /** The canvas host: measures the tray's lift over the player's footer nav. */
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const footerInset = useCourseFooterInset(!quickMode, canvasHostRef);
  useEffect(() => {
    const shell = canvasHostRef.current?.closest("[data-course-sketch-panel]") as HTMLElement | null;
    if (!shell) return;
    if (footerInset > 0) shell.style.setProperty(COURSE_FOOTER_INSET_PROPERTY, `${footerInset}px`);
    else shell.style.removeProperty(COURSE_FOOTER_INSET_PROPERTY);
  }, [footerInset]);


  /**
   * Where libraries.excalidraw.com sends the browser back to. A STABLE value
   * (`origin + pathname`, never the current hash route): the site appends
   * `#addLibrary=<url>` to it, and main.tsx turns that return into the route
   * the learner was on (see utils/excalidrawLibraryLink.js).
   */
  const libraryReturnUrl = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`),
    [],
  );

  /**
   * THE fix for "my library items were saved but the library is empty again":
   * the editor persists nothing by itself, so the host hands it the adapter
   * that does (Firestore + a localStorage mirror). Also the same call the
   * editor's own library panel expects for the "Browse libraries" return
   * link — with a validator widened to the two library hosts (the default
   * only allows excalidraw.com and would reject our own origin's return).
   */
  useHandleLibrary({
    excalidrawAPI: excalidrawApi,
    adapter: library.adapter as never,
    validateLibraryUrl: (url: string) => isAllowedExcalidrawLibraryUrl(url),
  });

  /**
   * Belt-and-braces: the editor also reports every library change directly.
   * `useHandleLibrary` is the primary writer; this makes a change survive even
   * if that hook's own save pass bails — the save is debounced and idempotent,
   * so the duplicate is free.
   */
  const onLibraryChange = (items: unknown) => {
    void library.adapter.save({ libraryItems: items });
  };

  /**
   * Install a parked "Add to Excalidraw" library into this editor, once per
   * link per mount. `updateLibrary({merge: true})` is the editor's own import
   * path (the same one its file-drop uses), so the items are real library
   * items — and, because the adapter above is mounted, they are persisted the
   * moment the editor reports them.
   */
  const importAttemptedRef = useRef("");
  useEffect(() => {
    const link = library.pendingImport;
    if (!link || !excalidrawApi) return;
    if (importAttemptedRef.current === link.libraryUrl) return;
    importAttemptedRef.current = link.libraryUrl;
    void library.importPending(excalidrawApi);
  }, [excalidrawApi, library]);

  // The board (or a late cloud copy of it) is the source of truth for the
  // colour while the editor is open; the learner's own picks update this
  // state directly and persist through the hook.
  useEffect(() => {
    if (loading) return;
    setCanvasColour(canvasColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, loading]);

  /**
   * Apply a canvas colour: update the LIVE editor through its API (so the
   * change shows under the learner's finger) and, on commit, persist it
   * through the hook — the board's appState AND the device preference.
   *
   * In the dark theme the editor INVERTS the canvas colour (white paints as
   * #121212 — that is how its dark canvas works), so any chosen colour also
   * flips the board to the light theme: what the learner picks is what they
   * see. The "theme" choice (null) goes the other way — dark board, the
   * editor's own default canvas.
   */
  const applyCanvasColour = (color: string | null, commit: boolean) => {
    setCanvasColour(color);
    const api = apiRef.current;
    if (api) {
      api.updateScene({
        appState: (
          color
            ? { theme: "light", viewBackgroundColor: color }
            : { theme: "light", viewBackgroundColor: "#ffffff" }
        ) as never,
      });
    }
    if (commit) {
      onCanvasColorChange(color);
    }
  };

  /**
   * Every change is tagged with the scene this editor was mounted for, so a
   * change from an editor mounted on an older scene (the cloud answered
   * late, a merge remounted the board) can never be saved over the newer one.
   */
  const handleChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => onChange(elements, appState, files, sceneKey),
    [onChange, sceneKey],
  );

  /**
   * Excalidraw reads `initialData` ONCE, on mount. It is therefore memoised
   * on the scene's identity — the same thing the editor is keyed by — so a
   * re-render caused by the save line (or by a divider drag) can never hand
   * the editor a new object and never remounts it.
   */
  const sketchTheme = storageOnly ? playerTheme : "light";
  const initialData = useMemo(() => {
    const scene = getScene();
    const saved = (scene.appState ?? {}) as Record<string, unknown>;
    // A board that was saved mid-pan reopens exactly where the learner left
    // it; a board with no remembered viewport is centred on its drawing.
    const hasViewport = Number.isFinite(saved.scrollX) && Number.isFinite(saved.scrollY);
    return {
      elements: scene.elements as never,
      appState: {
        // Course Player remains deliberately light-only. Work supplies its
        // scoped theme; a saved canvas colour remains in appState separately.
        viewBackgroundColor: "#ffffff",
        ...(canvasColor ? { viewBackgroundColor: canvasColor } : {}),
        ...saved,
        theme: sketchTheme,
      } as never,
      files: scene.files as never,
      scrollToContent: !hasViewport,
    };
    // Deliberately keyed to the scene's identity, not to `scene`: Excalidraw
    // reads this once per mount and the hook mutates the live scene in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, sketchTheme]);

  /**
   * The Quick Sketch / Full Editor switch — the ONE control both trays share.
   * It rides NEXT TO the eye (owner brief): the two controls that change what
   * the page is showing sit together at the head of the editing tray.
   */
  const modeToggle = (
    <button
      type="button"
      onClick={() => { setSidePanelOpen(false); setMode(quickMode ? "editor" : "quick-sketch"); }}
      className={`dc-sketch-tray-text${quickMode ? " dc-sketch-tray-text--lit" : ""}`}
      data-course-sketch-mode={mode}
      title={quickMode ? "Switch to Full Editor (Excalidraw)" : "Switch to Quick Sketch (pressure-sensitive pen)"}
    >
      {quickMode ? "✏️ Quick Sketch" : "Full Editor"}
    </button>
  );

  /** One tile of a tray — every control on both trays is the same button. */
  const trayButtonClass = "dc-sketch-tray-button";
  /** Work's light chrome (device-only storage on a light player theme). */
  const workLight = storageOnly && playerTheme === "light";

  const boardIndex = boards.findIndex((board) => board.sketchKey === activeBoardKey);
  const prevBoard = boardIndex > 0 ? boards[boardIndex - 1] : null;
  const nextBoard = boardIndex >= 0 && boardIndex < boards.length - 1 ? boards[boardIndex + 1] : null;

  /**
   * The panel's toggle — the SAME button in whichever tray is on screen, and
   * the only door into the panel (nothing in a page's chrome opens a side
   * panel here: there is no header at all). It is marked as a toggle so the
   * panel's own outside-click rule never treats it as an outside click.
   */
  const panelButton = (hook: string) => (
    <button
      type="button"
      className={trayButtonClass}
      data-course-sketch-panel-toggle
      {...{ [hook]: "" }}
      aria-expanded={sidePanelOpen}
      aria-label={sidePanelOpen ? "Hide the sketch canvases" : "Show the sketch canvases"}
      title={sidePanelOpen ? "Hide canvases" : "Canvases & options"}
      onClick={() => setSidePanelOpen((open) => !open)}
    >
      <Menu size={16} aria-hidden="true" />
    </button>
  );

  /**
   * Excalidraw's undo / redo are action-manager entries; its public API only
   * exposes `history.clear()`. Both chips therefore reach the editor's OWN
   * action by name — the real one, with the editor's real history and its real
   * enable state — and fall back to the editor's own keyboard command if a
   * future build renames it, so the tray keeps working either way.
   */
  const runHistoryAction = (name: "undo" | "redo") => {
    const internal = excalidrawApi as unknown as {
      actionManager?: { actions?: Record<string, unknown>; executeAction?: (action: unknown) => void };
    } | null;
    const action = internal?.actionManager?.actions?.[name];
    if (action && typeof internal?.actionManager?.executeAction === "function") {
      internal.actionManager.executeAction(action);
      return;
    }
    const host = canvasHostRef.current?.querySelector<HTMLElement>(".excalidraw") ?? null;
    host?.focus?.();
    (host ?? document).dispatchEvent(new KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, shiftKey: name === "redo", bubbles: true, cancelable: true,
    }));
  };

  /** Draw / erase: the editor's own tool switch, through its public API. */
  const runTool = (tool: "freedraw" | "eraser") => {
    apiRef.current?.setActiveTool({ type: tool } as never);
  };

  /**
   * Clear the canvas the way the editor's own action does: ONE undoable step
   * (`CaptureUpdateAction.IMMEDIATELY` is what puts it in the history), so an
   * accidental clear is one undo away.
   */
  const clearCanvas = () => {
    apiRef.current?.updateScene({
      elements: [],
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    } as never);
  };

  /**
   * Read mode's tray: the side-panel button, the previous / next canvas, a new
   * sketch and the pencil that unlocks the editor — the notes page's read
   * navigation, control for control. ONE tap on the canvas hides the whole
   * tray, the side-panel button with it, and the next tap brings it back.
   */
  const readTray = (
    <nav className="dc-sketch-tray" aria-label="Sketch navigation" data-course-sketch-read-tray>
      {panelButton("data-course-sketch-read-panel")}
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-read-prev
        aria-label="Previous sketch"
        title="Previous sketch"
        disabled={!prevBoard}
        onClick={() => { if (prevBoard) onSelectBoard?.(prevBoard.sketchKey); }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-read-next
        aria-label="Next sketch"
        title="Next sketch"
        disabled={!nextBoard}
        onClick={() => { if (nextBoard) onSelectBoard?.(nextBoard.sketchKey); }}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <span className="dc-sketch-tray-sep" aria-hidden="true" />
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-read-new
        aria-label="New sketch"
        title={canCreateBoard ? "New sketch" : "Sketch limit reached for this module"}
        disabled={!canCreateBoard}
        onClick={() => onCreateBoard?.()}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-read-edit
        aria-label="Edit this sketch"
        title="Edit this sketch"
        onClick={enterEditMode}
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
    </nav>
  );

  /**
   * The editing tray, in the owner's order: the canvases button, the EYE (back
   * to reading), the Full Editor / Quick Sketch switch beside it, the canvas
   * colour, and then this page's own tools — draw, erase, undo, redo, clear.
   * Every control is one tile of the row and the row SLIDES, so a narrow sheet
   * never shrinks or loses a button.
   */
  const editTray = (
    <nav className="dc-sketch-tray" aria-label="Sketch tools" data-course-sketch-edit-tray>
      {panelButton("data-course-sketch-edit-panel")}
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-edit-read
        aria-label="Read mode"
        title="Read mode — the canvas takes no marks"
        onClick={enterReadMode}
      >
        <Eye size={16} aria-hidden="true" />
      </button>
      {modeToggle}
      <span className="dc-sketch-tray-sep" aria-hidden="true" />
      <span className="dc-sketch-tray-colour" data-course-sketch-edit-colour>
        <SketchColourCluster canvasColour={canvasColour} onPick={applyCanvasColour} />
      </span>
      <span className="dc-sketch-tray-sep" aria-hidden="true" />
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-edit-draw
        aria-label="Draw"
        title="Draw — the freehand pen"
        onClick={() => runTool("freedraw")}
      >
        <PenLine size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-edit-erase
        aria-label="Erase"
        title="Erase"
        onClick={() => runTool("eraser")}
      >
        <Eraser size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-edit-undo
        aria-label="Undo"
        title="Undo"
        onClick={() => runHistoryAction("undo")}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-edit-redo
        aria-label="Redo"
        title="Redo"
        onClick={() => runHistoryAction("redo")}
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={trayButtonClass}
        data-course-sketch-edit-clear
        aria-label="Clear the canvas"
        title="Clear the canvas (undoable)"
        onClick={clearCanvas}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </nav>
  );

  /**
   * The panel's content — the module's canvases AND every option a header used
   * to hold (the two editor switches, the library read-out, the canvas colour,
   * the save state and its Retry). The Clean Look's docked Excalidraw sidebar
   * renders this same element, so there is one implementation, two homes.
   */
  const sketchSidebarContent = (
    <div className="flex flex-col gap-2 p-2" data-course-sketch-clean-sidebar>
      {scoped ? (
        <SketchCanvasList
          boards={boards}
          activeBoardKey={activeBoardKey}
          onSelectBoard={onSelectBoard}
          onRenameBoard={onRenameBoard}
          onRequestDelete={setPendingDeleteKey}
          canDelete={boards.length > 1}
        />
      ) : null}

      <div className="sketch-library-options" data-course-sketch-panel-options>
        {modeToggle}
        <SketchLibraryPill library={library} storageOnly={storageOnly} />
        <SketchColourCluster canvasColour={canvasColour} onPick={applyCanvasColour} />
      </div>
      <div className="sketch-library-options">
        <SketchStatusChip
          status={status}
          pendingSync={pendingSync}
          errorMessage={errorMessage}
          storageOnly={storageOnly}
          scoped={scoped}
          deviceSaved={deviceSaved}
        />
        {status === "error" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            title={errorMessage ?? (storageOnly ? "Retry saving on this device" : "Retry saving to your account")}
            data-course-sketch-retry
            className="flex items-center gap-1 rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold text-amber-200 transition-colors hover:bg-amber-400/10"
          >
            <RotateCcw aria-hidden size={10} /> Retry
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-course-sketch-panel
      data-work-storage-only={storageOnly ? "true" : undefined}
      data-sketch-editing={editing ? "true" : "false"}
      data-sketch-reading={readOnlySketch ? "true" : "false"}
      data-sketch-chrome={readChromeVisible ? "true" : "false"}
      data-course-theme={playerTheme}
      data-sketch-scope={scoped ? "module" : "none"}
      data-sketch-clean={cleanLook ? "true" : "false"}
    >
      {/* The page's ONE piece of top chrome — and it holds no button at all:
          the quiet save chip, exactly like the notes page's. Every option a
          header used to carry is in the tray or in the panel. */}
      {loading ? null : (
        <div className="pointer-events-none absolute inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex justify-center px-3">
          <SketchStatusChip
            status={status}
            pendingSync={pendingSync}
            errorMessage={errorMessage}
            storageOnly={storageOnly}
            scoped={scoped}
            deviceSaved={deviceSaved}
          />
        </div>
      )}

      {/* The canvas host: a positioned, flex-sized box. The editor is its
          absolutely-filled child, so its width and height always resolve from
          the study pane — whatever the split ratio is doing. It also carries
          read mode's tap: ONE tap hides the tray (a press that travelled is a
          pan, never a tap) and the next tap restores it. */}
      <div
        ref={canvasHostRef}
        className="relative min-h-0 w-full flex-1"
        data-course-sketch-canvas
        onPointerDownCapture={(event) => { readTapStartRef.current = { x: event.clientX, y: event.clientY }; }}
        onClickCapture={(event) => {
          if (!readOnlySketch || quickMode || sidePanelOpen) return;
          const target = event.target as HTMLElement | null;
          // The chrome itself is never "a tap on the canvas": the trays, the
          // panel, its strip, the confirmation dialog and the editor's own
          // menus all keep their own clicks.
          if (target?.closest?.("[data-course-sketch-read-tray], [data-course-sketch-edit-tray], [data-quick-sketch-tray], [data-course-sketch-side-panel], [data-course-sketch-panel-scrim], [data-course-confirm-delete], .App-menu_top, .App-bottom-bar")) return;
          const start = readTapStartRef.current;
          readTapStartRef.current = null;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > READ_TAP_SLOP_PX) return;
          setReadChromeVisible((visible) => !visible);
        }}
      >
        {loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <span
              aria-label="Loading sketch"
              className="block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-orange-400"
            />
          </div>
        ) : quickMode ? (
          /* Quick Sketch: the perfect-freehand canvas (its own design, its own
             canvases, its own save line — see the component). Switching back
             to the full editor loses nothing: both halves persist separately.
             The chip gets the same two doors as the tray — the pencil / eye and
             the Full Editor switch. */
          <PerfectFreehandSketch
            readOnly={!editing}
            localOnly={storageOnly}
            theme={playerTheme}
            uid={uid}
            productId={productId}
            moduleId={moduleId}
            resourceId={resourceId}
            resourceName={resourceName}
            onRequestEdit={enterEditMode}
            onRequestRead={enterReadMode}
            onShowFullEditor={() => setMode("editor")}
          />
        ) : (
          <div className="absolute inset-0" data-course-sketch-host>
            <Excalidraw
              key={sceneKey}
              initialData={initialData}
              theme={sketchTheme}
              viewModeEnabled={!editing}
              onChange={handleChange}
              name={[boardName, boards.length > 1 ? activeBoardTitle : ""].filter(Boolean).join(" — ") || "Sketch"}
              // "Browse libraries" opens libraries.excalidraw.com; it returns
              // the learner to `libraryReturnUrl` with `#addLibrary=…`, which
              // main.tsx intercepts and this panel then installs (see the
              // effects above). Persistence of every change runs through the
              // adapter: `onLibraryChange` is the belt, `useHandleLibrary`
              // the braces.
              libraryReturnUrl={libraryReturnUrl}
              onLibraryChange={onLibraryChange}
              // The player owns its own ⌘/Ctrl shortcuts: the editor only
              // takes the keyboard while the learner is actually in it.
              handleKeyboardGlobally={false}
              autoFocus={false}
              onExcalidrawAPI={(api) => {
                apiRef.current = api;
                setExcalidrawApi(api);
              }}
            >
              {/* The Course Player's OWN main menu. Rendering one replaces
                  Excalidraw's default (which ships an "Excalidraw links" group
                  — GitHub / Follow Us / Discord) so those three links are gone
                  (Part 1 §24) while every useful editor action stays. */}
              <MainMenu>
                <MainMenu.DefaultItems.LoadScene />
                <MainMenu.DefaultItems.SaveToActiveFile />
                <MainMenu.DefaultItems.Export />
                <MainMenu.DefaultItems.SaveAsImage />
                <MainMenu.DefaultItems.SearchMenu />
                <MainMenu.DefaultItems.Help />
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.Separator />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
              </MainMenu>
              {cleanLook ? (
                /* §26C: in Clean / Optimised Look the removed header's useful
                   actions live in the editor's LEFT sidebar (docked): the
                   canvases and their actions, the daylight toggle, save state +
                   retry, the library read-out and the colour cluster. No
                   socials, no duplicate toolbar. */
                <Sidebar docked name="course-sketch-clean">
                  {sketchSidebarContent}
                </Sidebar>
              ) : null}
              {/* The page's OWN bottom trays. They live inside the editor's
                  tree on purpose: the tray then rests on the canvas's own
                  bottom edge (whatever the split ratio does), and the editor's
                  own tool row can be brought down beside it. */}
              {readOnlySketch ? (readChromeVisible ? readTray : null) : editTray}
            </Excalidraw>
          </div>
        )}
        {!scoped && !loading ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded-full bg-black/60 px-3 py-1 text-[10px] font-semibold text-white/60"
            data-course-sketch-unscoped
          >
            Kept on this device — open a lesson to save it with the module
          </div>
        ) : null}
      </div>

      {/* A saved clean layout must still expose a way out of view mode, even
          if Excalidraw hides its custom sidebar while viewing. */}
      {cleanLook && !quickMode && readOnlySketch ? (
        <div className="absolute left-3 top-14 z-50" data-course-sketch-edit-access>
          <button
            type="button"
            className={trayButtonClass}
            data-course-sketch-edit-access-button
            aria-label="Edit this sketch"
            title="Edit this sketch"
            onClick={enterEditMode}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* ── The ONE side panel ──────────────────────────────────────────────
          The module's canvases, and every option the page's header used to
          carry. It opens from the bottom tray's own canvases button (read
          mode's, exactly like the notes page) and closes on the visible strip,
          on Escape, or on any click outside it — never on a click inside, and
          never on the button that opened it. */}
      {sidePanelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close the sketch canvases"
            data-course-sketch-panel-scrim
            className="absolute inset-0 z-30 bg-slate-950/30"
            onClick={() => setSidePanelOpen(false)}
          />
          <aside
            ref={sidePanelRef}
            className={`constant-sketch-panel absolute inset-y-0 left-0 z-40 flex w-[calc(100%-2.5rem)] flex-col border-r shadow-2xl ${
              workLight ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-[#141419] text-white"
            }`}
            data-course-sketch-side-panel
            role="complementary"
            aria-label="Sketch canvases and options"
          >
            <div className="flex h-14 shrink-0 items-center justify-center px-3" data-course-sketch-panel-head>
              <span className="text-sm font-black tracking-wide" data-course-sketch-panel-title>Sketch canvases</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" data-course-sketch-panel-body>
              {sketchSidebarContent}
            </div>
            {/* The panel's ONE bottom button: a new sketch. (There is nowhere
                "back to the canvases" to go — this panel IS the list.) */}
            <div className={`shrink-0 border-t p-3 ${workLight ? "border-slate-200" : "border-white/10"}`} data-course-sketch-panel-foot>
              <button
                type="button"
                data-course-sketch-panel-new
                disabled={!canCreateBoard}
                aria-label="New sketch"
                title={canCreateBoard ? "New sketch" : "Sketch limit reached for this module"}
                onClick={() => onCreateBoard?.()}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 text-[13px] font-black text-white transition hover:bg-slate-800 active:bg-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} aria-hidden="true" /> New sketch
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {/* §30 — deleting a canvas is a two-step act that names the actual
          canvas. Only the red confirm removes it; Cancel / backdrop / Escape
          never do. The rest of the library is untouched. */}
      <ConfirmDeleteDialog
        theme={playerTheme}
        open={Boolean(pendingDeleteKey)}
        title="Delete this Canvas?"
        message={`Delete Canvas "${pendingDeleteTitle}"?`}
        detail="This will permanently delete this Canvas. Your other Canvases are kept."
        confirmLabel="Delete Canvas"
        confirmTitle="Delete Canvas"
        onCancel={() => setPendingDeleteKey(null)}
        onConfirm={() => {
          const key = pendingDeleteKey;
          setPendingDeleteKey(null);
          if (!key) return;
          if (onDeleteBoard) onDeleteBoard(key);
          else onDeleteActive?.();
        }}
      />
    </div>
  );
}
