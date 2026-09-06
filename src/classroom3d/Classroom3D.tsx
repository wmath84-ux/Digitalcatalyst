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

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import { Network, NotebookPen } from "lucide-react";
import type { CourseFile, CourseModule } from "../types/course";
import Room from "./Room";
import SeatRig from "./SeatRig";
import SurfaceFrame from "./SurfaceFrame";
import DeskConsole from "./DeskConsole";
import { BoardPanel, DeskPanel, WallHeader } from "./panels";
import { FOCUS_PRESETS, flattenModules, type ClassroomFocus } from "./state";
import "./classroom3d.css";

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

  // Keyboard: 1-4 turn the head, ←/→ step lessons, Esc drops back to the desk.
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
      else if (event.key === "Escape") setFocus("desk");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <div className="dc-classroom-root" data-course-classroom-3d>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 62, position: [0.15, 1.24, 2.62] }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={["#9fb3cc"]} />
          <Room />
          <SeatRig focus={focus} />

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
            label="Lecture board"
          >
            <BoardPanel
              title={activeFileName}
              subtitle={flat[position.moduleIndex]?.title || courseTitle}
            >
              {board}
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
              <div className="min-h-0 flex-1 overflow-hidden">{notes}</div>
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
            label="Mind map wall"
          >
            <div className="flex h-full w-full flex-col bg-[#0a0f1c] text-white">
              <WallHeader
                icon={Network}
                title="Mind map"
                hint={`${mapCount} map${mapCount === 1 ? "" : "s"} · ${flat[position.moduleIndex]?.title || courseTitle}`}
                accent="#c4b5fd"
              />
              <div className="min-h-0 flex-1 overflow-hidden">{mind}</div>
            </div>
          </SurfaceFrame>

          {/* ── DOWN: the desk console ───────────────────────────────── */}
          <DeskConsole>
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
        Drag the room to turn your head · keys 1–4 jump to a surface · ← → change lesson
      </p>
    </div>
  );
}
