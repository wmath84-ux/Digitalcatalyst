import { Library } from "lucide-react";
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon } from "./icons";
import SiteFooterNav from "./SiteFooterNav";
import { type GlassDockItem } from "./glass-dock/GlassDock";

export type TabKey = "home" | "myday" | "store" | "purchases" | "profile" | "revision" | "flowpath" | "study-library";

type BottomNavProps = {
  active: TabKey | null;
  onChange: (tab: TabKey) => void;
  storeBadge?: number;
  purchasesBadge?: number;
  /** Course-player peek reveal/drag on the home icons (Home + My Day). */
  peek?: boolean;
};

const TABS: { key: TabKey; label: string; icon: GlassDockItem["icon"]; color: string }[] = [
  // Home sits directly beside Purchases, as requested.
  { key: "myday", label: "My Day", icon: CalendarIcon, color: "#06D6A0" },
  { key: "store", label: "Store", icon: StoreIcon, color: "#FF7B54" },
  { key: "purchases", label: "Purchases", icon: BagIcon, color: "#C9A96E" },
  { key: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B" },
  { key: "study-library", label: "My Study Library", icon: Library, color: "#06D6A0" },
  { key: "revision", label: "Revision", icon: SparkBookIcon, color: "#3A86FF" },
  { key: "flowpath", label: "FlowPath", icon: FlowPathIcon, color: "#B388FF" },
];

/**
 * The app footer — the same floating glass-dock capsule every other screen
 * wears. It hugs its icons, magnifies and lifts nearby tabs under the
 * pointer/finger, and floats the active label above the dock.
 */
export default function BottomNav({ active, onChange, storeBadge, purchasesBadge, peek = false }: BottomNavProps) {
  const items: GlassDockItem[] = TABS.map(({ key, label, icon, color }) => {
    const badge = key === "store" ? storeBadge : key === "purchases" ? purchasesBadge : undefined;
    return { id: key, label, icon, color, active: active === key, badge };
  });

  return (
    <SiteFooterNav
      label="Primary"
      peek={peek}
      items={items}
      onSelect={(id) => {
        const key = id as TabKey;
        if (key === "study-library") window.location.hash = "#/study-library";
        else if (key === "flowpath") window.location.hash = "#/flowpath";
        else if (key === "revision") window.location.hash = "#/revision";
        else onChange(key);
      }}
    />
  );
}
