// src/classroom3d/throttledTransform.ts
//
// Decoupled tick rates for DOM walls (Part 14, item C): the Three.js scene
// renders at full rate, but an iframe-carrying wall's DOM transform only
// COMMITS new values at ~22 Hz while the camera moves — exactly how a game
// ticks physics below the render rate while nobody notices.
//
// Why this shape: drei's <Html transform> recomputes and writes its matrix3d
// styles EVERY frame unconditionally — its `calculatePosition` prop is only
// consulted in NON-transform mode (verified against the installed drei
// source), so a custom calculator would be a silent no-op here. What we CAN
// observe are the wrapper divs' `style.transform` writes. This throttle runs
// AFTER drei's own update each frame (mount order — see WallTransformThrottle
// below) and:
//
//   · at rest — commits whatever drei wrote (full precision, zero lag, and
//     the automatic "snap to the exact position" the moment motion ends);
//   · while moving — holds the last committed matrices until
//     TRANSFORM_THROTTLE_MS have elapsed, so the compositor repositions the
//     wall layer at ~22 Hz instead of 60 Hz while the live iframe behind it
//     sits hidden under its impostor (see embedMotion.ts + EmbedImpostor).
//
// Only caller-listed walls are touched (the board, and only while it shows a
// third-party embed — Classroom3D decides). Everything else keeps drei's
// full-rate sync. If drei's DOM structure ever changes, resolution fails
// closed: full-rate sync continues, nothing breaks.

import { useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { isEmbedMoving } from "./embedMotion";
import type { ClassroomFocus } from "./state";

/** Committed transform cadence while moving: 45 ms ≈ 22 updates/sec. */
export const TRANSFORM_THROTTLE_MS = 45;

export type ThrottledWall = ClassroomFocus;

interface WallEntry {
  outer: HTMLElement;
  inner: HTMLElement;
  outerTransform: string;
  innerTransform: string;
  lastCommit: number;
}

/**
 * Resolve drei's transform wrappers for a wall: the [data-classroom-wall]
 * hook inside → closest `.dc-classroom-surface` (drei's portal root) →
 * first child (outer — drei writes the camera matrix here) → first child
 * (inner — drei writes the object matrix here). Null unless the full chain
 * resolves, so a future drei DOM change degrades to unthrottled sync.
 */
const resolveWallSurface = (
  wall: ThrottledWall,
): { outer: HTMLElement; inner: HTMLElement } | null => {
  try {
    const hook = document.querySelector(`[data-classroom-wall="${wall}"]`);
    const surface = hook?.closest(".dc-classroom-surface");
    const outer = surface?.firstElementChild;
    const inner = outer?.firstElementChild;
    if (outer instanceof HTMLElement && inner instanceof HTMLElement) return { outer, inner };
    return null;
  } catch {
    return null;
  }
};

/**
 * Reusable rate-limiter for wall-transform commits. Returns a `tick` to call
 * once per frame AFTER drei's Html updates: at rest it commits every frame;
 * while the view moves it commits at most every TRANSFORM_THROTTLE_MS,
 * restoring the last committed matrix between commits.
 */
export function useThrottledTransform(): (walls: readonly ThrottledWall[]) => void {
  const entries = useRef(new Map<ThrottledWall, WallEntry>());
  return useCallback((walls: readonly ThrottledWall[]) => {
    const moving = isEmbedMoving();
    const now = typeof performance === "undefined" ? 0 : performance.now();
    for (const wall of walls) {
      let entry = entries.current.get(wall);
      if (!entry || !entry.outer.isConnected) {
        const resolved = resolveWallSurface(wall);
        if (!resolved) continue;
        entry = {
          ...resolved,
          outerTransform: resolved.outer.style.transform,
          innerTransform: resolved.inner.style.transform,
          lastCommit: now,
        };
        entries.current.set(wall, entry);
        continue; // Freshly resolved — standing pat IS the first commit.
      }
      if (!moving || now - entry.lastCommit >= TRANSFORM_THROTTLE_MS) {
        entry.outerTransform = entry.outer.style.transform;
        entry.innerTransform = entry.inner.style.transform;
        entry.lastCommit = now;
        continue;
      }
      if (entry.outer.style.transform !== entry.outerTransform) {
        entry.outer.style.transform = entry.outerTransform;
      }
      if (entry.inner.style.transform !== entry.innerTransform) {
        entry.inner.style.transform = entry.innerTransform;
      }
    }
    // Drop walls no longer throttled so a re-enable re-resolves cleanly.
    if (entries.current.size > walls.length) {
      const wanted = new Set(walls);
      for (const key of entries.current.keys()) {
        if (!wanted.has(key)) entries.current.delete(key);
      }
    }
  }, []);
}

/**
 * Canvas-side wiring for the throttle. MUST be mounted after the walls (R3F
 * runs same-priority useFrame hooks in mount order), so drei's matrix writes
 * land first and this pass decides which values stand.
 */
export function WallTransformThrottle({ walls }: { walls: readonly ThrottledWall[] }) {
  const tick = useThrottledTransform();
  const wallsRef = useRef(walls);
  wallsRef.current = walls;
  useFrame(() => tick(wallsRef.current));
  return null;
}
