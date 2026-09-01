import { useRef, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  GraduationCap,
  LayoutDashboard,
  Landmark,
  Plus,
  StickyNote,
  Sunrise,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { ActivityType } from "../../flowpath/types/flowpath";
import { ACTIVITY_TYPE_META } from "../../flowpath/types/flowpath";
import { ACTIVITY_ICONS } from "./icons";
import { RadialMenu, type RadialItem } from "./RadialMenu";
import GlassDock, { type GlassDockItem } from "../glass-dock/GlassDock";
import { CalendarIcon, HomeIcon, SparkBookIcon } from "../icons";

/**
 * Map a dock radial item to the real app route it should open. "Create" is
 * handled separately (it creates an activity inside FlowPath); the Home /
 * MyDay / Revision items jump straight to their pages.
 */
const ROUTE_FOR_ITEM: Record<string, string> = {
  // Home long-press quick links
  "home-purchase": "#/store/purchases",
  "home-store": "#/store",
  "home-subscription": "#/subscription",
  "home-profile": "#/profile",
  "home-wishlist": "#/favorites",
  "home-cart": "#/cart",
  // MyDay quick sections (MyDay reads ?section= to open that tab)
  day: "#/my-day",
  "day-task": "#/my-day?section=tasks",
  "day-schedule": "#/my-day?section=schedule",
  "day-reminder": "#/my-day?section=reminders",
  "day-note": "#/my-day?section=notes",
  // Revision quick pages
  "rev-dashboard": "#/revision",
  "rev-bank": "#/revision/bank",
  "rev-week": "#/revision/weak-topics",
  "rev-progress": "#/revision/progress",
  "rev-profile": "#/revision/profile",
};

const MYDAY_ITEMS: RadialItem[] = [
  { id: "day", label: "Day", icon: Sunrise, color: "#5eead4" },
  { id: "day-task", label: "Task", icon: CheckSquare, color: "#8b7bff" },
  { id: "day-schedule", label: "Schedule", icon: CalendarClock, color: "#2dd4bf" },
  { id: "day-reminder", label: "Reminder", icon: BellRing, color: "#f5b969" },
  { id: "day-note", label: "Note", icon: StickyNote, color: "#c084fc" },
];

const REVISION_ITEMS: RadialItem[] = [
  { id: "rev-dashboard", label: "Dashboard", icon: LayoutDashboard, color: "#60a5fa" },
  { id: "rev-bank", label: "Bank", icon: Landmark, color: "#34d399" },
  { id: "rev-week", label: "Week", icon: CalendarRange, color: "#22d3ee" },
  { id: "rev-progress", label: "Progress", icon: TrendingUp, color: "#f5b969" },
  { id: "rev-profile", label: "Profile", icon: UserRound, color: "#fb7185" },
];

// The home radial menu (HOME_ITEMS) used to be triggered by a long-press on
// the FlowPath dock's Home button. The dock now does a plain single-tap
// navigate, so this list is kept here for documentation only — it is no
// longer wired to any UI. If/when we want a Home radial menu again, a
// separate affordance (e.g. the header's Plus shortcut or the home page
// footer) should host it instead of the FlowPath dock.
// const HOME_ITEMS: RadialItem[] = [
//   { id: "home-purchase", label: "My Purchase", icon: ShoppingBag, color: "#8b7bff" },
//   { id: "home-store", label: "Store", icon: Store, color: "#5eead4" },
//   { id: "home-subscription", label: "Subscription", icon: CreditCard, color: "#f5b969" },
//   { id: "home-profile", label: "Profile", icon: UserRound, color: "#fb7185" },
//   { id: "home-wishlist", label: "Wishlist", icon: Heart, color: "#f472b6" },
//   { id: "home-cart", label: "Cart", icon: ShoppingCart, color: "#34d399" },
// ];

interface MenuState {
  items: RadialItem[];
  group: string;
  rect: DOMRect;
}

interface BottomDockProps {
  onCreateType: (type: ActivityType) => void;
  /** Optional callback that opens the FlowPath lecture planner
   *  (3-step course + module + schedule wizard). When omitted, the
   *  dock hides the Plan-lectures shortcut. */
  onPlanLectures?: () => void;
  onStub: (group: string, label: string) => void;
  onNavigateToHome?: () => void;
}

export function BottomDock({ onCreateType, onPlanLectures, onStub, onNavigateToHome }: BottomDockProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const mydayRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const revisionRef = useRef<HTMLButtonElement>(null);
  const lectureRef = useRef<HTMLButtonElement>(null);

  const createItems: RadialItem[] = (Object.keys(ACTIVITY_TYPE_META) as ActivityType[]).map(
    (t) => ({
      id: t,
      label: ACTIVITY_TYPE_META[t].label,
      icon: ACTIVITY_ICONS[t],
      color: ACTIVITY_TYPE_META[t].color,
    })
  );

  function openMenu(
    ref: React.RefObject<HTMLButtonElement | null>,
    items: RadialItem[],
    group: string
  ) {
    if (ref.current) {
      setMenu({ items, group, rect: ref.current.getBoundingClientRect() });
    }
  }

  // Icon-only glass dock — the exact same component the Home page footer
  // uses (GlassDock), so the look (frost / refraction / transparency), the
  // pointer + finger magnify animation and the label tooltips all behave
  // identically. Selecting an item either navigates (Home) or opens the
  // same radial menus the old pill dock had (MyDay / Create / Revision).
  const items: GlassDockItem[] = [
    { id: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B" },
    { id: "myday", label: "My Day", icon: CalendarIcon, color: "#06D6A0", buttonRef: mydayRef },
    { id: "create", label: "Create", icon: Plus, color: "#8b7bff", buttonRef: createRef },
    { id: "revision", label: "Revision", icon: SparkBookIcon, color: "#3A86FF", buttonRef: revisionRef },
    ...(onPlanLectures
      ? [{ id: "lectures", label: "Lectures", icon: GraduationCap, color: "#f5b969", buttonRef: lectureRef } as GlassDockItem]
      : []),
  ];

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
        <div className="pointer-events-auto mx-auto w-max max-w-full">
          <GlassDock
            items={items}
            onSelect={(id) => {
              if (id === "home") {
                if (onNavigateToHome) onNavigateToHome();
                return;
              }
              if (id === "myday") {
                openMenu(mydayRef, MYDAY_ITEMS, "MyDay");
                return;
              }
              if (id === "create") {
                openMenu(createRef, createItems, "Create");
                return;
              }
              if (id === "revision") {
                openMenu(revisionRef, REVISION_ITEMS, "Revision");
                return;
              }
              if (id === "lectures" && onPlanLectures) {
                onPlanLectures();
              }
            }}
          />
        </div>
      </div>

      <RadialMenu
        anchor={menu?.rect ?? null}
        items={menu?.items ?? []}
        onClose={() => setMenu(null)}
        onSelect={(id) => {
          const group = menu?.group ?? "";
          setMenu(null);
          if (group === "Create") {
            onCreateType(id as ActivityType);
            return;
          }
          const route = ROUTE_FOR_ITEM[id];
          if (route) {
            // Jump straight to the real page for Home / MyDay / Revision items.
            window.location.hash = route;
            return;
          }
          // Unknown item — fall back to the stub so nothing silently disappears.
          const item = menu?.items.find((i) => i.id === id);
          onStub(group, item?.label ?? id);
        }}
      />
    </>
  );
}
