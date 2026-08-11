import { BagIcon, CalendarIcon, HomeIcon, StoreIcon, WalletIcon } from "./icons";

export type TabKey = "home" | "myday" | "store" | "purchases" | "wallet";

type BottomNavProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  storeBadge?: number;
  purchasesBadge?: number;
};

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon }[] = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "myday", label: "My Day", icon: CalendarIcon },
  { key: "store", label: "Store", icon: StoreIcon },
  { key: "purchases", label: "Purchases", icon: BagIcon },
  { key: "wallet", label: "Wallet", icon: WalletIcon },
];

export default function BottomNav({ active, onChange, storeBadge, purchasesBadge }: BottomNavProps) {
  return (
    <nav className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur">
      <div className="flex items-stretch justify-between">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          const badge = key === "store" ? storeBadge : key === "purchases" ? purchasesBadge : undefined;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
                isActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span
                className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                  isActive ? "bg-indigo-100" : ""
                }`}
              >
                <Icon className="h-5 w-5" />
                {!!badge && badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
