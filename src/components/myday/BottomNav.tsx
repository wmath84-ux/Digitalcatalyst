import { Bell, CalendarClock, ClipboardList, Home, LayoutGrid, NotebookPen } from "lucide-react";
import { cn } from "../../utils/cn";
import { useBranding } from "../../context/BrandingContext";

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

export default function BottomNav({ active, onNavigate }: BottomNavProps) {
  const { hideFrameBorders } = useBranding();
  return (
    <nav
      data-site-footer
      className={cn(
        "sticky bottom-0 z-30 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur",
        !hideFrameBorders && "border-t border-slate-200",
      )}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-between">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition",
                isActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600",
              )}
            >
              <span
                className={cn(
                  "relative flex h-9 w-14 items-center justify-center rounded-full transition",
                  isActive ? "bg-indigo-100" : "",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
