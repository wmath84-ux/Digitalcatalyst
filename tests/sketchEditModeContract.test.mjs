import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const panel = fs.readFileSync('src/course/SketchPanel.tsx', 'utf8');
const quick = fs.readFileSync('src/components/PerfectFreehandSketch.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
test('sketch starts in view mode and has an accessible editing action in every layout', () => {
  assert.match(panel, /\[editing, setEditing\] = useState\(false\)/);
  assert.match(panel, /data-course-sketch-edit-toggle/);
  assert.match(panel, /aria-pressed=\{editing\}/);
  assert.match(panel, /editing \? "Done" : "Edit sketch"/);
  assert.match(panel, /data-course-sketch-edit-access/);
  assert.match(panel, /setEditing\(false\), \[sceneKey, mode\]/);
});
test('Excalidraw editing and bottom chrome follow the same state without hiding navigation', () => {
  assert.match(panel, /viewModeEnabled=\{!editing\}/);
  assert.match(css, /\[data-course-sketch-panel\]\[data-sketch-editing="false"\] \[data-course-sketch-host\] \.App-bottom-bar \{\s*display: none !important;/);
  const rule = css.slice(css.lastIndexOf('/* Only the Sketch editor'));
  assert.doesNotMatch(rule, /data-course-strip-nav/);
});
test('Quick Sketch hides tools and guards pointer/keyboard edits in view mode', () => {
  assert.match(panel, /readOnly=\{!editing\}/);
  assert.match(quick, /if \(readOnly\) return;/);
  assert.match(quick, /if \(readOnly \|\| !isActive\(\)\) return;/);
  assert.match(quick, /open=\{panelOpen && !readOnly\}/);
  assert.match(quick, /!readOnly \? <div className="dc-qsk-corner dc-qsk-corner--bottom-left"/);
  assert.match(quick, /!readOnly \? <div className="dc-qsk-corner dc-qsk-corner--bottom-right"/);
  assert.match(quick, /readOnly = false/); // other existing callers keep editing behaviour
});
