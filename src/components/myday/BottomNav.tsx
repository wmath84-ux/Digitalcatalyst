import { Bell, CalendarClock, ClipboardList, Home, LayoutGrid, NotebookPen } from "lucide-react";
import { cn } from "../../utils/cn";
import { useHomeHold } from "../../hooks/useHomeHold";
import { HoldRing } from "../ui/HoldRing";

interface BottomNavProps {
  active: string;
  onNavigate: (id: string) => void;
}

const items = [
  { id: "home", label: "Home", icon: Home },
  { id: "overview", label: "Day", icon: LayoutGrid },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "reminders", label: "Remind", icon: Bell },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

/**
 * Same floating magic pill footer as the main app footer
 * (src/components/BottomNav.tsx): capsule rounding on all four sides,
 * light-black border, bottom-right shadow, and the outside-only blue
 * scroll glow. Icons/labels are crisp black; the active tab keeps its
 * blue accent exactly as it was.
 *
 * The Home button shares the main footer's 3-second long-press shortcut:
 * holding it opens the FlowPath / task-planning dashboard.
 */
export default function BottomNav({ active, onNavigate }: BottomNavProps) {
  const homeHold = useHomeHold(() => {
    window.location.hash = "#/flowpath";
  });

  return (
    <nav
      className="pointer-events-none sticky bottom-0 z-30 w-full px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 md:hidden"
      aria-label="My day"
    >
      <div className="dc-footer-shell pointer-events-auto mx-auto w-full max-w-md">
        <div className="dc-footer-glow" aria-hidden="true" />
        <div
          data-site-footer
          className="dc-footer-pill flex items-stretch justify-between px-1 py-0.5"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            const isHome = item.id === "home";
            return (
              <button
                key={item.id}
                type="button"
                {...(isHome ? homeHold.handlers : undefined)}
                onClick={() => {
                  if (isHome && homeHold.consumeSuppressedClick()) return;
                  onNavigate(item.id);
                }}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-1.5 text-[11px] font-semibold transition select-none",
                  isActive ? "text-indigo-600" : "text-black hover:opacity-70",
                  isHome && homeHold.holding ? "[touch-action:none]" : "",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-9 w-14 items-center justify-center rounded-full transition",
                    isActive ? "bg-indigo-100" : "",
                    isHome && homeHold.holding ? "scale-110" : "",
                  )}
                >
                  {isHome && homeHold.holding && <HoldRing holding={homeHold.holding} />}
                  <Icon className="h-5 w-5 text-black" />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
