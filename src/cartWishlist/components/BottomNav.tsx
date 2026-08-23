import { ReactNode } from "react";
import { Heart, Home, ShoppingBag } from "lucide-react";
import { TabKey } from "../types";
import { useBranding } from "../../context/BrandingContext";

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  favoritesCount: number;
  cartCount: number;
}

export default function BottomNav({
  active,
  onChange,
  favoritesCount,
  cartCount,
}: BottomNavProps) {
  const items: { key: TabKey; label: string; icon: ReactNode; badge?: number }[] = [
    { key: "home", label: "Discover", icon: <Home className="h-5 w-5" strokeWidth={2.2} /> },
    {
      key: "favorites",
      label: "Favorites",
      icon: <Heart className="h-5 w-5" strokeWidth={2.2} />,
      badge: favoritesCount,
    },
    {
      key: "cart",
      label: "Cart",
      icon: <ShoppingBag className="h-5 w-5" strokeWidth={2.2} />,
      badge: cartCount,
    },
  ];

  const { hideFrameBorders } = useBranding();

  return (
    <nav
      data-site-footer
      className={`sticky bottom-0 z-30 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur ${
        hideFrameBorders ? "" : "border-t border-slate-200"
      }`}
    >
      <div className="flex items-stretch justify-between">
        {items.map(({ key, label, icon, badge }) => {
          const isActive = active === key;
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
    </nav>
  );
}
