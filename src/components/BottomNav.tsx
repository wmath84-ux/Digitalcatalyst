import { useCallback, useRef, useState } from "react";
import { BagIcon, CalendarIcon, HomeIcon, SparkBookIcon, StoreIcon, UserIcon } from "./icons";
import GlassDock, { type GlassDockItem } from "./glass-dock/GlassDock";

export type TabKey = "home" | "myday" | "store" | "purchases" | "profile" | "revision";

type BottomNavProps = {
  active: TabKey | null;
  onChange: (tab: TabKey) => void;
  storeBadge?: number;
  purchasesBadge?: number;
  /**
   * Action fired after a 1-second hold on the Home button. Enabled on every
   * screen that renders this footer — defaults to opening the FlowPath
   * (task-planning) dashboard, but a caller may override it.
   */
  onLongPressHome?: () => void;
};

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon; color: string }[] = [
  { key: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B" },
  { key: "myday", label: "My Day", icon: CalendarIcon, color: "#06D6A0" },
  { key: "store", label: "Store", icon: StoreIcon, color: "#FF7B54" },
  { key: "purchases", label: "Purchases", icon: BagIcon, color: "#C9A96E" },
  { key: "profile", label: "Profile", icon: UserIcon, color: "#B388FF" },
  { key: "revision", label: "Revision", icon: SparkBookIcon, color: "#3A86FF" },
];

const HOLD_DURATION = 1000; // 1 second — shortened from 3s so the Home
// long-press is quicker to trigger on the main app footer.
const RING_R = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// "Task planning" = the FlowPath dashboard. The Home button's long-press is
// enabled on every screen that renders this footer, so a 1-second hold is
// always a shortcut to FlowPath — not just on the home page.
const DEFAULT_LONG_PRESS_HOME = () => {
  window.location.hash = "#/flowpath";
};

/**
 * The app footer — glass dock of labeled icons on tablet and mobile.
 * Nearby icons magnify and lift as the pointer moves across the dock.
 *
 * Logic (tabs, onChange, Home 1s long-press → FlowPath, badges, liquid
 * expand) is unchanged. The previous white-pill markup is stored at
 * src/components/glass-dock/stored/BottomNav.original.txt.
 */
export default function BottomNav({ active, onChange, storeBadge, purchasesBadge, onLongPressHome = DEFAULT_LONG_PRESS_HOME }: BottomNavProps) {
  const [holding, setHolding] = useState(false);
  const [liquidExpand, setLiquidExpand] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const homeBtnRef = useRef<HTMLButtonElement>(null);

  const startHold = useCallback(() => {
    setHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      setHolding(false);
      // Trigger liquid expand effect
      setLiquidExpand(true);
      // Navigate after the expand animation completes
      setTimeout(() => {
        onLongPressHome();
        // Reset state after navigation
        setTimeout(() => setLiquidExpand(false), 100);
      }, 750);
    }, HOLD_DURATION);
  }, [onLongPressHome]);

  const endHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  }, []);

  const items: GlassDockItem[] = TABS.map(({ key, label, icon, color }) => {
    const isHome = key === "home";
    const badge = key === "store" ? storeBadge : key === "purchases" ? purchasesBadge : undefined;
    return {
      id: key,
      label,
      icon,
      color,
      active: active === key,
      badge,
      buttonRef: isHome ? homeBtnRef : undefined,
      buttonProps: isHome
        ? {
            onPointerDown: () => startHold(),
            onPointerUp: endHold,
            onPointerLeave: endHold,
            onPointerCancel: endHold,
            onContextMenu: (event) => event.preventDefault(),
            className: holding ? "[touch-action:none]" : "",
          }
        : undefined,
      extra: isHome ? (
        <>
          <svg
            className="pointer-events-none absolute"
            viewBox="0 0 40 40"
            style={{
              left: "50%",
              top: "50%",
              width: 46,
              height: 46,
              transform: "translate(-50%, -50%) rotate(-90deg)",
            }}
          >
            <circle
              cx="20"
              cy="20"
              r={RING_R}
              fill="none"
              stroke="rgba(99, 102, 241, 0.15)"
              strokeWidth="2.5"
            />
            <circle
              cx="20"
              cy="20"
              r={RING_R}
              fill="none"
              stroke="url(#home-hold-gradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={holding ? 0 : RING_CIRCUMFERENCE}
              style={{
                transition: holding
                  ? `stroke-dashoffset ${HOLD_DURATION}ms linear`
                  : "stroke-dashoffset 0.18s ease",
                filter: holding ? "drop-shadow(0 0 5px rgba(99, 102, 241, 0.9))" : "none",
              }}
            />
            <defs>
              <linearGradient id="home-hold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          {!holding && (
            <span
              className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-indigo-500"
              style={{
                animation: "fp-pulse-ring 2.6s ease-out infinite",
                boxShadow: "0 0 6px 2px rgba(99, 102, 241, 0.6)",
              }}
            />
          )}
        </>
      ) : undefined,
    };
  });

  return (
    <>
      {/* Liquid expand overlay - covers full screen when hold completes */}
      {liquidExpand && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-end justify-center">
          <div
            className="fp-liquid-expand"
            style={{
              position: "fixed",
              left: homeBtnRef.current
                ? homeBtnRef.current.getBoundingClientRect().left + homeBtnRef.current.getBoundingClientRect().width / 2
                : "50%",
              top: homeBtnRef.current
                ? homeBtnRef.current.getBoundingClientRect().top + homeBtnRef.current.getBoundingClientRect().height / 2
                : "90%",
              width: 44,
              height: 44,
              marginLeft: -22,
              marginTop: -22,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
              borderRadius: "50%",
              transformOrigin: "center center",
            }}
          />
        </div>
      )}

      <nav
        data-site-footer-nav
        className="pointer-events-none sticky bottom-0 z-30 h-0 w-full overflow-visible md:px-6"
        aria-label="Primary"
      >
        <div data-site-footer className="pointer-events-auto absolute bottom-[max(env(safe-area-inset-bottom),10px)] left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2">
          <GlassDock
            siteFooter
            items={items}
            onSelect={(id) => {
              const key = id as TabKey;
              if (key === "home" && suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              if (key === "revision") window.location.hash = "#/revision";
              else onChange(key);
            }}
          />
        </div>
      </nav>
    </>
  );
}
