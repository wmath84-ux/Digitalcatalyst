// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-slider.json
//   source item: registry/new-york/ui/glass-slider/glass-slider.tsx
//
// [digitalcatalyst] Type-only adaptation: `React.PointerEvent` /
// `React.KeyboardEvent` → explicitly imported aliases (no global React
// namespace in this tsconfig). No behaviour change.
"use client";

import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { GlassLens, useGlassDark } from "@/components/ui/glass";
import { Track, spring, glide, easeGel, easeSoft, clamp, reduceMotion } from "@/components/ui/glass-motion";
import { cn } from "@/lib/utils";

const TRACK_H = 6;
const THUMB = 22;

// gel tuning (frac-velocity based, fraction/sec)
const DEFORM_GAIN = 0.13;
const DEFORM_EXP = 0.7;
const DEFORM_CAP = 0.36;
const HOLD_BOOST = 0.1;

interface GlassSliderProps extends Omit<ComponentProps<"div">, "onChange"> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  ariaLabel?: string;
}

export function GlassSlider({
  value: controlled,
  defaultValue = 50,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  ariaLabel = "Slider",
  className,
  ...props
}: GlassSliderProps) {
  const dark = useGlassDark();
  const isControlled = controlled !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const val = isControlled ? controlled! : internal;

  const railRef = useRef<HTMLDivElement | null>(null);
  const thumb = useRef<HTMLSpanElement | null>(null);
  const fill = useRef<HTMLSpanElement | null>(null);
  const solid = useRef<HTMLSpanElement | null>(null);
  const glass = useRef<HTMLSpanElement | null>(null);

  const frac = useRef(new Track((val - min) / (max - min)));
  const lift = useRef(new Track(0));
  const deform = useRef(new Track(0));
  const pressed = useRef(false);

  useEffect(() => {
    const paint = () => {
      const pct = clamp(frac.current.get(), 0, 1) * 100;
      const l = lift.current.get();
      const q = deform.current.get();
      if (fill.current) fill.current.style.width = `${pct}%`;
      const el = thumb.current;
      if (el) {
        const grow = 1 + 0.28 * l;
        const sx = grow * (1 + 0.6 * q);
        const sy = grow * (1 - 0.4 * q);
        el.style.left = `${pct}%`;
        el.style.transform = `translate(-50%, -50%) scale(${sx}, ${sy})`;
      }
      if (solid.current) solid.current.style.opacity = String(1 - l);
      if (glass.current) glass.current.style.opacity = String(l);
    };
    const subs = [frac.current.watch(paint), lift.current.watch(paint), deform.current.watch(paint)];
    return () => subs.forEach((o) => o());
  }, []);

  const runDeform = () => {
    if (reduceMotion()) return;
    spring(
      deform.current,
      () => {
        const v = Math.abs(frac.current.velocity());
        const fromVel = DEFORM_GAIN * v ** DEFORM_EXP;
        return clamp(Math.max(fromVel, pressed.current ? HOLD_BOOST : 0), 0, DEFORM_CAP);
      },
      { tension: 210, friction: 12, canRest: () => !pressed.current && Math.abs(frac.current.velocity()) < 0.001 },
    );
  };

  useEffect(() => {
    if (!pressed.current) {
      const target = (val - min) / (max - min);
      if (reduceMotion()) frac.current.snap(target);
      else spring(frac.current, () => target, { tension: 300, friction: 26 });
    }
  }, [val, min, max]);

  const fracAt = (clientX: number) => {
    const r = railRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return clamp((clientX - r.left) / r.width, 0, 1);
  };
  const toValue = (f: number) => clamp(Math.round((min + f * (max - min)) / step) * step, min, max);
  const emit = (f: number) => {
    const v = toValue(f);
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
  };
  const emit2 = (v: number) => {
    const c = clamp(v, min, max);
    if (!isControlled) setInternal(c);
    onValueChange?.(c);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    glide(lift.current, 1, 0.22, easeGel);
    const f = fracAt(e.clientX);
    frac.current.halt();
    frac.current.push(f);
    emit(f);
    runDeform();
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current) return;
    const f = fracAt(e.clientX);
    frac.current.push(f);
    emit(f);
  };
  const onUp = () => {
    if (!pressed.current) return;
    pressed.current = false;
    glide(lift.current, 0, 0.4, easeSoft);
    const target = isControlled
      ? (val - min) / (max - min)
      : (toValue(frac.current.get()) - min) / (max - min);
    spring(frac.current, () => target, { tension: 320, friction: 24 });
    runDeform();
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = (max - min) / 10 || step;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight": case "ArrowUp": next = val + step; break;
      case "ArrowLeft": case "ArrowDown": next = val - step; break;
      case "PageUp": next = val + big; break;
      case "PageDown": next = val - big; break;
      case "Home": next = min; break;
      case "End": next = max; break;
      default: return;
    }
    e.preventDefault();
    emit2(next);
  };

  const rail = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  const fillColor = dark ? "#0a84ff" : "#007aff";

  return (
    <div
      ref={railRef}
      role="slider"
      aria-valuenow={val}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cn("relative flex touch-none select-none items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50", className)}
      style={{ height: THUMB + 10, cursor: "pointer" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      {...props}
    >
      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style={{ height: TRACK_H, background: rail }} />
      <span ref={fill} className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full" style={{ height: TRACK_H, background: fillColor, width: "0%" }} />
      <span
        ref={thumb}
        aria-hidden
        className="absolute top-1/2 rounded-full will-change-transform"
        style={{ width: THUMB, height: THUMB, left: "0%", transformOrigin: "center", transform: "translate(-50%, -50%)" }}
      >
        <span ref={solid} className="absolute inset-0 rounded-full" style={{ background: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(0,0,0,0.05)" }} />
        <span ref={glass} className="absolute inset-0 rounded-full" style={{ opacity: 0 }}>
          <GlassLens width={THUMB} height={THUMB} radius={999} strength={0.75} blur={1} dome={0.35} />
        </span>
      </span>
    </div>
  );
}
