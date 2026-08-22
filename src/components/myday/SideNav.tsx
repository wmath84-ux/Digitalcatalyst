import { Bell, CalendarClock, ClipboardList, Home, LayoutGrid, NotebookPen } from "lucide-react";
import { cn } from "../../utils/cn";
import BrandMark from "../BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";

interface SideNavProps {
  active: string;
  onNavigate: (id: string) => void;
}

const items = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "home", label: "Home", icon: Home },
];

export default function SideNav({ active, onNavigate }: SideNavProps) {
  const { logoUrl } = useBranding();
  const custom = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  return (
    <aside className="sticky top-[65px] hidden h-fit w-60 shrink-0 flex-col gap-1 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:flex xl:w-64">
      <div className="mb-5 flex items-center gap-2.5 px-1">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200">
          {custom ? <BrandMark className="h-10 w-10" /> : <LayoutGrid className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-slate-900">Eduvora Tasker</p>
          <p className="text-[11px] font-medium text-slate-400">My Day Dashboard</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200",
                isActive
                  ? "bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
