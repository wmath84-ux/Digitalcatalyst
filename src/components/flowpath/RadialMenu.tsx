import { createPortal } from "react-dom";
import { GlassSurface } from "../ui/glass";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export interface RadialItem {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

interface RadialMenuProps {
  anchor: DOMRect | null;
  items: RadialItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function RadialMenu({ anchor, items, onClose, onSelect }: RadialMenuProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {anchor && items.length > 0 && (
        <motion.div
          className="fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/55" />
          <MenuItems anchor={anchor} items={items} onSelect={onSelect} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function MenuItems({
  anchor,
  items,
  onSelect,
}: {
  anchor: DOMRect;
  items: RadialItem[];
  onSelect: (id: string) => void;
}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const anchorX = anchor.left + anchor.width / 2;
  const anchorY = anchor.top + anchor.height / 2;
  const openUp = anchorY > vh * 0.6;
  const isNarrow = vw < 420;
  const radius = isNarrow ? 92 : vw < 640 ? 108 : 132;
  const centerAngle = openUp ? -90 : 90; // deg, screen coords (y grows down)
  const spread = items.length > 6 ? 160 : 148;
  const n = items.length;

  return (
    <>
      {items.map((item, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const angleDeg = centerAngle - spread / 2 + spread * t;
        const angle = (angleDeg * Math.PI) / 180;
        let x = anchorX + radius * Math.cos(angle);
        let y = anchorY + radius * Math.sin(angle);
        x = Math.min(Math.max(x, 40), vw - 40);
        y = Math.min(Math.max(y, 40), vh - 40);
        const Icon = item.icon;

        return (
          <motion.button
            key={item.id}
            type="button"
            initial={{ opacity: 0, scale: 0.3, left: anchorX, top: anchorY }}
            animate={{ opacity: 1, scale: 1, left: x, top: y }}
            exit={{ opacity: 0, scale: 0.3, left: anchorX, top: anchorY }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: i * 0.035 }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item.id);
            }}
            className="fixed z-[75] -translate-x-1/2 -translate-y-1/2 rounded-2xl text-fp-text"
          >
          {/* Wave 13c: each radial item is the pack GlassSurface — no
              `.glass-panel-strong` plate, no coloured glow shadow. */}
          <GlassSurface radius={16} contentClassName="flex flex-col items-center gap-1 px-2.5 py-2">
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
