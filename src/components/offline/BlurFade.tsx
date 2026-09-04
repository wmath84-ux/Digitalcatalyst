/**
 * Soft blur-fade reveal.
 *
 * Adapted from Magic UI Blur Fade (MIT) to this project's `framer-motion`
 * dependency (Magic UI's registry imports `motion/react`). EduOS uses it to
 * bring in the offline copy after the energy field fades — not as a gate on
 * first paint: the offline screen itself is already on screen.
 *
 * Source: https://magicui.design/docs/components/blur-fade
 */

"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BlurFadeProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  offset?: number;
  blur?: string;
};

export default function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.55,
  offset = 10,
  blur = "8px",
}: BlurFadeProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: offset, filter: `blur(${blur})` }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
