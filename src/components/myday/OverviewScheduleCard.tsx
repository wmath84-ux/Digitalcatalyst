import { useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Coffee,
  GraduationCap,
  PenSquare,
  Plus,
  User,
  type LucideIcon,
} from "lucide-react";
import type { EventType, ScheduleEvent } from "../../types";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import { cn } from "../../utils/cn";
import { GlassSurface } from "../ui/glass";

interface OverviewScheduleCardProps {
  events: ScheduleEvent[];
  onAdd: () => void;
  onEdit: (event: ScheduleEvent) => void;
  onSeeAll: () => void;
}

const PREVIEW_COUNT = 3;

const typeMeta: Record<EventType, { icon: LucideIcon; tile: string }> = {
  class: { icon: GraduationCap, tile: "bg-indigo-500/20 text-indigo-200 ring-1 ring-inset ring-indigo-400/30" },
  study: { icon: BookOpen, tile: "bg-violet-500/20 text-violet-200 ring-1 ring-inset ring-violet-400/30" },
  break: { icon: Coffee, tile: "bg-amber-500/20 text-amber-200 ring-1 ring-inset ring-amber-400/30" },
  personal: { icon: User, tile: "bg-emerald-500/20 text-emerald-200 ring-1 ring-inset ring-emerald-400/30" },
  exam: { icon: PenSquare, tile: "bg-rose-500/20 text-rose-200 ring-1 ring-inset ring-rose-400/30" },
};

/**
 * The overview's "Upcoming Schedule" card. Shows the next real events (tap
 * one to edit it through the existing schedule flow) or the polished empty
 * state that opens the existing event creation.
 */
export default function OverviewScheduleCard({ events, onAdd, onEdit, onSeeAll }: OverviewScheduleCardProps) {
  const upcoming = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return [...events]
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
      .filter((e) => toMinutes(e.endTime) > nowMin)
      .slice(0, PREVIEW_COUNT);
  }, [events]);

  return (
    <GlassSurface
      radius={24}
      className="dc-scene-plate h-full text-white"
      contentClassName="myday-card-pad flex h-full flex-col"
    >
      <div className="myday-section-head mb-3">
        <h2 className="myday-section-title flex items-center gap-2">
          <CalendarClock className="h-[18px] w-[18px] text-sky-300" aria-hidden="true" />
          Upcoming Schedule
        </h2>
        <button type="button" className="myday-see-all" onClick={onSeeAll} aria-label="See full schedule">
          See all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {upcoming.length === 0 ? (
        <div className="myday-empty myday-empty--blue flex-1 justify-center">
          <span className="myday-empty-icon">
            <CalendarClock className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="myday-empty-title">Nothing scheduled</p>
          <p className="myday-empty-sub">Plan your study sessions and stay consistent!</p>
          <button type="button" className="myday-cta myday-cta--blue mt-2" onClick={onAdd}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add to schedule
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {upcoming.map((event) => {
            const meta = typeMeta[event.type];
            const Icon = meta.icon;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onEdit(event)}
                aria-label={`Edit event: ${event.title}`}
                className="myday-mini-row w-full text-left"
              >
                <span className={cn("myday-mini-tile", meta.tile)}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white/90">{event.title}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-white/55">
                    {formatTime12(event.startTime)} – {formatTime12(event.endTime)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60 ring-1 ring-inset ring-white/10">
                  {event.type}
                </span>
              </button>
            );
          })}
          {events.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={onSeeAll}
              className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-xs font-bold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            >
              View full schedule
            </button>
          )}
        </div>
      )}
    </GlassSurface>
  );
}
