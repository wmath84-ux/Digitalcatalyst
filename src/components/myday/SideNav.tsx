import {
  Bell,
  CalendarClock,
  ClipboardList,
  Home,
  LayoutGrid,
  NotebookPen,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { GlassButton } from "../ui/glass-button";
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
      {/* Legibility (the same pass as Home, Store and the product page):
          `dc-scene-plate` is the ONE shared material in src/glass.css — a dark
          navy backing, a real rim, blur 0 and lifted `/55 · /70` ink — so the
          rail reads at the same contrast as the panels beside it. */}
      <GlassSurface
        radius={24}
        className="dc-scene-plate text-white"
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
              <GlassButton
                key={item.id}
                variant="capsule"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full text-left [&>span>div]:h-auto [&>span>div]:w-full [&>span>div]:rounded-xl [&>span>div]:px-3.5 [&>span>div]:py-2.5 [&>span>div]:text-sm [&>span>div]:font-semibold [&>span>div>span]:w-full",
                  isActive ? "text-indigo-300 [&>span>div>span]:text-indigo-300" : "text-white/70",
                )}
              >
                <span className="flex w-full items-center gap-3">
                  <Icon className="h-[18px] w-[18px]" />
                  {item.label}
                </span>
              </GlassButton>
            );
          })}
        </nav>
      </GlassSurface>
    </aside>
  );
}
