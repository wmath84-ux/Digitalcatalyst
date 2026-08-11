import { Bell, CalendarClock, ClipboardList, Coins, LayoutGrid } from "lucide-react";
import { cn } from "../../utils/cn";

interface BottomNavProps {
  active: string;
  onNavigate: (id: string) => void;
}

const items = [
  { id: "overview", label: "Day", icon: LayoutGrid },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "reminders", label: "Remind", icon: Bell },
  { id: "rewards", label: "Coins", icon: Coins },
];

export default function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-1 flex-col items-center gap-0.5 py-1.5 transition-colors"
            >
              <div
                className={cn(
                  "flex h-8 w-10 items-center justify-center rounded-full transition-all duration-200",
                  isActive ? "bg-indigo-100 text-indigo-600 scale-105" : "text-slate-400",
                )}
              >
                <Icon className="h-[20px] w-[20px]" />
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold transition-colors",
                  isActive ? "text-indigo-600" : "text-slate-400",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
