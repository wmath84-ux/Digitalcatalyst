import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/EduvoraCommunity.tsx', import.meta.url), 'utf8');

test('community popstate lets the app leave community at the root', () => {
  assert.match(source, /if \(state\.dcView !== 'community'\) return;/);
  const popstateBlock = source.slice(source.indexOf('const onCommunityPopState'), source.indexOf('const pushPage'));
  assert.doesNotMatch(popstateBlock, /window\.history\.pushState/);
});

test('community consumes nested browser back without deleting the previous app entry', () => {
  assert.match(source, /const writeCommunityHistory = \(\s*nextPage: CommunityPage,\s*mode: 'push' \| 'replace' = 'replace'/s);
  assert.match(source, /const historyMode: 'push' \| 'replace' = options\.fromBrowser \? 'push' : 'replace';/);
  assert.match(source, /writeCommunityHistory\('chat', historyMode, \[\]\);/);
  assert.match(source, /if \(options\.fromBrowser\) writeCommunityHistory\(pageRef\.current, 'push', pageStackRef\.current\);/);
});

test('community page pushes include a restorable community stack', () => {
  assert.match(source, /dcCommunityStack: cleanStack/);
  assert.match(source, /writeCommunityHistory\(nextPage, 'push', nextStack\);/);
  assert.match(source, /readCommunityHistoryStack\(state\.dcCommunityStack\)/);
});
