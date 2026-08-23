import { ReactNode } from "react";
import { Heart, Home, ShoppingBag } from "lucide-react";
import { TabKey } from "../types";

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  favoritesCount: number;
  cartCount: number;
}

/**
 * Same floating magic pill footer as the main app footer
 * (src/components/BottomNav.tsx): capsule rounding on all four sides,
 * light-black border, bottom-right shadow, and the outside-only blue
 * scroll glow. Icons/labels are crisp black; the active tab keeps its
 * blue accent exactly as it was.
 */
export default function BottomNav({
  active,
  onChange,
  favoritesCount,
  cartCount,
}: BottomNavProps) {
  const items: { key: TabKey; label: string; icon: ReactNode; badge?: number }[] = [
    { key: "home", label: "Discover", icon: <Home className="h-5 w-5 strokeWidth={2.2} text-black" /> },
    {
      key: "favorites",
      label: "Favorites",
      icon: <Heart className="h-5 w-5 strokeWidth={2.2} text-black" />,
      badge: favoritesCount,
    },
    {
      key: "cart",
      label: "Cart",
      icon: <ShoppingBag className="h-5 w-5 strokeWidth={2.2} text-black" />,
      badge: cartCount,
    },
  ];

  return (
    <nav
      className="pointer-events-none sticky bottom-0 z-30 w-full px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1"
      aria-label="Cart and wishlist"
    >
      <div className="dc-footer-shell pointer-events-auto">
        <div className="dc-footer-glow" aria-hidden="true" />
        <div
          data-site-footer
          className="dc-footer-pill flex items-stretch justify-between px-1 py-0.5"
        >
          {items.map(({ key, label, icon, badge }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                className={`relative flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-1.5 text-[11px] font-semibold transition ${
                  isActive ? "text-indigo-600" : "text-black hover:opacity-70"
                }`}
              >
                <span
                  className={`relative flex h-9 w-14 items-center justify-center rounded-full transition ${
                    isActive ? "bg-indigo-100" : ""
                  }`}
                >
                  {icon}
                  {!!badge && badge > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
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
