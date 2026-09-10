import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils/cn";

interface MyDayCalendarProps {
  className?: string;
  /**
   * "rail"  — the compact widget the My Day side navigation has always shown.
   * "panel" — the same control, promoted to the Schedule page's big glass
   *           calendar (larger cells, month/year emphasis, selection ring).
   */
  variant?: "rail" | "panel";
  /** Day the page is currently looking at. Omit for the rail's own usage. */
  selectedDate?: Date | null;
  /** When given, every day cell becomes a real button that reports the date. */
  onSelectDate?: (date: Date) => void;
}

interface DayCell {
  day: number;
  /** True when the cell belongs to the month currently on screen. */
  current: boolean;
  /** True for the real today inside the visible month. */
  today: boolean;
  /** True for the day the page is currently showing. */
  selected: boolean;
  /** -1 / 0 / +1 — the month a leading or trailing cell really belongs to. */
  monthDelta: number;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The month calendar that lives under the My Day section list — and, in its
 * `panel` variant, beside the Schedule timeline. It is a real control, not a
 * printed image: ‹ / › move through months, "Today" jumps back to the live
 * month and (when the page passes `onSelectDate`) every day is a button that
 * hands the chosen date back, so the hero and the timeline follow it.
 *
 * Tasks and schedule events are "today" scoped by the app — the persisted
 * `ScheduleEvent` has no date field and this redesign does not add one — so
 * the calendar is a date CONTEXT: it never claims to filter a data set it
 * cannot filter.
 */
export default function MyDayCalendar({
  className,
  variant = "rail",
  selectedDate = null,
  onSelectDate,
}: MyDayCalendarProps) {
  const [offset, setOffset] = useState(0);
  const now = useMemo(() => new Date(), []);
  // With a selection the visible month follows the selected day; without one
  // it follows the live month (exactly the rail's previous behaviour).
  const anchor = selectedDate ?? now;
  const view = useMemo(
    () => new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1),
    [anchor, offset],
  );

  const monthLabel = view.toLocaleDateString("en-US", { month: "long" });
  const yearLabel = String(view.getFullYear());

  const cells = useMemo<DayCell[]>(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const viewingRealMonth = year === now.getFullYear() && month === now.getMonth();

    const out: DayCell[] = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      const day = daysInPrev - firstWeekday + 1 + i;
      out.push({
        day,
        current: false,
        today: false,
        selected: Boolean(
          selectedDate &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month - 1 &&
            selectedDate.getDate() === day,
        ),
        monthDelta: -1,
      });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push({
        day,
        current: true,
        today: viewingRealMonth && day === now.getDate(),
        selected: Boolean(
          selectedDate &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === day,
        ),
        monthDelta: 0,
      });
    }
    let next = 1;
    while (out.length % 7 !== 0 || out.length < 35) {
      out.push({
        day: next,
        current: false,
        today: false,
        selected: Boolean(
          selectedDate &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month + 1 &&
            selectedDate.getDate() === next,
        ),
        monthDelta: 1,
      });
      next += 1;
    }
    return out;
  }, [view, now, selectedDate]);

  const isPanel = variant === "panel";

  return (
    <div className={className}>
      <div className={cn("myday-cal", isPanel && "myday-cal--panel")}>
        <div className="myday-cal-head">
          <p className="myday-cal-title">
            {monthLabel} <span className="myday-cal-year">{yearLabel}</span>
          </p>
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

        <div className="myday-cal-grid" role="grid" aria-label={`${monthLabel} ${yearLabel} calendar`}>
          {WEEKDAYS.map((w) => (
            <span key={w} className="myday-cal-wd" aria-hidden="true">
              {w}
            </span>
          ))}
          {cells.map((cell, idx) => {
            const cls = cn(
              "myday-cal-day",
              !cell.current && "myday-cal-day--edge",
              cell.today && "myday-cal-day--today",
              cell.selected && "myday-cal-day--selected",
            );
            if (!onSelectDate) {
              return (
                <span
                  key={`${cell.day}-${idx}`}
                  className={cls}
                  title={cell.today ? "Today" : undefined}
                >
                  {cell.day}
                </span>
              );
            }
            return (
              <button
                key={`${cell.day}-${idx}`}
                type="button"
                onClick={() => {
                  setOffset(0);
                  onSelectDate(
                    new Date(view.getFullYear(), view.getMonth() + cell.monthDelta, cell.day),
                  );
                }}
                className={cls}
                aria-current={cell.selected ? "date" : undefined}
                aria-label={`${cell.today ? "Today, " : ""}${monthLabel} ${cell.day}, ${yearLabel}`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setOffset(0);
            onSelectDate?.(new Date());
          }}
          className="myday-cal-today"
          aria-label="Jump to the current month"
        >
          Today
        </button>
      </div>
    </div>
  );
}

export { sameDay };
