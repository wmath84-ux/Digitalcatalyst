// tests/coursePlayerKeyboardFooterContract.test.mjs
//
// Course Player — the soft keyboard vs the FOOTER NAVIGATION (owner's
// direction): "jab bhi keyboard open ho, Footer Navigation = HIDDEN" for
// Notes, Mind Map AND the AI Mentor chat — implemented as ONE common
// keyboard-visible state for the whole player, never as three per-feature
// hacks.
//
//   1. ONE state — src/course/courseKeyboard.ts holds the maths (a keyboard
//      that OVERLAYS the layout viewport and one that RESIZES it both resolve
//      to the same "covered px"), src/course/useCourseKeyboard.tsx holds the
//      hook + the provider, and <CoursePlayerApp /> mounts the provider around
//      the player shell.
//   2. THE RULE — `keyboardVisible === true → footer navigation hidden`, in
//      both of the footer's homes: the bottom-centre peek dock and the legacy
//      in-pane dock, plus the shared CSS backstop keyed off the published
//      `data-course-keyboard="open"` attribute.
//   3. THE CONTENT RULE — while the keyboard is open the study pane takes the
//      whole deck for every writing surface, the AI Mentor chat included
//      (module/course content temporarily hidden).
//   4. NOTES / MIND MAP ARE NOT REWRITTEN — the deck's own inset hook, its
//      padding and its restore-over-nothing-persisted contract stay exactly
//      as the pinned split-deck contract describes them.
//   5. NOTHING IS PERSISTED — the state is derived, so close → restore is
//      automatic (no stuck-hidden footer, no duplicate footer, no layout jump).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const keyboardMath = readSource("src/course/courseKeyboard.ts");
const keyboardHook = readSource("src/course/useCourseKeyboard.tsx");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const peekDock = readSource("src/course/CoursePeekDock.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");
const studyPanels = readSource("src/course/studyPanels.tsx");
const indexCss = readSource("src/index.css");

// ---------------------------------------------------------------------------
// 1. ONE keyboard-visible state for the whole player
// ---------------------------------------------------------------------------

test("the player owns one keyboard state module with the viewport maths", () => {
  // The threshold lives in one place, and it is a keyboard-sized change —
  // smaller viewport movements are browser chrome (the URL bar).
  assert.match(keyboardMath, /export const COURSE_KEYBOARD_MIN_INSET = 90;/);
  // The attribute + custom property the state is published on.
  assert.match(keyboardMath, /export const COURSE_KEYBOARD_ATTRIBUTE = "data-course-keyboard";/);
  assert.match(keyboardMath, /export const COURSE_KEYBOARD_INSET_PROPERTY = "--course-kb-inset";/);
  // The ONE rule: keyboardVisible === true only with a text field focused
  // inside the player AND a viewport that really made room for a keyboard.
  assert.match(
    keyboardMath,
    /editingInsideScope && coverage >= COURSE_KEYBOARD_MIN_INSET\s*\?\s*\{ keyboardVisible: true, keyboardInset: coverage \}\s*:\s*COURSE_KEYBOARD_IDLE/,
  );
  // A text field is an input / textarea / contenteditable surface — the same
  // three the notes + mind map editors are built on.
  assert.match(keyboardMath, /return isContentEditableNode\(node\) \|\| \/\^\(input\|textarea\)\$\/i\.test\(node\.tagName\);/);
  // The contenteditable check has a fallback for engines that never
  // implemented `isContentEditable` — a notes editor that fails to register
  // would leave the footer up over the keyboard, i.e. the very bug.
  assert.match(keyboardMath, /if \(node\.isContentEditable === true\) return true;/);
  assert.match(keyboardMath, /const attribute = node\.getAttribute\?\.\("contenteditable"\);/);
  assert.match(keyboardMath, /typeof attribute === "string" && attribute\.toLowerCase\(\) !== "false"/);
});

test("both keyboard engines resolve to the same covered-px number", () => {
  // OVERLAY keyboard: the layout viewport keeps its height, the VISUAL one
  // shrinks — the measurement the deck's inset hook has always used.
  assert.match(keyboardMath, /const coveredByVisualViewport = Math\.max\(0, Math\.round\(layoutHeight - \(visualHeight \+ visualOffsetTop\)\)\);/);
  // RESIZE keyboard (the Android WebView): the layout viewport itself shrinks,
  // so the keyboard is only visible as the shrink against the resting height.
  assert.match(keyboardMath, /const coveredByLayoutResize = Math\.max\(0, Math\.round\(restingHeight - layoutHeight\)\);/);
  assert.match(keyboardMath, /return Math\.max\(coveredByVisualViewport, coveredByLayoutResize\);/);
  // The resting height never follows the viewport down while a field is being
  // typed in (that would erase the resize keyboard's own evidence)…
  assert.match(
    keyboardMath,
    /\(editingInsideScope \? Math\.max\(restingHeight, layoutHeight\) : layoutHeight\)/,
  );
});

test("the hook watches focus + the viewport and only re-renders on a real change", () => {
  assert.match(keyboardHook, /export const useCourseKeyboardViewport = \(/);
  assert.match(keyboardHook, /const editingInsideScope = isTextEntryElement\(active\) && Boolean\(scopeRef\.current\?\.contains\(active\)\);/);
  assert.match(keyboardHook, /window\.addEventListener\("focusin", schedule\);/);
  assert.match(keyboardHook, /window\.addEventListener\("focusout", schedule\);/);
  assert.match(keyboardHook, /viewport\?\.addEventListener\("resize", schedule\);/);
  assert.match(keyboardHook, /viewport\?\.addEventListener\("scroll", schedule\);/);
  assert.match(keyboardHook, /window\.addEventListener\("resize", schedule\);/);
  // Viewport events arrive in bursts while the keyboard animates: one read per
  // frame, and a state object that keeps its identity when nothing changed.
  assert.match(keyboardHook, /frame = window\.requestAnimationFrame\(read\);/);
  assert.match(
    keyboardHook,
    /current\.keyboardVisible === next\.keyboardVisible && current\.keyboardInset === next\.keyboardInset\s*\?\s*current\s*:\s*next/,
  );
  // Rotation re-baselines the resting height (otherwise landscape would look
  // like a keyboard-sized shrink).
  assert.match(keyboardHook, /window\.addEventListener\("orientationchange", onRotate\);/);
  assert.match(keyboardHook, /restingHeight = layoutHeight;\s*\n\s*resetResting = false;/);
});

test("the provider publishes the state on the player shell and cleans up", () => {
  assert.match(keyboardHook, /export function CourseKeyboardProvider\(\{/);
  assert.match(keyboardHook, /scope\.setAttribute\(COURSE_KEYBOARD_ATTRIBUTE, state\.keyboardVisible \? "open" : "closed"\);/);
  assert.match(keyboardHook, /scope\.style\.setProperty\(COURSE_KEYBOARD_INSET_PROPERTY, `\$\{state\.keyboardInset\}px`\);/);
  // Leaving the player drops the flag with the element — no other screen can
  // ever inherit a "keyboard open" state.
  assert.match(keyboardHook, /scope\.removeAttribute\(COURSE_KEYBOARD_ATTRIBUTE\);/);
  // The provider is mounted around the whole player shell.
  assert.match(coursePlayer, /import \{ CourseKeyboardProvider \} from "\.\/course\/useCourseKeyboard";/);
  assert.match(coursePlayer, /<CourseKeyboardProvider scopeRef=\{playerShellRef\}>/);
  assert.match(coursePlayer, /<\/CourseKeyboardProvider>/);
  // The default context value is the CLOSED state, so any surface rendered
  // without a provider behaves exactly as before.
  assert.match(keyboardHook, /createContext<CourseKeyboardState>\(COURSE_KEYBOARD_IDLE\)/);
});

// ---------------------------------------------------------------------------
// 2. THE RULE — keyboard visible → footer navigation hidden
// ---------------------------------------------------------------------------

test("the peek dock hides completely while the keyboard is open", () => {
  assert.match(peekDock, /import \{ useCourseKeyboard \} from '\.\/useCourseKeyboard'/);
  assert.match(peekDock, /const \{ keyboardVisible \} = useCourseKeyboard\(\)/);
  // Hidden, not merely transparent: display:none takes the line AND the open
  // dock out of the layout, so no strip of footer rides above the keyboard.
  assert.match(
    peekDock,
    /className=\{`fixed inset-x-0 bottom-0 z-\[70\] flex flex-col items-center \$\{keyboardVisible \? 'hidden' : ''\}`\}/,
  );
  assert.match(peekDock, /data-keyboard-hidden=\{keyboardVisible \? 'true' : 'false'\}/);
  // The dock's own machinery is untouched — it is a visibility rule only.
  assert.match(peekDock, /const open = hover \|\| pinned/);
  assert.match(peekDock, /<GlassDock compact items=\{items\} onSelect=\{handleSelect\} pointerX=\{pointerX\} \/>/);
});

test("the legacy in-pane dock carries the same rule", () => {
  assert.match(overlay, /import \{ useCourseKeyboard \} from "\.\/useCourseKeyboard";/);
  assert.match(overlay, /const \{ keyboardVisible \} = useCourseKeyboard\(\);/);
  assert.match(
    overlay,
    /className=\{`relative z-50 shrink-0 px-3 pb-\[max\(env\(safe-area-inset-bottom\),10px\)\] pt-2 \$\{keyboardVisible \? "hidden" : ""\}`\}/,
  );
  // Both of the footer's homes, one rule, no per-feature duplication: the
  // peek dock and the in-pane dock read the SAME state.
  const consumers = [peekDock, overlay].map((source) => /useCourseKeyboard\(\)/.test(source));
  assert.deepEqual(consumers, [true, true]);
  // The in-pane dock stays a child of the study pane (its home is unchanged).
  assert.match(overlay, /data-in-split="true"/);
});

test("the shared CSS backstop hides both footer homes on the published attribute", () => {
  assert.match(indexCss, /\.course-player-shell\[data-course-keyboard="open"\] \[data-course-peek-dock\],/);
  assert.match(indexCss, /\.course-player-shell\[data-course-keyboard="open"\] \[data-course-dock\] \{\s*\n\s*display: none !important;\s*\n\s*\}/);
  // The rule that restores the dock on desktop/tablet is still intact — the
  // keyboard rule is the only thing that may hide the footer.
  assert.match(indexCss, /\.course-player-shell \[data-course-dock\] \[data-glass-dock\] \{\s*\n\s*display: flex !important;\s*\n\s*\}/);
});

// ---------------------------------------------------------------------------
// 3. The content rule — the AI Mentor joins notes + mind map
// ---------------------------------------------------------------------------

test("notes, mind map AND the AI chat hand the whole deck to the writing surface", () => {
  assert.match(coursePlayer, /keyboardExpandEnabled=\{dockTab === "notes" \|\| dockTab === "mindmap" \|\| dockTab === "ai"\}/);
  assert.match(studyPanels, /const keyboardTakeover = \(keyboardInset > 0 \|\| keyboardVisible\) && keyboardExpandEnabled && collapsed !== "study";/);
  // The takeover consumes the player's ONE state…
  assert.match(studyPanels, /import \{ useCourseKeyboard \} from "\.\/useCourseKeyboard";/);
  assert.match(studyPanels, /const \{ keyboardVisible \} = useCourseKeyboard\(\);/);
  // …and hides the lesson pane + the divider for as long as it is on.
  assert.match(studyPanels, /data-keyboard-takeover=\{keyboardTakeover \? "true" : undefined\}/);
  assert.match(studyPanels, /style=\{keyboardTakeover \? \{ display: "none" \} : lessonStyle\}/);
  assert.match(studyPanels, /\{keyboardTakeover \? null : \(/);
});

// ---------------------------------------------------------------------------
// 4. Notes / mind map behaviour is preserved, not rewritten
// ---------------------------------------------------------------------------

test("the deck's own inset hook and padding are untouched", () => {
  assert.match(studyPanels, /const useKeyboardInset = \(scopeRef: RefObject<HTMLElement \| null>\): number =>/);
  assert.match(studyPanels, /window\.innerHeight - \(viewport\.height \+ viewport\.offsetTop\)/);
  assert.match(studyPanels, /target\.isContentEditable \|\| \/\^\(textarea\|input\)\$\/i\.test\(target\.tagName\)/);
  assert.match(studyPanels, /scopeRef\.current\?\.contains\(target\)/);
  assert.match(studyPanels, /const keyboardInset = useKeyboardInset\(sectionRef\);/);
  assert.match(studyPanels, /paddingBottom: keyboardInset \? keyboardInset : undefined/);
  assert.match(studyPanels, /data-keyboard-inset=\{keyboardInset \|\| undefined\}/);
  // Only the OVERLAY inset is ever used as padding: a layout that already
  // resized under the keyboard must not be padded a second time, or the pane
  // would leave an empty strip where the footer used to be.
  assert.match(keyboardMath, /keyboardInset: coverage \}/);
});

// ---------------------------------------------------------------------------
// 5. Derived, never persisted — restore is automatic
// ---------------------------------------------------------------------------

test("nothing about the keyboard state is written to storage", () => {
  assert.doesNotMatch(keyboardMath, /localStorage|sessionStorage/);
  assert.doesNotMatch(keyboardHook, /localStorage|sessionStorage/);
  // No persisted "hidden" flag anywhere near the footer visibility rule.
  assert.doesNotMatch(peekDock, /localStorage/);
  assert.doesNotMatch(overlay, /keyboardHidden|footerHidden/);
});

test("close → restore is derived from the same state, with no second footer", () => {
  // The state is a plain boolean pair handed down; the footer comes back the
  // instant it flips back to false because nothing was mutated on the way out.
  assert.match(keyboardHook, /export const useCourseKeyboard = \(\): CourseKeyboardState => useContext\(CourseKeyboardContext\);/);
  // Exactly ONE footer is ever rendered: peek mode OR the legacy in-pane dock.
  assert.match(overlay, /const dock = props\.peekDock \? null : \(/);
  assert.equal((coursePlayer.match(/<CoursePeekDock tab=/g) || []).length, 1);
  assert.equal((overlay.match(/^\s*data-course-dock$/gm) || []).length, 1);
});
