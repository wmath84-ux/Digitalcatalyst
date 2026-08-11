import { ReactNode } from "react";
import { Heart, Home, ShoppingBag } from "lucide-react";
import { TabKey } from "../types";

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
    { key: "home", label: "Discover", icon: <Home size={22} strokeWidth={2.2} /> },
    {
      key: "favorites",
      label: "Favorites",
      icon: <Heart size={22} strokeWidth={2.2} />,
      badge: favoritesCount,
    },
    {
      key: "cart",
      label: "Cart",
      icon: <ShoppingBag size={22} strokeWidth={2.2} />,
      badge: cartCount,
    },
  ];

  return (
    <div className="relative z-30 border-t border-slate-100 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className="relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 transition-all active:scale-90"
            >
              <div
                className={`relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300 ${
                  isActive ? "bg-indigo-50 text-indigo-600" : "text-slate-400"
                }`}
              >
                {item.icon}
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-0.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-semibold transition-colors ${
                  isActive ? "text-indigo-600" : "text-slate-400"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
