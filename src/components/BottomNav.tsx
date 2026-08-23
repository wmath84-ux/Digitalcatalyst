import { BagIcon, CalendarIcon, HomeIcon, SparkBookIcon, StoreIcon, UserIcon } from "./icons";

export type TabKey = "home" | "myday" | "store" | "purchases" | "profile" | "revision";

type BottomNavProps = {
  active: TabKey | null;
  onChange: (tab: TabKey) => void;
  storeBadge?: number;
  purchasesBadge?: number;
};

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon }[] = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "myday", label: "My Day", icon: CalendarIcon },
  { key: "store", label: "Store", icon: StoreIcon },
  { key: "purchases", label: "Purchases", icon: BagIcon },
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "revision", label: "Revision", icon: SparkBookIcon },
];

/**
 * The app footer — the floating magic pill shown on the home page and
 * everywhere else. Capsule rounded on all four sides, light-black border,
 * bottom-right shadow, and a blue glow that lives OUTSIDE the pill and
 * swells with the page's scroll energy (see .dc-footer-pill /
 * .dc-footer-glow in src/index.css). Icons and labels are crisp black;
 * the active tab keeps its blue accent exactly as it was.
 */
export default function BottomNav({ active, onChange, storeBadge, purchasesBadge }: BottomNavProps) {
  return (
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
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "revision") window.location.hash = "#/revision";
                  else onChange(key);
                }}
                className={`relative flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-1.5 text-[11px] font-semibold transition ${
                  isActive ? "text-indigo-600" : "text-black hover:opacity-70"
                }`}
              >
                <span
                  className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                    isActive ? "bg-indigo-100" : ""
                  }`}
                >
                  <Icon className="h-5 w-5 text-black" />
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
      </div>
    </nav>
  );
}
