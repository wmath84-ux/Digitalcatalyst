import { useExitGuard } from "./ExitGuardContext";
import { BankIcon, ChartIcon, DashboardIcon, HomeIcon, TargetIcon, UserIcon } from "./icons";
import SiteFooterNav from "../../components/SiteFooterNav";
import { type GlassDockItem } from "../../components/glass-dock/GlassDock";

// The revision footer mirrors the main app footer
// (src/components/BottomNav.tsx) exactly: same glass dock magnification,
// plain-tap Home (the long-press → FlowPath shortcut is gone). Only the tab set differs —
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

  const items: GlassDockItem[] = TABS.map((tab) => {
    const active =
      tab.href === "#/revision/bank"
        ? route.startsWith("#/revision/bank") || route.startsWith("#/revision/session")
        : tab.match(route);
    return {
      id: tab.href,
      label: tab.label,
      icon: tab.icon,
      color: tab.color,
      active,
    };
  });

  // The shared site footer capsule (src/components/SiteFooterNav.tsx) — the
  // same design and material as Home / Store / My Day. This nav used to be
  // hidden from 768 px up, which left Revision without any footer on a tablet
  // in portrait; the text tab row (src/components/ui/PageTabs.tsx) stays the
  // desktop nav and steps aside in the 768–959 px portrait band where this
  // capsule is now visible, so the two never stack.
  return (
    <SiteFooterNav
      label="Bottom navigation"
      items={items}
      onSelect={(href) => {
        navigate(href);
      }}
    />
  );
}
