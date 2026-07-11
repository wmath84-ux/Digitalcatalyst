import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../components/EduvoraCommunity.tsx', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

test('community inbox is restricted to shared posts and stories', () => {
  assert.match(component, /Only Community posts and stories can be shared/);
  assert.match(component, /type: 'shared_item'/);
  assert.doesNotMatch(component, /Add optional caption/);
  assert.match(rules, /request\.resource\.data\.type == 'shared_item'/);
  assert.match(rules, /allow update: if false/);
});

test('sender delete-for-everyone is limited to 30 minutes', () => {
  assert.match(component, /PRIVATE_SHARE_DELETE_WINDOW_MS = 30 \* 60 \* 1000/);
  assert.match(rules, /resource\.data\.senderId == request\.auth\.uid/);
  assert.match(rules, /duration\.value\(30, 'm'\)/);
});

test('post detail stays separate from the dedicated comments page', () => {
  assert.match(component, /page === 'thread'.*renderMessageDetails/s);
  assert.match(component, /page === 'comments'.*renderCommentsPage/s);
  assert.match(component, /const openComments = \(messageId: number\)/);
});


test('share conversations are exactly two-party and participant maps cannot grant extra readers', () => {
  assert.match(rules, /participants\.size\(\) == 2/);
  assert.match(rules, /participantMap\.keys\(\)\.hasOnly\(request\.resource\.data\.participants\)/);
  assert.match(rules, /participantMap\[request\.resource\.data\.participants\[0\]\] == true/);
  assert.match(rules, /participantMap\[request\.resource\.data\.participants\[1\]\] == true/);
});

test('mobile search, grouped stories, text truncation and stable like handling are wired', () => {
  assert.match(component, /limit\(500\)/);
  assert.match(component, /const storyGroups = useMemo/);
  assert.match(component, /community-feed-plain-text/);
  assert.match(component, /community-feed-image-caption/);
  assert.match(component, /restoreFeedScrollAfterInteraction/);
});


test('status reel order stays stable and profile previews use non-overlay captions', () => {
  assert.match(component, /statusReelOrderIdsRef/);
  assert.match(component, /prepareStatusReelOrder/);
  assert.match(component, /statusReelScrollFrameRef/);
  assert.doesNotMatch(component, /const reelStatuses = \[\.\.\.orderedStoryStatuses\.slice\(selectedIndex\)/);
  assert.match(component, /community-story-poll-card/);
  assert.match(component, /community-instagram-story-avatar .*has-story/);
  assert.match(component, /community-profile-post-footer/);
  assert.match(component, /community-profile-post-detail/);
});
