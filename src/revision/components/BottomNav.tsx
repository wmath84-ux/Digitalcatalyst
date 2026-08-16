import { useExitGuard } from "./ExitGuardContext";
import { BankIcon, ChartIcon, HomeIcon, TargetIcon, UserIcon } from "./icons";

// The website's own footer keeps only the Home button; every other slot is
// filled by the feature's tabs (Bank / Weak Spots / Progress / Profile) —
// exactly matching the reference design's bottom navigation.
const TABS = [
  { href: "#/home", label: "Home", icon: HomeIcon, match: (p: string) => p === "#/home" },
  { href: "#/revision/bank", label: "Bank", icon: BankIcon, match: (p: string) => p.startsWith("#/revision/bank") },
  { href: "#/revision/weak-topics", label: "Weak Spots", icon: TargetIcon, match: (p: string) => p.startsWith("#/revision/weak-topics") },
  { href: "#/revision/progress", label: "Progress", icon: ChartIcon, match: (p: string) => p.startsWith("#/revision/progress") },
  { href: "#/revision/profile", label: "Profile", icon: UserIcon, match: (p: string) => p.startsWith("#/revision/profile") },
];

export default function BottomNav({ route }: { route: string }) {
  const { navigate } = useExitGuard();

  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-5">
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
              className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors active:bg-slate-50"
            >
              <Icon className={`h-[22px] w-[22px] ${active ? "text-indigo-600" : "text-slate-400"}`} />
              <span className={active ? "text-indigo-600" : "text-slate-500"}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
