import {
  Bell,
  CalendarClock,
  ClipboardList,
  Home,
  LayoutGrid,
  NotebookPen,
} from "lucide-react";
import { cn } from "../../utils/cn";
import BrandMark from "../BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";
import { GlassSurface } from "../ui/glass";

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
  const { logoUrl, appName } = useBranding();
  const custom = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  return (
    <aside className="sticky top-[65px] hidden h-fit w-60 shrink-0 md:block md:w-56 lg:w-60 xl:w-64">
      <GlassSurface
        radius={24}
        className="text-white"
        contentClassName="flex flex-col gap-1 p-4 md:p-3"
      >
        <div className="mb-5 flex items-center gap-2.5 px-1">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-indigo-600 text-white">
            {custom ? (
              <BrandMark className="h-10 w-10" />
            ) : (
              <LayoutGrid className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="text-sm font-extrabold tracking-tight text-white">{`${appName} Tasker`}</p>
            <p className="text-[11px] font-medium text-white/55">
              My Day Dashboard
            </p>
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
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </GlassSurface>
    </aside>
  );
}
