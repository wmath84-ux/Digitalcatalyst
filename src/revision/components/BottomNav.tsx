import { useExitGuard } from "./ExitGuardContext";
import { BankIcon, ChartIcon, DashboardIcon, HomeIcon, TargetIcon, UserIcon } from "./icons";
import { useHomeHold } from "../../hooks/useHomeHold";
import { HoldRing } from "../../components/ui/HoldRing";
import GlassDock, { type GlassDockItem } from "../../components/glass-dock/GlassDock";

// The revision footer mirrors the main app footer
// (src/components/BottomNav.tsx) exactly: same glass dock magnification,
// same Home 1-second long-press to FlowPath. Only the tab set differs —
// Home stays, and Dashboard / Bank / Weak Spots / Progress / Profile fill
// the other slots. Dashboard sits right next to Home and points at the
// revision dashboard (#/revision), which is the feature's own landing screen.
// The previous white-pill markup is stored at
// src/components/glass-dock/stored/RevisionBottomNav.original.txt.
const TABS = [
  { href: "#/home", label: "Home", icon: HomeIcon, match: (p: string) => p === "#/home", color: "#FFBE0B" },
  {
    href: "#/revision",
    label: "Dashboard",
    icon: DashboardIcon,
    match: (p: string) => p === "#/revision" || p === "#/revision/" || p.startsWith("#/revision/dashboard"),
    color: "#3A86FF",
  },
  { href: "#/revision/bank", label: "Bank", icon: BankIcon, match: (p: string) => p.startsWith("#/revision/bank"), color: "#C9A96E" },
  { href: "#/revision/weak-topics", label: "Weak", icon: TargetIcon, match: (p: string) => p.startsWith("#/revision/weak-topics"), color: "#FF5C8A" },
  { href: "#/revision/progress", label: "Progress", icon: ChartIcon, match: (p: string) => p.startsWith("#/revision/progress"), color: "#06D6A0" },
  { href: "#/revision/profile", label: "Profile", icon: UserIcon, match: (p: string) => p.startsWith("#/revision/profile"), color: "#B388FF" },
];

export default function BottomNav({ route }: { route: string }) {
  const { navigate } = useExitGuard();
  const homeHold = useHomeHold(() => {
    window.location.hash = "#/flowpath";
  });

  const items: GlassDockItem[] = TABS.map((tab) => {
    const active =
      tab.href === "#/revision/bank"
        ? route.startsWith("#/revision/bank") || route.startsWith("#/revision/session")
        : tab.match(route);
    const isHome = tab.href === "#/home";
    return {
      id: tab.href,
      label: tab.label,
      icon: tab.icon,
      color: tab.color,
      active,
      buttonProps: isHome
        ? {
            ...homeHold.handlers,
            className: homeHold.holding ? "[touch-action:none]" : "",
          }
        : undefined,
      extra: isHome && homeHold.holding ? <HoldRing holding={homeHold.holding} durationMs={homeHold.durationMs} /> : undefined,
    };
  });

  return (
    // `md:hidden` — same rule as the My Day footer: from 768 px up (tablet +
    // desktop) the floating phone pill is the wrong chrome, and the pages are
    // reached from the text-only tab row under the header instead
    // (src/components/ui/PageTabs.tsx). Below 768 px nothing changes.
    <nav
      data-site-footer-nav
      className="pointer-events-none sticky bottom-0 z-30 w-full px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 md:hidden"
      aria-label="Bottom navigation"
    >
      <div data-site-footer className="pointer-events-auto">
        <GlassDock
          siteFooter
          items={items}
          onSelect={(href) => {
            if (href === "#/home" && homeHold.consumeSuppressedClick()) return;
            navigate(href);
          }}
        />
      </div>
    </nav>
  );
}
