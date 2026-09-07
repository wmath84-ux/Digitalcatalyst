// src/classroom3d/roomGeometry.ts
//
// THE ROOM'S MEASUREMENTS — one place, because four files have to agree.
//
// `Room.tsx` builds the shell, `mergedStatics.ts` bakes the window bays and
// the bookshelf into merged geometry, `Classroom3D.tsx` hangs the boards on
// the front wall, and `SeatRig.tsx` / `WallVisibility.tsx` aim the camera at
// them. Every one of those needs the same numbers, and the bug class this
// file exists to prevent is a board that moved in one of them and not in the
// others — a wall you can look straight at but the camera never faces.
//
// ── The front wall is a TRIPTYCH ──────────────────────────────────────────
// The owner's layout, seen from the seat:
//
//      ┌──── MIND MAP ────┬──── LECTURE BOARD ────┬──── NOTES ────┐
//      │   (left board)   │  (centre: the lesson) │ (right board) │
//      └──────────────────┴───────────────────────┴───────────────┘
//
// Three slabs, ALL THE SAME SIZE, all flat on the front wall and all facing
// the seat square-on (rotation 0 — no wall is angled away any more). That is
// not only what was asked for, it is what makes the boards USABLE: a DOM
// panel welded to a slab that is turned 56° or 90° away is projected through
// a CSS 3D perspective, and every pointer→content mapping inside it (React
// Flow's node dragging, a contentEditable caret) is computed against a
// bounding box that no longer matches the pixels. Square-on, the projection
// is a pure uniform scale and the panels behave like ordinary flat UI.
//
// The room is therefore wide enough for three 6.4 m boards: see ROOM.width.

import type { ClassroomFocus } from "./state";

/* ── The shell ─────────────────────────────────────────────────────────── */

/**
 * Room shell in metres. `width` is sized for the triptych: three boards of
 * `BOARD.width` plus two `BOARD.gap`s is 20.2 m, so the side walls sit just
 * outside the outer bezels (±10.75 m) instead of cutting through them.
 */
export const ROOM = { width: 21.5, depth: 13, height: 3.5 } as const;

/** The seat: eye height of a seated learner at the second-row centre desk. */
export const SEAT = { x: 0.15, y: 1.24, z: 2.62 } as const;

/* ── The three boards ──────────────────────────────────────────────────── */

export const BOARD = {
  /** Every board is the same slab — the owner's "size utna hi bada". */
  width: 6.4,
  height: 3.05,
  /** Air between two neighbouring bezels. */
  gap: 0.5,
  /** Centre height of the row. Top edge lands at 3.325 m (room is 3.5 m). */
  y: 1.8,
  /** Slab centre plane. The DOM face rides 0.05 m in front of it. */
  z: -3.28,
} as const;

/** Centre-to-centre spacing of the row. */
export const BOARD_PITCH = BOARD.width + BOARD.gap;

/** Which of the three boards a focus preset points at (`desk` points at none). */
export type BoardSide = "mind" | "board" | "notes";

/** Board centres along the front wall: mind map LEFT, lesson CENTRE, notes RIGHT. */
export const BOARD_X: Record<BoardSide, number> = {
  mind: -BOARD_PITCH,
  board: 0,
  notes: BOARD_PITCH,
};

/** The focus id → board side map (the desk has no board). */
export const FOCUS_BOARD: Partial<Record<ClassroomFocus, BoardSide>> = {
  mind: "mind",
  board: "board",
  notes: "notes",
};

/** Straight-ahead distance from the seat's eye to the board plane. */
export const SEAT_TO_BOARD = SEAT.z - BOARD.z;

/* ── Aiming the head ───────────────────────────────────────────────────── */

/**
 * Yaw (camera.rotation.y) that points the seat's head at a board centre.
 *
 * A camera looks down −Z at yaw 0 and rotation order YXZ, so its view
 * direction is (−sin θ, 0, −cos θ). Solving that for "look at (x, z) from the
 * seat" gives θ = atan2(−dx, −dz).
 */
export const yawToBoard = (boardX: number): number =>
  Math.atan2(-(boardX - SEAT.x), -(BOARD.z - SEAT.z));

/** Pitch (camera.rotation.x, positive = look UP) that centres a board. */
export const pitchToBoard = (boardX: number): number => {
  const horizontal = Math.hypot(boardX - SEAT.x, BOARD.z - SEAT.z);
  return Math.atan2(BOARD.y - SEAT.y, horizontal);
};

/** Bearing (as a yaw) from ANY eye position to a board centre. */
export const bearingToBoard = (
  boardX: number,
  eyeX: number,
  eyeZ: number,
): number => Math.atan2(-(boardX - eyeX), -(BOARD.z - eyeZ));

/* ── Filling the screen ────────────────────────────────────────────────── */

/**
 * Overscan applied to the fill distance. The board is framed a touch CLOSER
 * than the exact fit so its edges land a few percent OUTSIDE the viewport —
 * otherwise a single rounded pixel of bezel, or a sub-pixel spring residual,
 * shows a sliver of wall around a board that is supposed to cover everything.
 */
export const FILL_OVERSCAN = 0.97;

/** Never dolly closer than this — the near plane is 0.05 and the DOM face
 *  sits 0.05 m in front of the slab, so this keeps a real gap of air. */
export const FILL_MIN_DISTANCE = 0.45;

/**
 * How far in front of a `width × height` slab the camera must sit for the
 * slab to COVER the whole viewport — the owner's "board screen par zoom in
 * hokar fit ho jaaye aur kuchh na dikhe aaspaas".
 *
 * three.js `fov` is the VERTICAL angle and the horizontal one follows from
 * the aspect ratio (tan h = tan v × aspect). The slab covers the frame only
 * when it covers BOTH axes, so the tighter of the two distances wins.
 *
 * @param width    slab width in metres
 * @param height   slab height in metres
 * @param fovDeg   the camera's LIVE vertical fov, in degrees
 * @param aspect   viewport aspect (width / height)
 */
export const fillDistance = (
  width: number,
  height: number,
  fovDeg: number,
  aspect: number,
): number => {
  const safeFov = Number.isFinite(fovDeg) ? Math.min(150, Math.max(10, fovDeg)) : 62;
  const safeAspect = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 16 / 9;
  const tanVertical = Math.tan((safeFov * Math.PI) / 360);
  const tanHorizontal = tanVertical * safeAspect;
  if (!(tanVertical > 0) || !(tanHorizontal > 0)) return FILL_MIN_DISTANCE;
  const byHeight = height / 2 / tanVertical;
  const byWidth = width / 2 / tanHorizontal;
  return Math.max(FILL_MIN_DISTANCE, Math.min(byHeight, byWidth) * FILL_OVERSCAN);
};
