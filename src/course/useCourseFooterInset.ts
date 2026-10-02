// src/course/useCourseFooterInset.ts
//
// The live half of the "toolbar ends where the footer navigation begins" rule
// (the maths is in ./courseFooterInset.ts, with no React in it).
//
//   useCourseFooterInset(active, surfaceRef) → px
//
// `active` is whether the toolbar is on screen at all: the measurement only
// runs while there is a toolbar to place, so an idle note editor subscribes
// to nothing.
//
// The number is re-read whenever anything can move the footer or the writing
// surface, and ONLY then:
//
//   · the viewport (resize / visualViewport resize + scroll / rotation) — a
//     `position: fixed` footer rides the viewport, and the soft keyboard
//     moving it is also what hides the footer, which drops the lift to 0;
//   · a ResizeObserver on the writing surface and on the footer itself — the
//     peek dock GROWS when it opens (its panel expands) and collapses to zero
//     height when the keyboard rule hides it, and the study pane is resized
//     by the split divider's every drag;
//   · a MutationObserver that fires only for a change that actually touches a
//     footer — so the learner flipping the player's "Always-visible footer
//     dock" setting (one footer unmounts, the other mounts) is picked up,
//     without re-measuring on every DOM write the editor itself makes.
//
// Everything is coalesced to one read per animation frame, and a read that
// answers the same number re-renders nothing.

import { useLayoutEffect, useState, type RefObject } from "react";
import { COURSE_FOOTER_SELECTOR, readCourseFooterInset } from "./courseFooterInset";

/** Does this node (or anything under it) carry one of the footer's homes? */
const carriesFooter = (node: Node): boolean => {
  if (!(node instanceof Element)) return false;
  try {
    return node.matches(COURSE_FOOTER_SELECTOR) || node.querySelector(COURSE_FOOTER_SELECTOR) !== null;
  } catch {
    return false;
  }
};

/**
 * Is this mutation one the footer's position could have changed by?
 *
 * Deliberately cheap: the editor writes to the DOM on every keystroke, and this
 * filter runs for each record, so it only ever asks O(1) questions of the
 * changed node — never "does a footer live somewhere under this subtree", which
 * on the editor's own root would scan the whole document per keystroke.
 */
const touchesFooter = (record: MutationRecord): boolean => {
  if (record.type === "childList") {
    for (const node of Array.from(record.addedNodes)) if (carriesFooter(node)) return true;
    for (const node of Array.from(record.removedNodes)) if (carriesFooter(node)) return true;
    return false;
  }
  const target = record.target;
  if (!(target instanceof Element)) return false;
  try {
    return (
      // The footer itself changed (the class the keyboard rule hides it with,
      // `data-open`, an inline style)…
      target.matches(COURSE_FOOTER_SELECTOR) ||
      // …or something inside it did…
      target.closest(COURSE_FOOTER_SELECTOR) !== null ||
      // …or the player shell republished the keyboard state, which is what the
      // shared CSS backstop hides the footer off.
      target.classList.contains("course-player-shell")
    );
  } catch {
    return false;
  }
};

export const useCourseFooterInset = (active: boolean, surfaceRef: RefObject<Element | null>): number => {
  const [inset, setInset] = useState(0);

  // A layout effect, not a passive one: the toolbar is already painted when
  // this runs, so measuring here means the very first frame the toolbar
  // appears it is in the right place — the learner never sees it jump out
  // from under the footer navigation.
  useLayoutEffect(() => {
    if (!active) {
      setInset(0);
      return undefined;
    }

    let frame = 0;
    // The footers currently watched, so a footer that is swapped for the other
    // home (the player's footer-dock setting) is picked up without a remount.
    const watched = new Set<Element>();
    let observer: ResizeObserver | null = null;

    const watchFooters = () => {
      const present = Array.from(document.querySelectorAll(COURSE_FOOTER_SELECTOR));
      for (const element of present) {
        if (watched.has(element)) continue;
        watched.add(element);
        observer?.observe(element);
      }
      for (const element of Array.from(watched)) {
        if (present.includes(element)) continue;
        watched.delete(element);
        observer?.unobserve(element);
      }
    };

    const read = () => {
      frame = 0;
      watchFooters();
      const next = readCourseFooterInset(surfaceRef.current);
      setInset((current) => (current === next ? current : next));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };

    const viewport = window.visualViewport;
    const surface = surfaceRef.current;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(schedule);
      if (surface) observer.observe(surface);
    }
    const mutations =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver((records) => {
            if (records.some(touchesFooter)) schedule();
          })
        : null;

    read();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    mutations?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // Every way the footer's box can change without resizing: the class the
      // keyboard rule hides it with, the attribute that says it is open, an
      // inline style, and the player shell attribute the keyboard state is
      // published on (the CSS backstop hides the footer off that one).
      attributeFilter: ["class", "style", "hidden", "data-open", "data-course-keyboard"],
    });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      observer?.disconnect();
      mutations?.disconnect();
      watched.clear();
    };
  }, [active, surfaceRef]);

  return inset;
};
