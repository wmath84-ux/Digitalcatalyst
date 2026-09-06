// src/classroom3d/Classroom3D.tsx
//
// THE 3D CLASSROOM — the course player rebuilt as a room the learner sits in.
//
// Layout, seen from the seat (the learner never moves, only turns their head):
//
//        ┌──────────── FRONT WALL ────────────┐
//        │   ██████  BIG SCREEN  ██████       │   ← straight ahead: the lesson
//        │   (blackboard framing, chalk rail) │      plays here (ResourceViewer)
//        └────────────────────────────────────┘
//   LEFT-FRONT  ▓ NOTES WALL ▓        RIGHT WALL: winter windows, snow outside
//   FAR LEFT    ▓ MIND WALL  ▓
//        ▁▁▁▁▁ your desk: the console tablet ▁▁▁▁▁   ← look down to control
//
//   · Turn a little left  → the NOTES wall (the app's real NotesPanel).
//   · Turn further left   → the MIND MAP wall (the app's real MindMapPanel).
//   · Look down           → the desk console: modules, lessons, progress,
//                           and one-tap head-turns to any surface.
//
// Everything is live DOM welded to the geometry, so every course-player
// capability — YouTube, video, audio, PDF, Docs/Sheets/Slides, forms, images,
// embeds, rich-text notes, the full mind map editor — works from the chair.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import { Network, NotebookPen } from "lucide-react";
import type { CourseModule, CoursePlayerNote } from "../types/course";
import NotesPanel from "../course/NotesPanel";
import MindMapPanel from "../course/MindMapPanel";
import type { MindMapSaveStatus, MindMapSummary } from "../course/useCourseMindMap";
import {
  addChildNode,
  countNodes,
  createMindMap,
  rootId,
  type MindMap,
} from "../../utils/mindMapTree";
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
  /** Notes: owned by the caller so the flat player and the room share them. */
  notes?: CoursePlayerNote[];
  onAddNote?: (html: string) => void;
  onEditNote?: (id: string, html: string) => void;
  onDeleteNote?: (id: string) => void;
  /** Mind map: same deal — pass the hook's state in to persist to Firestore. */
  mind?: MindMap;
  onMindChange?: (updater: MindMap | ((current: MindMap) => MindMap)) => void;
  mindStatus?: MindMapSaveStatus;
  mindMaps?: MindMapSummary[];
  activeMapKey?: string;
  onSelectMap?: (mapKey: string) => void;
  onCreateMap?: (title?: string) => void;
  onRenameMap?: (mapKey: string, title: string) => void;
  onDeleteMap?: (mapKey: string) => void;
  /** Leave the room (back to the flat player / purchases). */
  onExit?: () => void;
}

const demoMind = (): MindMap => {
  let mind = createMindMap("This module", "Room map");
  for (const branch of ["Key idea", "Formula", "Doubt to revise"]) {
    mind = addChildNode(mind, rootId(), branch).mind;
  }
  return mind;
};

export default function Classroom3D({
  modules,
  courseTitle = "Course",
  notes: notesProp,
  onAddNote,
  onEditNote,
  onDeleteNote,
  mind: mindProp,
  onMindChange,
  mindStatus = "saved",
  mindMaps,
  activeMapKey = "main",
  onSelectMap,
  onCreateMap,
  onRenameMap,
  onDeleteMap,
  onExit,
}: Classroom3DProps) {
  const flat = useMemo(() => flattenModules(modules).filter((module) => module.files.length > 0), [modules]);

  const [moduleIndex, setModuleIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState(0);
  const [focus, setFocus] = useState<ClassroomFocus>("board");
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [composerSignal, setComposerSignal] = useState(0);

  // Uncontrolled fallbacks so the room is usable stand-alone (dev preview).
  const [localNotes, setLocalNotes] = useState<CoursePlayerNote[]>([]);
  const [localMind, setLocalMind] = useState<MindMap>(demoMind);
  const notes = notesProp ?? localNotes;
  const mind = mindProp ?? localMind;

  const addNote = useCallback(
    (html: string) => {
      if (onAddNote) return onAddNote(html);
      setLocalNotes((current) => [
        { id: `n${Date.now()}`, text: html.replace(/<[^>]+>/g, " ").trim(), html, createdAt: Date.now(), links: [] },
        ...current,
      ]);
    },
    [onAddNote],
  );
  const editNote = useCallback(
    (id: string, html: string) => {
      if (onEditNote) return onEditNote(id, html);
      setLocalNotes((current) =>
        current.map((note) =>
          note.id === id ? { ...note, html, text: html.replace(/<[^>]+>/g, " ").trim(), updatedAt: Date.now() } : note,
        ),
      );
    },
    [onEditNote],
  );
  const deleteNote = useCallback(
    (id: string) => {
      if (onDeleteNote) return onDeleteNote(id);
      setLocalNotes((current) => current.filter((note) => note.id !== id));
    },
    [onDeleteNote],
  );
  const changeMind = useCallback(
    (updater: MindMap | ((current: MindMap) => MindMap)) => {
      if (onMindChange) return onMindChange(updater);
      setLocalMind((current) => (typeof updater === "function" ? updater(current) : updater));
    },
    [onMindChange],
  );

  const activeModule = flat[moduleIndex];
  const activeFile = activeModule?.files[fileIndex] ?? null;

  const selectModule = useCallback((index: number) => {
    setModuleIndex(index);
    setFileIndex(0);
    setFocus("board");
  }, []);
  const selectFile = useCallback((index: number) => {
    setFileIndex(index);
    setFocus("board");
  }, []);

  /** Prev / Next walks the whole course, crossing module boundaries. */
  const step = useCallback(
    (direction: 1 | -1) => {
      if (!flat.length) return;
      let m = moduleIndex;
      let f = fileIndex + direction;
      while (m >= 0 && m < flat.length) {
        if (f < 0) {
          m -= 1;
          if (m < 0) return;
          f = flat[m].files.length - 1;
        } else if (f >= flat[m].files.length) {
          m += 1;
          if (m >= flat.length) return;
          f = 0;
        } else {
          setModuleIndex(m);
          setFileIndex(f);
          setFocus("board");
          return;
        }
      }
    },
    [flat, moduleIndex, fileIndex],
  );

  const toggleComplete = useCallback((fileId: string) => {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // Keyboard: 1-4 turn the head, ←/→ step lessons, Esc goes back to the desk.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const map: Record<string, ClassroomFocus> = { "1": "board", "2": "notes", "3": "mind", "4": "desk" };
      if (map[event.key]) setFocus(map[event.key]);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "Escape") setFocus("desk");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const mapSummaries = useMemo<MindMapSummary[]>(
    () =>
      mindMaps ?? [
        {
          mapKey: "main",
          title: mind.title || "Room map",
          rootTopic: mind.rootTopic,
          nodeCount: countNodes(mind),
          updatedAt: Date.now(),
          createdAt: Date.now(),
        },
      ],
    [mindMaps, mind],
  );

  const canvasRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={canvasRef} className="dc-classroom-root">
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

          {/* ── FRONT: the big board ─────────────────────────────────── */}
          <group position={[0, 0, -3.38]}>
            {/* blackboard slab the screen is mounted on */}
            <mesh position={[0, 1.72, 0.02]} receiveShadow>
              <boxGeometry args={[7.4, 2.7, 0.1]} />
              <meshStandardMaterial color="#16302a" roughness={0.95} />
            </mesh>
            {/* chalk tray */}
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
            <BoardPanel file={activeFile} moduleTitle={activeModule?.title || courseTitle} />
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
                hint={`${notes.length} saved · writes straight from the seat`}
                accent="#fbbf24"
              />
              <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setComposerSignal((value) => value + 1)}
                  className="rounded-xl bg-amber-400/20 px-3 py-1.5 text-[12px] font-black text-amber-200 ring-1 ring-amber-300/40"
                >
                  + New note
                </button>
                <span className="truncate text-[11px] font-semibold text-white/40">
                  {activeFile ? `While watching: ${activeFile.name}` : "Pick a lesson from the desk"}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NotesPanel
                  notes={notes}
                  onAdd={addNote}
                  onEdit={editNote}
                  onDelete={deleteNote}
                  composerOpenSignal={composerSignal}
                />
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
            label="Mind map wall"
          >
            <div className="flex h-full w-full flex-col bg-[#0a0f1c] text-white">
              <WallHeader
                icon={Network}
                title="Mind map"
                hint={`${countNodes(mind)} nodes · ${activeModule?.title || courseTitle}`}
                accent="#c4b5fd"
              />
              <div className="min-h-0 flex-1">
                <MindMapPanel
                  mind={mind}
                  onMindChange={changeMind}
                  status={mindStatus}
                  playerTheme="dark"
                  open={focus === "mind"}
                  maps={mapSummaries}
                  activeMapKey={activeMapKey}
                  onSelectMap={onSelectMap}
                  onCreateMap={onCreateMap}
                  onRenameMap={onRenameMap}
                  onDeleteMap={onDeleteMap}
                />
              </div>
            </div>
          </SurfaceFrame>

          {/* ── DOWN: the desk console ───────────────────────────────── */}
          <DeskConsole>
            <DeskPanel
              modules={flat}
              moduleIndex={moduleIndex}
              fileIndex={fileIndex}
              onSelectModule={selectModule}
              onSelectFile={selectFile}
              onStep={step}
              focus={focus}
              onFocus={setFocus}
              completed={completed}
              onToggleComplete={toggleComplete}
              noteCount={notes.length}
              mapCount={mapSummaries.length}
              onExit={onExit}
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
