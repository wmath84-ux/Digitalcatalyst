import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');

test('master tagged desktop uses dedicated optimized filter panel with More topics dropdown', () => {
  assert.match(community, /isMasterTagMoreTopicsOpen/);
  assert.match(community, /renderMasterTagDesktopFilters/);
  assert.match(community, /More topics/);
  assert.match(community, /master-tag-more-topics-panel/);
  assert.match(community, /moreMasterTagTopics/);
  assert.match(community, /activeFilterCount/);
  assert.match(community, /Optimised buttons/);
});

test('master tagged desktop layout separates filter rail, results wall and right rail', () => {
  assert.match(community, /md:grid-cols-\[minmax\(19rem,22rem\)_minmax\(0,1fr\)\]/);
  assert.match(community, /xl:grid-cols-\[minmax\(19rem,22rem\)_minmax\(0,1fr\)_20rem\]/);
  assert.match(community, /Appreciation wall/);
  assert.match(community, /Browse appreciation posts/);
  assert.match(community, /Quick topic picks/);
  assert.match(community, /Use the More topics dropdown/);
});

test('mobile master tagged filter remains available separately', () => {
  assert.match(community, /const renderMasterTagFilters = \(compact = false\) => \(/);
  assert.match(community, /space-y-4 md:hidden/);
});
