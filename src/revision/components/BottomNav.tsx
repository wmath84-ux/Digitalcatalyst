import { useExitGuard } from "./ExitGuardContext";
import { BankIcon, ChartIcon, DashboardIcon, HomeIcon, TargetIcon, UserIcon } from "./icons";

// The revision footer now mirrors the website's own footer (src/components/BottomNav.tsx)
// pixel-for-pixel: same container padding, same icon pill (h-9 w-14), same icon size
// (h-5 w-5), same icon stroke width (2px), same label size/weight, same active state.
// Only the tab set differs — Home stays, and Dashboard / Bank / Weak Spots / Progress /
// Profile fill the other slots. Dashboard sits right next to Home and points at the
// revision dashboard (#/revision), which is the feature's own landing screen.
// Note: these local icons are drawn at strokeWidth 1.8 by default, so the footer
// explicitly overrides the stroke to 2px to match the store/home footer's contrast.
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

  return (
    <nav
      data-site-footer
      className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur"
      aria-label="Bottom navigation"
    >
      <div className="flex items-stretch justify-between">
        {TABS.map((tab) => {
          const active =
            tab.href === "#/revision/bank"
              ? route.startsWith("#/revision/bank") || route.startsWith("#/revision/session")
              : tab.match(route);
          const Icon = tab.icon;
          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => navigate(tab.href)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[10px] font-semibold transition ${
                active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span
                className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                  active ? "bg-indigo-100" : ""
                }`}
              >
                <Icon className="h-5 w-5 [stroke-width:2px]" />
              </span>
              <span className="w-full truncate leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
