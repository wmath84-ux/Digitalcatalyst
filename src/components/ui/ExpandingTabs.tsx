'use client'

/**
 * ExpandingTabs — the aicanvas.me "Expanding Tabs" bar, adapted for the app's
 * glass chrome (https://aicanvas.me/components/expanding-tabs).
 *
 * A monochrome tab bar of icon circles: the active item expands into a full
 * icon-and-label pill while the previous one collapses back into a plain
 * icon-only circle. Every icon sits at a fixed left inset so it never needs
 * its own layout animation — that is what keeps the morph smooth however fast
 * the user taps between items.
 *
 * Used everywhere a header renders its action / navigation cluster:
 *   · src/components/Header.tsx        (mobile + tablet app header)
 *   · src/home/components/Header.tsx   (home hero header)
 *   · src/components/DesktopShell.tsx  (desktop top bar)
 *
 * The bar keeps the app's ink (white on the frosted dark chrome) instead of
 * the reference component's page-locked palette, so it reads correctly over
 * every backdrop the headers sit on — in both site schemes.
 */

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface ExpandingTabItem {
  id: string;
  /** Title-case label revealed inside the expanded pill. */
  label: string;
  /** Accessible name — kept verbatim (some names are pinned by tests). */
  ariaLabel?: string;
  icon: ReactNode;
  badge?: string;
  badgeAriaLabel?: string;
  badgeTone?: "indigo" | "rose";
  /** Extra data-* attributes for contract tests / page CSS. */
  dataAttrs?: Record<string, string | undefined>;
}

/** One shared motion spring — the exact transition from the reference. */
const spring = { type: "spring", stiffness: 420, damping: 30, mass: 0.7 } as const;

export default function ExpandingTabs({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className = "",
  itemSize = 40,
}: {
  items: ExpandingTabItem[];
  /** The expanded item. `null` renders every item as an icon circle. */
  activeId: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
  className?: string;
  /** Circle diameter in px (default 40 — the reference size). */
  itemSize?: number;
}) {
  return (
    <motion.div
      layout
      transition={spring}
      role="tablist"
      aria-label={ariaLabel}
      data-expanding-tabs
      className={`flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <motion.button
            key={item.id}
            layout
            transition={spring}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={item.ariaLabel ?? item.label}
            title={item.ariaLabel ?? item.label}
            onClick={() => onSelect(item.id)}
            whileHover={isActive ? undefined : { scale: 1.045 }}
            whileTap={{ scale: 0.94 }}
            {...(item.dataAttrs ?? {})}
            className={`relative flex shrink-0 cursor-pointer items-center justify-start rounded-full pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              isActive
                ? "gap-2 bg-white/90 pr-4 text-slate-900 shadow-[0_7px_18px_rgba(0,0,0,0.34),inset_0_2px_0_rgba(255,255,255,0.98)]"
                : "text-white/85 hover:text-white"
            }`}
            style={{ height: itemSize, width: isActive ? undefined : itemSize }}
            data-expanding-tab={item.id}
            data-active={isActive ? "true" : "false"}
          >
            {/* Fixed-left icon slot — never layout-animated (the morph stays
                smooth because only the button's width changes around it). */}
            <motion.span
              className="grid shrink-0 place-items-center"
              animate={{ scale: isActive ? 1.03 : 1, opacity: isActive ? 1 : 0.8 }}
              transition={spring}
              aria-hidden="true"
            >
              {item.icon}
            </motion.span>
            <AnimatePresence initial={false}>
              {isActive ? (
                <motion.span
                  layout
                  initial={{ opacity: 0, x: -7 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -7 }}
                  transition={spring}
                  className="whitespace-nowrap text-sm font-semibold tracking-[0.01em]"
                >
                  {item.label}
                </motion.span>
              ) : null}
            </AnimatePresence>
            {item.badge ? (
              <span
                aria-label={item.badgeAriaLabel}
                className={`absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-[#0a0c12] ${
                  item.badgeTone === "rose" ? "bg-rose-500" : "bg-indigo-600"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
