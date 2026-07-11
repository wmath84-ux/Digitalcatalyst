import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../components/EduvoraCommunity.tsx', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const uploader = fs.readFileSync(new URL('../components/common/PremiumImageUrlInput.tsx', import.meta.url), 'utf8');
const cloudinaryUpload = fs.readFileSync(new URL('../utils/cloudinaryUpload.ts', import.meta.url), 'utf8');
const aiMentor = fs.readFileSync(new URL('../components/CommunityAiMentor.tsx', import.meta.url), 'utf8');
const coursePlayer = fs.readFileSync(new URL('../components/CoursePlayer.tsx', import.meta.url), 'utf8');

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

test('mobile story tray separates Add story and shows newest own story groups', () => {
  assert.match(component, /community-instagram-story-avatar is-add/);
  assert.match(component, /const visibleGroups = storyGroups\.slice\(0, 12\)/);
  assert.match(component, /ownGroup \? 'Your story'/);
  assert.doesNotMatch(component, /storyGroups\.filter\(\(group\) => !isOwnCommunityId/);
  assert.match(component, /if \(right\.latestAt !== left\.latestAt\) return right\.latestAt - left\.latestAt/);
});

test('profile post detail owns one scroll area with locked header and composer', () => {
  assert.match(component, /community-profile-post-detail-page/);
  assert.match(component, /community-profile-post-detail-scroll/);
  assert.match(component, /community-profile-post-detail-composer/);
  assert.match(component, /community-profile-post-detail mx-auto flex h-full max-h-full min-h-0/);
  assert.match(component, /profileReplyInputRef/);
});

test('text stories support formatted collapse and status-scoped replies', () => {
  assert.match(component, /expandedStatusTextId/);
  assert.match(component, /buildStatusTextBlocks/);
  assert.match(component, /'Read more'/);
  assert.match(component, /statusReplyComposerId/);
  assert.match(component, /submitStatusDiscussion/);
  assert.match(component, /discussionReplies/);
  assert.match(component, /STATUS_REPLY_EMOJIS/);
  assert.match(component, /targetPage: 'statusReel'/);
  assert.match(component, /Story discussion/);
});


test('legacy status grids are unreachable and profile text detail renders once in white', () => {
  assert.doesNotMatch(component, /statusMine/);
  assert.doesNotMatch(component, /statusCards\.map\(renderStatusTile\)/);
  assert.doesNotMatch(component, /myStatuses\.map\(renderStatusTile\)/);
  assert.match(component, /if \(page === 'chat' && activeView === 'status'\) setActiveView\('feed'\)/);
  assert.match(component, /community-profile-text-detail/);
  assert.match(component, /const hasVisualPost = Boolean/);
  assert.match(component, /type === 'text' \? \(/);
  assert.doesNotMatch(component, /Text post<\/span><h2[^]*bg-\[#111\]/);
});

test('shared inbox counts and mobile nested notifications are wired', () => {
  assert.match(component, /sharedItemCount\?: number/);
  assert.match(component, /setSharedItemCounts/);
  assert.match(component, /sharedCount\} shared/);
  assert.match(component, /type: 'share'/);
  assert.match(component, /targetPage: 'directChatThread'/);
  assert.match(component, /'notifications'/);
  assert.match(component, /const renderNotificationPage/);
  assert.match(component, /pushPage\('notifications'\)/);
  assert.match(component, /const allNotifications = useMemo/);
  assert.match(component, /allNotifications\.filter\(\(notification\) => !notification\.read\)\.length/);
  assert.match(component, /community-header-search-button[^]*<svg/);
  assert.match(component, /community-header-inbox-button[^]*<svg/);
  assert.match(rules, /'follow', 'share'/);
  assert.match(rules, /'sharedItemCount'/);
});


test('compact image uploader supports HEIC and auto-fills parent URL without internal preview', () => {
  assert.match(uploader, /IMAGE_FILE_ACCEPT = 'image\/\*,\.heic,\.heif,image\/heic,image\/heif'/);
  assert.match(uploader, /onChange\(hostedUrl\)/);
  assert.match(uploader, /Upload image/);
  assert.match(uploader, /Use URL/);
  assert.doesNotMatch(uploader, /Your image preview appears here/);
  assert.match(cloudinaryUpload, /HEIC_IMAGE_EXTENSIONS/);
  assert.match(cloudinaryUpload, /isHeicImageFile/);
  assert.match(cloudinaryUpload, /f_auto,q_auto/);
});

test('profile detail bottom gap, AI overlay and course icon contrast are optimized', () => {
  assert.match(component, /community-mobile-latest \.eduvora-community-main\.community-profile-post-detail-page/);
  assert.match(component, /padding-bottom: max\(env\(safe-area-inset-bottom\), 0\.35rem\)/);
  assert.match(aiMentor, /bg-white\/10/);
  assert.match(aiMentor, /bg-\[#F2F5F9\]/);
  assert.doesNotMatch(aiMentor, /bg-\[#081A45\]\/24/);
  assert.match(coursePlayer, /course-panel-icon-contrast/);
  assert.match(coursePlayer, /linear-gradient\(135deg, #4F46E5 0%, #7C3AED 100%\)/);
});
