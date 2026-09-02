'use client'

/**
 * ChargingCompleteButton — the "Mark complete" toggle rebuilt on the
 * aicanvas.me "Charging Widget" (https://aicanvas.me/components/charging-widget).
 *
 * A circular battery-style indicator: two phased liquid waves live inside a
 * ring and rise when the lesson is marked complete (100%), settling back to a
 * low idle level when it is un-marked. The wave surface is a rAF-driven SVG
 * path (two sine layers drifting in opposite directions), so it always looks
 * alive without being busy. Complete = emerald waves + a check glyph; not yet
 * complete = violet waves + a lightning bolt.
 *
 * The control stays a real <button> toggle — same aria contract as the old
 * GlassButton version (`data-course-mark-complete`, `data-completed`).
 */

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

const IDLE_LEVEL = 18; // % fill while the lesson is not yet complete
const FULL_LEVEL = 100;

export default function ChargingCompleteButton({
  done,
  onToggle,
  size = 44,
  className = "",
}: {
  done: boolean;
  onToggle: () => void;
  /** Outer diameter in px. */
  size?: number;
  className?: string;
}) {
  const wave1Ref = useRef<SVGPathElement>(null);
  const wave2Ref = useRef<SVGPathElement>(null);
  const levelRef = useRef(done ? FULL_LEVEL : IDLE_LEVEL);
  const targetRef = useRef(done ? FULL_LEVEL : IDLE_LEVEL);

  useEffect(() => {
    targetRef.current = done ? FULL_LEVEL : IDLE_LEVEL;
  }, [done]);

  // Continuous wave animation — no React state, pure rAF path rewrites.
  useEffect(() => {
    let raf = 0;
    let offset1 = 0;
    let offset2 = Math.PI;
    const buildWavePath = (fillY: number, amp: number, phase: number) => {
      let d = `M 0 ${fillY.toFixed(2)}`;
      for (let x = 0; x <= 200; x += 4) {
        const y = fillY + Math.sin((x / 200) * Math.PI * 4 + phase) * amp;
        d += ` L ${x} ${y.toFixed(2)}`;
      }
      d += " L 200 200 L 0 200 Z";
      return d;
    };
    const tick = () => {
      // Ease the level toward its target so marking complete visibly FILLS.
      levelRef.current += (targetRef.current - levelRef.current) * 0.045;
      const pct = levelRef.current;
      const fillY = 200 - (pct / 100) * 200;
      const amp = 12 * (1 - pct / 100) + 4;
      offset1 += 0.045;
      offset2 -= 0.032;
      wave1Ref.current?.setAttribute("d", buildWavePath(fillY, amp, offset1));
      wave2Ref.current?.setAttribute("d", buildWavePath(fillY, amp, offset2 + Math.PI));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ring = done ? "#34d399" : "#a855f7";
  const wave1 = done ? "rgba(16,185,129,0.45)" : "rgba(120,60,220,0.45)";
  const wave2 = done ? "rgba(52,211,153,0.7)" : "rgba(160,80,255,0.7)";
  const glyph = done ? "#ecfdf5" : "#e0b0ff";
  const clipId = useRef(`cw-clip-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.9 }}
      aria-pressed={done}
      aria-label={done ? "Mark this lesson as not complete" : "Mark this lesson complete"}
      title={done ? "Tap to mark as not complete" : "Mark this lesson complete"}
      className={`relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}
      style={{ width: size, height: size }}
      data-course-mark-complete
      data-completed={done ? "true" : "false"}
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true" className="block">
        <defs>
          <clipPath id={clipId}>
            <circle cx="100" cy="100" r="88" />
          </clipPath>
        </defs>
        {/* Backplate keeps the glyph legible over any lesson behind it. */}
        <circle cx="100" cy="100" r="88" fill="rgba(10,12,18,0.55)" />
        <circle cx="100" cy="100" r="88" fill={done ? "rgba(16,185,129,0.10)" : "rgba(120,60,220,0.10)"} />
        <g clipPath={`url(#${clipId})`}>
          <path ref={wave1Ref} d="M 0 200 L 200 200 L 200 200 L 0 200 Z" fill={wave1} />
          <path ref={wave2Ref} d="M 0 200 L 200 200 L 200 200 L 0 200 Z" fill={wave2} />
        </g>
        <circle cx="100" cy="100" r="88" fill="none" stroke={ring} strokeWidth="10" />
        {done ? (
          // Check mark
          <path
            d="M 62 104 L 90 132 L 140 74"
            fill="none"
            stroke={glyph}
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          // Lightning bolt (the charging glyph)
          <g transform="translate(100, 100) scale(2.4)">
            <path d="M 8 -20 L -8 2 L 0 2 L -8 20 L 8 -2 L 0 -2 Z" fill={glyph} />
          </g>
        )}
      </svg>
    </motion.button>
  );
}
