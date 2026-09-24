import { Library } from "lucide-react";
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon } from "./icons";
import SiteFooterNav from "./SiteFooterNav";
import { type GlassDockIcon, type GlassDockItem } from "./glass-dock/GlassDock";

export type TabKey = "home" | "myday" | "store" | "purchases" | "profile" | "revision" | "flowpath" | "study-library" | "sanctuary";

type BottomNavProps = {
  active: TabKey | null;
  onChange: (tab: TabKey) => void;
  storeBadge?: number;
  purchasesBadge?: number;
  /** Home-only mobile shortcut placed immediately after FlowPath. */
  showSanctuary?: boolean;
};

/**
 * The sanctuary artwork is deliberately a PNG-backed icon rather than a
 * generic tree glyph: it preserves the friendly dinosaur supplied for this
 * destination while still participating in GlassDock's sizing and spring.
 */
const SanctuaryDinosaurIcon: GlassDockIcon = ({ className, style, size = 22 }) => (
  <img
    aria-hidden="true"
    alt=""
    draggable={false}
    src="/icons/sanctuary-dinosaur.png"
    className={className}
    style={{ ...style, width: size, height: size, objectFit: "contain" }}
  />
);

const TABS: { key: TabKey; label: string; icon: GlassDockItem["icon"]; color: string }[] = [
  { key: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B" },
  { key: "myday", label: "My Day", icon: CalendarIcon, color: "#06D6A0" },
  { key: "store", label: "Store", icon: StoreIcon, color: "#FF7B54" },
  { key: "purchases", label: "Purchases", icon: BagIcon, color: "#C9A96E" },
  // Owner (post Wave 14): Revision sits where FlowPath used to be and
  // FlowPath is the last (right-most) slot of the dock.
  { key: "study-library", label: "My Study Library", icon: Library, color: "#06D6A0" },
  { key: "revision", label: "Revision", icon: SparkBookIcon, color: "#3A86FF" },
  { key: "flowpath", label: "FlowPath", icon: FlowPathIcon, color: "#B388FF" },
];

/**
 * The app footer — the SAME floating glass-dock capsule every other screen
 * wears (src/components/SiteFooterNav.tsx): it hugs its icons, nearby icons
 * magnify and lift as the pointer/finger moves across, and the label floats
 * above the active tab.
 *
 * It used to render a different footer from the rest of the app: a
 * `data-primary-library-nav` hook in src/index.css stretched this dock into a
 * full-width bar with a permanent label under all seven tabs and froze the
 * magnification wave. The owner's 2026-09-16 brief made My Day's capsule the
 * one design, so that hook is gone and the seven tabs now fit the capsule by
 * tightening the rhythm only (`[data-dock-count="7"]` rules in index.css) —
 * tap targets stay 44 px, 38 px below 350 px.
 *
 * The Home button is a plain tap target: the former 1-second long-press →
 * FlowPath shortcut (hold ring, pulse dot, liquid-expand overlay) was removed
 * on the owner's direction — FlowPath is reached from its own dock slot.
 * The previous white-pill markup is stored at
 * src/components/glass-dock/stored/BottomNav.original.txt.
 */
export default function BottomNav({
  active,
  onChange,
  storeBadge,
  purchasesBadge,
  showSanctuary = false,
}: BottomNavProps) {
  const tabs = showSanctuary
    ? [
        ...TABS,
        {
          key: "sanctuary" as const,
          label: "3D Sanctuary",
          icon: SanctuaryDinosaurIcon,
          color: "#34D399",
        },
      ]
    : TABS;

  const items: GlassDockItem[] = tabs.map(({ key, label, icon, color }) => {
    // P3-15: BottomNav badge — purchases uses same emerald ring as profile, keep 99+ cap
    const badge = key === "store" ? storeBadge : key === "purchases" ? purchasesBadge : undefined;
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
      label="Primary"
      items={items}
      onSelect={(id) => {
        const key = id as TabKey;
        if (key === "study-library") window.location.hash = "#/study-library";
        else if (key === "flowpath") window.location.hash = "#/flowpath";
        else if (key === "revision") window.location.hash = "#/revision";
        else if (key === "sanctuary") window.location.hash = "#/nature-studio";
        else onChange(key);
      }}
    />
  );
}
