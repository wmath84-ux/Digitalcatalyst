import { Heart, Home, ShoppingBag } from "lucide-react";
import { TabKey } from "../types";
import { useHomeHold } from "../../hooks/useHomeHold";
import { HoldRing } from "../../components/ui/HoldRing";
import GlassDock, { type GlassDockItem } from "../../components/glass-dock/GlassDock";

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  favoritesCount: number;
  cartCount: number;
}

/**
 * Same glass-dock footer as the main app footer (src/components/BottomNav.tsx):
 * nearby icons magnify and lift as the pointer moves across the dock.
 *
 * The Home / Discover button shares the main footer's 1-second long-press
 * shortcut: holding it opens the FlowPath / task-planning dashboard.
 *
 * The previous white-pill markup is stored at
 * src/components/glass-dock/stored/CartBottomNav.original.txt.
 */
export default function BottomNav({
  active,
  onChange,
  favoritesCount,
  cartCount,
}: BottomNavProps) {
  const homeHold = useHomeHold(() => {
    window.location.hash = "#/flowpath";
  });

  const dockItems: GlassDockItem[] = [
    { key: "home" as TabKey, label: "Discover", icon: Home, color: "#FFBE0B", badge: undefined as number | undefined },
    { key: "favorites" as TabKey, label: "Favorites", icon: Heart, color: "#FF5C8A", badge: favoritesCount },
    { key: "cart" as TabKey, label: "Cart", icon: ShoppingBag, color: "#C9A96E", badge: cartCount },
  ].map(({ key, label, icon, color, badge }) => {
    const isHome = key === "home";
    return {
      id: key,
      label,
      icon,
      color,
      active: active === key,
      badge,
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
    <nav
      data-site-footer-nav
      className="pointer-events-none sticky bottom-0 z-30 h-0 w-full overflow-visible md:px-6"
      aria-label="Cart and wishlist"
    >
      <div data-site-footer className="pointer-events-auto absolute bottom-[max(env(safe-area-inset-bottom),10px)] left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2">
        <GlassDock
          siteFooter
          items={dockItems}
          onSelect={(id) => {
            if (id === "home" && homeHold.consumeSuppressedClick()) return;
            onChange(id as TabKey);
          }}
        />
      </div>
    </nav>
  );
}
