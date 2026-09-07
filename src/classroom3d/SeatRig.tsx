// src/classroom3d/SeatRig.tsx
//
// The seated camera. The learner NEVER walks in this classroom — the whole
// experience is "sit at your desk and turn your head", exactly as the owner
// specified. So there is no orbit control and no WASD: the camera is pinned
// to the seat and only its yaw / pitch move, clamped to a human head-turn —
// plus, since Part 12, a lean toward the board (a clamped forward dolly that
// can neither leave the seat backwards nor reach the board).
//
// Three ways to turn, three ways to lean:
//   · drag anywhere on the empty room (pointer / touch),
//   · tap a focus chip in the HUD (springs to that surface),
//   · the desk console buttons (same springs);
//   · lean: the wheel over the empty room while facing the board, a two-finger
//     pinch on the room, or a double-tap / double-click on the board itself
//     (that last one lives on the BoardPanel, next to the + / − / fit keys).
//
// Because every panel is live DOM welded to a slab, gestures that start ON a
// panel must NOT move the camera — the rig only listens to pointer events
// that reach the canvas itself. Pinching the PICTURE still zooms the picture
// (the viewer's own gesture); pinching the ROOM leans the seat closer.
//
// Part 13: a drag also drops the room to drag fidelity (a CSS class on the
// canvas parent that sheds overlay effects, plus a dpr dip to 1×) and every
// hot path is allocation-free — no React state, no per-event objects, no
// per-frame property writes that never change.
//
// Part 14: the rig publishes "is the view actively changing" to embedMotion
// every frame (drag, pinch, focus spring, board lean — but NOT the idle
// breathing sway), driving the iframe impostor swap, the YouTube quality
// step-down and the transform throttle. The spring also snaps sub-visible
// residuals to rest so motion ends when VISIBLE motion ends, not a second
// into the exponential tail.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  BOARD_DOLLY_METRES,
  BOARD_ZOOM_MAX,
  BOARD_ZOOM_MIN,
  PITCH_LIMIT,
  SEAT,
  YAW_LIMIT,
  clampBoardZoom,
  focusPreset,
  type ClassroomFocus,
} from "./state";
import {
  EMBED_MOVING_CLASS,
  reportEmbedMotion,
  resetEmbedMotion,
  subscribeEmbedMotion,
} from "./embedMotion";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function SeatRig({
  focus,
  zoom = BOARD_ZOOM_MIN,
  recenterSignal = 0,
  onZoomDelta,
  onManualLook,
}: {
  focus: ClassroomFocus;
  /** The room's board lean. Only honoured while facing the board. */
  zoom?: number;
  /** Bump to re-aim at the current focus without changing it (Fit-to-screen). */
  recenterSignal?: number;
  /** Wheel / pinch on the empty room report a zoom delta; the room owns the clamped state. */
  onZoomDelta?: (delta: number) => void;
  /** Fired when the learner turns the head by hand, so the HUD can un-pin. */
  onManualLook?: () => void;
}) {
  const { camera, gl, size } = useThree();
  const target = useRef({ yaw: 0, pitch: 0, zoom: BOARD_ZOOM_MIN });
  const current = useRef({ yaw: 0, pitch: 0, zoom: BOARD_ZOOM_MIN });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  // The canvas listeners below are attached once — they read the live room
  // state through refs so they never go stale between renders.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const onZoomDeltaRef = useRef(onZoomDelta);
  onZoomDeltaRef.current = onZoomDelta;
  // Every pointer currently on the canvas, for the drag-vs-pinch split.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number; applied: number } | null>(null);
  // Live render resolution for the drag-dip (Part 13): a drag temporarily
  // drops dpr to 1× and dragend restores the snapshot — unless the quality
  // governor moved the resolution meanwhile, in which case its live decision
  // wins. Read through refs so the once-attached listeners never go stale.
  const liveDpr = useThree((state) => state.viewport.dpr);
  const setDpr = useThree((state) => state.setDpr);
  const dprRef = useRef(liveDpr);
  dprRef.current = liveDpr;
  const setDprRef = useRef(setDpr);
  setDprRef.current = setDpr;
  const dipDpr = useRef<number | null>(null);

  // A focus change re-aims the head. `recenterSignal` re-aims without a focus
  // change — Fit-to-screen recentres the board even when already on "board".
  useEffect(() => {
    const preset = focusPreset(focus);
    target.current.yaw = preset.yaw;
    target.current.pitch = preset.pitch;
  }, [focus, recenterSignal]);

  // The board lean follows the room's zoom state — and glides back to the
  // seat's normal position the moment the learner looks at another wall. The
  // spring below makes the return a lean-back, never a jump-cut.
  useEffect(() => {
    target.current.zoom = focus === "board" ? clampBoardZoom(zoom) : BOARD_ZOOM_MIN;
  }, [focus, zoom]);

  // Manual head turn + pinch-to-lean — canvas-only pointer drags.
  useEffect(() => {
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) {
        // A drag starts: the DOM walls drop to drag fidelity (see the
        // `.dc-dragging` rule in classroom3d.css) and the render resolution
        // dips to 1×, so the frame rate holds while the view sweeps. Both
        // restore on release; the dip only engages above 1× and dragend
        // restores only what the dip itself set (never the governor's).
        element.parentElement?.classList.add("dc-dragging");
        if (dprRef.current > 1.01 && dipDpr.current === null) {
          dipDpr.current = dprRef.current;
          setDprRef.current(1);
        }
        dragging.current = true;
        last.current = { x: event.clientX, y: event.clientY };
      } else if (pointers.current.size === 2) {
        // The second fingertip turns the drag into a pinch: rotation stops
        // and the finger spread takes over as the zoom control.
        dragging.current = false;
        const values = pointers.current.values();
        const first = values.next().value as { x: number; y: number };
        const second = values.next().value as { x: number; y: number };
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        pinch.current = { distance, zoom: target.current.zoom, applied: target.current.zoom };
      }
      element.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2) {
        // Two fingers on the room lean the seat — but only while facing the
        // board, exactly like the wheel. Anywhere else the gesture is a no-op
        // (the zoom state is left alone so nothing fires on the way back).
        if (focusRef.current === "board" && pinch.current && pinch.current.distance > 0) {
          const values = pointers.current.values();
          const first = values.next().value as { x: number; y: number };
          const second = values.next().value as { x: number; y: number };
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          // Same distance-ratio maths as the image viewer's pinch zoom.
          const next = clampBoardZoom((pinch.current.zoom * distance) / pinch.current.distance);
          const delta = next - pinch.current.applied;
          pinch.current.applied = next;
          if (delta !== 0) onZoomDeltaRef.current?.(delta);
        }
        return;
      }
      if (!dragging.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      // Mutated in place — a drag fires dozens of pointermoves per second
      // and none of them should allocate.
      last.current.x = event.clientX;
      last.current.y = event.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) onManualLook?.();
      target.current.yaw = clamp(target.current.yaw + dx * 0.0042, YAW_LIMIT.min, YAW_LIMIT.max);
      target.current.pitch = clamp(target.current.pitch - dy * 0.0032, PITCH_LIMIT.min, PITCH_LIMIT.max);
    };
    const up = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      pinch.current = null;
      if (pointers.current.size === 1) {
        // Back to one fingertip: the head turn resumes from where it is.
        const remaining = pointers.current.values().next().value as { x: number; y: number };
        last.current.x = remaining.x;
        last.current.y = remaining.y;
        dragging.current = true;
      } else if (pointers.current.size === 0) {
        dragging.current = false;
        // The drag ends: drag fidelity off, and the dpr dip restored — but
        // only if the quality governor hasn't moved the resolution meanwhile
        // (its live decision always wins over this stale snapshot).
        element.parentElement?.classList.remove("dc-dragging");
        if (dipDpr.current !== null) {
          if (dprRef.current <= 1.01) setDprRef.current(dipDpr.current);
          dipDpr.current = null;
        }
      }
      element.releasePointerCapture?.(event.pointerId);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("pointerleave", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("pointerleave", up);
    };
  }, [gl, onManualLook]);

  // Wheel over the empty room leans toward the board — board only, so a wheel
  // anywhere else never arms a surprise zoom for the way back. A native
  // listener (not React onWheel) so preventDefault actually holds and the
  // page never scrolls or zooms under the room.
  useEffect(() => {
    const element = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      if (focusRef.current !== "board") return;
      event.preventDefault();
      // Same notch as the image viewer's wheel zoom.
      onZoomDeltaRef.current?.(event.deltaY < 0 ? 0.2 : -0.2);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [gl]);

  // Part 14: mirror the motion signal onto the canvas parent as a CSS class
  // (edge-driven — the store only notifies on true/false transitions), so
  // the iframe impostor swap is pure CSS with zero React renders. Unmount
  // resets the store: leaving the room must never strand subscribers — or a
  // remount — inside a stale "moving".
  useEffect(() => {
    const element = gl.domElement.parentElement;
    const unsubscribe = subscribeEmbedMotion((moving) => {
      element?.classList.toggle(EMBED_MOVING_CLASS, moving);
    });
    return () => {
      unsubscribe();
      element?.classList.remove(EMBED_MOVING_CLASS);
      resetEmbedMotion();
    };
  }, [gl]);

  useFrame((state, delta) => {
    // Critically-damped-ish spring so a focus jump feels like a head turn,
    // not a cut — the lean rides the very same spring.
    const k = 1 - Math.pow(0.0016, delta);
    current.current.yaw += (target.current.yaw - current.current.yaw) * k;
    current.current.pitch += (target.current.pitch - current.current.pitch) * k;
    current.current.zoom += (target.current.zoom - current.current.zoom) * k;

    // Snap sub-visible residuals: below ~1.5 px of wall travel the spring's
    // exponential tail is invisible but would read as "moving" for another
    // second — snapping ends motion when VISIBLE motion ends. (Exact rest
    // also makes the settled check below a plain comparison, no epsilon.)
    if (Math.abs(target.current.yaw - current.current.yaw) < 0.002) current.current.yaw = target.current.yaw;
    if (Math.abs(target.current.pitch - current.current.pitch) < 0.002) {
      current.current.pitch = target.current.pitch;
    }
    if (Math.abs(target.current.zoom - current.current.zoom) < 0.002) current.current.zoom = target.current.zoom;

    // Part 14 motion signal: a finger on the glass, or a spring still
    // travelling (focus hop, pinch/wheel lean, recenter glide). The sway
    // below is added straight to the camera — never to these refs — so idle
    // breathing correctly reads as rest.
    if (
      dragging.current ||
      pointers.current.size >= 2 ||
      target.current.yaw !== current.current.yaw ||
      target.current.pitch !== current.current.pitch ||
      target.current.zoom !== current.current.zoom
    ) {
      reportEmbedMotion();
    }

    // A seated body breathes — a whisper of sway keeps the room alive.
    const t = state.clock.elapsedTime;
    const swayY = Math.sin(t * 0.55) * 0.0045;
    const swayX = Math.sin(t * 0.37 + 1.2) * 0.0035;

    // The lean is a forward dolly from the seat: at BOARD_ZOOM_MIN the camera
    // sits exactly where it always has, and at BOARD_ZOOM_MAX it has glided
    // 3.6 m toward the board — still 2.2 m of air short of the chalk rail.
    const lean =
      (clamp(current.current.zoom, BOARD_ZOOM_MIN, BOARD_ZOOM_MAX) - BOARD_ZOOM_MIN) * BOARD_DOLLY_METRES;
    camera.position.set(SEAT.x, SEAT.y + Math.sin(t * 0.8) * 0.006, SEAT.z - lean);
    // (rotation.order is "YXZ" once, in the lens effect below — nothing here
    // ever changes it, so re-asserting it every frame was pure overhead.)
    camera.rotation.y = current.current.yaw + swayY;
    camera.rotation.x = current.current.pitch + swayX;
    camera.rotation.z = 0;
    camera.updateMatrixWorld();
  });

  // ── Orientation-aware field of view ────────────────────────────────────
  // The Course Player is NOT landscape-only: it is the one screen in the app
  // where rotation is unlocked (src/utils/appOrientation.ts), so it has to be
  // usable held either way. The flat shell handles that by re-stacking its
  // panes; a 3D room has to handle it in the LENS instead.
  //
  // three.js `fov` is the VERTICAL angle, so a tall portrait viewport keeps
  // the vertical view and squeezes the horizontal one — on a 9:16 phone a 62°
  // vertical fov leaves only ~38° horizontally, which is a keyhole: the board
  // no longer fits and the side walls disappear entirely.
  //
  // So we hold the HORIZONTAL angle steady instead and derive the vertical
  // one from the live aspect ratio. Landscape looks exactly as designed;
  // portrait widens the lens so the whole board still fits, at the cost of
  // showing more floor and ceiling — which is the correct trade, because the
  // learner can always turn their head but can never widen the screen.
  useEffect(() => {
    camera.rotation.order = "YXZ";
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    // The horizontal angle the room was composed for.
    const targetHorizontalFov = THREE.MathUtils.degToRad(76);
    const vertical = 2 * Math.atan(Math.tan(targetHorizontalFov / 2) / aspect);
    // Clamped so an extreme aspect can never produce a fisheye or a pinhole.
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vertical), 55, 96);
    camera.near = 0.05;
    camera.far = 60;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}
