// Owner brief: "Course Player ke draggable divider ko bilkul top ya bottom
// par le jaane par jo chhota unwanted icon dikhai deta hai, use hatao.
// Divider ka existing drag aur resize behaviour unchanged rehna chahiye."
//
// Dragging the divider to an edge collapses the far pane into its 28px peek
// rail; the rail used to carry a small breathing icon (the lesson's play
// glyph / the active tab's icon). That glyph is gone — top AND bottom (and
// both landscape sides, which share the one PeekRail). Everything else
// about the divider — drag, edge fill, snap, keyboard, the rail's tap to
// restore — is pinned unchanged below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const panels = read('src/course/studyPanels.tsx');
const motion = read('src/course/splitMotion.ts');
const player = read('src/CoursePlayerApp.tsx');

test('no icon is rendered at either collapsed edge', () => {
  // The glyph itself and both of its feeds are gone.
  assert.doesNotMatch(panels, /data-peek-icon/);
  assert.doesNotMatch(panels, /icon=\{PlayCircle\}/);
  assert.doesNotMatch(panels, /icon=\{studyIcon\}/);
  assert.doesNotMatch(panels, /studyIcon/);
  assert.doesNotMatch(player, /studyIcon=/);
  // No breathing animation survives on the rail.
  assert.doesNotMatch(panels, /breathe/);
  // And no stylesheet still styles the removed glyph.
  for (const sheet of ['src/course/flatPlayerChrome.css', 'src/index.css', 'src/work/work-shell.css']) {
    assert.doesNotMatch(read(sheet), /data-peek-icon/, `${sheet} must not style the removed icon`);
  }
});

test('the collapsed rail remains: 28px strip, accent glow, tap restores', () => {
  assert.match(motion, /export const PEEK_RAIL_PX = 28;/);
  assert.match(panels, /data-course-peek-rail=""/);
  assert.match(panels, /data-peek-glow=""/);
  // The glow still wears the active tab's colour, on the divider-facing edge.
  assert.match(panels, /boxShadow: `0 0 14px \$\{accent\}88`/);
  assert.match(player, /accent=\{activeStudyTab\.color\}/);
  // Both edges still mount their rail and restore on tap.
  assert.match(panels, /collapsed === "lesson" && railAtEdge/);
  assert.match(panels, /collapsed === "study" && railAtEdge/);
  assert.match(panels, /label="Show the lesson pane"/);
  assert.match(panels, /label="Show the study pane"/);
  assert.match(panels, /onRestore=\{restore\}/);
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
