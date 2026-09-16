import { Heart, Home, ShoppingBag } from "lucide-react";
import { TabKey } from "../types";
import SiteFooterNav from "../../components/SiteFooterNav";
import { type GlassDockItem } from "../../components/glass-dock/GlassDock";

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  favoritesCount: number;
  cartCount: number;
}

/**
 * Cart / Favourites wear the shared site footer capsule
 * (src/components/SiteFooterNav.tsx) — the same design, gutters, safe-area
 * padding and frost material as Home, Store and My Day. Only the three tabs
 * and their badges are local.
 *
 * The Home / Discover button is a plain tap (the old long-press → FlowPath
 * shortcut was removed on the owner's direction).
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

  const dockItems: GlassDockItem[] = [
    { key: "home" as TabKey, label: "Discover", icon: Home, color: "#FFBE0B", badge: undefined as number | undefined },
    { key: "favorites" as TabKey, label: "Favorites", icon: Heart, color: "#FF5C8A", badge: favoritesCount },
    { key: "cart" as TabKey, label: "Cart", icon: ShoppingBag, color: "#C9A96E", badge: cartCount },
  ].map(({ key, label, icon, color, badge }) => {
    return {
      id: key,
      label,
      icon,
      color,
      active: active === key,
      badge,
    };
  });

  return (
    <SiteFooterNav
      label="Cart and wishlist"
      items={dockItems}
      onSelect={(id) => {
        onChange(id as TabKey);
      }}
    />
  );
}
