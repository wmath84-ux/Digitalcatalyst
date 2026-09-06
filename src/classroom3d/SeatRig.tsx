// src/classroom3d/SeatRig.tsx
//
// The seated camera. The learner NEVER walks in this classroom — the whole
// experience is "sit at your desk and turn your head", exactly as the owner
// specified. So there is no orbit control and no WASD: the camera is pinned
// to the seat and only its yaw / pitch move, clamped to a human head-turn.
//
// Three ways to turn:
//   · drag anywhere on the empty room (pointer / touch),
//   · tap a focus chip in the HUD (springs to that surface),
//   · the desk console buttons (same springs).
//
// Because every panel is live DOM welded to a slab, drags that start ON a
// panel must NOT rotate the room — the rig only listens to pointer events
// that reach the canvas itself.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PITCH_LIMIT, SEAT, YAW_LIMIT, focusPreset, type ClassroomFocus } from "./state";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function SeatRig({
  focus,
  onManualLook,
}: {
  focus: ClassroomFocus;
  /** Fired when the learner turns the head by hand, so the HUD can un-pin. */
  onManualLook?: () => void;
}) {
  const { camera, gl } = useThree();
  const target = useRef({ yaw: 0, pitch: 0 });
  const current = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // A focus change re-aims the head.
  useEffect(() => {
    const preset = focusPreset(focus);
    target.current = { yaw: preset.yaw, pitch: preset.pitch };
  }, [focus]);

  // Manual head turn — canvas-only pointer drags.
  useEffect(() => {
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      dragging.current = true;
      last.current = { x: event.clientX, y: event.clientY };
      element.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      if (Math.abs(dx) + Math.abs(dy) > 1) onManualLook?.();
      target.current.yaw = clamp(target.current.yaw + dx * 0.0042, YAW_LIMIT.min, YAW_LIMIT.max);
      target.current.pitch = clamp(target.current.pitch - dy * 0.0032, PITCH_LIMIT.min, PITCH_LIMIT.max);
    };
    const up = (event: PointerEvent) => {
      dragging.current = false;
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

  useFrame((state, delta) => {
    // Critically-damped-ish spring so a focus jump feels like a head turn,
    // not a cut.
    const k = 1 - Math.pow(0.0016, delta);
    current.current.yaw += (target.current.yaw - current.current.yaw) * k;
    current.current.pitch += (target.current.pitch - current.current.pitch) * k;

    // A seated body breathes — a whisper of sway keeps the room alive.
    const t = state.clock.elapsedTime;
    const swayY = Math.sin(t * 0.55) * 0.0045;
    const swayX = Math.sin(t * 0.37 + 1.2) * 0.0035;

    camera.position.set(SEAT.x, SEAT.y + Math.sin(t * 0.8) * 0.006, SEAT.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = current.current.yaw + swayY;
    camera.rotation.x = current.current.pitch + swayX;
    camera.rotation.z = 0;
    camera.updateMatrixWorld();
  });

  useEffect(() => {
    camera.rotation.order = "YXZ";
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 62;
      camera.near = 0.05;
      camera.far = 60;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return null;
}
