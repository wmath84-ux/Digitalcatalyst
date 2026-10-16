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
// Aur usi din owner ne strip ko THIN karke WAPAS maanga (yeh doosra badlav hai):
//
//   "jo patali white strip banti hai icon ke niche aur donon ke bich mein usko
//    bhi add karo wapas, mobile users desktop sabhi jagah."
//
// Isliye ab gap me EK 6px ki patli white strip (PEEK_STRIP_PX) chalti hai —
// do panes ke BEECH, gap ki poori lambai — aur chhota icon uske theek upar
// centre me baithta hai (isliye wo "icon ke niche" bhi dikhti hai). Poora 28px
// plate aaj bhi nahi hai: rail element khud kuchh paint nahi karta, glass sirf
// is ek patle child par hai.
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

test('the collapsed edge is a clean gap with ONE small icon and the THIN white strip he asked back', () => {
  // The rail element itself still paints nothing — a plate across the whole
  // 28px is exactly what the owner rejected.
  assert.doesNotMatch(railBody, /style=\{CHROME_GLASS\}/, 'the rail element carries no glass plate');
  assert.doesNotMatch(railBody, /background/, 'the rail element paints no background of its own');
  // …but the THIN white strip is back (owner, 2026-10-16): one 6px rail running
  // the gap's whole length, between the two panes, under the icon.
  assert.match(railBody, /data-peek-strip=""/);
  assert.match(railBody, /style=\{peekStripStyle\(axis\)\}/);
  assert.match(panels, /const peekStripStyle = \(axis: SplitAxis\): CSSProperties => \{/);
  assert.match(panels, /const strip: CSSProperties = \{ position: "absolute", borderRadius: 999, \.\.\.CHROME_GLASS \};/);
  assert.match(panels, /\{ \.\.\.strip, top: 0, bottom: 0, left: "50%", width: PEEK_STRIP_PX, transform: "translateX\(-50%\)" \}/);
  assert.match(panels, /\{ \.\.\.strip, left: 0, right: 0, top: "50%", height: PEEK_STRIP_PX, transform: "translateY\(-50%\)" \}/);
  assert.match(motion, /export const PEEK_STRIP_PX = 6;/);
  // Between the two panes: a bare 6px rail, never a wash across the gap.
  assert.doesNotMatch(panels, /PEEK_STRIP_PX \* 2|width: PEEK_RAIL_PX/);
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
