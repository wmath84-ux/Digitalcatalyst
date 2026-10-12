import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(file, 'utf8');
const css = read('src/course/study-light-surfaces.css');
test('AI sidebar owns an opaque white surface for docked and drawer modes', () => {
  const side = read('src/lumen/components/Sidebar.tsx');
  const styles = read('src/lumen/index.css');
  assert.match(side, /data-lumen-sidebar=\{mode\}/);
  assert.match(side, /anim-drawer w-full/);
  assert.match(read("src/lumen/App.tsx"), /w-\[min\(272px,88%\)\]/);
  assert.match(styles, /\.lumen-root\[data-lumen-theme="light"\] \[data-lumen-sidebar\] \{\s*background: #fff;/);
});
test('note library owns its white plate, navigation ink and all empty/sync states', () => {
  assert.match(read('src/course/NotesPanel.tsx'), /import "\.\/study-light-surfaces.css"/);
  assert.match(css, /data-course-notes-mode="list"/);
  assert.match(css, /background: #fff !important/);
  assert.match(css, /--bm-ink: var\(--dc-ink, #0f172a\)/);
  for (const hook of ['study-library-empty', 'study-library-notice__message', 'study-library-notice__retry', 'data-course-notes-add']) assert.ok(css.includes(hook));
});
test('Brain polish uses real filtered sets, keeps the practice actions and introduces no sidebar', () => {
  const panel = read('src/course/CourseBrainPanel.tsx');
  assert.match(panel, /data-brain-library-intro/);
  assert.match(panel, /selfSets : moduleSets\).length/);
  assert.match(panel, /total \+ set.questions.length/);
  assert.match(panel, /onClick=\{\(\) => startSet\(set.id\)\}/);
  assert.match(panel, /<BrainQuestionDeck/);
  assert.doesNotMatch(panel, /<aside|<Sidebar/);
  assert.equal((panel.match(/className="brain-library-grid"/g) || []).length, 2);
});
test('Brain creation and submit overlays use readable light fields, feedback and actions', () => {
  assert.match(read('src/course/SelfPracticeSetComposer.tsx'), /data-brain-composer-surface/);
  assert.match(css, /:is\(input, textarea, select, option\).*background: #fff !important; color: var\(--dc-ink, #0f172a\) !important/);
  assert.match(css, /data-brain-submit-dialog/);
  assert.match(css, /data-brain-self-create/);
  assert.match(css, /color: #fff !important/);
  assert.match(css, /data-brain-self-parse-errors/);
});
