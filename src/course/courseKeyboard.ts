// src/course/courseKeyboard.ts
//
// THE COURSE PLAYER'S ONE KEYBOARD-VISIBLE STATE — the maths, with no React
// in it, so every consumer (the footer navigation, the Notes editor, the mind
// map, the AI Mentor chat) can share exactly the same definition of "the soft
// keyboard is open".
//
// Why the player needs its own state at all: the soft keyboard is not a DOM
// element — no event says "I am open". The only honest signal is the VIEWPORT,
// and browsers reduce it in two different ways:
//
//   · OVERLAY keyboard (mobile Chrome's default `interactive-widget` behaviour)
//     — the layout viewport KEEPS its height; only the VISUAL viewport shrinks.
//     The covered amount is `innerHeight - (visualViewport.height + offsetTop)`.
//
//   · RESIZE keyboard (an Android WebView with `adjustResize`, which is how the
//     Capacitor shell runs) — the layout viewport itself shrinks, so the visual
//     viewport shrinks by the same amount and the covered amount above stays 0.
//     The keyboard is only visible as the SHRINK against the height the
//     viewport was resting at before the keyboard opened.
//
// Measuring only the first (as the deck's original inset hook did) silently
// reports "no keyboard" in the second — which is exactly the case where the
// footer navigation used to stay parked above the keyboard. `measureKeyboardCoverage`
// takes the max of both, so one number is right in both engines.
//
// A viewport change alone is NOT a keyboard: browser chrome (the URL bar) and
// desktop window resizes move it too. The state therefore only turns ON while
// a text-entry element inside the player actually has focus, and only once the
// covered part is big enough to be a keyboard rather than browser chrome.

/** Below this the viewport shrank because of browser chrome, not a keyboard. */
export const COURSE_KEYBOARD_MIN_INSET = 90;

/** The player shell attribute the live state is published on (CSS keys off it). */
export const COURSE_KEYBOARD_ATTRIBUTE = "data-course-keyboard";

/** The published coverage in px — `--course-kb-inset: 312px`. */
export const COURSE_KEYBOARD_INSET_PROPERTY = "--course-kb-inset";

/**
 * A rich-text surface: `contenteditable` in any of its spellings. The live
 * `isContentEditable` flag is the fast path, and the attribute is the fallback
 * for engines that never implemented the flag (some WebViews, jsdom) — a notes
 * or mind-map editor that fails to register here would leave the footer
 * navigation up over the keyboard, which is the exact bug this state exists
 * to kill.
 */
const isContentEditableNode = (node: HTMLElement): boolean => {
  if (node.isContentEditable === true) return true;
  const attribute = node.getAttribute?.("contenteditable");
  return typeof attribute === "string" && attribute.toLowerCase() !== "false";
};

/**
 * Is this the kind of element a soft keyboard opens for? Inputs, textareas and
 * contenteditable surfaces (the notes / mind-map rich-text editors) — the same
 * three the deck's own inset hook watches.
 */
export const isTextEntryElement = (element: Element | null | undefined): boolean => {
  if (!element) return false;
  const node = element as HTMLElement;
  return isContentEditableNode(node) || /^(input|textarea)$/i.test(node.tagName);
};

export interface KeyboardViewportSample {
  /** `window.innerHeight` — the layout viewport the fixed shell measures against. */
  layoutHeight: number;
  /** `window.visualViewport?.height` (already falls back to the layout height). */
  visualHeight: number;
  /** `window.visualViewport?.offsetTop ?? 0`. */
  visualOffsetTop: number;
  /** The layout height this viewport rests at (measured with no keyboard up). */
  restingHeight: number;
}

/**
 * How many px of the player the soft keyboard is covering — the max of the two
 * engine behaviours described at the top of this file, so callers never have to
 * know which one they are running in.
 */
export const measureKeyboardCoverage = ({
  layoutHeight,
  visualHeight,
  visualOffsetTop,
  restingHeight,
}: KeyboardViewportSample): number => {
  const coveredByVisualViewport = Math.max(0, Math.round(layoutHeight - (visualHeight + visualOffsetTop)));
  const coveredByLayoutResize = Math.max(0, Math.round(restingHeight - layoutHeight));
  return Math.max(coveredByVisualViewport, coveredByLayoutResize);
};

/**
 * The layout height the NEXT sample is measured against.
 *
 * While a field inside the player has focus the resting height is the LARGEST
 * height seen (a shrinking viewport must never move the baseline it is being
 * compared with, or the resize keyboard would erase its own evidence). With
 * nothing focused the current height IS the resting height — which is what
 * makes dismissing the keyboard restore the state, even on browsers that keep
 * the input focused after the keyboard slides away.
 */
export const nextRestingHeight = (
  restingHeight: number,
  layoutHeight: number,
  editingInsideScope: boolean,
): number => (editingInsideScope ? Math.max(restingHeight, layoutHeight) : layoutHeight);

export interface CourseKeyboardState {
  /** TRUE only while the soft keyboard is genuinely open over the player. */
  keyboardVisible: boolean;
  /** How much of the player the keyboard covers, in px (0 while it is closed). */
  keyboardInset: number;
}

/** The closed state — also the context's default (no provider above). */
export const COURSE_KEYBOARD_IDLE: CourseKeyboardState = { keyboardVisible: false, keyboardInset: 0 };

/**
 * The one rule every keyboard-aware surface in the player reads:
 *
 *   keyboardVisible === true  →  the keyboard is open over THIS player
 *
 * It requires both halves — a text field focused inside the player AND a
 * viewport that has really made room for a keyboard — so a rotated device or a
 * resized desktop window can never fake it.
 */
export const resolveCourseKeyboardState = (
  coverage: number,
  editingInsideScope: boolean,
): CourseKeyboardState =>
  editingInsideScope && coverage >= COURSE_KEYBOARD_MIN_INSET
    ? { keyboardVisible: true, keyboardInset: coverage }
    : COURSE_KEYBOARD_IDLE;
