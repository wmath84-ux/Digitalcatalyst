// src/classroom3d/wallFocus.ts
//
// WHICH WALLS ARE ACTUALLY IN VIEW.
//
// Part 13 put every wall to sleep unless it was the room's `focus` — the one
// surface a HUD chip or a desk button had explicitly selected. That is right
// for expensive work and wrong for what the learner SEES: turning the head by
// hand (a drag) never changes `focus`, so a learner who dragged their view
// round to the notes wall was shown a wall that had switched its own contents
// off. The surface was in front of their eyes, blank.
//
// So on-screen-ness is now published as its own signal. WallVisibility already
// computes it every frame to gate painting; it writes the same answer here,
// edge-triggered (a handful of notifications per session, never per frame),
// and the room ORs it with `focus`:
//
//     a wall renders when it is focused OR when it is in view
//     a wall sleeps only when it is neither
//
// Media still follows the same rule, which is the honest reading of "don't
// play what nobody is looking at": a board you have turned away from pauses,
// a board you can still see keeps playing.

export type ClassroomWall = "board" | "notes" | "mind" | "desk";

export type WallOnScreen = Record<ClassroomWall, boolean>;

let state: WallOnScreen = { board: true, notes: false, mind: false, desk: false };

const listeners = new Set<(next: WallOnScreen) => void>();

/** Current on-screen map (a stable object between edges — safe to compare). */
export const getWallOnScreen = (): WallOnScreen => state;

/** Called by WallVisibility on every visibility edge. */
export const setWallOnScreen = (wall: ClassroomWall, onScreen: boolean): void => {
  if (state[wall] === onScreen) return;
  state = { ...state, [wall]: onScreen };
  for (const listener of listeners) listener(state);
};

/** Leaving the room must not strand the next mount in a stale map. */
export const resetWallOnScreen = (): void => {
  state = { board: true, notes: false, mind: false, desk: false };
  for (const listener of listeners) listener(state);
};

export const subscribeWallOnScreen = (listener: (next: WallOnScreen) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
