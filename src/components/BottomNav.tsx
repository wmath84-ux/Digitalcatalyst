import { useCallback, useRef, useState } from "react";
import { BagIcon, CalendarIcon, HomeIcon, SparkBookIcon, StoreIcon, UserIcon } from "./icons";

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

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon }[] = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "myday", label: "My Day", icon: CalendarIcon },
  { key: "store", label: "Store", icon: StoreIcon },
  { key: "purchases", label: "Purchases", icon: BagIcon },
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "revision", label: "Revision", icon: SparkBookIcon },
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
 * The app footer — the floating magic pill shown on the home page and
 * everywhere else. Capsule rounded on all four sides, light-black border,
 * bottom-right shadow, and a blue glow that lives OUTSIDE the pill and
 * swells with the page's scroll energy (see .dc-footer-pill /
 * .dc-footer-glow in src/index.css). Icons and labels are crisp black;
 * the active tab keeps its blue accent exactly as it was.
 *
 * The Home button supports a 1-second long-press to open FlowPath:
 *  - A circular SVG ring animates around the button during the hold
 *  - On completing the hold, a liquid expand effect fills the screen
 *  - Then navigates to the FlowPath dashboard
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
        className="pointer-events-none sticky bottom-0 z-30 w-full px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1"
        aria-label="Primary"
      >
        <div className="dc-footer-shell pointer-events-auto">
          <div className="dc-footer-glow" aria-hidden="true" />
          <div
            data-site-footer
            className="dc-footer-pill flex items-stretch justify-between px-1 py-0.5"
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const isActive = active === key;
              const badge = key === "store" ? storeBadge : key === "purchases" ? purchasesBadge : undefined;
              const isHome = key === "home";

              return (
                <button
                  ref={isHome ? homeBtnRef : undefined}
                  key={key}
                  type="button"
                  onPointerDown={isHome ? () => startHold() : undefined}
                  onPointerUp={isHome ? endHold : undefined}
                  onPointerLeave={isHome ? endHold : undefined}
                  onPointerCancel={isHome ? endHold : undefined}
                  onContextMenu={isHome ? (e) => e.preventDefault() : undefined}
                  onClick={() => {
                    if (isHome && suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (key === "revision") window.location.hash = "#/revision";
                    else onChange(key);
                  }}
                  className={`relative flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-1.5 text-[11px] font-semibold transition select-none ${
                    isActive ? "text-indigo-600" : "text-black hover:opacity-70"
                  } ${isHome && holding ? "[touch-action:none]" : ""}`}
                >
                  <span
                    className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                      isActive ? "bg-indigo-100" : ""
                    } ${isHome && holding ? "scale-110" : ""}`}
                    style={{
                      transition: "transform 0.2s ease",
                    }}
                  >
                    {/* Circular hold progress ring - only for Home button.
                        Centered on the icon pill: absolutely positioned at
                        (50%, 50%) of the pill and shifted back by half its own
                        size, so the ring hugs the button instead of dropping
                        below it. */}
                    {isHome && (
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
                        {/* Background ring track */}
                        <circle
                          cx="20"
                          cy="20"
                          r={RING_R}
                          fill="none"
                          stroke="rgba(99, 102, 241, 0.15)"
                          strokeWidth="2.5"
                        />
                        {/* Animated progress ring */}
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
                    )}

                    <Icon className="h-5 w-5 text-black" />
                    {!!badge && badge > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                        {badge}
                      </span>
                    )}
                  </span>
                  {label}

                  {/* Pulsing glow dot indicator that Home button has hold feature */}
                  {isHome && !holding && (
                    <span
                      className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-indigo-500"
                      style={{
                        animation: "fp-pulse-ring 2.6s ease-out infinite",
                        boxShadow: "0 0 6px 2px rgba(99, 102, 241, 0.6)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
