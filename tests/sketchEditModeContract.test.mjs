import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const panel = fs.readFileSync('src/course/SketchPanel.tsx', 'utf8');
const quick = fs.readFileSync('src/components/PerfectFreehandSketch.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
test('sketch starts in read mode and has an accessible editing action in every layout', () => {
  // READ FIRST (the notes page's rule): the page opens view-only, and the two
  // doors between the modes are the tray's pencil and the tray's eye.
  assert.match(panel, /const \[readOnlySketch, setReadOnlySketch\] = useState\(true\);/);
  assert.match(panel, /const editing = !readOnlySketch;/);
  assert.match(panel, /const enterEditMode = useCallback\(\(\) => \{/);
  assert.match(panel, /const enterReadMode = useCallback\(\(\) => \{/);
  assert.match(panel, /data-course-sketch-read-edit/);
  assert.match(panel, /data-course-sketch-edit-read/);
  assert.match(panel, /data-course-sketch-edit-access/);
  assert.match(panel, /setReadOnlySketch\(true\);\s+setReadChromeVisible\(true\);\s+setPendingDeleteKey\(null\);\s+\}, \[sceneKey, mode\]\);/);
  // The old header's Edit / Done pill is gone for good.
  assert.doesNotMatch(panel, /data-course-sketch-edit-toggle/);
  assert.doesNotMatch(panel, /"Done" : "Edit sketch"/);
});
test('there is no header left to size: the trays are ONE row of identical tiles', () => {
  // No header at all — the library read-out lives in the panel body now.
  assert.doesNotMatch(panel, /<SketchStatus\b/);
  assert.match(panel, /data-course-sketch-library-count=\{library\.itemCount\}/); // in the panel's options
  // Every tray control is the same class, so nothing on the page is a
  // different size or weight from its neighbours.
  assert.match(panel, /const trayButtonClass = "dc-sketch-tray-button";/);
  assert.match(panel, /className=\{trayButtonClass\}/);
  assert.match(panel, /className=\{`dc-sketch-tray-text\$\{quickMode \? " dc-sketch-tray-text--lit" : ""\}`\}/);
  assert.match(panel, /data-course-sketch-read-tray/);
  assert.match(panel, /data-course-sketch-edit-tray/);
  assert.match(panel, /Full Editor/);
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
  // One bottom tray, not two corners: the editor's own tools on the left of
  // the row, then the page's doors (Full Editor + the eye / pencil).
  assert.match(quick, /<nav className="dc-qsk-tray" aria-label="Sketch tools" data-quick-sketch-tray>/);
  assert.match(quick, /data-quick-sketch-tool-button="draw"/);
  assert.match(quick, /data-quick-sketch-tool-button="erase"/);
  assert.match(quick, /data-quick-sketch-full-editor/);
  assert.match(quick, /data-quick-sketch-read-edit/);
  assert.match(quick, /data-quick-sketch-edit-read/);
  assert.match(quick, /onShowFullEditor/);
  // Read mode's tray follows the page's single-tap rule.
  assert.match(quick, /const \[trayVisible, setTrayVisible\] = useState\(true\);/);
  assert.match(quick, /if \(!readOnly\) return;\s+const target = event\.target as HTMLElement \| null;/);
  assert.match(quick, /readOnly = false/); // other existing callers keep editing behaviour
});
