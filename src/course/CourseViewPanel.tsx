// src/course/CourseViewPanel.tsx
//
// THE COURSE VIEW PAGE — the owner's brief (2026-10-16): the deck's own two
// settings on one page, reachable from the settings gear in the Course Player
// AND — same design, same store — from Work mode's own view button.
//
//   · ZOOM — smaller / larger. Every format scales by the same percentage
//     (zoom har format mein carry karta hai) and, past 100 %, the deck pans so
//     no corner is ever out of reach. With `prefers-reduced-motion` the scale
//     simply jumps.
//   · the four DIVIDER switches — the two halves of the vertical divider and
//     the two halves of the horizontal one, each on its own. All four on is the
//     old four-divider look; switching one off hides that piece of the line
//     (and its dot) but never the drag, so the boundary always stays resizable.
//
// The page was lifted OUT of `PlayerPanel.tsx` unchanged (same markup, same
// classes, same data-* hooks) so the Course Player and Work mode cannot drift
// apart: one component, one store (`courseViewSettings.ts`), one design. Work
// renders it inside `[data-work-view-settings]`, the player inside its settings
// list.

import { GlassPrefToggle } from "../components/ui/glass-pref-toggle";
import {
  COURSE_DIVIDER_SEGMENTS,
  COURSE_DIVIDER_SEGMENT_LABEL,
  COURSE_VIEW_ZOOM_MAX,
  COURSE_VIEW_ZOOM_MIN,
  COURSE_VIEW_ZOOM_STEP,
  clampCourseViewZoom,
  courseDividersComplete,
  setCourseDividerVisible,
  setCourseViewZoom,
  useCourseViewSettings,
} from "./courseViewSettings";

export interface CourseViewPanelProps {
  /** True from 768px up — the deck (and its zoom) owns the view there. */
  quadWide: boolean;
}

export default function CourseViewPanel({ quadWide }: CourseViewPanelProps) {
  const courseView = useCourseViewSettings();

  return (
    <div className="px-2 pb-2 pt-1" data-course-view-page data-course-view-mode={quadWide ? "quad" : "split"}>
      <p className="px-4 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]">
        Course view
      </p>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3" data-course-view-zoom>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-[var(--course-text)]">Zoom</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/5 text-[13px] font-black text-[var(--course-text)] disabled:opacity-40"
              data-course-view-zoom-out
              aria-label="Zoom out the course view"
              disabled={courseView.zoom <= COURSE_VIEW_ZOOM_MIN}
              onClick={() => setCourseViewZoom(clampCourseViewZoom(courseView.zoom - COURSE_VIEW_ZOOM_STEP))}
            >
              −
            </button>
            <span
              className="min-w-[42px] text-center text-[11px] font-black tabular-nums text-[var(--course-text)]"
              data-course-view-zoom-value
              data-zoom={courseView.zoom}
            >
              {courseView.zoom}%
            </span>
            <button
              type="button"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/5 text-[13px] font-black text-[var(--course-text)] disabled:opacity-40"
              data-course-view-zoom-in
              aria-label="Zoom in the course view"
              disabled={courseView.zoom >= COURSE_VIEW_ZOOM_MAX}
              onClick={() => setCourseViewZoom(clampCourseViewZoom(courseView.zoom + COURSE_VIEW_ZOOM_STEP))}
            >
              +
            </button>
          </div>
        </div>
        <p className="pt-2 text-[10px] font-semibold text-[var(--course-muted)]">
          Har format mein same zoom — scale hota hai aur zarurat pade to pan bhi.
        </p>
      </div>

      <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3" data-course-view-dividers>
        <p className="pb-1 text-[11px] font-black uppercase tracking-wide text-[var(--course-muted)]">Dividers</p>
        {COURSE_DIVIDER_SEGMENTS.map((segment) => (
          // The app's OWN switch (GlassPrefToggle) — never a native form
          // control, which this codebase keeps out of every learner page.
          <div key={segment} data-course-view-divider-row={segment}>
            <GlassPrefToggle
              label={COURSE_DIVIDER_SEGMENT_LABEL[segment]}
              on={courseView.dividers[segment]}
              onChange={(next) => setCourseDividerVisible(segment, next)}
              color="#6366f1"
              delay={0.04}
              divider
              dataAttrs={{ "data-course-view-divider": segment }}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[10px] font-semibold text-[var(--course-muted)]">
            {courseDividersComplete(courseView.dividers) ? "Charon divider on — purana look." : "Kuch divider chhupe hue hain."}
          </span>
          <button
            type="button"
            className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-black text-[var(--course-text)]"
            data-course-view-dividers-all
            onClick={() => COURSE_DIVIDER_SEGMENTS.forEach((segment) => setCourseDividerVisible(segment, true))}
          >
            All four on
          </button>
        </div>
      </div>
    </div>
  );
}
