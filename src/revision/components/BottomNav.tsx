import { useExitGuard } from "./ExitGuardContext";
import { BankIcon, ChartIcon, DashboardIcon, HomeIcon, TargetIcon, UserIcon } from "./icons";
import { useHomeHold } from "../../hooks/useHomeHold";
import { HoldRing } from "../../components/ui/HoldRing";

// The revision footer mirrors the main app footer
// (src/components/BottomNav.tsx) exactly: same floating magic pill
// (capsule rounding on all four sides, light-black border, bottom-right
// shadow, outside-only blue scroll glow), same icon pill (h-9 w-14),
// same icon size (h-5 w-5), same icon stroke width (2px), same label
// size/weight. Only the tab set differs — Home stays, and Dashboard /
// Bank / Weak Spots / Progress / Profile fill the other slots.
// Dashboard sits right next to Home and points at the revision
// dashboard (#/revision), which is the feature's own landing screen.
// Note: these local icons are drawn at strokeWidth 1.8 by default, so
// the footer explicitly overrides the stroke to 2px to match the
// store/home footer's contrast.
const TABS = [
  { href: "#/home", label: "Home", icon: HomeIcon, match: (p: string) => p === "#/home" },
  {
    href: "#/revision",
    label: "Dashboard",
    icon: DashboardIcon,
    match: (p: string) => p === "#/revision" || p === "#/revision/" || p.startsWith("#/revision/dashboard"),
  },
  { href: "#/revision/bank", label: "Bank", icon: BankIcon, match: (p: string) => p.startsWith("#/revision/bank") },
  { href: "#/revision/weak-topics", label: "Weak", icon: TargetIcon, match: (p: string) => p.startsWith("#/revision/weak-topics") },
  { href: "#/revision/progress", label: "Progress", icon: ChartIcon, match: (p: string) => p.startsWith("#/revision/progress") },
  { href: "#/revision/profile", label: "Profile", icon: UserIcon, match: (p: string) => p.startsWith("#/revision/profile") },
];

export default function BottomNav({ route }: { route: string }) {
  const { navigate } = useExitGuard();
  const homeHold = useHomeHold(() => {
    window.location.hash = "#/flowpath";
  });

  return (
    <nav
      className="pointer-events-none sticky bottom-0 z-30 w-full px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1"
      aria-label="Bottom navigation"
    >
      <div className="dc-footer-shell pointer-events-auto">
        <div className="dc-footer-glow" aria-hidden="true" />
        <div
          data-site-footer
          className="dc-footer-pill flex items-stretch justify-between px-1 py-0.5"
        >
          {TABS.map((tab) => {
            const active =
              tab.href === "#/revision/bank"
                ? route.startsWith("#/revision/bank") || route.startsWith("#/revision/session")
                : tab.match(route);
            const Icon = tab.icon;
            const isHome = tab.href === "#/home";
            return (
              <button
                key={tab.href}
                type="button"
                {...(isHome ? homeHold.handlers : undefined)}
                onClick={() => {
                  if (isHome && homeHold.consumeSuppressedClick()) return;
                  navigate(tab.href);
                }}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-1 rounded-full px-0.5 py-1.5 text-[10px] font-semibold transition select-none ${
                  active ? "text-indigo-600" : "text-black hover:opacity-70"
                } ${isHome && homeHold.holding ? "[touch-action:none]" : ""}`}
              >
                <span
                  className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                    active ? "bg-indigo-100" : ""
                  } ${isHome && homeHold.holding ? "scale-110" : ""}`}
                >
                  {isHome && homeHold.holding && <HoldRing holding={homeHold.holding} />}
                  <Icon className="h-5 w-5 [stroke-width:2px] text-black" />
                </span>
                <span className="w-full truncate leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
