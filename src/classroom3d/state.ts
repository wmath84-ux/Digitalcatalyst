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
//   CoursePlayerNote           → what the RIGHT "notes board" writes
//   MindMap                    → what the LEFT "mind board" draws
//
// The measurements themselves live in `roomGeometry.ts` — this file only turns
// them into the camera contract (where the head points, how far it may turn,
// what the fit ⇄ fill blend means).

import type { CourseFile, CourseModule } from "../types/course";
import {
  BOARD,
  BOARD_X,
  SEAT,
  pitchToBoard,
  yawToBoard,
} from "./roomGeometry";

/** The four things the learner can face from the seat, in cycle order. */
export type ClassroomFocus = "board" | "notes" | "mind" | "desk";

/**
 * The three boards, in the order the room's FOCUS key cycles through them:
 * Board → Notes → Mind map → Board … (the owner's "pahle click mein board,
 * dusre mein note, teesre mein mind map"). The desk is deliberately NOT in
 * the cycle — it is where you go to switch lesson, and cycling into it would
 * drop the learner's head onto the tablet every third tap.
 */
export const FOCUS_CYCLE: readonly ClassroomFocus[] = ["board", "notes", "mind"] as const;

/** The next surface in the cycle. Anything off-cycle (the desk) starts at the board. */
export const nextFocusInCycle = (current: ClassroomFocus): ClassroomFocus => {
  const index = FOCUS_CYCLE.indexOf(current);
  if (index < 0) return FOCUS_CYCLE[0];
  return FOCUS_CYCLE[(index + 1) % FOCUS_CYCLE.length];
};

export interface FocusPreset {
  id: ClassroomFocus;
  label: string;
  hint: string;
  /** Radians. 0 = straight at the centre board, negative = turn right. */
  yaw: number;
  /** Radians. Positive = look up, negative = look down (the desk). */
  pitch: number;
}

/**
 * Where each surface sits around the seat, DERIVED from the board row in
 * `roomGeometry.ts` so a board that moves can never leave a preset aiming at
 * empty wall. The learner never walks at "fit": the seat is the origin and
 * every preset is a head turn. (The fill blend in SeatRig DOES slide the eye
 * square-on to the focused board — that is the "only the board, nothing else
 * around it" mode, not a walk to another seat.)
 *
 * Note the sign: the NOTES board is on the RIGHT, so its yaw is negative.
 */
export const FOCUS_PRESETS: FocusPreset[] = [
  {
    id: "board",
    label: "Board",
    hint: "Lecture screen",
    yaw: yawToBoard(BOARD_X.board),
    pitch: pitchToBoard(BOARD_X.board),
  },
  {
    id: "notes",
    label: "Notes",
    hint: "Write while you watch",
    yaw: yawToBoard(BOARD_X.notes),
    pitch: pitchToBoard(BOARD_X.notes),
  },
  {
    id: "mind",
    label: "Mind map",
    hint: "Build the map",
    yaw: yawToBoard(BOARD_X.mind),
    pitch: pitchToBoard(BOARD_X.mind),
  },
  { id: "desk", label: "Desk", hint: "Switch module / lesson", yaw: 0.1, pitch: -0.78 },
];

export const focusPreset = (id: ClassroomFocus): FocusPreset =>
  FOCUS_PRESETS.find((preset) => preset.id === id) ?? FOCUS_PRESETS[0];

/**
 * How far the learner may turn their head before the look controls clamp.
 * Wide enough to look past the OUTER edge of each end board (the row spans
 * ±10.1 m from a seat 5.9 m away, i.e. ±1.05 rad) plus a little air, so the
 * head turn never stops short of a board it is supposed to reach.
 */
export const YAW_LIMIT = { min: -1.14, max: 1.16 };
export const PITCH_LIMIT = { min: -0.95, max: 0.34 };

export { SEAT, BOARD };

/* ── Flattening helpers (same contract the Course Player uses) ────────────── */

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

/* ── The view blend: FIT ⇄ FILL ───────────────────────────────────────────
   `zoom` is no longer "how far the seat leans". It is a blend between two
   camera POSES for the surface being faced, and SeatRig interpolates between
   them on the same spring as the head turn:

     MIN (1) — FIT.  The camera sits exactly at the seat and turns its head to
                     the focused board. You see that board in perspective with
                     its neighbours at the edges of the frame: the room.
     MAX (2) — FILL. The camera glides square-on to the focused board and stops
                     at the distance `fillDistance()` computes from the LIVE
                     lens, so the board covers the entire viewport and nothing
                     else is visible around it. Square-on also means zero
                     perspective skew, which is what makes React Flow dragging
                     and the note editor's caret behave inside a 3D surface.

   Because FILL is computed from the live fov + aspect, it is exact in both
   orientations — a portrait phone dollies much closer than a landscape one to
   cover the same slab, and neither ever leaves a sliver of wall on show.

   Intermediate values are legal and useful: the wheel and a two-finger pinch
   sweep the blend continuously between the two poses. */

export const BOARD_ZOOM_MIN = 1;
export const BOARD_ZOOM_MAX = 2;
/** One button / key press of blend. */
export const BOARD_ZOOM_STEP = 0.25;
/** Wheel notch (kept at the image viewer's feel). */
export const BOARD_ZOOM_WHEEL = 0.2;

/** 0 at FIT, 1 at FILL — the value SeatRig interpolates the poses with. */
export const zoomBlend = (value: number): number => {
  const span = BOARD_ZOOM_MAX - BOARD_ZOOM_MIN;
  if (!(span > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, (value - BOARD_ZOOM_MIN) / span));
};

export const clampBoardZoom = (value: number): number =>
  Number.isFinite(value) ? Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, value)) : BOARD_ZOOM_MIN;
