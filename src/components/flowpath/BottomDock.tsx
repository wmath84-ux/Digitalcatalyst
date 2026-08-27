import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  House,
  Landmark,
  LayoutDashboard,
  Plus,
  StickyNote,
  Sunrise,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "../../flowpath/types/flowpath";
import { ACTIVITY_TYPE_META } from "../../flowpath/types/flowpath";
import { ACTIVITY_ICONS } from "./icons";
import { RadialMenu, type RadialItem } from "./RadialMenu";

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

  const homeRef = useRef<HTMLButtonElement>(null);
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

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="glass-panel-strong pointer-events-auto flex items-center gap-1 rounded-full p-1.5 sm:gap-1.5 sm:p-2"
          style={{
            boxShadow:
              "0 0 0 1px var(--fp-border) inset, 0 0 40px -6px rgba(139,123,255,0.45), 0 25px 60px -20px rgba(0,0,0,0.9)",
          }}
        >
          {/* Home — single tap navigates straight to the home page. The
              long-press radial menu was removed in favour of a simpler
              one-tap interaction (the home radial now lives in the
              user-triggered FlowPath "open" affordance, not the dock). */}
          <button
            ref={homeRef}
            type="button"
            aria-label="Go to Home Page"
            onClick={() => {
              if (onNavigateToHome) onNavigateToHome();
            }}
            className="grid h-10 w-10 shrink-0 select-none place-items-center rounded-full border border-fp-border bg-fp-surface text-fp-muted transition hover:bg-fp-surface-hover hover:text-fp-text sm:h-11 sm:w-11"
          >
            <House className="h-[18px] w-[18px]" />
          </button>

          <DockButton
            buttonRef={mydayRef}
            icon={Sunrise}
            label="MyDay"
            onClick={() => openMenu(mydayRef, MYDAY_ITEMS, "MyDay")}
          />

          {/* Create — primary */}
          <motion.button
            ref={createRef}
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => openMenu(createRef, createItems, "Create")}
            className="relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white sm:gap-2 sm:px-6 sm:py-3"
            style={{ boxShadow: "0 10px 30px -10px rgba(139,123,255,0.85)" }}
          >
            <span className="fp-shimmer pointer-events-none absolute inset-0" />
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            <span className="font-display hidden tracking-wide min-[380px]:inline">CREATE</span>
          </motion.button>

          <DockButton
            buttonRef={revisionRef}
            icon={BookOpen}
            label="Revision"
            onClick={() => openMenu(revisionRef, REVISION_ITEMS, "Revision")}
          />

          {onPlanLectures ? (
            <DockButton
              buttonRef={lectureRef}
              icon={Sunrise}
              label="Lectures"
              onClick={onPlanLectures}
            />
          ) : null}
        </motion.div>
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

function DockButton({
  buttonRef,
  icon: Icon,
  label,
  onClick,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-fp-border bg-fp-surface px-3 py-2.5 text-fp-muted transition-colors hover:bg-fp-surface-hover hover:text-fp-text sm:gap-2 sm:px-4 sm:py-3"
    >
      <Icon className="h-4 w-4" />
      <span className="text-xs font-semibold tracking-wide min-[430px]:inline">{label}</span>
    </motion.button>
  );
}
