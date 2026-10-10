// tests/coursePlayerMindMapStyleContract.test.mjs
//
// Source contract for the Mind Map editor redesign (src/course/MindMapPanel.tsx).
// The editor renders through React Flow, so these checks read the source to
// pin the behaviours that matter for the learner:
//   • Light is still the default palette and the Course Player theme is untouched
//   • the Plus is hidden until a node is selected or being created
//   • backing out of a fresh `+` removes its node (no stray blank branch)
//   • the Boxed / Modern look is a remembered view, not map data
//   • node text colour is computed from the real fill, never a fixed white
//   • the colour menu only exists for a selection and writes through setNodeStyle

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("src/course/MindMapPanel.tsx", "utf8");
const prefs = fs.readFileSync("src/course/playerPreferences.tsx", "utf8");

test("the editor still defaults to the Light palette without touching the shared theme", () => {
  assert.match(panel, /useCourseTheme\("mindMap", uid \?\? null(?:, "light")?\)/);
  // The shared loader's fallback is Light; the editor never passes a Dark default.
  assert.match(prefs, /fallback: CoursePlayerTheme = "light",/);
  assert.doesNotMatch(panel, /useCourseTheme\("mindMap", uid \?\? null, "dark"\)/);
  assert.doesNotMatch(panel, /useCourseTheme\("player"/);
});

test("the Plus renders only while a node is selected or being created", () => {
  assert.match(panel, /const showPlus = \(selected \|\| editing\) && !dragging;/);
  assert.match(panel, /\{showPlus \? \(\s*<button[\s\S]*?data-mind-node-add=\{id\}/);
  // The old unconditional render is gone.
  assert.doesNotMatch(panel, /\/\* ── The `\+`: one tap appends a child to THIS node ──────────────── \*\/\}\s*<button/);
});

test("the Plus adds a child under the node it was clicked on", () => {
  assert.match(panel, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onAddChild\(id\);/);
});

test("backing out of a freshly created node removes it instead of leaving a blank branch", () => {
  assert.match(panel, /const freshIdRef = useRef<string \| null>\(null\);/);
  assert.match(panel, /freshIdRef\.current = createdId;/);
  assert.match(panel, /const handleCancelEdit = useCallback\([\s\S]*?removeNode\(current, id\)/);
  // Escape and a blank draft both go through the cancel path.
  assert.match(panel, /if \(event\.key === "Escape"\) \{[\s\S]*?onCancelEdit\(id\);/);
  assert.match(panel, /if \(!trimmed\) \{\s*onCancelEdit\(id\);/);
});

test("the Boxed / Modern look is a remembered per-device view, defaulting to Boxed", () => {
  assert.match(panel, /const lookStorageKey = "dc\.mindMapLook";/);
  assert.match(panel, /localStorage\.getItem\(lookStorageKey\) === "modern" \? "modern" : "boxed"/);
  assert.match(panel, /const \[look, setLook\] = useState<MindMapLook>\(loadLook\);/);
  assert.match(panel, /data-course-mindmap-look=\{look\}/);
  assert.match(panel, /aria-pressed=\{look === "modern"\}/);
});

test("node text follows the real fill: no fixed white ink and no GlassSurface cascade", () => {
  assert.doesNotMatch(panel, /text-white"\s*:\s*/);
  assert.doesNotMatch(panel, /<GlassSurface/);
  assert.match(panel, /ink: style\?\.text \?\? readableInkOn\(inkBase\)/);
  assert.match(panel, /style=\{\{\s*background: fill,\s*color: ink,/);
  assert.match(panel, /style=\{\{ color: "inherit" \}\}/);
});

test("modern boxes draw a branch underline and take their wire from the palette", () => {
  assert.match(panel, /const underlineShadow = boxed \? null : `inset 0 \$\{selected \|\| editing \? -3 : -2\}px 0 \$\{accent\}`;/);
  assert.match(panel, /look === "modern" && index != null \? BRANCH_PALETTE\[index % BRANCH_PALETTE\.length\] : null/);
  assert.match(panel, /stroke: wire \?\? \(goesLeft \? "var\(--mm-edge-left\)" : "var\(--mm-edge-right\)"\)/);
});

test("the colour button exists only for a selection and writes through setNodeStyle", () => {
  assert.match(panel, /\{selectedId != null \? \(\s*<button[\s\S]*?data-course-mindmap-style/);
  assert.match(panel, /onMindChange\(\(current\) => setNodeStyle\(current, target, patch\)\);/);
  assert.match(panel, /data-course-mindmap-style-reset/);
  // Branch colour is offered for branches, not for the centre.
  assert.match(panel, /selectedId !== rootId\(\) \?/);
});

test("the map switcher is an icon with a tooltip and an accessible name", () => {
  assert.match(panel, /aria-label=\{`Maps — \$\{activeMapName\} \(\$\{maps\.length\}\)`\}/);
  assert.match(panel, /title=\{`Maps — \$\{activeMapName\}`\}/);
  assert.doesNotMatch(panel, /<span className="min-w-0 truncate normal-case" data-mm-map-name>/);
});

test("Backspace cannot silently remove a node: deletion stays behind the confirmation", () => {
  assert.match(panel, /deleteKeyCode=\{null\}/);
});

test("nodes are keyboard reachable: focusable, labelled, and opened with Enter or Space", () => {
  assert.match(panel, /tabIndex=\{0\}/);
  assert.match(panel, /if \(event\.key === "Enter" \|\| event\.key === " "\) \{/);
});
