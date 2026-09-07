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

import { Suspense, memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, AdaptiveEvents, BakeShadows, Preload } from "@react-three/drei";
import { Network, NotebookPen } from "lucide-react";
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
import { BoardPanel, DeskPanel, WallHeader } from "./panels";
import {
  BOARD_ZOOM_MIN,
  BOARD_ZOOM_PORTRAIT_FIT,
  BOARD_ZOOM_STEP,
  BOARD_ZOOM_TOGGLE,
  FOCUS_PRESETS,
  clampBoardZoom,
  flattenModules,
  type ClassroomFocus,
} from "./state";
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
  onExit,
  exitLabel = "Flat player",
}: Classroom3DProps) {
  const [focus, setFocus] = useState<ClassroomFocus>("board");

  // ── Board lean + fullscreen (Part 12) ───────────────────────────────────
  // `boardZoom` is the camera's lean toward the board: 1 = the seat's normal
  // position, BOARD_ZOOM_MAX = the closest lean. SeatRig turns it into a
  // clamped forward dolly on the same spring as the head turn, and glides it
  // back to 1 whenever the learner looks at another wall.
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
   * Fit-to-screen: the lean back to normal — a touch closer in portrait,
   * where SeatRig's widened lens shrinks the board — and the head back to
   * the board's exact centre. Reuses the room's `portrait` flag, like the
   * hint line below.
   */
  const fitBoard = useCallback(() => {
    setBoardZoom(portrait ? BOARD_ZOOM_PORTRAIT_FIT : BOARD_ZOOM_MIN);
    setFocus("board");
    setBoardFitSignal((value) => value + 1);
  }, [portrait]);

  /** Double-tap / double-click the board: face it, centre it, toggle a close-up. */
  const toggleBoardZoom = useCallback(() => {
    setFocus("board");
    setBoardFitSignal((value) => value + 1);
    setBoardZoom((current) =>
      current > (BOARD_ZOOM_MIN + BOARD_ZOOM_TOGGLE) / 2
        ? portrait
          ? BOARD_ZOOM_PORTRAIT_FIT
          : BOARD_ZOOM_MIN
        : BOARD_ZOOM_TOGGLE,
    );
  }, [portrait]);

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

  // Keyboard: 1-4 turn the head, ←/→ step lessons, +/−/0 lean toward the
  // board, Esc exits board-fullscreen first and only otherwise drops to the desk.
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
        if (document.fullscreenElement) void document.exitFullscreen();
        else if (boardFullscreen) setBoardFullscreen(false);
        else setFocus("desk");
      } else if (focus === "board" && (event.key === "+" || event.key === "=")) zoomBoardBy(BOARD_ZOOM_STEP);
      else if (focus === "board" && (event.key === "-" || event.key === "_")) zoomBoardBy(-BOARD_ZOOM_STEP);
      else if (focus === "board" && event.key === "0") fitBoard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, focus, boardFullscreen, zoomBoardBy, fitBoard]);

  return (
    <div className="dc-classroom-root" data-course-classroom-3d>
      <Canvas
        shadows
        // Mount-time resolution from the area-aware heuristic (quality.ts):
        // huge viewports start lower than small phone screens. Runtime dpr
        // is owned by <AdaptiveDpr> under the quality governor — never here.
        dpr={initialDpr}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 62, position: [0.15, 1.24, 2.62] }}
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

          {/* ── FRONT: the blackboard the big screen is mounted on ────── */}
          <group position={[0, 0, -3.38]}>
            <mesh position={[0, 1.72, 0.02]} receiveShadow>
              <boxGeometry args={[7.4, 2.7, 0.1]} />
              <meshStandardMaterial color="#16302a" roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.34, 0.14]} castShadow>
              <boxGeometry args={[7.4, 0.08, 0.18]} />
              <meshStandardMaterial color="#7a5a38" roughness={0.8} />
            </mesh>
            {[-1.4, -1.1, -0.8].map((x, i) => (
              <mesh key={x} position={[x, 0.41, 0.16]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.014, 0.014, 0.12, 8]} />
                <meshStandardMaterial color={["#ffffff", "#ffe8a3", "#ffd0d0"][i]} />
              </mesh>
            ))}
          </group>
          <SurfaceFrame
            position={[0, 1.78, -3.28]}
            width={6.4}
            height={3.05}
            pixelWidth={1600}
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
              onZoomIn={() => {
                setFocus("board");
                zoomBoardBy(BOARD_ZOOM_STEP);
              }}
              onZoomOut={() => {
                setFocus("board");
                zoomBoardBy(-BOARD_ZOOM_STEP);
              }}
              onFit={fitBoard}
              onToggleFullscreen={toggleBoardFullscreen}
              onToggleZoom={toggleBoardZoom}
            >
              {/* Only the faced wall works (Part 13): the viewer keeps its
                  mounted instance — playback position, drafts, listeners —
                  but an unfaced board skips rendering and pauses its media.
                  Fullscreen counts as faced: the learner is watching it. */}
              <WallActivity wall="board" active={focus === "board" || boardFullscreen}>
                {board}
              </WallActivity>
            </BoardPanel>
          </SurfaceFrame>

          {/* ── LEFT-FRONT: the notes wall ───────────────────────────── */}
          <SurfaceFrame
            position={[-4.55, 1.6, -0.55]}
            rotation={[0, 0.98, 0]}
            width={3.5}
            height={2.5}
            pixelWidth={1100}
            accent="#f59e0b"
            active={focus === "notes"}
            spill={settings.spillLights === "all" || focus === "notes"}
            label="Notes wall"
          >
            <div className="flex h-full w-full flex-col bg-[#0a0f1c] text-white">
              <WallHeader
                icon={NotebookPen}
                title="Your notes"
                hint={`${noteCount} saved · written from the seat`}
                accent="#fbbf24"
              />
              {onComposeNote && (
                <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-2">
                  <button
                    type="button"
                    onClick={onComposeNote}
                    className="rounded-xl bg-amber-400/20 px-3 py-1.5 text-[12px] font-black text-amber-200 ring-1 ring-amber-300/40"
                  >
                    + New note
                  </button>
                  <span className="truncate text-[11px] font-semibold text-white/40">
                    {activeFileName ? `While watching: ${activeFileName}` : "Pick a lesson from the desk"}
                  </span>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                <WallActivity wall="notes" active={focus === "notes"}>
                  {notes}
                </WallActivity>
              </div>
            </div>
          </SurfaceFrame>

          {/* ── FAR LEFT: the mind map wall ──────────────────────────── */}
          <SurfaceFrame
            position={[-5.86, 1.6, 2.5]}
            rotation={[0, Math.PI / 2, 0]}
            width={4.2}
            height={2.7}
            pixelWidth={1240}
            accent="#a78bfa"
            active={focus === "mind"}
            spill={settings.spillLights === "all" || focus === "mind"}
            label="Mind map wall"
          >
            <div className="flex h-full w-full flex-col bg-[#0a0f1c] text-white">
              <WallHeader
                icon={Network}
                title="Mind map"
                hint={`${mapCount} map${mapCount === 1 ? "" : "s"} · ${flat[position.moduleIndex]?.title || courseTitle}`}
                accent="#c4b5fd"
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                <WallActivity wall="mind" active={focus === "mind"}>
                  {mind}
                </WallActivity>
              </div>
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
      <p className="dc-classroom-hint">
        {portrait
          ? "Drag to turn · double-tap the board to lean in · rotate for the full board"
          : "Drag to turn · 1–4 jump to a surface · ← → change lesson · scroll to lean in · double-click the board to zoom"}
      </p>
    </div>
  );
}
