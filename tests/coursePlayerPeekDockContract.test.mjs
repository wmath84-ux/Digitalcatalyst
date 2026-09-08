// tests/coursePlayerPeekDockContract.test.mjs
//
// The Course Player's footer navigation gets the SAME bottom-centre peek dock
// the desktop shell already uses (src/components/glass-dock/DesktopPeekDock.tsx):
//
//   1. a thin frosted line sits at the bottom CENTRE of the player;
//   2. tapping / hovering the line OPENS the footer navigation — the same
//      GlassDock the study pane used to hold;
//   3. swiping left / right across the open dock and lifting the finger on a
//      tab SELECTS that tab (GlassDock's own onPointerUp), so the button the
//      finger settles on is the one that is clicked;
//   4. pointer (mouse) interaction works too — enter reveals, leave hides;
//   5. a Player-settings toggle ("Always-visible footer dock") reverts to the
//      OLD always-visible in-pane dock, and it defaults to OFF because the
//      peek dock is the better interaction.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const peek = readSource("src/course/CoursePeekDock.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const playerPanel = readSource("src/course/PlayerPanel.tsx");
const indexCss = readSource("src/index.css");
const flatChrome = readSource("src/course/flatPlayerChrome.css");

// ---------------------------------------------------------------------------
// 1. The peek dock itself: line + panel + the SAME GlassDock
// ---------------------------------------------------------------------------

test("the peek dock mounts the line, the panel and the home GlassDock", () => {
  assert.match(peek, /data-course-peek-dock=""/);
  assert.match(peek, /data-course-peek-line=""/);
  assert.match(peek, /data-course-peek-panel=""/);
  assert.match(peek, /<GlassDock[^>]*compact[^>]*items=\{items\}[^>]*onSelect=\{handleSelect\}/);
  assert.match(peek, /<GlassMaterial radius=\{6\} \/>/);
  // The dock items are the study pane's own tabs, built by the shared helper.
  assert.match(peek, /buildDockItems\(tab\)/);
  // It must NOT carry the site-footer attribute: that is what the desktop
  // rules hide, and the peek dock has to stay reachable on every device.
  assert.doesNotMatch(peek, /siteFooter/);
});

test("opening is hover OR tap, and both pointer and touch are wired", () => {
  // Hover reveals for mouse pointers; leave hides (the desktop behaviour).
  assert.match(peek, /onPointerEnter=\{show\}/);
  assert.match(peek, /onPointerLeave=\{hide\}/);
  // Touch has no hover, so a tap toggles the dock open/closed and it stays
  // open while the learner swipes it.
  assert.match(peek, /pointerTypeRef/);
  assert.match(peek, /event\.pointerType/);
  assert.match(peek, /setPinned\(\(value\) => !value\)/);
  assert.match(peek, /const open = hover \|\| pinned/);
  // A pinned (touch) dock closes on an outside tap, and the tap still lands.
  assert.match(peek, /document\.addEventListener\(["']pointerdown["'], onDown\)/);
  assert.match(peek, /root\.contains\(event\.target\)/);
});

test("hold + drag across the LINE scrolls the dock and selects on release", () => {
  // The press opens the dock immediately so the finger has something to see.
  assert.match(peek, /onPointerDown=\{\(event\) => \{/);
  assert.match(peek, /draggingRef\.current = true/);
  assert.match(peek, /setHover\(true\)/);
  // The line drives the dock's magnification wave through a shared motion value.
  assert.match(peek, /const pointerX: MotionValue<number> = useMotionValue\(-200\)/);
  assert.match(peek, /<GlassDock[^>]*pointerX=\{pointerX\}/);
  assert.match(peek, /pointerX\.set\(event\.clientX\)/);
  // A press under the tap threshold toggles; a real left/right drag selects
  // the tab the finger settled on (the button closest to the finger).
  assert.match(peek, /DRAG_SELECT_THRESHOLD/);
  assert.match(peek, /const isTap = Math\.abs\(dx\) < DRAG_SELECT_THRESHOLD/);
  assert.match(peek, /const id = tabAtX\(event\.clientX\)/);
  assert.match(peek, /if \(id\) handleSelect\(id\)/);
  // The nearest-tab picker walks the dock's own items.
  assert.match(peek, /querySelectorAll<HTMLElement>\('\[data-glass-dock-item\]'\)/);
  assert.match(peek, /setPointerCapture\(event\.pointerId\)/);
  assert.match(peek, /releasePointerCapture/);
});

test("selecting a tab closes the dock and routes through onTabChange", () => {
  assert.match(peek, /const handleSelect = useCallback\(/);
  assert.match(peek, /setPinned\(false\)/);
  assert.match(peek, /setHover\(false\)/);
  assert.match(peek, /onTabChange\(id as DockTab\)/);
  // The line is an accessible button: Enter / Space also toggles it.
  assert.match(peek, /role="button"/);
  assert.match(peek, /aria-expanded=\{open\}/);
  assert.match(peek, /event\.key === ["']Enter["'] \|\| event\.key === ["'] ["']/);
});

test("swipe-select is the GlassDock's own release behaviour", () => {
  // The peek dock mounts the exact GlassDock the home footer uses, whose
  // onPointerUp already selects the tab the finger settles on — no re-roll.
  const glassDock = readSource("src/components/glass-dock/GlassDock.tsx");
  assert.match(glassDock, /onPointerUp=\{\(event\) => \{/);
  assert.match(glassDock, /const id = idFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(glassDock, /onSelect\(id\)/);
});

// ---------------------------------------------------------------------------
// 2. The study pane yields its dock in peek mode
// ---------------------------------------------------------------------------

test("CourseOverlay conditionally drops the in-pane dock for peek mode", () => {
  assert.match(overlay, /peekDock\?: boolean/);
  assert.match(overlay, /const dock = props\.peekDock \? null : \(/);
  // The legacy dock (always-visible, inside the study pane) is still intact.
  assert.match(overlay, /data-course-dock/);
  assert.match(overlay, /data-in-split="true"/);
  assert.match(overlay, /siteFooter/);
});

// ---------------------------------------------------------------------------
// 3. The default is OFF (peek dock), and the toggle reverts to the old dock
// ---------------------------------------------------------------------------

test("the player defaults to the peek dock and persists the preference", () => {
  // OFF by default: the loader returns false unless the key is "1".
  assert.match(coursePlayer, /const legacyFooterDockStorageKey = "dc\.coursePlayerLegacyFooterDock"/);
  assert.match(coursePlayer, /localStorage\.getItem\(legacyFooterDockStorageKey\) === "1"/);
  assert.match(coursePlayer, /const \[legacyFooterDock, setLegacyFooterDock\] = useState<boolean>\(loadLegacyFooterDock\)/);
  // Persisted on change, like every other player preference.
  assert.match(coursePlayer, /localStorage\.setItem\(legacyFooterDockStorageKey, legacyFooterDock \? "1" : "0"\)/);
  // The peek dock renders ONLY while the legacy preference is off.
  assert.match(coursePlayer, /!legacyFooterDock \? <CoursePeekDock tab=\{dockTab\} onTabChange=\{handleDockTabChange\} \/> : null/);
  // The study pane is told to drop its own dock in the same mode.
  assert.match(coursePlayer, /peekDock=\{!legacyFooterDock\}/);
});

test("the Player settings carry the revert toggle, defaulting OFF", () => {
  assert.match(playerPanel, /legacyFooterDock: boolean/);
  assert.match(playerPanel, /onLegacyFooterDockChange: \(next: boolean\) => void/);
  assert.match(playerPanel, /settingsRow\("Always-visible footer dock", legacyFooterDock, \(next\) => onLegacyFooterDockChange\(next\), "footerDock"\)/);
  assert.match(playerPanel, /footerDock: \{ color: "#FFBE0B"/);
  // The player hands the state + setter straight through.
  assert.match(coursePlayer, /legacyFooterDock=\{legacyFooterDock\}/);
  assert.match(coursePlayer, /onLegacyFooterDockChange=\{setLegacyFooterDock\}/);
});

// ---------------------------------------------------------------------------
// 4. The look: frosted line + the room's solid plate for the dock
// ---------------------------------------------------------------------------

test("index.css seats the line at the bottom centre and animates the panel", () => {
  assert.match(indexCss, /\[data-course-peek-dock\] \{/);
  assert.match(indexCss, /\[data-course-peek-line\] \{/);
  assert.match(indexCss, /\[data-course-peek-panel\] \{/);
  assert.match(indexCss, /\[data-course-peek-dock\]\[data-open="true"\] \[data-course-peek-panel\] \{/);
  // A watercolor-frost strip, exactly the desktop line's look.
  assert.match(indexCss, /\[data-course-peek-line\][\s\S]*?width: min\(22rem, 68%\)/);
  assert.match(indexCss, /\[data-course-peek-line\][\s\S]*?border-radius: 9999px/);
  // The collapsed dock never blocks the player's content.
  assert.match(indexCss, /\[data-course-peek-dock\] \{[\s\S]*?pointer-events: none/);
});

test("the peek dock's GlassDock wears the room's solid plate (no frost)", () => {
  assert.match(flatChrome, /\[data-course-peek-dock\] \[data-glass-dock\] \{/);
  assert.match(flatChrome, /\[data-course-peek-dock\] \[data-glass-dock\][\s\S]*?linear-gradient\(180deg, #141b30 0%, #0a0e1c 100%\) !important/);
  assert.match(flatChrome, /\[data-course-peek-dock\] \[data-glass-dock-item\] > div:first-child \{/);
  assert.match(flatChrome, /\[data-course-peek-dock\] \[data-glass-dock-item\] > div:first-child[\s\S]*?backdrop-filter: none !important/);
});
