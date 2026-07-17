import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const reading = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');
const admin = fs.readFileSync('components/admin/NewsBlogManagement.tsx', 'utf8');
const automator = fs.readFileSync('utils/contentAutomator.ts', 'utf8');

test('admin can choose independent News and Blog generation quantities', () => {
  assert.match(admin, /AI_GENERATION_COUNT_OPTIONS = Array\.from\(\{ length: 11 \}/);
  assert.match(admin, /newsGenerationCount/);
  assert.match(admin, /blogGenerationCount/);
  assert.match(admin, /News to add/);
  assert.match(admin, /Blogs to add/);
  assert.match(admin, /newsCount: newsGenerationCount/);
  assert.match(admin, /blogCount: blogGenerationCount/);
  assert.match(admin, /disabled=\{isRunning \|\| totalGenerationCount === 0\}/);
});

test('AI generation uses small structured batches and never saves malformed JSON', () => {
  assert.match(automator, /GENERATION_BATCH_SIZE = 2/);
  assert.match(automator, /responseMimeType: 'application\/json'/);
  assert.match(automator, /responseSchema: buildContentResponseSchema\(type\)/);
  assert.match(automator, /maxOutputTokens: 8192/);
  assert.match(automator, /for \(let attempt = 1; attempt <= 2; attempt \+= 1\)/);
  assert.match(automator, /The batch was retried and no posts were changed/);
  assert.match(automator, /const generatedPosts = await generateEducationalContent\(counts\);/);
  assert.match(automator, /purgePolicy\.autoPurgeEnabled[\s\S]*purgeExpiredContent/);
  assert.match(automator, /DEFAULT_CONTENT_PURGE_POLICY[\s\S]*autoPurgeEnabled: false/);
  assert.doesNotMatch(automator, /Generate exactly 20 fresh/);
  assert.doesNotMatch(automator, /slice\(0, 10\)/);
});

test('generated posts receive topic-matched real image URLs built by code', () => {
  assert.match(automator, /imagePrompt\?: string/);
  assert.match(automator, /premiumImagePromptForPost/);
  assert.match(automator, /image\.pollinations\.ai\/prompt/);
  assert.match(automator, /seed=\$\{seed\}/);
  assert.match(automator, /no words/);
  assert.match(admin, /sourceType: 'url' as const/);
  assert.match(admin, /topic-matched image URLs/);
});

test('top Reading back is local detail-to-list while browser system back stays separate', () => {
  assert.match(reading, /view === 'article' \|\| view === 'announcement' \? onBackToList : onClose/);
  assert.match(reading, /Back to \$\{listType === 'news' \? 'News' : 'Blog'\}/);
  const handler = app.match(/const handleBackToReadingList = \(\) => \{[\s\S]*?\n  \};/)?.[0] || '';
  assert.match(handler, /setReadingDrawerView\(readingListType\)/);
  assert.match(handler, /dcReadingTopBack: true/);
  assert.doesNotMatch(handler, /window\.history\.back\(\)/);
  assert.match(app, /const onPopState = \(event: PopStateEvent\) =>/);
  assert.match(app, /window\.addEventListener\('popstate', onPopState\)/);
});
