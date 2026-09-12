import { useRef, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CheckSquare,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  Landmark,
  Palette,
  Plus,
  Settings,
  Sparkles,
  StickyNote,
  Sunrise,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { ActivityType } from "../../flowpath/types/flowpath";
import { RadialMenu, type RadialItem } from "./RadialMenu";
import { FanMenu } from "./FanMenu";
import { CreateMenuPanel, type CreateMenuSection } from "./CreateMenuPanel";
import GlassDock, { type GlassDockItem } from "../glass-dock/GlassDock";
import { CalendarIcon, HomeIcon, SparkBookIcon } from "../icons";

/**
 * Map a dock item to the real app route it should open. "Create" opens the
 * sectioned action panel; the Home / MyDay / Revision items jump straight to
 * their pages.
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

/**
 * The Create button's dropdown — the creation actions each surface REALLY
 * offers, grouped into three sections. Every entry reuses an existing
 * route/handler (no new action system):
 *   · My Day   → the same ?section= routes the My Day fan uses, which open
 *                the page's own create hubs (task / schedule / reminder / note).
 *   · Revision → the AI test generator (#/revision/ai-generate), the Flow
 *                test activity (existing CreateModal, date-time + question
 *                config = scheduling a test) and the bulk importer
 *                (#/revision/bulk-import, whose page button is "Create test").
 *   · Courses  → Schedule Lecture — the same 3-step LecturePicker wizard the
 *                old dedicated dock button opened.
 */
const CREATE_SECTIONS: CreateMenuSection[] = [
  {
    title: "My Day",
    items: [
      { id: "day-task", label: "Today Task", icon: CheckSquare, color: "#8b7bff" },
      { id: "day-schedule", label: "Daily Schedule", icon: CalendarClock, color: "#2dd4bf" },
      { id: "day-reminder", label: "Reminder", icon: BellRing, color: "#f5b969" },
      { id: "day-note", label: "Quick Note", icon: StickyNote, color: "#c084fc" },
    ],
  },
  {
    title: "Revision",
    items: [
      { id: "rev-create-test", label: "Create Test", icon: Sparkles, color: "#60a5fa" },
      { id: "rev-schedule-test", label: "Schedule Test", icon: CalendarPlus, color: "#34d399" },
      { id: "rev-import-test", label: "Import Test", icon: FileUp, color: "#f5b969" },
    ],
  },
  {
    title: "Courses",
    items: [
      { id: "course-schedule-lecture", label: "Schedule Lecture", icon: GraduationCap, color: "#22d3ee" },
    ],
  },
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

/**
 * Which expansion surface a dock trigger owns. One state = one open surface:
 * opening My Day closes Revision, opening Create closes both fans, and the
 * fans never stack with the Create panel.
 *   · fan    — My Day / Revision: the vertical curved fan (FanMenu)
 *   · panel  — Create: the sectioned dropdown (CreateMenuPanel)
 *   · radial — Settings: the original radial (Flow Curve)
 */
type MenuKind = "fan" | "panel" | "radial";

interface MenuState {
  kind: MenuKind;
  group: string;
  items: RadialItem[];
  sections: CreateMenuSection[];
  rect: DOMRect;
}

interface BottomDockProps {
  onCreateType: (type: ActivityType) => void;
  /** Opens the FlowPath lecture planner (3-step course + module + schedule
   *  wizard). Previously a dedicated dock button; the action now lives in
   *  Create → Courses → "Schedule Lecture" (owner brief: the footer keeps
   *  one Create entry point). */
  onPlanLectures?: () => void;
  onStub: (group: string, label: string) => void;
  onNavigateToHome?: () => void;
  /** Settings gear — the controls of the old fixed FLOWPATH title bar.
   *  Tapping the gear opens a radial; Flow Curve opens the same
   *  CurveSettingsModal overlay it always did. (The light/dark item is gone
   *  with the app-wide light theme — FlowPath is dark only.) */
  onOpenCurve?: () => void;
}

export function BottomDock({
  onCreateType,
  onPlanLectures,
  onStub,
  onNavigateToHome,
  onOpenCurve,
}: BottomDockProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const mydayRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const revisionRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  const settingsItems: RadialItem[] = [
    { id: "set-curve", label: "Flow Curve", icon: Palette, color: "#c084fc" },
  ];

  /**
   * Open one surface, or close it when the same trigger is tapped again.
   * The single `menu` state makes the surfaces mutually exclusive: opening
   * My Day closes Revision/Create and vice versa.
   */
  function toggleMenu(
    kind: MenuKind,
    group: string,
    ref: React.RefObject<HTMLButtonElement | null>,
    items: RadialItem[] = [],
    sections: CreateMenuSection[] = [],
  ) {
    setMenu((current) => {
      if (current && current.group === group) return null;
      if (!ref.current) return null;
      return { kind, group, items, sections, rect: ref.current.getBoundingClientRect() };
    });
  }

  /** A Create-panel selection → the EXISTING route/handler it maps to. */
  function handleCreateAction(id: string) {
    setMenu(null);
    // My Day creation actions share the fan's routes (?section= deep links).
    if (id === "day-task" || id === "day-schedule" || id === "day-reminder" || id === "day-note") {
      const route = ROUTE_FOR_ITEM[id];
      if (route) {
        window.location.hash = route;
      }
      return;
    }
    if (id === "rev-create-test") {
      // The Revision dashboard's own create-test action (AI generator).
      window.location.hash = "#/revision/ai-generate";
      return;
    }
    if (id === "rev-schedule-test") {
      // The existing Flow test activity: the CreateModal carries the
      // date-time + question config, i.e. scheduling a test on the flow.
      onCreateType("mcq");
      return;
    }
    if (id === "rev-import-test") {
      // The bulk importer's "Create test" flow.
      window.location.hash = "#/revision/bulk-import";
      return;
    }
    if (id === "course-schedule-lecture") {
      // The same lecture planner the old dedicated dock button opened.
      if (onPlanLectures) onPlanLectures();
      return;
    }
  }

  // Icon-only glass dock — the exact same component the Home page footer
  // uses (GlassDock), so the look (frost / refraction / transparency), the
  // pointer + finger magnify animation and the label tooltips all behave
  // identically. Home navigates; My Day / Revision expand as vertical curved
  // fans; Create is a wide primary button opening the sectioned dropdown;
  // Settings keeps its radial (Flow Curve).
  const items: GlassDockItem[] = [
    { id: "home", label: "Home", icon: HomeIcon, color: "#FFBE0B" },
    { id: "myday", label: "My Day", icon: CalendarIcon, color: "#06D6A0", buttonRef: mydayRef },
    { id: "create", label: "Create", icon: Plus, color: "#8b7bff", wide: true, buttonRef: createRef },
    { id: "revision", label: "Revision", icon: SparkBookIcon, color: "#3A86FF", buttonRef: revisionRef },
    { id: "settings", label: "Settings", icon: Settings, color: "#94a3b8", buttonRef: settingsRef },
  ];

  return (
    <>
      <div data-fp-dock className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
        <div className="pointer-events-auto mx-auto w-max max-w-full">
          <GlassDock
            items={items}
            onSelect={(id) => {
              if (id === "home") {
                if (onNavigateToHome) onNavigateToHome();
                return;
              }
              if (id === "myday") {
                toggleMenu("fan", "MyDay", mydayRef, MYDAY_ITEMS);
                return;
              }
              if (id === "create") {
                toggleMenu("panel", "Create", createRef, [], CREATE_SECTIONS);
                return;
              }
              if (id === "revision") {
                toggleMenu("fan", "Revision", revisionRef, REVISION_ITEMS);
                return;
              }
              if (id === "settings") {
                toggleMenu("radial", "Settings", settingsRef, settingsItems);
              }
            }}
          />
        </div>
      </div>

      {/* One open surface at a time — mutual exclusion is the single `menu`
          state; each surface closes on outside click, Escape, and re-tap. */}
      {(menu?.kind === "fan") && (
        <FanMenu
          anchor={menu.rect}
          items={menu.items}
          onClose={() => setMenu(null)}
          onSelect={(id) => {
            setMenu(null);
            const route = ROUTE_FOR_ITEM[id];
            if (route) {
              // Jump straight to the real page for MyDay / Revision items.
              window.location.hash = route;
              return;
            }
            // Unknown item — fall back to the stub so nothing silently disappears.
            const item = menu.items.find((i) => i.id === id);
            onStub(menu.group, item?.label ?? id);
          }}
        />
      )}

      {menu?.kind === "panel" && (
        <CreateMenuPanel
          anchor={menu.rect}
          sections={menu.sections}
          onClose={() => setMenu(null)}
          onSelect={handleCreateAction}
        />
      )}

      {menu?.kind === "radial" && (
        <RadialMenu
          anchor={menu.rect}
          items={menu.items}
          onClose={() => setMenu(null)}
          onSelect={(id) => {
            setMenu(null);
            // Settings gear options — Flow Curve opens the same
            // CurveSettingsModal overlay it always did.
            if (id === "set-curve") {
              if (onOpenCurve) onOpenCurve();
              return;
            }
            const route = ROUTE_FOR_ITEM[id];
            if (route) {
              window.location.hash = route;
              return;
            }
            const item = menu.items.find((i) => i.id === id);
            onStub(menu.group, item?.label ?? id);
          }}
        />
      )}
    </>
  );
}
