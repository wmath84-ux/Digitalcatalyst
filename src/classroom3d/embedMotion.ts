// src/classroom3d/embedMotion.ts
//
// "Is the view actively changing?" — the single motion signal behind every
// Part 14 iframe optimization (games call this the camera-activity flag that
// drives LOD and impostor swaps).
//
// SeatRig is the ONLY writer: it calls `reportEmbedMotion()` from its
// per-frame update while the head is dragged, pinched, sprung between focus
// presets, or leaned toward the board. Readers — the impostor CSS class, the
// YouTube quality step-down, the transform throttle — subscribe and are
// notified ONLY on true/false edges, never per frame.
//
// Settle debounce: motion clears EMBED_MOTION_SETTLE_MS after the last
// report, so a drag that pauses mid-gesture or a spring's final millimetres
// don't thrash the impostor swap or the video quality. The idle breathing
// sway is deliberately NOT motion (SeatRig's spring refs exclude it), so a
// resting learner never sees an impostor — and the flat player never moves
// at all, because only the room's SeatRig ever reports.

import { useSyncExternalStore } from "react";

/** Stillness required before motion clears (A3: ~150–250 ms debounce). */
export const EMBED_MOTION_SETTLE_MS = 200;

/** CSS class toggled on the canvas parent while the view moves (impostor swap). */
export const EMBED_MOVING_CLASS = "dc-embed-moving";

let moving = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let lastMotionAt = 0;
const now = () => performance.now();
const listeners = new Set<(moving: boolean) => void>();

const notify = (): void => {
  for (const listener of listeners) {
    try {
      listener(moving);
    } catch {
      /* a subscriber must never break the rig */
    }
  }
};

// One pending timer, not a new callback + cancel/re-arm on every frame.
// The deadline still follows the MOST RECENT motion report, so the existing
// 200 ms quiet-window behaviour (including pauses mid-drag) is unchanged.
const settle = (): void => {
  const remaining = EMBED_MOTION_SETTLE_MS - (now() - lastMotionAt);
  if (remaining > 0) {
    settleTimer = setTimeout(settle, remaining);
    return;
  }
  settleTimer = null;
  moving = false;
  notify();
};

/** Raise immediately; keep extending the quiet deadline without allocating. */
export function reportEmbedMotion(): void {
  lastMotionAt = now();
  if (!moving) {
    moving = true;
    notify();
  }
  if (settleTimer === null) settleTimer = setTimeout(settle, EMBED_MOTION_SETTLE_MS);
}

/** Force the signal to rest — room unmount must never strand subscribers. */
export function resetEmbedMotion(): void {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  if (moving) {
    moving = false;
    notify();
  }
}

export function subscribeEmbedMotion(listener: (moving: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isEmbedMoving(): boolean {
  return moving;
}

/** React binding — re-renders only on motion edges. Server snapshot: at rest. */
export function useEmbedMotion(): boolean {
  return useSyncExternalStore(subscribeEmbedMotion, isEmbedMoving, () => false);
}
