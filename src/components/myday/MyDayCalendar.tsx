import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MyDayCalendarProps {
  className?: string;
}

interface DayCell {
  day: number;
  /** True when the cell belongs to the month currently on screen. */
  current: boolean;
  /** True for the real today inside the visible month. */
  today: boolean;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * The month calendar that lives under the My Day section list, exactly where
 * the reference panel places it. It is a real control, not a printed image:
 * ‹ / › move through months and "Today" jumps back to the live month — the
 * current day carries the violet ring so the learner always knows where they
 * are standing. Tasks themselves are "today" scoped by the app (the data model
 * has no per-day dates), so the calendar is a calendar — never a fake task
 * filter.
 */
export default function MyDayCalendar({ className }: MyDayCalendarProps) {
  const [offset, setOffset] = useState(0);
  const now = useMemo(() => new Date(), []);
  const view = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + offset, 1),
    [now, offset],
  );

  const monthLabel = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells = useMemo<DayCell[]>(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const isCurrentMonth = offset === 0;

    const out: DayCell[] = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      out.push({ day: daysInPrev - firstWeekday + 1 + i, current: false, today: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push({ day, current: true, today: isCurrentMonth && day === now.getDate() });
    }
    let next = 1;
    while (out.length % 7 !== 0 || out.length < 35) {
      out.push({ day: next, current: false, today: false });
      next += 1;
    }
    return out;
  }, [view, offset, now]);

  return (
    <div className={className}>
      <div className="myday-cal">
        <div className="myday-cal-head">
          <p className="myday-cal-title">{monthLabel}</p>
          <div className="myday-cal-nav">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setOffset((o) => o - 1)}
              className="myday-cal-btn"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setOffset((o) => o + 1)}
              className="myday-cal-btn"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="myday-cal-grid" role="grid" aria-label={`${monthLabel} calendar`}>
          {WEEKDAYS.map((w) => (
            <span key={w} className="myday-cal-wd" aria-hidden="true">
              {w}
            </span>
          ))}
          {cells.map((cell, idx) => (
            <span
              key={`${cell.day}-${idx}`}
              className={
                cell.today
                  ? "myday-cal-day myday-cal-day--today"
                  : cell.current
                    ? "myday-cal-day"
                    : "myday-cal-day myday-cal-day--edge"
              }
              title={cell.today ? "Today" : undefined}
            >
              {cell.day}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOffset(0)}
          className="myday-cal-today"
          aria-label="Jump to the current month"
        >
          Today
        </button>
      </div>
    </div>
  );
}
