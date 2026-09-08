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
import { BOARD, BOARD_X, bearingToBoard } from "./roomGeometry";
import { resetWallOnScreen, setWallOnScreen } from "./wallFocus";

interface WallSpec {
  wall: "board" | "notes" | "mind";
  /** The board's centre along the front wall (metres). */
  x: number;
}

// The triptych: mind map LEFT, lecture board CENTRE, notes RIGHT — all on the
// front wall, all the same slab (see roomGeometry.ts). The bearing to each is
// computed LIVE from the camera's own position rather than baked for the seat,
// because the FIT ⇄ FILL blend slides the eye square-on to whichever board is
// focused: a seat-relative angle would keep the other two "on screen" long
// after the camera had glided 7 m sideways past them.
const WALLS: WallSpec[] = [
  { wall: "board", x: BOARD_X.board },
  { wall: "notes", x: BOARD_X.notes },
  { wall: "mind", x: BOARD_X.mind },
];

/** Half the composed horizontal FOV (76°), plus a small lead-in margin. */
const HALF_FOV_H = (76 / 2) * (Math.PI / 180) + 0.06;
/** Hysteresis band so a wall on the frame edge never flickers. */
const EDGE_BAND = 0.15;
/** Desk tablet pitch from the seat; the desk shows while looking down. */
const DESK_PITCH = -0.63;

export default function WallVisibility({ forceVisible = false }: { forceVisible?: boolean }) {
  const camera = useThree((state) => state.camera);
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
        // Angle between where the head points and where this board actually
        // is, from the camera's LIVE position, plus the board's own angular
        // half-width at that live distance (a board you have glided up to
        // subtends far more of the frame than the same board from the seat).
        const dx = entry.x - camera.position.x;
        const dz = BOARD.z - camera.position.z;
        const range = Math.hypot(dx, dz);
        const off = Math.abs(yaw - bearingToBoard(entry.x, camera.position.x, camera.position.z));
        const halfSize = range > 0.2 ? Math.atan(BOARD.width / 2 / range) : Math.PI;
        const limit = HALF_FOV_H + halfSize;
        show = entry.visible ? off < limit + EDGE_BAND : off < limit;
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
