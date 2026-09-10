import {
  Bell,
  CalendarClock,
  ClipboardList,
  Crosshair,
  Home,
  LayoutGrid,
  NotebookPen,
  Quote,
} from "lucide-react";
import { cn } from "../../utils/cn";
import BrandMark from "../BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";
import { useBranding } from "@/context/BrandingContext";
import { GlassSurface } from "../ui/glass";
import { quoteOfTheDay } from "./quotes";

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
  { id: "focus", label: "Focus Mode", icon: Crosshair },
  { id: "home", label: "Home", icon: Home },
];

export default function SideNav({ active, onNavigate }: SideNavProps) {
  const { logoUrl, appName } = useBranding();
  const custom = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  const quote = quoteOfTheDay();
  return (
    <aside className="sticky top-[65px] hidden h-fit w-60 shrink-0 md:block md:w-56 lg:w-60 xl:w-64">
      {/* The pinned `dc-scene-plate` shell stays exactly as the legibility
          contract requires; the nav rows + quote below are the redesign. */}
      <GlassSurface
        radius={24}
        className="dc-scene-plate text-white"
        contentClassName="flex max-h-[calc(100dvh-100px)] flex-col gap-1 overflow-y-auto custom-scrollbar p-4 md:p-3.5"
      >
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 ring-1 ring-white/25">
            {custom ? (
              <BrandMark className="h-10 w-10" />
            ) : (
              <LayoutGrid className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-tight text-white">{`${appName} Tasker`}</p>
            <p className="truncate text-[11px] font-medium text-white/55">
              Stay organized, learn better
            </p>
          </div>
        </div>

        <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
          My Day
        </p>
        <nav className="flex flex-1 flex-col gap-1" aria-label="My Day sections">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "myday-snav-item",
                  isActive && "myday-snav-item--active",
                )}
              >
                <span className="myday-snav-icon">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <figure className="myday-quote-card mt-4">
          <Quote className="h-4 w-4 text-violet-200/70" aria-hidden="true" />
          <blockquote className="relative z-[1] mt-1.5 text-[0.83rem] font-bold leading-snug text-white">
            {quote.text}
          </blockquote>
          <figcaption className="relative z-[1] mt-1.5 text-[11px] font-semibold text-violet-100/75">
            — {quote.author}
          </figcaption>
        </figure>
      </GlassSurface>
    </aside>
  );
}
