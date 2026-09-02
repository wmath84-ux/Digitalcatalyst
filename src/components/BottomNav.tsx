import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon } from "./icons";
import GlassDock, { type GlassDockItem } from "./glass-dock/GlassDock";

export type TabKey = "home" | "myday" | "store" | "purchases" | "profile" | "revision" | "flowpath";

type BottomNavProps = {
  active: TabKey | null;
  onChange: (tab: TabKey) => void;
  storeBadge?: number;
  purchasesBadge?: number;
};

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon; color: string }[] = [
  { key: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B" },
  { key: "myday", label: "My Day", icon: CalendarIcon, color: "#06D6A0" },
  { key: "store", label: "Store", icon: StoreIcon, color: "#FF7B54" },
  { key: "purchases", label: "Purchases", icon: BagIcon, color: "#C9A96E" },
  // Owner (post Wave 14): Revision sits where FlowPath used to be and
  // FlowPath is the last (right-most) slot of the dock.
  { key: "revision", label: "Revision", icon: SparkBookIcon, color: "#3A86FF" },
  { key: "flowpath", label: "FlowPath", icon: FlowPathIcon, color: "#B388FF" },
];

/**
 * The app footer — glass dock of labeled icons on tablet and mobile.
 * Nearby icons magnify and lift as the pointer moves across the dock.
 *
 * The Home button is a plain tap target: the former 1-second long-press →
 * FlowPath shortcut (hold ring, pulse dot, liquid-expand overlay) was removed
 * on the owner's direction — FlowPath is reached from its own dock slot.
 * The previous white-pill markup is stored at
 * src/components/glass-dock/stored/BottomNav.original.txt.
 */
export default function BottomNav({ active, onChange, storeBadge, purchasesBadge }: BottomNavProps) {
  const items: GlassDockItem[] = TABS.map(({ key, label, icon, color }) => {
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
    <nav
      data-site-footer-nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 w-full overflow-visible px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 md:px-6"
      aria-label="Primary"
    >
      <div data-site-footer className="pointer-events-auto mx-auto w-max max-w-full">
        <GlassDock
          siteFooter
          items={items}
          onSelect={(id) => {
            const key = id as TabKey;
            if (key === "flowpath") window.location.hash = "#/flowpath";
            else if (key === "revision") window.location.hash = "#/revision";
            else onChange(key);
          }}
        />
      </div>
    </nav>
  );
}
