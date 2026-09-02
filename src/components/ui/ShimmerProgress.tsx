'use client'

/**
 * ShimmerProgress — the aicanvas.me "Upload Progress" bar, extracted as a
 * standalone progress strip (https://aicanvas.me/components/upload-progress).
 *
 * A slim rounded track whose fill animates smoothly to the current value and
 * carries a CONTINUOUS white shimmer sweep (a 1.6s left-to-right gradient loop
 * with a 0.8s pause between sweeps). The shimmer runs all the time — the fill
 * itself only grows when the value actually increases (e.g. the learner marks
 * a module complete), which is exactly the Course Player requirement.
 *
 * `paused` freezes the shimmer and flips the fill to amber, mirroring the
 * reference widget's uploading/paused states (used by the audio player).
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

const FILL_ACTIVE = "#6366f1"; // indigo while running
const FILL_PAUSED = "#f59e0b"; // amber on pause

export default function ShimmerProgress({
  value,
  paused = false,
  orientation = "horizontal",
  thickness = 6,
  trackColor = "rgba(255,255,255,0.14)",
  fillColor = FILL_ACTIVE,
  pausedColor = FILL_PAUSED,
  className = "",
  style,
  ...rest
}: {
  /** 0–100. */
  value: number;
  /** Freezes the shimmer + flips the fill to amber. */
  paused?: boolean;
  /** `vertical` fills bottom → top (the landscape rail bar). */
  orientation?: "horizontal" | "vertical";
  /** Bar thickness in px (6 = the reference's collapsed bottom bar). */
  thickness?: number;
  trackColor?: string;
  fillColor?: string;
  pausedColor?: string;
  className?: string;
  style?: CSSProperties;
} & Record<`data-${string}`, string | number | undefined>) {
  const clamped = Math.max(0, Math.min(100, value));
  const vertical = orientation === "vertical";

  return (
    <div
      className={`relative overflow-hidden rounded-full ${className}`}
      style={{
        background: trackColor,
        ...(vertical ? { width: thickness } : { height: thickness }),
        ...style,
      }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      {...rest}
    >
      <motion.div
        className={`absolute overflow-hidden rounded-full ${vertical ? "bottom-0 left-0 right-0" : "bottom-0 left-0 top-0"}`}
        initial={false}
        animate={{
          ...(vertical ? { height: `${clamped}%` } : { width: `${clamped}%` }),
          backgroundColor: paused ? pausedColor : fillColor,
        }}
        transition={{
          height: { type: "spring", stiffness: 120, damping: 26 },
          width: { type: "spring", stiffness: 120, damping: 26 },
          backgroundColor: { duration: 0.35, ease: "easeInOut" },
        }}
        data-shimmer-fill
      >
        {/* The continuous shimmer sweep. It never stops while active — the
            "lagatar chalta" animation — and holds off-screen when paused. */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: vertical
              ? "linear-gradient(to top, transparent, rgba(255,255,255,0.35), transparent)"
              : "linear-gradient(to right, transparent, rgba(255,255,255,0.35), transparent)",
          }}
          animate={
            paused
              ? vertical ? { y: "100%" } : { x: "-100%" }
              : vertical
                ? { y: ["100%", "-100%"] }
                : { x: ["-100%", "100%"] }
          }
          transition={
            paused
              ? { duration: 0.2 }
              : { duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }
          }
        />
      </motion.div>
    </div>
  );
}
