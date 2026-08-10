import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

test('verified admin identity is centralized across profile, feed, and stories', () => {
  assert.match(community, /VERIFIED_ADMIN_EMAIL = 'wmath84@gmail\.com'/);
  assert.match(community, /isCurrentAdminIdentity/);
  assert.match(community, /isOfficialAdminMessage/);
  assert.match(community, /isOfficialAdminStatus/);
  assert.match(community, /authorEmail/);
  assert.match(community, /owner\.verified \? <BlueVerifiedTick/);
  assert.match(rules, /communityVerificationAllowedOnCreate/);
  assert.match(rules, /communityVerificationUnchangedOnUpdate/);
});

test('status hub supports feed-equivalent filters and contextual empty states', () => {
  assert.match(community, /const \[statusFilter, setStatusFilter\]/);
  assert.match(community, /statusFilterOptions/);
  assert.match(community, /filteredStatusCards/);
  assert.match(community, /No stories are posted by people you follow/);
  assert.match(community, /No stories are posted by your followers/);
  assert.match(community, /No stories are posted by the verified admin/);
  assert.match(community, /activeView === 'status' && renderStatusHub\(\)/);
});

test('profile cards remove post-type badges and story text can expand', () => {
  assert.doesNotMatch(community, /absolute left-2\.5 top-2\.5 rounded-full bg-black\/72/);
  assert.doesNotMatch(community, /w-max rounded-full bg-white px-2\.5 py-1 text-\[9px\].*>Poll<\/span>/);
  assert.doesNotMatch(community, /\{story\.type\} story/);
  assert.match(community, /aria-expanded=\{expandedStatusTextId === card\.id\}/);
  assert.match(community, /max-h-\[42dvh\]/);
});

test('desktop sidebar detached trigger placement contract is preserved', () => {
  assert.match(app, /detachedTriggerPlacement="top-left"/);
});
