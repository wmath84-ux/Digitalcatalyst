// Glass Toggle — AI Canvas design (https://aicanvas.me/components/glass-toggle).
//
// iOS-style toggle row: label + "On"/"Off" state text on the left, a 56×32
// glass track on the right whose colour, border, thumb position, thumb shadow
// and glow are all driven off ONE spring-animated progress motion value —
// exactly the choreography the source component ships.
"use client";

import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

interface GlassPrefToggleProps {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  color: string; // accent hex, e.g. "#FF6BF5"
  delay?: number; // entrance stagger
  open?: boolean; // popover visibility — replays the entrance on every open
  light?: boolean; // player light theme → dark ink
  attr?: string; // data-course-setting hook
}

export function GlassPrefToggle({
  label,
  on,
  onChange,
  color,
  delay = 0,
  open = true,
  light = false,
  attr,
}: GlassPrefToggleProps) {
  // One spring drives everything: track bg, border, thumb x, thumb shadow.
  const progress = useSpring(on ? 1 : 0, { stiffness: 300, damping: 22 });

  useEffect(() => {
    progress.set(on ? 1 : 0);
  }, [on, progress]);

  const offTrack = light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)";
  const offBorder = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)";

  const trackBg = useTransform(progress, [0, 1], [offTrack, `${color}44`]);
  const trackBorder = useTransform(progress, [0, 1], [offBorder, `${color}55`]);
  const thumbX = useTransform(progress, [0, 1], [2, 26]);
  const thumbShadow = useTransform(
    progress,
    [0, 1],
    ["0 2px 8px rgba(0,0,0,0.3)", `0 2px 16px ${color}44`],
  );

  const ink = light ? "text-slate-900/70" : "text-white/60";

  return (
    <motion.div
      className="flex items-center justify-between gap-4 px-4 py-2.5"
      data-course-setting={attr}
      initial={false}
      animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
      transition={{ type: "spring", stiffness: 200, damping: 22, delay: open ? delay : 0 }}
    >
      <div className="min-w-0">
        <p className={`text-sm font-medium ${ink}`}>{label}</p>
        <p
          className="text-[11px]"
          style={
            on
              ? { color }
              : { color: light ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.25)", opacity: 0.5 }
          }
        >
          {on ? "On" : "Off"}
        </p>
      </div>

      <motion.button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        whileTap={{ scale: 0.95 }}
        className="relative h-8 w-14 shrink-0 cursor-pointer rounded-full outline-none"
        style={{
          background: trackBg,
          border: "1px solid",
          borderColor: trackBorder,
          boxShadow: on
            ? `0 0 20px ${color}15, inset 0 1px 2px rgba(0,0,0,0.1)`
            : "inset 0 1px 2px rgba(0,0,0,0.2)",
        }}
      >
        {/* Glow behind the thumb */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          animate={{ opacity: on ? 0.3 : 0 }}
          style={{ background: `radial-gradient(circle at 75% 50%, ${color}, transparent 70%)` }}
        />
        {/* Thumb */}
        <motion.span
          aria-hidden
          className="absolute top-1/2 h-6 w-6 rounded-full"
          style={{
            x: thumbX,
            y: "-50%",
            boxShadow: thumbShadow,
            background: on
              ? "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85))"
              : "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.5))",
          }}
        >
          <span
            className="absolute inset-[2px] rounded-full"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.5), transparent 60%)" }}
          />
        </motion.span>
      </motion.button>
    </motion.div>
  );
}
