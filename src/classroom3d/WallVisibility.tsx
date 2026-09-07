// src/classroom3d/WallVisibility.tsx
//
// Off-screen walls shouldn't even paint (Part 13).
//
// The learner never leaves the seat — the camera only rotates — so each
// wall's visibility is a cheap static angle check, not a raycast. One
// useFrame reads the camera's live yaw/pitch (SeatRig writes rotation
// directly, so there is no shared state to wire) and flips each wall's DOM
// between `visibility: visible | hidden`:
//
//   · `visibility` (not display/content-visibility) composes with the
//     WallActivity gate, which owns `content-visibility` via React: either
//     mechanism hiding the wall hides it, and neither overwrites the other.
//   · layout is preserved, so a wall swimming back into view never reflows.
//   · DOM is touched ONLY on visibility edges, with a hysteresis band, so
//     the steady-state per-frame cost is a few float comparisons.
//
// Horizontal half-FOV is a constant 38° by design (SeatRig holds the
// horizontal angle steady across orientations); vertical half-FOV is read
// live from the camera because portrait widens it dramatically.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { resetWallOnScreen, setWallOnScreen } from "./wallFocus";

interface WallSpec {
  wall: "board" | "notes" | "mind";
  /** Yaw (rad, rotation.y) at which the camera faces this wall head-on. */
  yaw: number;
  /** Wall angular half-size (rad) from the seat, margin included. */
  halfSize: number;
}

// Directions from the seat (0.15, 1.24, 2.62) to each wall centre, as
// rotation.y values: yaw = atan2(-(x - cx), -(z - cz)).
const WALLS: WallSpec[] = [
  { wall: "board", yaw: 0.025, halfSize: 0.55 },
  { wall: "notes", yaw: 0.976, halfSize: 0.36 },
  { wall: "mind", yaw: 1.551, halfSize: 0.4 },
];

/** Half the composed horizontal FOV (76°), plus a small lead-in margin. */
const HALF_FOV_H = (76 / 2) * (Math.PI / 180) + 0.06;
/** Hysteresis band so a wall on the frame edge never flickers. */
const EDGE_BAND = 0.15;
/** Desk tablet pitch from the seat; the desk shows while looking down. */
const DESK_PITCH = -0.63;

export default function WallVisibility({ forceVisible = false }: { forceVisible?: boolean }) {
  const { camera } = useThree();
  // The store outlives this component (module scope), so a room that unmounts
  // must hand the next one a clean map instead of last session's angles.
  useEffect(() => resetWallOnScreen, []);
  const forceRef = useRef(forceVisible);
  forceRef.current = forceVisible;
  // Cached wall elements + last applied state. Resolved lazily because the
  // Html portals mount around the same commit as this rig.
  const tracked = useRef(
    [...WALLS.map((spec) => ({ ...spec, kind: "yaw" as const })), { wall: "desk" as const, kind: "pitch" as const }].map(
      (entry) => ({ ...entry, el: null as HTMLElement | null, visible: true }),
    ),
  );

  useFrame(() => {
    const list = tracked.current;
    const yaw = camera.rotation.y;
    const pitch = camera.rotation.x;
    // Vertical half-FOV is live: portrait widens it up to 48°.
    const halfFovV = ("fov" in camera ? Number((camera as { fov: number }).fov) : 62) * (Math.PI / 360);
    for (const entry of list) {
      if (!entry.el || !entry.el.isConnected) {
        entry.el = document.querySelector<HTMLElement>(`[data-classroom-wall="${entry.wall}"]`);
        if (!entry.el) continue;
      }
      let show: boolean;
      if (forceRef.current) {
        show = true;
      } else if (entry.kind === "pitch") {
        // The desk tablet is visible while the frame's bottom edge reaches it.
        const bottom = pitch - halfFovV;
        show = entry.visible ? bottom < DESK_PITCH + 0.35 : bottom < DESK_PITCH + 0.2;
      } else {
        const distance = Math.abs(yaw - entry.yaw);
        const limit = HALF_FOV_H + entry.halfSize;
        show = entry.visible ? distance < limit + EDGE_BAND : distance < limit;
      }
      if (show === entry.visible) continue;
      entry.visible = show;
      entry.el.style.visibility = show ? "visible" : "hidden";
      // Publish the same edge to the room (wallFocus.ts): a wall the learner
      // turned to by hand must WAKE UP, not just be allowed to paint.
      setWallOnScreen(entry.wall, show);
    }
  });

  return null;
}
