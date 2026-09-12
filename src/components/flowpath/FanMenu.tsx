// src/components/flowpath/FanMenu.tsx
//
// The My Day / Revision expansion: the same glass chips the RadialMenu
// renders (GlassSurface · icon tile · label — identical size, shape,
// typography and colours), laid out as a macOS-style VERTICAL FAN instead
// of a straight top-to-bottom stack:
//
//   · chips open bottom → top, the first one starting right at the dock
//     trigger (the anchor rect's top edge is the origin);
//   · adjacent chips keep a fixed ~0.5rem gap, so chips never overlap;
//   · every step upward adds a small horizontal drift that eases in
//     (quadratic), so the stack reads as one subtle smooth curve — never
//     a perfectly straight vertical line, never an exaggerated arc;
//   · the drift bends toward the screen centre so the fan can never clip
//     a phone's screen edge;
//   · opening staggers bottom → top with a short spring; closing plays the
//     exact reverse (top chip returns first) along the same curved path;
//   · everything is portalled to <body> at a fixed z-index above the dock,
//     so no ancestor overflow can clip it on desktop or mobile.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { GlassSurface } from "../ui/glass";
import type { RadialItem } from "./RadialMenu";

/** Chip geometry — mirrors the RadialMenu chip's exact content box. */
export const FAN_CHIP_HEIGHT = 64;
export const FAN_CHIP_MIN_WIDTH = 76;
/** The ~0.5 spacing between adjacent chips (0.5rem = 8px). */
const CHIP_GAP = 8;
/** Total horizontal drift of the stack — deliberately subtle. */
const CURVE_DRIFT = 26;
/** Pixels above the trigger where the fan's origin sits. */
const ORIGIN_LIFT = 10;
/** Per-chip open stagger — small on purpose, the fan must feel fast. */
const OPEN_STAGGER = 0.03;
/** Close stagger runs in reverse (top chip first). */
const CLOSE_STAGGER = 0.022;

export interface FanMenuProps {
  anchor: DOMRect | null;
  items: RadialItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function FanMenu({ anchor, items, onClose, onSelect }: FanMenuProps) {
  // Escape closes — the fans are the dock's primary action surfaces.
  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {anchor && items.length > 0 && (
        <motion.div
          /* Keyed by the group's items so switching fans (My Day → Revision)
             plays a proper exit+enter instead of swapping chips in place. */
          key={`fan-${items.map((item) => item.id).join("-")}`}
          className="fixed inset-0 z-[70] touch-none"
          variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
          initial="closed"
          animate="open"
          exit="closed"
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/55" />
          <FanChips anchor={anchor} items={items} onSelect={onSelect} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** One chip's pose. `origin` is where it grows from (the dock trigger). */
interface ChipPose {
  index: number;
  count: number;
  x: number; // centre x of the resting position
  y: number; // centre y of the resting position
  originX: number;
  originY: number;
}

const chipVariants = {
  open: (pose: ChipPose) => ({
    opacity: 1,
    scale: 1,
    left: pose.x,
    top: pose.y,
    transition: { type: "spring" as const, stiffness: 380, damping: 26, delay: pose.index * OPEN_STAGGER },
  }),
  // Closing is the exact reverse path: back into the trigger, top chip first.
  closed: (pose: ChipPose) => ({
    opacity: 0,
    scale: 0.4,
    left: pose.originX,
    top: pose.originY,
    transition: {
      duration: 0.16,
      ease: "easeIn" as const,
      delay: (pose.count - 1 - pose.index) * CLOSE_STAGGER,
    },
  }),
};

function FanChips({
  anchor,
  items,
  onSelect,
}: {
  anchor: DOMRect;
  items: RadialItem[];
  onSelect: (id: string) => void;
}) {
  const vw = window.innerWidth;
  const n = items.length;
  const anchorX = anchor.left + anchor.width / 2;
  const originX = anchorX;
  const originY = anchor.top - ORIGIN_LIFT - FAN_CHIP_HEIGHT / 2;
  // Bend toward the screen centre so the fan never clips an edge.
  const dir = anchorX <= vw / 2 ? 1 : -1;

  return (
    <>
      {items.map((item, i) => {
        const t = n === 1 ? 0 : i / (n - 1);
        // Quadratic ease-in: the first chip sits right above the trigger and
        // each next one drifts a little further — a subtle natural curve.
        const drift = CURVE_DRIFT * t * t;
        const x = Math.min(
          Math.max(anchorX + dir * drift, FAN_CHIP_MIN_WIDTH / 2 + 8),
          vw - FAN_CHIP_MIN_WIDTH / 2 - 8,
        );
        const top = Math.max(
          anchor.top - ORIGIN_LIFT - FAN_CHIP_HEIGHT - i * (FAN_CHIP_HEIGHT + CHIP_GAP),
          8,
        );
        const y = top + FAN_CHIP_HEIGHT / 2;
        const Icon = item.icon;

        return (
          <motion.button
            key={item.id}
            type="button"
            custom={{ index: i, count: n, x, y, originX, originY } satisfies ChipPose}
            variants={chipVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item.id);
            }}
            className="fixed z-[75] -translate-x-1/2 -translate-y-1/2 rounded-2xl text-fp-text"
            style={{ transformOrigin: "50% 95%" }}
          >
            {/* The exact RadialMenu chip — same GlassSurface, icon tile,
                label size and colours, so the visual identity is unchanged. */}
            <GlassSurface
              radius={16}
              contentClassName="flex h-16 min-w-[76px] flex-col items-center justify-center gap-1 px-2.5 py-2"
            >
              <span
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ background: `${item.color}2a`, color: item.color }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="whitespace-nowrap text-[9.5px] font-medium tracking-wide text-fp-text-85">
                {item.label}
              </span>
            </GlassSurface>
          </motion.button>
        );
      })}
    </>
  );
}
