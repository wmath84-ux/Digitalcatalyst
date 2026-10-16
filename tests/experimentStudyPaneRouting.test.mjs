import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const player = fs.readFileSync('src/CoursePlayerApp.tsx', 'utf8');
const library = fs.readFileSync('src/course/CourseResourceLibrary.tsx', 'utf8');
const callback = player.match(/const openStudyExperiment = useCallback\(([\s\S]*?), \[masterExperimentItems\]\);/)[1];
function setup() {
  const calls = [];
  const code = ts.transpileModule(`const route = ${callback}; return route;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const route = new Function('isExperimentFileType', 'masterExperimentItems', 'experimentOpenedRef', 'userSelectedRef', 'setStudyExperiment', 'setDockTab', 'splitDeckRef', code)(
    type => type === 'interactive',
    [{ file: { id: 'allowed' }, locked: false }, { file: { id: 'locked' }, locked: true }],
    { current: false }, { current: false }, value => calls.push(['study', value]),
    tab => calls.push(['tab', tab]), { current: { activateStudy: () => calls.push(['activate']) } },
  );
  return { route, calls };
}
test('official experiments open only the study pane, leaving the current lesson untouched', () => {
  const { route, calls } = setup();
  route({ id: 'allowed', type: 'interactive' });
  assert.equal(calls[0][0], 'study');
  assert.equal(calls[0][1].personal, false);
  assert.deepEqual(calls.slice(1), [['tab', 'experiment'], ['activate']]);
  assert.doesNotMatch(callback, /setSelectedFile/);
});
test('locked and unknown official resources cannot be opened', () => {
  const { route, calls } = setup();
  route({ id: 'locked', type: 'interactive' });
  route({ id: 'unknown', type: 'interactive' });
  route({ id: 'allowed', type: 'pdf' });
  assert.equal(calls.length, 0);
});
test('SELF and personal resources retain their non-official progress identity', () => {
  for (const [file, personal] of [[{ id: 'self', type: 'interactive' }, true], [{ id: 'mine', type: 'interactive', source: 'personal' }, false]]) {
    const { route, calls } = setup();
    route(file, personal);
    assert.equal(calls[0][1].personal, true);
  }
});
test('module selection, personal selection, initial/deep-link and resume paths route experiments below', () => {
  assert.match(player, /openStudyExperiment\(first,/);
  assert.match(player, /openStudyExperiment\(match,/);
  assert.match(player, /openStudyExperiment\(file, true\)/);
  assert.match(player, /openStudyExperiment\(experiment.file, source === "self"\)/);
  assert.match(player, /experimentPanel=\{opts\.extra \? undefined : studyExperiment \?/);
  assert.match(player, /!studyExperiment.personal && !completedIds.has/);
  assert.match(player, /Back to experiments/);
});
test('module search is the SHARED box now; expansion and access guards stay', () => {
  // The old dead filter state never came back — the library searches through
  // the shared kit (owner brief, 2026-10-16).
  assert.doesNotMatch(library, /LibrarySearchBar|searchQuery|setSearchQuery/);
  assert.match(library, /useStudySearch<LibrarySearchResults>/);
  assert.match(library, /const visibleEntries = built.entries/);
  assert.match(library, /useBranchedOpen\(tree\)/);
  assert.match(library, /resource.locked/);
});
