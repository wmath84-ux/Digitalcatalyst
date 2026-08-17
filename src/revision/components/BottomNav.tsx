import { useExitGuard } from "./ExitGuardContext";
import { BankIcon, ChartIcon, HomeIcon, TargetIcon, UserIcon } from "./icons";

// The revision footer now mirrors the website's own footer (src/components/BottomNav.tsx)
// pixel-for-pixel: same container padding, same icon pill (h-9 w-14), same icon size
// (h-5 w-5), same label size/weight, same active state. Only the tab set differs —
// Home stays, and Bank / Weak Spots / Progress / Profile fill the other slots.
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
              className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
                active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span
                className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                  active ? "bg-indigo-100" : ""
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
