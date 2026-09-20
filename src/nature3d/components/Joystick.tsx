// src/nature3d/components/Joystick.tsx
//
// A twin-stick-grade virtual joystick.
//
// Why it is written this way:
//   * It reports through a REF CALLBACK, never through React state. A stick
//     that setState()s on every pointermove would re-render the whole panel
//     60 times a second and fight the WebGL loop for the main thread. The
//     knob is moved with a direct `transform` write instead, which stays on
//     the compositor.
//   * `setPointerCapture` means the finger can slide outside the pad without
//     dropping the input — the classic mobile-shooter behaviour.
//   * The vector is normalised to the unit disc with a small dead zone, and a
//     slight response curve (x * |x|) gives fine control near the centre and
//     full speed at the rim.

import { useCallback, useEffect, useRef } from "react";

export interface JoystickProps {
  /** Called with the current vector. x: -1 (left) … 1 (right), y: -1 (up) … 1 (down). */
  onChange: (x: number, y: number, active: boolean) => void;
  /** Visual size in px. */
  size?: number;
  label?: string;
  className?: string;
  /** Tint of the knob — used to distinguish move vs look. */
  accent?: string;
}

const DEAD_ZONE = 0.08;

export default function Joystick({ onChange, size = 132, label, className, accent = "#38bdf8" }: JoystickProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const raf = useRef(0);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const radius = size / 2;
  const knobSize = size * 0.42;
  const maxTravel = radius - knobSize / 2 - 4;

  const flush = useCallback(() => {
    raf.current = 0;
    const v = pending.current;
    if (!v) return;
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate3d(${v.x * maxTravel}px, ${v.y * maxTravel}px, 0)`;
    // Response curve: squared magnitude keeps small movements precise.
    const mag = Math.hypot(v.x, v.y);
    const curved = mag * mag;
    const nx = mag > 0 ? (v.x / mag) * curved : 0;
    const ny = mag > 0 ? (v.y / mag) * curved : 0;
    onChangeRef.current(nx, ny, mag > DEAD_ZONE);
  }, [maxTravel]);

  const schedule = useCallback((x: number, y: number) => {
    pending.current = { x, y };
    // Coalesce to one update per animation frame — a fast finger can fire
    // 240 pointermove events/sec and we only need 60.
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  }, [flush]);

  const compute = useCallback((clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    let dx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      dx = 0;
      dy = 0;
    }
    schedule(dx, dy);
  }, [schedule]);

  const release = useCallback(() => {
    activeId.current = null;
    pending.current = { x: 0, y: 0 };
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div className={className} style={{ touchAction: "none", userSelect: "none" }}>
      <div
        ref={padRef}
        role="application"
        aria-label={label ?? "Virtual joystick"}
        onPointerDown={(e) => {
          if (activeId.current !== null) return;
          activeId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          compute(e.clientX, e.clientY);
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerMove={(e) => {
          if (activeId.current !== e.pointerId) return;
          compute(e.clientX, e.clientY);
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          if (activeId.current !== e.pointerId) return;
          release();
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerCancel={release}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          position: "relative",
          background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.14), rgba(9,18,32,0.42) 70%)",
          border: "1px solid rgba(255,255,255,0.28)",
          boxShadow: "0 12px 34px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          display: "grid",
          placeItems: "center",
          cursor: "grab",
        }}
      >
        {/* Cross-hair guides */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", opacity: 0.25, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: "50%", top: 12, bottom: 12, width: 1, background: "rgba(255,255,255,0.6)" }} />
          <div style={{ position: "absolute", top: "50%", left: 12, right: 12, height: 1, background: "rgba(255,255,255,0.6)" }} />
        </div>
        <div
          ref={knobRef}
          style={{
            width: knobSize,
            height: knobSize,
            borderRadius: "50%",
            background: `radial-gradient(circle at 38% 32%, rgba(255,255,255,0.92), ${accent} 62%, rgba(12,24,40,0.9))`,
            boxShadow: `0 6px 18px rgba(0,0,0,0.45), 0 0 18px ${accent}66`,
            border: "1px solid rgba(255,255,255,0.5)",
            willChange: "transform",
            pointerEvents: "none",
          }}
        />
      </div>
      {label ? (
        <p style={{ marginTop: 6, textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
          {label}
        </p>
      ) : null}
    </div>
  );
}
