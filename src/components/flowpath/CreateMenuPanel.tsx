// src/components/flowpath/CreateMenuPanel.tsx
//
// The Create button's dropdown — a compact, sectioned action panel that opens
// anchored above the dock's Create button (NOT floating radial chips):
//
//   MY DAY      the My Day page's own creation actions (same four options
//               the My Day overview's Create hub offers — today task, daily
//               schedule, reminder, quick note)
//   REVISION    Create Test · Schedule Test · Import Test (the Revision
//               feature's real creation routes + the Flow test activity)
//   COURSES     Schedule Lecture (the 3-step lecture planner)
//
// Every action reuses an EXISTING handler/route — navigation hashes the same
// routes the dock always used, Schedule Test drives the same CreateModal the
// create flow drives, Schedule Lecture opens the same LecturePicker. The
// panel is a pack GlassSurface wearing the shared scene plate, spring-opens
// from the trigger (transform-origin at the bottom edge), clamps itself to
// the viewport on both axes, closes on outside click and Escape, and can
// never stack twice (the dock owns one menu state).
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { GlassSurface } from "../ui/glass";

export interface CreateMenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

export interface CreateMenuSection {
  title: string;
  items: CreateMenuAction[];
}

export interface CreateMenuPanelProps {
  anchor: DOMRect | null;
  sections: CreateMenuSection[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

const PANEL_WIDTH = 264;
const PANEL_EDGE = 10;

export function CreateMenuPanel({ anchor, sections, onClose, onSelect }: CreateMenuPanelProps) {
  // Escape closes.
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

  const vw = window.innerWidth;
  const anchorX = anchor ? anchor.left + anchor.width / 2 : vw / 2;
  // Centred above the trigger, clamped so the panel never clips either edge.
  const left = Math.min(Math.max(anchorX - PANEL_WIDTH / 2, PANEL_EDGE), vw - PANEL_WIDTH - PANEL_EDGE);
  // `bottom` positions the panel relative to the viewport bottom, i.e. just
  // above the trigger's top edge — robust at every height, keyboard open too.
  const bottom = anchor ? window.innerHeight - anchor.top + 10 : 80;

  return createPortal(
    <AnimatePresence>
      {anchor && sections.length > 0 && (
        <motion.div
          key="create-panel-backdrop"
          className="fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="fixed text-fp-text"
            style={{ left, bottom, width: PANEL_WIDTH, transformOrigin: "50% 100%" }}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            {/* Same floating plate the store's view-mode popover wears
                (`.dc-scene-plate` on a pack GlassSurface): the shared glass
                language, with enough contrast to sit over the scene. */}
            <GlassSurface
              radius={20}
              className="dc-scene-plate"
              contentClassName="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1.5"
            >
              {sections.map((section, sIndex) => (
                <div
                  key={section.title}
                  className={sIndex > 0 ? "mt-1 border-t border-white/10 pt-1.5" : ""}
                >
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                    {section.title}
                  </p>
                  <ul>
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(item.id);
                            }}
                            className="dc-focusable flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.08] active:bg-white/[0.12]"
                          >
                            <span
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                              style={{ background: `${item.color}26`, color: item.color }}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">
                              {item.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </GlassSurface>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
