// src/nature3d/components/Joystick.tsx
//
// The twin-stick's LEFT half: a virtual joystick for explore mode. It reports
// a normalised (x, y) vector — x = strafe, y = forward — through a ref-style
// callback, never through React state: a drag must not re-render at 60 Hz.
//
// Moves are coalesced to one callback per animation frame, the pointer is
// captured so a sliding thumb never loses the stick, and `touchAction:none`
// keeps the page from scrolling under the gesture.

import { useEffect, useRef } from "react";

export interface JoystickVector {
  x: number;
  y: number;
  active: boolean;
}

interface JoystickProps {
  /** Called at most once per frame while the stick moves. */
  onMove: (v: JoystickVector) => void;
  /** Diameter of the base in CSS px. */
  size?: number;
  label?: string;
}

const OUT: JoystickVector = { x: 0, y: 0, active: false };

export default function Joystick({ onMove, size = 128, label = "Move" }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onMove);
  cbRef.current = onMove;
  const stateRef = useRef({ id: -1, cx: 0, cy: 0, dx: 0, dy: 0, raf: 0, scheduled: false });

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return undefined;
    const st = stateRef.current;
    const radius = size / 2;

    const emit = () => {
      st.scheduled = false;
      const len = Math.hypot(st.dx, st.dy);
      const cl = len > radius ? radius / len : 1;
      const nx = (st.dx * cl) / radius;
      const ny = -(st.dy * cl) / radius;
      knob.style.transform = `translate(${st.dx * cl}px, ${st.dy * cl}px)`;
      OUT.x = nx;
      OUT.y = ny;
      OUT.active = st.id !== -1;
      cbRef.current(OUT);
    };

    const schedule = () => {
      if (st.scheduled) return;
      st.scheduled = true;
      st.raf = requestAnimationFrame(emit);
    };

    const onDown = (e: PointerEvent) => {
      if (st.id !== -1) return;
      st.id = e.pointerId;
      base.setPointerCapture(e.pointerId);
      const r = base.getBoundingClientRect();
      st.cx = r.left + r.width / 2;
      st.cy = r.top + r.height / 2;
      st.dx = e.clientX - st.cx;
      st.dy = e.clientY - st.cy;
      schedule();
      e.preventDefault();
    };

    const onMoveInner = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      st.dx = e.clientX - st.cx;
      st.dy = e.clientY - st.cy;
      schedule();
      e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      st.id = -1;
      st.dx = 0;
      st.dy = 0;
      try {
        base.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      schedule();
    };

    base.addEventListener("pointerdown", onDown);
    base.addEventListener("pointermove", onMoveInner);
    base.addEventListener("pointerup", onUp);
    base.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(st.raf);
      base.removeEventListener("pointerdown", onDown);
      base.removeEventListener("pointermove", onMoveInner);
      base.removeEventListener("pointerup", onUp);
      base.removeEventListener("pointercancel", onUp);
    };
  }, [size]);

  const knobSize = Math.round(size * 0.44);
  return (
    <div
      ref={baseRef}
      role="slider"
      aria-label={label}
      aria-valuetext="Move stick"
      style={{ width: size, height: size, touchAction: "none" }}
      className="relative grid place-items-center rounded-full border border-white/25 bg-slate-950/45 shadow-2xl backdrop-blur-xl"
    >
      <div className="pointer-events-none absolute inset-2 rounded-full border border-white/10" />
      <div
        ref={knobRef}
        style={{ width: knobSize, height: knobSize }}
        className="pointer-events-none rounded-full border border-emerald-200/50 bg-gradient-to-br from-emerald-300/80 to-teal-500/80 shadow-[0_0_18px_rgba(16,185,129,0.5)]"
      />
    </div>
  );
}
