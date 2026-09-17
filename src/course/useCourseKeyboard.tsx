// src/course/useCourseKeyboard.tsx
//
// The Course Player's ONE keyboard-visible state, published to the component
// tree and to the DOM.
//
//   · <CourseKeyboardProvider scopeRef={playerShellRef}> measures the soft
//     keyboard for the WHOLE player (see ./courseKeyboard for the maths) and
//     is the single source of truth: `keyboardVisible === true` means a text
//     field inside the player is being typed into right now.
//
//   · `useCourseKeyboard()` is how a surface reads it — the footer navigation
//     (both the bottom-centre peek dock and the legacy in-pane dock), the
//     Notes editor, the mind map and the AI Mentor chat all consume the same
//     answer, so there is no per-feature keyboard hack anywhere.
//
//   · The state is ALSO written onto the player shell as
//     `data-course-keyboard="open" | "closed"` (plus `--course-kb-inset`),
//     the way the AI chat publishes `.kb-open` on its own root, so the one
//     shared CSS rule for the footer navigation can key off it too.
//
// Nothing here is persisted: the state is derived from the live viewport on
// every read, so dismissing the keyboard restores every surface to exactly
// the state it had — no layout jump, no stuck footer, no second footer.

import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  COURSE_KEYBOARD_ATTRIBUTE,
  COURSE_KEYBOARD_IDLE,
  COURSE_KEYBOARD_INSET_PROPERTY,
  isTextEntryElement,
  measureKeyboardCoverage,
  nextRestingHeight,
  resolveCourseKeyboardState,
  type CourseKeyboardState,
} from "./courseKeyboard";

/**
 * Subscribe to the soft keyboard for everything inside `scopeRef` (the player
 * shell). Re-renders ONLY when the resolved state actually changes — the
 * keyboard's animation fires dozens of viewport events per open, and each one
 * that reports the same answer must be free.
 */
export const useCourseKeyboardViewport = (
  scopeRef: RefObject<HTMLElement | null>,
): CourseKeyboardState => {
  const [state, setState] = useState<CourseKeyboardState>(COURSE_KEYBOARD_IDLE);

  useEffect(() => {
    const viewport = window.visualViewport;
    // The layout height the viewport rests at before the keyboard opens.
    let restingHeight = window.innerHeight;
    // A rotation changes every height on screen: the next read re-baselines.
    let resetResting = false;
    let frame = 0;

    const read = () => {
      frame = 0;
      const layoutHeight = window.innerHeight;
      if (resetResting) {
        restingHeight = layoutHeight;
        resetResting = false;
      }
      const active = document.activeElement;
      const editingInsideScope = isTextEntryElement(active) && Boolean(scopeRef.current?.contains(active));
      restingHeight = nextRestingHeight(restingHeight, layoutHeight, editingInsideScope);
      const coverage = measureKeyboardCoverage({
        layoutHeight,
        visualHeight: viewport?.height ?? layoutHeight,
        visualOffsetTop: viewport?.offsetTop ?? 0,
        restingHeight,
      });
      const next = resolveCourseKeyboardState(coverage, editingInsideScope);
      setState((current) =>
        current.keyboardVisible === next.keyboardVisible && current.keyboardInset === next.keyboardInset
          ? current
          : next,
      );
    };

    // Viewport events arrive in bursts (the keyboard animates): one read per
    // frame is plenty, and it keeps the listener cheap.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };
    const onRotate = () => {
      resetResting = true;
      schedule();
    };

    read();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("focusin", schedule);
    window.addEventListener("focusout", schedule);
    window.addEventListener("orientationchange", onRotate);
    const orientationMedia = window.matchMedia?.("(orientation: landscape)");
    orientationMedia?.addEventListener?.("change", onRotate);
    window.screen?.orientation?.addEventListener?.("change", onRotate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("focusin", schedule);
      window.removeEventListener("focusout", schedule);
      window.removeEventListener("orientationchange", onRotate);
      orientationMedia?.removeEventListener?.("change", onRotate);
      window.screen?.orientation?.removeEventListener?.("change", onRotate);
    };
  }, [scopeRef]);

  return state;
};

const CourseKeyboardContext = createContext<CourseKeyboardState>(COURSE_KEYBOARD_IDLE);

/**
 * Provides the player-wide keyboard state and publishes it on the shell
 * element (`data-course-keyboard` + `--course-kb-inset`) so the shared CSS
 * rule can hide the footer navigation without a single selector per feature.
 */
export function CourseKeyboardProvider({
  scopeRef,
  children,
}: {
  scopeRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const state = useCourseKeyboardViewport(scopeRef);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return undefined;
    scope.setAttribute(COURSE_KEYBOARD_ATTRIBUTE, state.keyboardVisible ? "open" : "closed");
    scope.style.setProperty(COURSE_KEYBOARD_INSET_PROPERTY, `${state.keyboardInset}px`);
    return () => {
      // Leaving the player drops the flag with the element it was pinned to,
      // so no other screen can ever inherit a "keyboard open" state.
      scope.removeAttribute(COURSE_KEYBOARD_ATTRIBUTE);
      scope.style.removeProperty(COURSE_KEYBOARD_INSET_PROPERTY);
    };
  }, [scopeRef, state.keyboardVisible, state.keyboardInset]);

  return <CourseKeyboardContext.Provider value={state}>{children}</CourseKeyboardContext.Provider>;
}

/**
 * The common keyboard rule, for every surface that has to react to the
 * keyboard: notes, mind map, AI Mentor — and, above all, the footer
 * navigation, which hides completely while `keyboardVisible` is true.
 */
export const useCourseKeyboard = (): CourseKeyboardState => useContext(CourseKeyboardContext);
