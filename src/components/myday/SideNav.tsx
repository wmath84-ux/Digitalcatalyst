import {
  Bell,
  CalendarClock,
  ClipboardList,
  Crosshair,
  LayoutGrid,
  NotebookPen,
  Quote,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { GlassSurface } from "../ui/glass";
import MyDayCalendar from "./MyDayCalendar";
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
];

/**
 * The My Day secondary panel, redesigned to the approved Tasks reference: the
 * "My Day" identity at the top, the six section buttons (every one of them
 * still a real `onNavigate` call — no dead decoration), the live month
 * calendar and the quote of the day, stacked in exactly the reference's
 * order. The pinned `dc-scene-plate` shell stays — this file restyles the
 * INTERIOR only, so the shared material and the legibility floor are intact.
 */
export default function SideNav({ active, onNavigate }: SideNavProps) {
  const quote = quoteOfTheDay();
  return (
    <aside className="sticky top-[65px] hidden h-fit w-60 shrink-0 md:block md:w-56 lg:w-60 xl:w-64">
      <GlassSurface
        radius={24}
        className="dc-scene-plate text-white"
        contentClassName="flex max-h-[calc(100dvh-100px)] flex-col gap-1 overflow-y-auto custom-scrollbar p-4 md:p-3.5"
      >
        {/* Panel identity */}
        <div className="mb-3 px-1 pt-0.5">
          <p className="text-[17px] font-black tracking-tight text-white">My Day</p>
          <p className="mt-0.5 text-[11.5px] font-medium leading-snug text-white/55">
            Plan, track and achieve your goals ✨
          </p>
        </div>

        <nav className="flex flex-col gap-1.5" aria-label="My Day sections">
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
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {isActive && (
                  <span className="myday-snav-dot" aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <MyDayCalendar className="mt-4" />

        <figure className="myday-quote-card mt-4">
          <Quote className="h-5 w-5 text-violet-100/80" aria-hidden="true" />
          <blockquote className="relative z-[1] mt-2 text-[0.86rem] font-bold leading-snug text-white">
            {quote.text}
          </blockquote>
          <figcaption className="relative z-[1] mt-2 text-[11px] font-semibold text-violet-100/75">
            — Learnbook
          </figcaption>
        </figure>
      </GlassSurface>
    </aside>
  );
}

/** Tiny inline check glyph for the selected row — the reference marks the
 *  active entry with a filled check square; drawn inline so no extra icon
 *  import is needed for a 10px decoration. */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
