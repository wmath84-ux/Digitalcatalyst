import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');

test('master tagged desktop uses a minimal clean toolbar with dropdown filters', () => {
  assert.match(community, /master-tag-desktop-clean-toolbar/);
  assert.match(community, /aria-label="Filter master tagged audience"/);
  assert.match(community, /aria-label="Filter master tagged topic"/);
  assert.match(community, /aria-label="Sort master tagged posts"/);
  assert.match(community, /masterTagCategories\.map\(\(category\) => <option/);
  assert.match(community, /Clean appreciation board/);
  assert.match(community, /dropdown filters/);
});

test('master tagged desktop layout is simplified without the old heavy side rails', () => {
  assert.match(community, /master-tag-desktop-minimal-shell/);
  assert.match(community, /hidden md:block/);
  assert.match(community, /mt-5 grid gap-4 xl:grid-cols-2/);
  assert.doesNotMatch(community, /Community favourites/);
  assert.doesNotMatch(community, /Quick topic picks/);
  assert.doesNotMatch(community, /Optimised buttons/);
  assert.doesNotMatch(community, /master-tag-more-topics-panel/);
});

test('mobile master tagged filter remains available separately', () => {
  assert.match(community, /const renderMasterTagFilters = \(compact = false\) => \(/);
  assert.match(community, /space-y-4 md:hidden/);
});
