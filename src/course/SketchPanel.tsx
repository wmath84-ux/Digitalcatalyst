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

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
// Must come first: it sets window.EXCALIDRAW_ASSET_PATH before the editor's
// font loader runs (see the file's header).
import "./excalidrawAssets";
import { Excalidraw } from "@excalidraw/excalidraw";
// A second import line on purpose: the integration contract pins the FIRST
// line's exact text, and the editor's library hook is the only other symbol
// this panel needs from the package.
import { useHandleLibrary } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { BookMarked, Pencil } from "lucide-react";
import type { SketchSaveStatus } from "./useCourseSketch";
import type { SketchScene } from "../../utils/sketchScene";
// The learner's PERSONAL LIBRARY (the editor ships the panel but no storage —
// see the hook's header) plus the "Add to Excalidraw" return link it installs.
import { useSketchLibrary } from "./useSketchLibrary";
import { isAllowedExcalidrawLibraryUrl } from "../../utils/excalidrawLibraryLink.js";

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
  /** Excalidraw's own `onChange` — elements, appState, files. */
  onChange: (elements: unknown, appState: unknown, files: unknown) => void;
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
}

/** The slim save line — the only chrome this panel adds. Never a banner. */
function SketchStatus({
  status,
  pendingSync,
  errorMessage,
  boardName,
  children,
}: {
  status: SketchSaveStatus;
  pendingSync: boolean;
  errorMessage: string | null;
  boardName?: string;
  /** The canvas-colour cluster (swatches + pencil + picker), right-aligned. */
  children?: React.ReactNode;
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
      className="relative flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1"
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
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {children}
        {boardName ? (
          <span className="min-w-0 max-w-32 truncate text-[10px] font-semibold text-white/35" data-course-sketch-board>
            {boardName}
          </span>
        ) : null}
      </div>
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
  canvasColor,
  onCanvasColorChange,
  boardName,
  uid = null,
}: SketchPanelProps) {
  /** The editor's imperative API (canvas colour + the library adapter). */
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  /**
   * The same API in state: `useHandleLibrary` below only wires itself up once
   * it receives a non-null API, and state is what re-runs it. Passing the ref
   * would leave the library adapter mounted with a null editor.
   */
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawAPI | null>(null);
  /** The learner's own library — stored and synced by `useSketchLibrary`. */
  const library = useSketchLibrary({ uid });
  /** The canvas colour as the learner currently sees it (null = theme). */
  const [canvasColour, setCanvasColour] = useState<string | null>(canvasColor);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

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

  // A "custom" colour is any saved colour that is neither the theme default
  // (null) nor the white swatch — the pencil chip shows it.
  const isCustomColour =
    canvasColour !== null && canvasColour.toLowerCase() !== "#ffffff";

  // The board (or a late cloud copy of it) is the source of truth for the
  // colour while the editor is open; the learner's own picks update this
  // state directly and persist through the hook.
  useEffect(() => {
    if (loading) return;
    setCanvasColour(canvasColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, loading]);

  // Close the picker on a click outside the colour cluster.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDocumentClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [pickerOpen]);

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
            : { theme: "dark", viewBackgroundColor: "#ffffff" }
        ) as never,
      });
    }
    if (commit) {
      onCanvasColorChange(color);
      if (color === null) setPickerOpen(false);
    }
  };

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
        viewBackgroundColor: "#ffffff",
        // A remembered canvas colour (the board's own, else the learner's
        // device preference) opens on a LIGHT board — the dark theme would
        // invert the colour. `...saved` last: the board's own saved state
        // always wins over the defaults.
        ...(canvasColor ? { theme: "light", viewBackgroundColor: canvasColor } : {}),
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
      <SketchStatus status={status} pendingSync={pendingSync} errorMessage={errorMessage} boardName={boardName}>
        {/* The learner's PERSONAL LIBRARY, at a glance: how many items their
            own library holds on this device/account, and what the "Add to
            Excalidraw" return is doing right now. The panel itself is
            Excalidraw's own (the book icon in its toolbar) — this is a
            read-out, never a second library UI. */}
        <span
          data-course-sketch-library={library.state}
          data-course-sketch-library-count={library.itemCount}
          title={
            library.importError ||
            library.error ||
            "Your personal library — saved to your account and synced to your other devices"
          }
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
            library.importState === "importing"
              ? "border-white/25 text-white/70"
              : library.importError || library.error
                ? "border-amber-400/40 text-amber-300"
                : "border-white/15 text-white/55"
          }`}
        >
          {library.importState === "importing" ? (
            <span
              aria-hidden
              className="block h-2.5 w-2.5 animate-spin rounded-full border border-white/25 border-t-white/80"
            />
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
        {/* Canvas colour: the theme default (dark, what the player always
            opened with), white, and the pencil → full-RGB custom colour.
            The choice persists with the board AND as the learner's device
            preference, so the next open shows the same canvas. */}
        <button
          type="button"
          aria-label="Dark canvas (theme default)"
          aria-pressed={canvasColour === null}
          onClick={() => applyCanvasColour(null, true)}
          data-course-sketch-swatch="theme"
          className={`h-4 w-4 rounded-full border border-white/25 bg-[#141416] transition-shadow ${
            canvasColour === null ? "ring-2 ring-white/70 ring-offset-1 ring-offset-[#0c0c12]" : "hover:ring-1 hover:ring-white/40"
          }`}
        />
        <button
          type="button"
          aria-label="White canvas"
          aria-pressed={canvasColour?.toLowerCase() === "#ffffff"}
          onClick={() => applyCanvasColour("#ffffff", true)}
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
                ? {
                    background: canvasColour,
                    color: isLightColour(canvasColour) ? "#141416" : "#ffffff",
                  }
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
          {pickerOpen ? (
            <SketchColourPicker initial={canvasColour} onPick={applyCanvasColour} />
          ) : null}
        </div>
      </SketchStatus>

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
