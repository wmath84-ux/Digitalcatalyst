// Owner brief (2026-10-16) — ismein purana faisla badla hai, isliye ye file
// dobara likhi gayi:
//
//   "agar usko kisi bhi edge per le jaya jaye mobile mein … to vah ek patla sa
//    white strip create ho jata hai isko remove karo … unke bich mein ek chhota
//    sa gap dikhna chahiye aur icon bhi dikhe … use per click karne per vah
//    apne previous area mein directly expand ho jata hai."
//
// Pehle (2026-10-14) owner ne is jagah par chhota glyph HATA diya tha
// ("jo chhota unwanted icon dikhai deta hai, use hatao") aur wahan ek frosted
// glass plate (CHROME_GLASS) chhod di gayi thi — wahi plate "patla sa white
// strip" thi. Ab dono baatein badal gayi hain:
//
//   · plate GAYAB — collapsed pane ek saaf gap chhodta hai (koi background nahi);
//   · gap ke theek centre me EK chhota icon hai (22px), jo pane ko uske
//     previous size par wapas le jaata hai;
//   · drag / edge fill / snap / keyboard / tap-to-restore — sab unchanged.
//
// Breathing animation aur purane icon feeds (PlayCircle / studyIcon) aaj bhi
// nahi hain — wapas nahi laaye gaye.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const panels = read('src/course/studyPanels.tsx');
const motion = read('src/course/splitMotion.ts');
const player = read('src/CoursePlayerApp.tsx');

const railBody = panels.slice(panels.indexOf('function PeekRail('), panels.indexOf('// ── The divider ──'));

test('the collapsed edge is a clean gap with ONE small icon — never a white plate', () => {
  // The frosted plate that used to fill the strip is gone from the rail.
  assert.doesNotMatch(railBody, /style=\{CHROME_GLASS\}/, 'the gap carries no glass plate (that was the white strip)');
  assert.doesNotMatch(railBody, /background/, 'the gap paints no background of its own');
  // The icon is there: one small plate at the centre, drawn by the icon style.
  assert.match(railBody, /data-course-peek-icon=""/);
  assert.match(railBody, /style=\{PEEK_ICON_STYLE\}/);
  assert.match(panels, /const PEEK_ICON_STYLE: CSSProperties = \{[\s\S]*?width: 22,[\s\S]*?height: 22,/);
  assert.match(panels, /const PEEK_ICON_PX = 16;/);
  // It points the way the pane grows back — all four ends of the two axes.
  assert.match(railBody, /axis === "row"\s*\n\s*\? \(glowSide === "lesson" \? ChevronRight : ChevronLeft\)\s*\n\s*: \(glowSide === "lesson" \? ChevronDown : ChevronUp\)/);
  assert.match(panels, /ChevronDown, ChevronLeft, ChevronRight, ChevronUp/);
  // The old removed feeds stay removed, and nothing breathes.
  assert.doesNotMatch(panels, /icon=\{PlayCircle\}/);
  assert.doesNotMatch(panels, /data-peek-icon=/);
  assert.doesNotMatch(panels, /studyIcon/);
  assert.doesNotMatch(player, /studyIcon=/);
  assert.doesNotMatch(panels, /breathe/);
  // And no stylesheet still styles the removed glyph by its old name.
  for (const sheet of ['src/course/flatPlayerChrome.css', 'src/index.css', 'src/work/work-shell.css']) {
    assert.doesNotMatch(read(sheet), /data-peek-icon=/, `${sheet} must not style the old glyph`);
  }
});

test('the collapsed rail remains: 28px gap, accent glow, tap restores the PREVIOUS size', () => {
  assert.match(motion, /export const PEEK_RAIL_PX = 28;/);
  assert.match(panels, /data-course-peek-rail=""/);
  assert.match(panels, /data-peek-gap=""/);
  assert.match(panels, /data-peek-glow=""/);
  // The glow still wears the active tab's colour, on the divider-facing edge.
  assert.match(panels, /boxShadow: `0 0 14px \$\{accent\}88`/);
  assert.match(player, /accent=\{activeStudyTab\.color\}/);
  // Both ends still mount their rail and restore on tap.
  assert.match(panels, /collapsed === "lesson" && railAtEdge/);
  assert.match(panels, /collapsed === "study" && railAtEdge/);
  assert.match(panels, /label="Show the lesson pane"/);
  assert.match(panels, /label="Show the study pane"/);
  assert.match(panels, /onRestore=\{restore\}/);
  // "Apne previous area mein": the restore target is the ratio the pane had
  // BEFORE the collapse, never the default.
  assert.match(panels, /const target = clampSplitRatio\(lastRatioRef\.current \|\| DEFAULT_SPLIT_RATIO\[axis\], floor\);/);
  assert.match(panels, /animateRatio\(target, SPRING_ENTRY\)/);
});

test('drag and resize behaviour is unchanged', () => {
  // Edge fill thresholds and the collapse they trigger.
  assert.match(motion, /export const FILL_THRESHOLD = 8;/);
  assert.match(panels, /if \(raw <= FILL_THRESHOLD\) \{ collapseTo\("study"\); return; \}/);
  assert.match(panels, /if \(raw >= 100 - FILL_THRESHOLD\) \{ collapseTo\("lesson"\); return; \}/);
  assert.match(panels, /animateRatio\(side === "study" \? 0 : 100, SPRING_SETTLE\)/);
  // The drag itself: pointer capture, live percent, settle on release.
  assert.match(panels, /setPointerCapture\(event\.pointerId\)/);
  assert.match(panels, /onSplitPointerMove/);
  assert.match(panels, /settleAfterDrag\(endRatio\)/);
  // Dragging a collapsed edge wakes the pane back up.
  assert.match(panels, /if \(collapsedRef\.current\) \{\n        setCollapsed\(null\);/);
  // Snap points, double-click 50/50 and full keyboard control remain.
  assert.match(panels, /SPLIT_SNAP_POINTS\.find/);
  assert.match(panels, /onDoubleClick=\{fiftyFifty\}/);
  assert.match(panels, /case "Home":/);
  assert.match(panels, /case "End":/);
  // The divider's own chrome is untouched: the 2px yellow core line.
  assert.match(motion, /export const DIVIDER_LINE = "#FFBE0B";/);
  assert.match(panels, /background: DIVIDER_LINE,/);
});
