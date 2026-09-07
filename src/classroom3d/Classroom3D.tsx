// src/classroom3d/Classroom3D.tsx
//
// THE 3D CLASSROOM — the Course Player rebuilt as a room the learner sits in.
//
// Layout, seen from the seat (the learner never moves, only turns their head):
//
//        ┌──────────── FRONT WALL ────────────┐
//        │   ██████  BIG SCREEN  ██████       │   ← straight ahead: the lesson
//        │   (blackboard framing, chalk rail) │      plays here
//        └────────────────────────────────────┘
//   LEFT-FRONT  ▓ NOTES WALL ▓        RIGHT WALL: winter windows, snow outside
//   FAR LEFT    ▓ MIND WALL  ▓
//        ▁▁▁▁▁ your desk: the console tablet ▁▁▁▁▁   ← look down to control
//
//   · Turn a little left  → the NOTES wall.
//   · Turn further left   → the MIND MAP wall.
//   · Look down           → the desk console: modules, lessons, progress,
//                           and one-tap head-turns to any surface.
//
// ── Part 2: this component owns NO course state ────────────────────────────
// The room is a SHELL, not a second player. `CoursePlayerApp` stays the single
// owner of the course, the viewer stack, Firestore notes and the persisted
// mind maps, and hands the room three ready-made React nodes:
//
//   board → the player's own viewer stack (every opened file stays mounted,
//           so switching lessons in the room is as lossless as in flat mode)
//   notes → the player's own NotesPanel, writing to the same store
//   mind  → the player's own MindMapPanel, on the same Firestore documents
//
// That means every capability of the flat player — YouTube, video, audio,
// PDF, Docs/Sheets/Slides, forms, images, embeds, rich-text notes, the full
// mind map editor, resume playback, mark-complete, paid/locked modules —
// works from the chair, with zero duplicated logic.
//
// ── Part 13: the room runs like a real-time game ────────────────────────────
// Same room, same features, a fraction of the per-frame work: merged static
// geometry, consolidated lights, shadows baked once, an fps governor with
// auto quality tiers, walls that sleep when unfaced or off-screen, and a
// drag-fidelity mode while the head turns. See docs/part13-classroom-
// performance.md for the full per-item account.
//
// ── Part 14: third-party iframes get the game treatment ────────────────────
// YouTube/Docs/Sheets/Slides/Forms/Whimsical/embeds render uncontrollably,
// so the room fakes them like a game fakes expensive assets: a static
// impostor swaps over the live frame while the camera moves (the iframe is
// never unmounted), YouTube steps down to 'small' instead of pausing, the
// wall's DOM transform commits at ~22 Hz during motion, embeds lazy-boot on
// first wall focus, and permissions are tightened per kind. See
// docs/part14-classroom-embed-optimization.md.

import { Suspense, memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, AdaptiveEvents, BakeShadows, Preload } from "@react-three/drei";
import {
  CircleCheck,
  LayoutList,
  Maximize,
  Minimize,
  Network,
  NotebookPen,
  Repeat,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { CourseFile, CourseModule } from "../types/course";
import { getCourseEmbed } from "../utils/courseEmbed";
import Room from "./Room";
import SeatRig from "./SeatRig";
import SurfaceFrame from "./SurfaceFrame";
import DeskConsole from "./DeskConsole";
import QualityGovernor from "./QualityGovernor";
import WallActivity from "./WallActivity";
import WallVisibility from "./WallVisibility";
import { WallTransformThrottle } from "./throttledTransform";
import { computeInitialDpr, pickInitialTier, qualitySettings, type ClassroomQuality } from "./quality";
import { BoardPanel, DeskPanel } from "./panels";
import {
  MapSheetBody,
  ModuleSheetBody,
  NoteSheetBody,
  RoomSheet,
  type RoomMapItem,
  type RoomNoteItem,
  type RoomSheetKind,
} from "./RoomSheet";
import { getWallOnScreen, subscribeWallOnScreen } from "./wallFocus";
import {
  BOARD_ZOOM_MAX,
  BOARD_ZOOM_MIN,
  BOARD_ZOOM_STEP,
  FOCUS_CYCLE,
  FOCUS_PRESETS,
  clampBoardZoom,
  flattenModules,
  nextFocusInCycle,
  zoomBlend,
  type ClassroomFocus,
} from "./state";
import { BOARD, BOARD_X, SEAT } from "./roomGeometry";
import "./classroom3d.css";

// Baked once, never per frame (Part 13): the room's shadow casters are
// static (classmate sway is sub-texel at 512 px over 12 m), so a memo'd
// <BakeShadows> renders its shadow map on mount and never again — focus hops
// and pinch ticks re-render the room but must not re-bake the map.
const BakedShadowsOnce = memo(function BakedShadowsOnce() {
  return <BakeShadows />;
});

// Embed kinds whose internals render uncontrollably (Part 14): YouTube plus
// every third-party iframe kind. Native video/audio (`direct`) and images
// are deliberately excluded — GPU-cheap, fully controllable, and Part 13
// keeps them visually live while faced.
/** All three boards are authored at the same CSS width, so they are the same
 *  size on their slabs AND the same resolution: `surfaceScale()` maps this
 *  onto `BOARD.width` metres (see surfaceScale.ts). */
const BOARD_PIXEL_WIDTH = 1600;

/** Chalk slab the triptych rides on: the row plus a margin each side. */
const BOARD_ROW_WIDTH = BOARD_X.notes - BOARD_X.mind + BOARD.width + 0.8;

const THIRD_PARTY_EMBED_KINDS: ReadonlySet<string> = new Set([
  "youtube",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "form",
  "drive",
  "mindmap",
  "embed",
]);

export interface Classroom3DProps {
  /** The course tree — the exact shape the flat Course Player consumes. */
  modules: CourseModule[];
  courseTitle?: string;

  /** Which lesson the board is showing, and how to change it. */
  selectedFileId?: string | null;
  onSelectFile: (file: CourseFile) => void;

  /** Modules the learner may actually open (everything else shows a lock). */
  accessibleModuleIds?: Set<string>;
  /** Locked modules the learner can buy — tapping one calls `onBuyModule`. */
  onBuyModule?: (module: CourseModule) => void;

  /** ── The three live surfaces, supplied by the player ─────────────────── */
  /** The lesson viewer for the big front screen. */
  board: ReactNode;
  /** The notes UI for the left wall. */
  notes: ReactNode;
  /** The mind map UI for the far-left wall. */
  mind: ReactNode;

  /** Desk console readouts. */
  progress?: number;
  isDone?: boolean;
  canMarkComplete?: boolean;
  onToggleComplete?: () => void;
  noteCount?: number;
  mapCount?: number;

  /** "New note" on the notes wall — asks the player's panel to open its composer. */
  onComposeNote?: () => void;

  /* ── The floating in-room libraries (the right-hand keys) ──────────────
     These are CHOOSERS only. Picking something here turns the learner's head
     to the wall that owns it and asks the player's own panel to show it —
     the note is still written on the notes wall and the map is still drawn
     on the mind wall, with their real editors and toolbars. */
  /** Every note in this course, for the floating note library. */
  noteItems?: RoomNoteItem[];
  /** Open one of those notes in the NotesPanel editor on the notes wall. */
  onOpenNote?: (id: string) => void;
  /** Every mind map in this module, for the floating map library. */
  mapItems?: RoomMapItem[];
  /** Which map the mind wall is currently drawing. */
  activeMapKey?: string | null;
  /** Show another map on the mind wall. */
  onSelectMap?: (mapKey: string) => void;
  /** Start a new map and draw it on the mind wall. */
  onCreateMap?: () => void;

  /** Leave the room (back to the flat player). */
  onExit?: () => void;
  exitLabel?: string;
}

export default function Classroom3D({
  modules,
  courseTitle = "Course",
  selectedFileId,
  onSelectFile,
  accessibleModuleIds,
  onBuyModule,
  board,
  notes,
  mind,
  progress = 0,
  isDone = false,
  canMarkComplete = false,
  onToggleComplete,
  noteCount = 0,
  mapCount = 0,
  onComposeNote,
  noteItems,
  onOpenNote,
  mapItems,
  activeMapKey,
  onSelectMap,
  onCreateMap,
  onExit,
  exitLabel = "Flat player",
}: Classroom3DProps) {
  const [focus, setFocus] = useState<ClassroomFocus>("board");

  // Which floating library is open over the room (null = none). It is a
  // CHOOSER, never a content surface: every pick closes it and puts the
  // content on a board.
  const [sheet, setSheet] = useState<RoomSheetKind | null>(null);

  // ── Which walls are actually in view (wallFocus.ts) ─────────────────────
  // A wall wakes up when it is focused OR simply on screen. Turning the head
  // by hand never changes `focus`, and gating on `focus` alone is what made a
  // dragged-to wall render as a blank slab.
  const onScreen = useSyncExternalStore(subscribeWallOnScreen, getWallOnScreen, getWallOnScreen);

  // ── The view blend + fullscreen (Part 12 → Part 19) ─────────────────────
  // `boardZoom` blends between two camera POSES for whichever board is faced
  // (see state.ts): MIN = FIT, the camera at the seat with its head turned;
  // MAX = FILL, the camera square-on to that board at exactly the distance
  // `fillDistance()` computes from the live lens, so the board covers the
  // whole screen and nothing else shows around it. SeatRig interpolates on
  // the same spring as the head turn and glides back to FIT at the desk.
  const [boardZoom, setBoardZoom] = useState(BOARD_ZOOM_MIN);
  // Bumped by Fit / double-tap so SeatRig re-aims at the board even when the
  // focus never changed ("board" → "board" can't re-fire the focus effect).
  const [boardFitSignal, setBoardFitSignal] = useState(0);
  // True while the board panel holds the browser fullscreen top layer.
  const [boardFullscreen, setBoardFullscreen] = useState(false);

  // ── Adaptive quality (Part 13) ──────────────────────────────────────────
  // The governor inside the Canvas samples real frame times and reports tier
  // changes here; the room answers with snow/lights/spill while <AdaptiveDpr>
  // answers with resolution. Renders are rare by design — only a tier edge
  // re-renders, never a frame — and the tier persists for the session.
  const [quality, setQuality] = useState<ClassroomQuality>(pickInitialTier);
  const settings = useMemo(() => qualitySettings(quality), [quality]);
  const initialDpr = useMemo(
    () =>
      computeInitialDpr(
        typeof window === "undefined" ? 1280 : window.innerWidth,
        typeof window === "undefined" ? 720 : window.innerHeight,
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
        quality,
      ),
    // Mount-only on purpose: runtime dpr belongs to the governor alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The Course Player is the ONE screen where the phone may rotate
  // (src/utils/appOrientation.ts unlocks it on mount), so the room has to
  // read well in both orientations. The camera widens its lens in portrait
  // (SeatRig.tsx) and the CSS repositions the HUD; this flag only tailors
  // the wording of the hint line.
  const [portrait, setPortrait] = useState(
    () => typeof window !== "undefined" && window.innerHeight > window.innerWidth,
  );
  useEffect(() => {
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  /** Flat, seat-friendly module list; locks resolved against real access. */
  const flat = useMemo(() => {
    const list = flattenModules(modules).filter((module) => module.files.length > 0);
    if (!accessibleModuleIds) return list;
    return list.map((module) => ({
      ...module,
      locked: module.locked || !accessibleModuleIds.has(String(module.id)),
    }));
  }, [modules, accessibleModuleIds]);

  const moduleByRawId = useMemo(() => {
    const map = new Map<string, CourseModule>();
    const walk = (nodes: CourseModule[]) => {
      for (const node of nodes) {
        map.set(String(node.id), node);
        if (node.modules?.length) walk(node.modules);
      }
    };
    walk(modules);
    return map;
  }, [modules]);

  /** Where the selected file lives, so the desk always opens on the right row. */
  const position = useMemo(() => {
    if (!selectedFileId) return { moduleIndex: 0, fileIndex: 0 };
    for (let m = 0; m < flat.length; m += 1) {
      const f = flat[m].files.findIndex((file) => String(file.id) === String(selectedFileId));
      if (f >= 0) return { moduleIndex: m, fileIndex: f };
    }
    return { moduleIndex: 0, fileIndex: 0 };
  }, [flat, selectedFileId]);

  /** Which module the desk list is browsing — may differ from the playing one. */
  const [browseIndex, setBrowseIndex] = useState(position.moduleIndex);
  useEffect(() => setBrowseIndex(position.moduleIndex), [position.moduleIndex]);

  /**
   * Which module the FLOATING library has expanded. Deliberately separate
   * from `browseIndex`: collapsing a module in the floating panel must not
   * empty the desk console's lesson column behind it, and -1 (all collapsed)
   * is a state the desk has no meaning for.
   */
  const [sheetModuleIndex, setSheetModuleIndex] = useState(position.moduleIndex);
  useEffect(() => setSheetModuleIndex(position.moduleIndex), [position.moduleIndex]);

  const activeFileName = useMemo(() => {
    for (const module of flat) {
      const file = module.files.find((entry) => String(entry.id) === String(selectedFileId));
      if (file) return file.name;
    }
    return "";
  }, [flat, selectedFileId]);

  // ── Transform throttle enablement (Part 14, item C) ─────────────────────
  // The board wall's DOM transform commits at ~22 Hz during camera motion —
  // but ONLY while the selected lesson is a third-party embed. Native video
  // keeps drei's full-rate sync (a 45 ms-stepped video wall would judder
  // visibly on fast drags for zero gain). Approximate by construction — the
  // board node is opaque (owned by CoursePlayerApp) — and safe in both
  // directions: a missed embed just syncs full-rate, a false positive just
  // steps at 22 Hz.
  const boardHasEmbed = useMemo(() => {
    const file = flat[position.moduleIndex]?.files[position.fileIndex];
    if (!file) return false;
    return THIRD_PARTY_EMBED_KINDS.has(getCourseEmbed(file).kind);
  }, [flat, position]);
  const throttledWalls = useMemo(() => (boardHasEmbed ? (["board"] as const) : ([] as const)), [boardHasEmbed]);

  const openFile = useCallback(
    (moduleIndex: number, fileIndex: number) => {
      const module = flat[moduleIndex];
      const file = module?.files[fileIndex];
      if (!module || !file) return;
      if (module.locked) {
        const raw = moduleByRawId.get(String(module.id));
        if (raw && onBuyModule) onBuyModule(raw);
        return;
      }
      onSelectFile(file);
      // The chooser's whole job ends here: the lesson goes on the board and
      // the panel gets out of the way.
      setSheet(null);
      setFocus("board");
    },
    [flat, moduleByRawId, onBuyModule, onSelectFile],
  );

  /** Prev / Next walks the whole course, skipping locked modules. */
  const step = useCallback(
    (direction: 1 | -1) => {
      if (!flat.length) return;
      let m = position.moduleIndex;
      let f = position.fileIndex + direction;
      for (let guard = 0; guard < 500; guard += 1) {
        if (m < 0 || m >= flat.length) return;
        if (f < 0) {
          m -= 1;
          if (m < 0) return;
          f = flat[m].files.length - 1;
          continue;
        }
        if (f >= flat[m].files.length) {
          m += 1;
          if (m >= flat.length) return;
          f = 0;
          continue;
        }
        if (flat[m].locked) {
          m += direction;
          f = direction > 0 ? 0 : (flat[m]?.files.length ?? 1) - 1;
          continue;
        }
        openFile(m, f);
        return;
      }
    },
    [flat, position, openFile],
  );

  /** Nudge the board lean; clamped so the camera never leaves the seat backwards nor reaches the board. */
  const zoomBoardBy = useCallback((delta: number) => {
    setBoardZoom((current) => clampBoardZoom(Number((current + delta).toFixed(3))));
  }, []);

  /**
   * FIT: back to the seat pose, head square on the focused board. FILL is
   * computed live by SeatRig from the real lens, so portrait no longer needs
   * its own hand-tuned "a touch closer" constant — the same call is exact in
   * both orientations.
   */
  const fitBoard = useCallback(() => {
    setBoardZoom(BOARD_ZOOM_MIN);
    // Looking down at the desk has no FIT/FILL pose of its own, so the key
    // lifts the head to the board first rather than doing nothing at all.
    setFocus((current) => (FOCUS_CYCLE.includes(current) ? current : "board"));
    setBoardFitSignal((value) => value + 1);
  }, []);

  /**
   * The DUAL-FUNCTION fit key the owner asked for: one button, two states,
   * alternating for as long as it is tapped.
   *
   *   click 1 → FIT   (the seat's normal view of the board)
   *   click 2 → FILL  (only the board — zoomed until it covers the screen and
   *                    nothing else is visible around it)
   *   click 3 → FIT … and so on.
   *
   * "Am I at fit?" is read from the live blend rather than a second flag, so
   * the wheel and a pinch — which sweep the same blend continuously — can
   * never leave the button disagreeing with the camera.
   */
  const toggleFitFill = useCallback(() => {
    setFocus((current) => (FOCUS_CYCLE.includes(current) ? current : "board"));
    setBoardFitSignal((value) => value + 1);
    setBoardZoom((current) =>
      current > BOARD_ZOOM_MIN + 1e-6 ? BOARD_ZOOM_MIN : BOARD_ZOOM_MAX,
    );
  }, []);

  /** Double-tap / double-click a board: the same FIT ⇄ FILL flip. */
  const toggleBoardZoom = toggleFitFill;

  /**
   * The THREE-TAP focus key: Board → Notes → Mind map → Board … for as long
   * as it is tapped. The blend is deliberately left alone, so a learner who
   * filled the screen cycles through three full-screen boards, and one who is
   * at fit cycles through three boards in the room.
   */
  const cycleFocus = useCallback(() => {
    setFocus((current) => nextFocusInCycle(current));
    setBoardFitSignal((value) => value + 1);
  }, []);

  /** Which surface the cycle key is sitting on, for its label. */
  const focusLabel = useMemo(
    () => FOCUS_PRESETS.find((preset) => preset.id === focus)?.label ?? "Board",
    [focus],
  );
  const filled = zoomBlend(boardZoom) >= 0.5;

  /**
   * Board fullscreen WITHOUT leaving the room: the exact mechanism
   * ResourceViewer already uses (requestFullscreen / exitFullscreen), aimed
   * at the board panel instead of the viewer. The SAME viewer instance is
   * shown in the browser's top layer — no unmount, no iframe reload, no lost
   * playback — with the 3D canvas still alive underneath. Focus, yaw, pitch
   * and zoom are untouched, so exiting returns to exactly where the learner
   * was.
   */
  const toggleBoardFullscreen = useCallback(() => {
    const root = document.querySelector("[data-classroom-board-panel]");
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (root as HTMLElement).requestFullscreen?.();
  }, []);

  // Keep the Fullscreen / Exit label and the Esc priority in lock-step with
  // the real top layer (covers native Esc, the Android swipe-down exit and
  // the YouTube player's OWN fullscreen button — which must NOT flip our
  // state, so only a fullscreen element inside the board panel counts).
  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement;
      const panel = document.querySelector("[data-classroom-board-panel]");
      setBoardFullscreen(Boolean(active && panel && (active === panel || panel.contains(active))));
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Keyboard: 1-4 turn the head, C cycles Board → Notes → Mind map, F flips
  // FIT ⇄ FILL, ←/→ step lessons, +/− sweep the blend and 0 fits. Esc exits
  // board-fullscreen first and only otherwise drops to the desk.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const map: Record<string, ClassroomFocus> = { "1": "board", "2": "notes", "3": "mind", "4": "desk" };
      if (map[event.key]) setFocus(map[event.key]);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "Escape") {
        // Board-fullscreen wins over the room: Esc gives the board back
        // first. The browser also exits native fullscreen on Esc by itself,
        // so the LIVE top layer is read here — a lagging state sync must
        // neither re-request fullscreen nor yank the head to the desk.
        if (sheet) setSheet(null);
        else if (document.fullscreenElement) void document.exitFullscreen();
        else if (boardFullscreen) setBoardFullscreen(false);
        else setFocus("desk");
      } else if (event.key === "f" || event.key === "F") toggleFitFill();
      else if (event.key === "c" || event.key === "C") cycleFocus();
      else if (FOCUS_CYCLE.includes(focus) && (event.key === "+" || event.key === "=")) zoomBoardBy(BOARD_ZOOM_STEP);
      else if (FOCUS_CYCLE.includes(focus) && (event.key === "-" || event.key === "_")) zoomBoardBy(-BOARD_ZOOM_STEP);
      else if (event.key === "0") fitBoard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, focus, sheet, boardFullscreen, zoomBoardBy, fitBoard, toggleFitFill, cycleFocus]);

  return (
    <div className="course-player-shell dc-classroom-root" data-course-classroom-3d data-course-theme="dark">
      <Canvas
        shadows
        // Mount-time resolution from the area-aware heuristic (quality.ts):
        // huge viewports start lower than small phone screens. Runtime dpr
        // is owned by <AdaptiveDpr> under the quality governor — never here.
        dpr={initialDpr}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        // The seat (roomGeometry.ts) — the same numbers SeatRig springs from,
        // so the first frame is already in the chair instead of snapping to it.
        camera={{ fov: 62, position: [SEAT.x, SEAT.y, SEAT.z] }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={["#9fb3cc"]} />
          {/* Auto-graphics-settings: the governor samples fps and steps the
              tier; AdaptiveDpr/AdaptiveEvents react through the fiber store
              the governor writes (see QualityGovernor.tsx for why the bridge
              is needed); shadows bake exactly once on mount. */}
          <QualityGovernor onTier={setQuality} />
          <AdaptiveDpr />
          <AdaptiveEvents />
          <BakedShadowsOnce />
          <Room snow={settings.snow} lampLights={settings.lampLights} />
          <SeatRig focus={focus} zoom={boardZoom} recenterSignal={boardFitSignal} onZoomDelta={zoomBoardBy} />
          {/* Off-screen walls stop painting (yaw/pitch gate — the DOM is
              touched only on visibility edges). Mounted after SeatRig so it
              reads the same frame's rotation; fullscreen forces all visible
              so the top layer can never be gated by a stale head angle. */}
          <WallVisibility forceVisible={boardFullscreen} />

          {/* ── FRONT: the TRIPTYCH screen wall ───────────────────────────
              One wide chalk slab carrying THREE boards of the SAME size —
              mind map on the LEFT, the lesson in the CENTRE, notes on the
              RIGHT — all flat on the wall and all facing the seat square-on.
              Measurements come from roomGeometry.ts so the shell, the merged
              statics, the camera poses and the visibility rig can never
              disagree about where a board is. */}
          <group position={[0, 0, -3.42]}>
            <mesh position={[0, BOARD.y, 0.02]} receiveShadow>
              <boxGeometry args={[BOARD_ROW_WIDTH, BOARD.height + 0.55, 0.1]} />
              <meshStandardMaterial color="#16302a" roughness={0.95} />
            </mesh>
            {/* Chalk rail, full width, just under the row of bezels */}
            <mesh position={[0, BOARD.y - BOARD.height / 2 - 0.19, 0.14]} castShadow>
              <boxGeometry args={[BOARD_ROW_WIDTH, 0.08, 0.18]} />
              <meshStandardMaterial color="#7a5a38" roughness={0.8} />
            </mesh>
            {[-8.4, -8.1, -7.8, 7.8, 8.1, 8.4].map((x, i) => (
              <mesh key={x} position={[x, BOARD.y - BOARD.height / 2 - 0.15, 0.16]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.014, 0.014, 0.12, 8]} />
                <meshStandardMaterial color={["#ffffff", "#ffe8a3", "#ffd0d0"][i % 3]} />
              </mesh>
            ))}
          </group>

          {/* ── CENTRE: the lecture board (the lesson plays here) ─────── */}
          <SurfaceFrame
            position={[BOARD_X.board, BOARD.y, BOARD.z]}
            width={BOARD.width}
            height={BOARD.height}
            pixelWidth={BOARD_PIXEL_WIDTH}
            accent="#38bdf8"
            active={focus === "board"}
            spill={settings.spillLights === "all" || focus === "board"}
            label="Lecture board"
          >
            <BoardPanel
              title={activeFileName}
              subtitle={flat[position.moduleIndex]?.title || courseTitle}
              zoom={boardZoom}
              boardFullscreen={boardFullscreen}
              focusLabel={focusLabel}
              onCycleFocus={cycleFocus}
              onFit={fitBoard}
              onToggleFitFill={toggleFitFill}
              onToggleFullscreen={toggleBoardFullscreen}
              onToggleZoom={toggleBoardZoom}
            >
              {/* Only the faced wall works (Part 13): the viewer keeps its
                  mounted instance — playback position, drafts, listeners —
                  but an unfaced board skips rendering and pauses its media.
                  Fullscreen counts as faced: the learner is watching it. */}
              <WallActivity wall="board" active={focus === "board" || onScreen.board || boardFullscreen}>
                {board}
              </WallActivity>
            </BoardPanel>
          </SurfaceFrame>

          {/* ── RIGHT: the notes board — same slab as the lecture board ── */}
          <SurfaceFrame
            position={[BOARD_X.notes, BOARD.y, BOARD.z]}
            width={BOARD.width}
            height={BOARD.height}
            pixelWidth={BOARD_PIXEL_WIDTH}
            accent="#f59e0b"
            active={focus === "notes"}
            spill={settings.spillLights === "all" || focus === "notes"}
            label="Notes board"
          >
            <div className="relative h-full w-full overflow-hidden bg-[#0a0f1c] text-white">
              <WallActivity wall="notes" active={focus === "notes" || onScreen.notes}>
                {notes}
              </WallActivity>
              {onComposeNote && (
                <button
                  type="button"
                  onClick={onComposeNote}
                  className="dc-classroom-surface-fab"
                  data-classroom-new-note
                >
                  + New note
                </button>
              )}
            </div>
          </SurfaceFrame>

          {/* ── LEFT: the mind map board — same slab again ─────────────── */}
          <SurfaceFrame
            position={[BOARD_X.mind, BOARD.y, BOARD.z]}
            width={BOARD.width}
            height={BOARD.height}
            pixelWidth={BOARD_PIXEL_WIDTH}
            accent="#a78bfa"
            active={focus === "mind"}
            spill={settings.spillLights === "all" || focus === "mind"}
            label="Mind map board"
          >
            <div className="h-full w-full overflow-hidden bg-[#0a0f1c] text-white">
              <WallActivity wall="mind" active={focus === "mind" || onScreen.mind}>
                {mind}
              </WallActivity>
            </div>
          </SurfaceFrame>

          {/* ── DOWN: the desk console ───────────────────────────────── */}
          {/* Desk spill follows the tier outright (off on low): the console is
              legible from its emissive face alone. */}
          <DeskConsole spill={settings.spillLights === "all"}>
            <DeskPanel
              modules={flat}
              browseIndex={browseIndex}
              playingModuleIndex={position.moduleIndex}
              playingFileIndex={position.fileIndex}
              selectedFileId={selectedFileId ?? null}
              onBrowseModule={setBrowseIndex}
              onOpenFile={openFile}
              onStep={step}
              focus={focus}
              onFocus={setFocus}
              progress={progress}
              isDone={isDone}
              canMarkComplete={canMarkComplete}
              onToggleComplete={onToggleComplete}
              noteCount={noteCount}
              mapCount={mapCount}
              activeFileName={activeFileName}
              onExit={onExit}
              exitLabel={exitLabel}
            />
          </DeskConsole>

          {/* Decoupled wall-transform rate (Part 14, item C): while the camera
              moves, listed walls commit DOM matrices at ~22 Hz instead of 60
              (the scene itself still renders full-rate). Mounted LAST on
              purpose — R3F runs same-priority frames in mount order, so
              drei's writes land first and the throttle decides what stands.
              Only the board, only while it shows a third-party embed. */}
          <WallTransformThrottle walls={throttledWalls} />

          {/* No HDRI env map on purpose: the room must render offline inside
              the Capacitor shell, so all lighting is local and analytic. */}
          <Preload all />
        </Suspense>
      </Canvas>

      {/* Floating HUD — always reachable even while facing a wall */}
      <div className="dc-classroom-hud">
        {FOCUS_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setFocus(preset.id)}
            className="dc-classroom-chip"
            data-active={focus === preset.id ? "true" : "false"}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="dc-classroom-control-tray" data-classroom-control-tray>
        {/* ── The library keys ────────────────────────────────────────────
            The desk console still holds the full switcher, but looking down
            to change module while a lecture is playing is a chore. These
            three keys summon the same lists as a floating panel in the
            middle of the room — and every pick lands on a BOARD. */}
        <button
          type="button"
          className="dc-classroom-control-btn"
          data-classroom-open-modules
          data-active={sheet === "modules" ? "true" : "false"}
          onClick={() => setSheet((current) => (current === "modules" ? null : "modules"))}
        >
          <LayoutList size={18} /> Modules
        </button>
        <button
          type="button"
          className="dc-classroom-control-btn"
          data-classroom-open-notes
          data-active={sheet === "notes" ? "true" : "false"}
          onClick={() => setSheet((current) => (current === "notes" ? null : "notes"))}
        >
          <NotebookPen size={18} /> Notes
        </button>
        <button
          type="button"
          className="dc-classroom-control-btn"
          data-classroom-open-maps
          data-active={sheet === "mind" ? "true" : "false"}
          onClick={() => setSheet((current) => (current === "mind" ? null : "mind"))}
        >
          <Network size={18} /> Maps
        </button>
        <button type="button" className="dc-classroom-control-btn" onClick={() => step(-1)}>
          <SkipBack size={18} /> Prev
        </button>
        <button type="button" className="dc-classroom-control-btn" onClick={() => step(1)}>
          Next <SkipForward size={18} />
        </button>
        {/* ── The two keys the owner asked for, always within thumb reach ──
            They live here as well as on the board's own chrome because the
            board chrome is only readable while you are FACING the board: a
            key that switches boards has to work from any of them. */}
        <button
          type="button"
          className="dc-classroom-control-btn"
          data-classroom-cycle-focus
          data-focus={focus}
          onClick={cycleFocus}
          title="Switch surface: Board → Notes → Mind map"
        >
          <Repeat size={18} /> {focusLabel}
        </button>
        <button
          type="button"
          className="dc-classroom-control-btn"
          data-classroom-fit-fill
          data-filled={filled ? "true" : "false"}
          onClick={toggleFitFill}
          title="Tap: fit the board · tap again: only the board, filling the screen"
        >
          {filled ? <Minimize size={18} /> : <Maximize size={18} />} {filled ? "Fit" : "Zoom"}
        </button>
        <button
          type="button"
          className="dc-classroom-control-btn"
          onClick={onToggleComplete}
          disabled={!canMarkComplete || !onToggleComplete}
          data-done={isDone ? "true" : "false"}
        >
          <CircleCheck size={18} /> {isDone ? "Done" : "Complete"}
        </button>
        {onExit ? (
          <button type="button" className="dc-classroom-control-btn" onClick={onExit}>
            {exitLabel}
          </button>
        ) : null}
      </div>
      {/* ── The floating in-room library ───────────────────────────────── */}
      {sheet === "modules" && (
        <RoomSheet
          title="Modules"
          hint="Scroll with your finger · tap a lesson to put it on the board"
          accent="#38bdf8"
          onClose={() => setSheet(null)}
        >
          <ModuleSheetBody
            modules={flat}
            browseIndex={sheetModuleIndex}
            playingModuleIndex={position.moduleIndex}
            playingFileIndex={position.fileIndex}
            onBrowseModule={setSheetModuleIndex}
            onOpenFile={openFile}
          />
        </RoomSheet>
      )}
      {sheet === "notes" && (
        <RoomSheet
          title="Note library"
          hint="Tap a note to open it on the notes wall"
          accent="#f59e0b"
          onClose={() => setSheet(null)}
          action={
            onComposeNote
              ? {
                  label: "New note",
                  onClick: () => {
                    // Written on the WALL, never in this panel.
                    setSheet(null);
                    setFocus("notes");
                    onComposeNote();
                  },
                }
              : undefined
          }
        >
          <NoteSheetBody
            notes={noteItems ?? []}
            onOpenNote={(id) => {
              setSheet(null);
              setFocus("notes");
              onOpenNote?.(id);
            }}
          />
        </RoomSheet>
      )}
      {sheet === "mind" && (
        <RoomSheet
          title="Mind map library"
          hint="Tap a map to draw it — toolbar and all — on the mind wall"
          accent="#a78bfa"
          onClose={() => setSheet(null)}
          action={
            onCreateMap
              ? {
                  label: "New map",
                  onClick: () => {
                    setSheet(null);
                    setFocus("mind");
                    onCreateMap();
                  },
                }
              : undefined
          }
        >
          <MapSheetBody
            maps={mapItems ?? []}
            activeMapKey={activeMapKey}
            onOpenMap={(mapKey) => {
              setSheet(null);
              setFocus("mind");
              onSelectMap?.(mapKey);
            }}
          />
        </RoomSheet>
      )}

      <p className="dc-classroom-hint">
        {portrait
          ? "Drag to turn · tap Zoom to fill the screen with one board · tap the surface key to switch Board → Notes → Mind map"
          : "Drag to turn · 1–4 jump to a surface · C cycles Board → Notes → Mind map · F flips Fit ⇄ Zoom · ← → change lesson · double-click a board to fill the screen"}
      </p>
    </div>
  );
}
