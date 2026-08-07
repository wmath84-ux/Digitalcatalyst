import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const latestNews = fs.readFileSync('components/LatestNews.tsx', 'utf8');
const reading = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');
const header = fs.readFileSync('components/Header.tsx', 'utf8');
const notificationCenter = fs.readFileSync('components/SiteNotificationCenter.tsx', 'utf8');
const notificationUtility = fs.readFileSync('utils/siteNotifications.ts', 'utf8');
const googleAd = fs.readFileSync('components/GoogleAd.tsx', 'utf8');
const serviceWorker = fs.readFileSync('public/sw.js', 'utf8');

test('desktop Home combines News and Blog and caps the section at six real cards', () => {
  assert.match(latestNews, /article\.type === 'news' \|\| article\.type === 'blog'/);
  assert.match(latestNews, /\.sort\(\(left, right\) =>/);
  assert.match(latestNews, /\.slice\(0, 6\)/);
  assert.match(latestNews, /Latest News and Blog|News and Blog|News & Blog/);
  assert.match(latestNews, /onOpenHub\('news'\)/);
  assert.match(latestNews, /onOpenHub\('blog'\)/);
  assert.match(app, /articles=\{websiteSettings\.content\.newsArticles\}/);
  assert.match(app, /onOpenHub=\{openReadingHub\}/);
  assert.doesNotMatch(app, /articles=\{websiteSettings\.content\.newsArticles\.filter\(article => article\.type === 'news'\)\}/);
});

test('Home reading cards use the public website card radius instead of random responsive rounding', () => {
  assert.match(latestNews, /borderRadius: 'var\(--eduvora-card-radius, 22px\)'/);
  assert.doesNotMatch(latestNews, /latest-news-mobile-card[^\n]*rounded-\[1\.25rem\]/);
  assert.doesNotMatch(latestNews, /latest-news-mobile-card[^\n]*sm:rounded-2xl/);
});

test('Reading uses the configured AdSense component at safe article positions', () => {
  assert.match(googleAd, /ca-pub-7301571867236257/);
  assert.match(googleAd, /data-ad-slot/);
  assert.match(googleAd, /pagead2\.googlesyndication\.com/);
  assert.match(reading, /variant="display"[\s\S]*pageType="article"/);
  assert.match(reading, /includeInArticleAd/);
  assert.match(reading, /variant="multiplex"/);
  assert.match(reading, /visibleWordCount=\{selectedArticleWordCount\}/);
  assert.match(reading, /disabled=\{selectedArticleAdDisabled\}/);
});

test('notification UX covers content, courses, unlocks and Community without historical flooding', () => {
  assert.match(notificationUtility, /ContentNotificationInventory/);
  assert.match(notificationUtility, /New free product available/);
  assert.match(notificationUtility, /New News update/);
  assert.match(notificationUtility, /New Blog published/);
  assert.match(notificationUtility, /Your course has new content/);
  assert.match(notificationUtility, /Product unlocked/);
  assert.match(notificationUtility, /New story from someone you follow/);
  assert.match(notificationUtility, /New post from someone you follow/);
  assert.match(notificationUtility, /New post reaction/);
  assert.match(notificationUtility, /if \(!previous\) return/);
  assert.match(app, /community_notifications/);
  assert.match(app, /community_follows/);
  assert.match(app, /community_feed/);
  assert.match(app, /community_status/);
  assert.match(app, /recipientId/);
  assert.match(header, /BellIcon/);
  assert.match(header, /notificationCount > 99 \? '99\+'/);
  assert.match(notificationCenter, /Mark all read/);
  assert.match(notificationCenter, /Notification preferences/);
  assert.match(notificationCenter, /permission is requested only from this button/i);
  assert.match(notificationCenter, /real background push notifications/i);
});

test('browser notification permission is contextual and service worker clicks return to the app', () => {
  assert.match(app, /requestBrowserSiteNotifications/);
  assert.match(app, /window\.Notification\.requestPermission\(\)/);
  assert.match(app, /document\.visibilityState === 'visible' && document\.hasFocus\(\)/);
  assert.match(app, /registration\.showNotification/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /site-notification-open/);
  assert.match(serviceWorker, /siteNotification=/);
  assert.match(app, /url\.searchParams\.get\('siteNotification'\)/);
  assert.match(serviceWorker, /addEventListener\(['"]push['"]/);
});

test('Reading list scroll is restored after article Back for explicit and system navigation', () => {
  assert.match(reading, /listScrollPositionsRef/);
  assert.match(reading, /previousView === 'article' \|\| previousView === 'announcement'/);
  assert.match(reading, /behavior: 'auto'/);
  assert.match(reading, /handleSelectArticleFromList/);
  assert.match(reading, /handleSelectAnnouncementFromList/);
  assert.match(reading, /listScrollPositionsRef\.current\[view\] = el\.scrollTop/);
  assert.doesNotMatch(reading, /scrollRef\.current\?\.scrollTo\(\{ top: 0 \}\);/);
  assert.match(app, /dcReadingTopBack: true/);
  assert.match(app, /const onPopState = \(event: PopStateEvent\) =>/);
});

test('mobile Reading header has a stable compact frame and desktop typography remains responsive', () => {
  assert.match(reading, /reading-drawer-header/);
  assert.match(reading, /height: 4\.5rem; min-height: 4\.5rem; max-height: 4\.5rem/);
  assert.match(reading, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(reading, /className="sm:hidden">←/);
  assert.match(reading, /className="hidden sm:inline"/);
  assert.match(reading, /sm:h-auto sm:min-h-0 sm:max-h-none/);
});
