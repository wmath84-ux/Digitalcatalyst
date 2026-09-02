// Taga Toggle — AI Canvas design (https://aicanvas.me/components/taga-toggle),
// re-housed in the app's liquid-glass material.
//
// A playful pill toggle with an expressive face drawn on the thumb:
// dead (×× eyes, flat mouth) when off, happy (arc eyes, big smile) when on.
// The face transitions are Motion-driven so the morph reads as one continuous
// gesture. Per the brief, the TRACK here is glass (frosted blur + hairline
// border) instead of the original grey→yellow paint; the thumb slide, the
// eye swap spring and the mouth path morph are kept exactly as shipped.
//
// This variant is presentational (`on` prop) so it can live INSIDE another
// interactive element (e.g. a PopoverTrigger button) without nesting buttons.
"use client";

import { useEffect } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";

const FACE_COLOR = "#4A3F35"; // warm dark, legible on the white thumb

// IMPORTANT: both mouth paths share the same M+Q structure so Framer Motion
// interpolates between them smoothly instead of cross-fading.
const MOUTH_FLAT = "M -0.40,0.43 Q 0,0.43 0.40,0.43";
const MOUTH_SMILE = "M -0.40,0.15 Q 0,0.50 0.40,0.15";

const eyeSpring = { duration: 0.16, ease: [0.34, 1.56, 0.64, 1] as const };

export function TagaToggle({ on, width = 60, className }: { on: boolean; width?: number; className?: string }) {
  // Derived dimensions (AI Canvas taga-toggle ratios).
  const TRACK_W = width;
  const TRACK_H = Math.round(width * 0.58);
  const THUMB = Math.round(width * 0.5);
  const PAD = Math.max(3, Math.round(width * 0.04));
  const OFF_X = PAD;
  const ON_X = TRACK_W - THUMB - PAD;
  const FACE_SIZE = THUMB * 0.78;
  const THUMB_TOP = (TRACK_H - THUMB) / 2;

  const thumbX = useMotionValue(on ? ON_X : OFF_X);

  // Glass track: transparent frosted glass when off, warm honey tint when on —
  // driven off the thumb position so the colour rides the same spring.
  const trackTint = useTransform(
    thumbX,
    [OFF_X, ON_X],
    ["rgba(255,255,255,0.08)", "rgba(245,197,24,0.34)"],
  );

  useEffect(() => {
    const controls = animate(thumbX, on ? ON_X : OFF_X, {
      type: "spring",
      stiffness: 500,
      damping: 36,
    });
    return () => controls.stop();
  }, [on, thumbX, ON_X, OFF_X]);

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      className={className}
      style={{ display: "inline-block" }}
    >
      <motion.span
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          backgroundColor: trackTint,
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow:
            "inset 0 1px 4px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10)",
          backdropFilter: "blur(16px) saturate(1.6)",
          WebkitBackdropFilter: "blur(16px) saturate(1.6)",
          position: "relative",
          display: "block",
          cursor: "pointer",
        }}
      >
        {/* Thumb with the face */}
        <motion.span
          style={{
            position: "absolute",
            top: THUMB_TOP,
            x: thumbX,
            width: THUMB,
            height: THUMB,
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 3px 8px rgba(0,0,0,0.50), 0 1px 3px rgba(0,0,0,0.30)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg viewBox="-1 -1 2 2" width={FACE_SIZE} height={FACE_SIZE} aria-hidden>
            {/* Left eye */}
            <AnimatePresence mode="wait" initial={false}>
              {on ? (
                <motion.path
                  key="l-happy"
                  d="M -0.50,-0.28 Q -0.32,-0.06 -0.14,-0.28"
                  stroke={FACE_COLOR}
                  strokeWidth={0.13}
                  strokeLinecap="round"
                  fill="none"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={eyeSpring}
                />
              ) : (
                <motion.g
                  key="l-dead"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={eyeSpring}
                >
                  <line x1="-0.50" y1="-0.33" x2="-0.14" y2="-0.01" stroke={FACE_COLOR} strokeWidth={0.13} strokeLinecap="round" />
                  <line x1="-0.14" y1="-0.33" x2="-0.50" y2="-0.01" stroke={FACE_COLOR} strokeWidth={0.13} strokeLinecap="round" />
                </motion.g>
              )}
            </AnimatePresence>
            {/* Right eye */}
            <AnimatePresence mode="wait" initial={false}>
              {on ? (
                <motion.path
                  key="r-happy"
                  d="M 0.14,-0.28 Q 0.32,-0.06 0.50,-0.28"
                  stroke={FACE_COLOR}
                  strokeWidth={0.13}
                  strokeLinecap="round"
                  fill="none"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={eyeSpring}
                />
              ) : (
                <motion.g
                  key="r-dead"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={eyeSpring}
                >
                  <line x1="0.14" y1="-0.33" x2="0.50" y2="-0.01" stroke={FACE_COLOR} strokeWidth={0.13} strokeLinecap="round" />
                  <line x1="0.50" y1="-0.33" x2="0.14" y2="-0.01" stroke={FACE_COLOR} strokeWidth={0.13} strokeLinecap="round" />
                </motion.g>
              )}
            </AnimatePresence>
            {/* Mouth: flat ↔ smile path morph */}
            <motion.path
              animate={{ d: on ? MOUTH_SMILE : MOUTH_FLAT }}
              stroke={FACE_COLOR}
              strokeWidth={0.13}
              strokeLinecap="round"
              fill="none"
              transition={{ duration: 0.28, ease: "easeInOut" }}
            />
          </svg>
        </motion.span>
      </motion.span>
    </motion.span>
  );
}
