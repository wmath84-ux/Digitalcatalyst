// Glass Tags — AI Canvas design (https://aicanvas.me/components/glass-tags).
//
// Selectable pill-shaped tags with frosted glass surfaces, unique colour
// accents per tag, and spring-animated check marks that scale in when a tag
// is activated: entrance spring with per-index stagger, hover/tap scale,
// a selection glow, and a 14×14 slot where the idle colour dot swaps for a
// check icon drawn via pathLength.
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

/** The AI Canvas glass-tags accent palette — cycled per tag index. */
export const GLASS_TAG_COLORS = [
  "#FF9A3C",
  "#FFBE0B",
  "#FF6BF5",
  "#FF7B54",
  "#DC5A28",
  "#FFD166",
  "#FF6680",
] as const;

export function glassTagColor(index: number): string {
  return GLASS_TAG_COLORS[index % GLASS_TAG_COLORS.length];
}

interface GlassTagProps {
  label: string;
  color: string;
  selected: boolean;
  /** Index in the visible list — drives the staggered entrance delay. */
  index?: number;
  onClick: () => void;
  title?: string;
}

export function GlassTag({ label, color, selected, index = 0, onClick, title }: GlassTagProps) {
  const [hovered, setHovered] = useState(false);

  const surface = selected
    ? {
        background: `linear-gradient(135deg, ${color}33, ${color}18)`,
        border: `1px solid ${color}55`,
        boxShadow: `0 4px 24px ${color}30, inset 0 1px 0 rgba(255,255,255,0.12)`,
      }
    : hovered
      ? {
          background: "rgba(255,255,255,0.13)",
          border: "1px solid rgba(255,255,255,0.24)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.18)",
        }
      : {
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
        };

  return (
    <motion.button
      type="button"
      title={title ?? label}
      aria-pressed={selected}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ scale: 0.8, y: 12, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, delay: index * 0.04 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
      className="relative isolate cursor-pointer rounded-full px-4 py-2 outline-none sm:px-5 sm:py-2.5"
      style={{
        ...surface,
        transition: "background 0.2s ease, border 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Separate non-animating blur layer */}
      <span
        aria-hidden
        className="absolute inset-0 z-[-1] rounded-full"
        style={{
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        }}
      />
      {/* Selection glow */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        animate={{ opacity: selected ? 0.15 : 0 }}
        transition={{ duration: 0.3 }}
        style={{ background: `radial-gradient(circle at center, ${color}, transparent 70%)` }}
      />

      <span className="relative z-10 flex items-center gap-2">
        {/* Fixed 14×14 slot: colour dot when idle, drawn check when selected */}
        <span className="relative h-3.5 w-3.5 shrink-0">
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: color }}
            animate={{ scale: selected ? 0 : 1, opacity: selected ? 0 : 1 }}
            transition={{ duration: 0.15 }}
          />
          {selected && (
            <motion.svg
              viewBox="0 0 14 14"
              className="absolute inset-0 h-full w-full"
              fill="none"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              aria-hidden
            >
              <motion.path
                d="M3 7.5L5.5 10L11 4"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.25, delay: 0.1 }}
              />
            </motion.svg>
          )}
        </span>
        <span
          className="text-xs font-semibold sm:text-sm"
          style={{
            color: selected
              ? "rgba(255,255,255,0.95)"
              : hovered
                ? "rgba(255,255,255,0.78)"
                : "rgba(255,255,255,0.5)",
            transition: "color 0.2s ease",
          }}
        >
          {label}
        </span>
      </span>
    </motion.button>
  );
}
