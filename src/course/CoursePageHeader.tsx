// src/course/CoursePageHeader.tsx
//
// The ONE page header for the Course Player's library/list pages.
//
// Every such page — Resource Library (Modules), Notes, Mind Map library,
// Brain, Live Experiment, Read, Music, My Modules, Paid and Player — renders
// this header so they all share the Resource Library header's defined area:
//
//   · one fixed height (see `--dc-course-page-header-h` in
//     coursePageHeader.css — the Resource Library header's own height);
//   · the page name on the left, clear and bold, with its icon beside it
//     (`data-course-page-title`);
//   · page actions on the right (`course-page-header__actions`) — this is
//     where the MASTER / SELF segmented control lives on the pages that
//     have one, inside the header, never floating in the scrolling body.
//
// The header paints no background of its own (transparent), so a page keeps
// its own surface.
//
// A page may also render the strip with NO title of its own (2026-10-16): the
// Resource Library moved its name, its icon and its count DOWN onto the page —
// just under this strip, where the page scrolls — and gave this area to its
// one rounded search box instead. `title` and `icon` are therefore optional:
// with them the strip is the page's name row, without them it is the page's
// own top strip (the Resource Library's search box).

import type { CSSProperties, ReactNode } from "react";
import "./coursePageHeader.css";

export interface CoursePageHeaderProps {
  /** The page name, shown bold beside its icon. Omit on a page that carries
   *  its name on the page itself (the Resource Library's search strip). */
  title?: string;
  /** The page's icon (render at 20px so every header lines up). */
  icon?: ReactNode;
  /** Optional control before the title, e.g. a back button. */
  leading?: ReactNode;
  /** Right-hand actions, e.g. the MASTER / SELF control. */
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  dataAttrs?: Record<string, string | number | undefined>;
  style?: CSSProperties;
}

export default function CoursePageHeader({
  title,
  icon,
  leading,
  children,
  className = "",
  titleClassName = "",
  dataAttrs,
  style,
}: CoursePageHeaderProps) {
  return (
    <header
      className={`course-page-header ${className}`.trim()}
      data-course-page-header=""
      {...dataAttrs}
      style={style}
    >
      {leading}
      {title ? (
        <h2 className={`course-page-header__title ${titleClassName}`.trim()} data-course-page-title>
          <span className="course-page-header__icon" aria-hidden="true">{icon}</span>
          <span className="course-page-header__name">{title}</span>
        </h2>
      ) : null}
      {children ? <div className="course-page-header__actions">{children}</div> : null}
    </header>
  );
}
