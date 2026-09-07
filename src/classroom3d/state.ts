// src/classroom3d/state.ts
//
// The 3D Classroom's shared state contract.
//
// The classroom is NOT a new course player — it is a new *shell* around the
// course player the app already has. Everything the learner can do while
// seated (switch module / lesson, watch the board, write notes, build a mind
// map) maps 1:1 onto the existing Course Player concepts:
//
//   CourseModule / CourseFile  → what the desk console lists and the board plays
//   CoursePlayerNote           → what the left "notes wall" writes
//   MindMap                    → what the far-left "mind wall" draws
//
// Part 1 (this pass) ships the room, the seated camera and the three live
// surfaces driven by demo course content. Part 2 swaps the surface bodies for
// the real ResourceViewer / NotesPanel / MindMapPanel components and wires
// them to Firestore through CoursePlayerApp.

import type { CourseFile, CourseModule } from "../types/course";

/** The four things the learner can face from the seat, in yaw order. */
export type ClassroomFocus = "board" | "notes" | "mind" | "desk";

export interface FocusPreset {
  id: ClassroomFocus;
  label: string;
  hint: string;
  /** Radians. 0 = straight at the front board, negative = turn left. */
  yaw: number;
  /** Radians. Negative = look down (the desk). */
  pitch: number;
}

/**
 * Where each surface sits around the seat. The learner never walks: the seat
 * is the origin of the whole experience and every surface is placed on an arc
 * within a comfortable head turn of it.
 */
export const FOCUS_PRESETS: FocusPreset[] = [
  { id: "board", label: "Board", hint: "Lecture screen", yaw: 0, pitch: -0.02 },
  { id: "notes", label: "Notes", hint: "Write while you watch", yaw: 0.85, pitch: -0.05 },
  { id: "mind", label: "Mind map", hint: "Build the map", yaw: 1.62, pitch: -0.05 },
  { id: "desk", label: "Desk", hint: "Switch module / lesson", yaw: 0.1, pitch: -0.78 },
];

export const focusPreset = (id: ClassroomFocus): FocusPreset =>
  FOCUS_PRESETS.find((preset) => preset.id === id) ?? FOCUS_PRESETS[0];

/** How far the learner may turn their head before the look controls clamp. */
export const YAW_LIMIT = { min: -0.6, max: 1.95 };
export const PITCH_LIMIT = { min: -0.95, max: 0.3 };

/** The seat: eye height of a seated learner at the second-row centre desk. */
export const SEAT = { x: 0.15, y: 1.24, z: 2.62 } as const;

// ── Flattening helpers (same contract the Course Player uses) ──────────────

export interface FlatModule {
  id: string;
  title: string;
  files: CourseFile[];
  locked: boolean;
}

const isLocked = (level?: string) => level === "paidUpdate" || level === "hidden";

/** Modules → a flat, seat-friendly list; nested sub-modules are inlined. */
export const flattenModules = (modules: CourseModule[], depth = 0): FlatModule[] => {
  const out: FlatModule[] = [];
  for (const module of modules) {
    const files: CourseFile[] = [
      ...(module.embedContentUrl
        ? [{
            id: `${module.id}__embedded`,
            name: module.embedContentTypeLabel || "Embedded resource",
            type: "embed" as const,
            url: module.embedContentUrl,
            embedUrl: module.embedContentUrl,
            accessLevel: module.accessLevel,
          }]
        : []),
      ...(module.files || []),
    ];
    out.push({
      id: module.id,
      title: depth > 0 ? `↳ ${module.title}` : module.title,
      files,
      locked: isLocked(module.accessLevel),
    });
    if (module.modules?.length) out.push(...flattenModules(module.modules, depth + 1));
  }
  return out;
};

/** Chalk-friendly label for a file type — what the blackboard writes. */
export const FILE_KIND_LABEL: Record<string, string> = {
  youtube: "Video lecture",
  video: "Video lecture",
  audio: "Audio class",
  pdf: "PDF reading",
  doc: "Document",
  sheet: "Worksheet",
  slides: "Slides",
  ebook: "E-book",
  image: "Diagram",
  google_form: "Practice test",
  embed: "Interactive",
  mindmap: "Mind map",
};

/* ── Board lean — camera zoom-to-board (Part 12) ────────────────────────────
   `boardZoom` is the camera's lean toward the front board: 1 = the seat's
   normal position, BOARD_ZOOM_MAX = the closest lean. SeatRig turns it into
   a forward dolly of (zoom - MIN) * BOARD_DOLLY_METRES on the same spring
   as the head turn.

   The numbers are chosen so the camera can never misbehave:
     · MIN = 1 — the lens never pulls back past the seat.
     · MAX = 2.5 → 3.6 m forward, from z = 2.62 to z = -0.98. The board face
       sits at z ≈ -3.23, so 2.2 m of air always remains — no clipping — and
       the path (x = 0.15, y ≈ 1.24) glides over the learner's desk, clear of
       the mug, the neighbouring desks and every classmate behind the seat. */

export const BOARD_ZOOM_MIN = 1;
export const BOARD_ZOOM_MAX = 2.5;
/** One button / key press of lean. */
export const BOARD_ZOOM_STEP = 0.25;
/** Where a double-tap / double-click on the board lands the camera. */
export const BOARD_ZOOM_TOGGLE = 2;
/**
 * Fit-to-screen in portrait. The portrait lens is wider (SeatRig holds the
 * horizontal angle steady), so the board reads smaller — fitting a touch
 * closer keeps the chalk the same readable size in both orientations.
 */
export const BOARD_ZOOM_PORTRAIT_FIT = 1.15;
/** Metres of forward travel per 1.0 of zoom. */
export const BOARD_DOLLY_METRES = 2.4;

export const clampBoardZoom = (value: number): number =>
  Number.isFinite(value) ? Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, value)) : BOARD_ZOOM_MIN;
