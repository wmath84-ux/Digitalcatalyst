import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const courseSource = readFileSync(new URL('../components/CoursePlayer.tsx', import.meta.url), 'utf8');
const mentorSource = readFileSync(new URL('../components/AiMentor.tsx', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../utils/subscriptionAccess.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../components/admin/WebsiteSettings.tsx', import.meta.url), 'utf8');
const subscriptionSource = readFileSync(new URL('../components/SubscriptionPage.tsx', import.meta.url), 'utf8');

const inlineStyleBlock = (() => {
  const match = courseSource.match(/<style>\{`([^`]*)`\}<\/style>/);
  return match ? match[1] : '';
})();

test('docs flip: incoming page stays parked during the drag and animates only after release', () => {
  assert.match(courseSource, /parkedIncomingTransform/);
  assert.match(courseSource, /const incomingTransform = isPageFlipped/);
  assert.ok(!/swipeProgress/.test(courseSource), 'live progress-based preview animation must be gone');
});

test('docs flip: swap commit suppresses transitions so the flipped page never re-animates back', () => {
  assert.match(courseSource, /isFlipSettling/);
  assert.match(courseSource, /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(\(\) => setIsFlipSettling\(false\)\)/);
  assert.match(courseSource, /dragOffset \|\| isFlipSettling \? 'none'/);
});

test('docs page renders without box shadows', () => {
  assert.ok(!courseSource.includes('open-docs-page-flipped'), 'flipped box-shadow class must be removed');
  assert.ok(!/paper-shell[^`]*shadow-\[/.test(courseSource), 'paper shell shadow classes must be removed');
  assert.ok(!inlineStyleBlock.includes('drop-shadow('), 'corner fold drop-shadow must be removed');
  assert.ok(!inlineStyleBlock.includes('*::after') && !inlineStyleBlock.includes('shell::after'), 'radial page shadow pseudo-element must be removed');
});

test('ruled guide lines are anchored to the text page with a 32px period', () => {
  assert.match(courseSource, /ruledLinesStyle/);
  assert.match(courseSource, /backgroundAttachment: 'local'/);
  assert.match(courseSource, /transparent 31px, rgba\(125, 184, 230, 0\.5\) 31px, rgba\(125, 184, 230, 0\.5\) 32px/);
  assert.ok(!/paperBackground = hasRuledLines/.test(courseSource), 'paper shell must no longer carry the ruled gradient');
});

test('AI mentor receives the full course knowledge base and a strict module scope', () => {
  assert.match(courseSource, /collectCourseKnowledgeItems/);
  assert.match(courseSource, /courseItems=\{courseKnowledgeItems\}/);
  assert.match(mentorSource, /buildCoursePromptContext/);
  assert.match(mentorSource, /STRICT MODULE MODE/);
  assert.match(mentorSource, /Web reference:/);
  assert.match(mentorSource, /googleSearch: \{\}/);
  assert.match(mentorSource, /buildStarterPrompts\(mentorItems, 10\)/);
  assert.match(mentorSource, /ai-mentor-module-picker/);
  assert.match(mentorSource, /ai-mentor-starter-prompts/);
});

test('admin store config exposes per-feature subscription price editing', () => {
  assert.match(accessSource, /export const normalizeSubscriptionFeatures = /);
  assert.match(settingsSource, /updateSubscriptionFeature/);
  assert.match(settingsSource, /subscription-feature-pricing/);
  assert.match(settingsSource, /Feature-wise Pricing/);
  assert.match(subscriptionSource, /normalizeSubscriptionFeatures\(\(settings\.content as any\)\.subscriptionFeatures\)/);
  assert.ok(!/SUBSCRIPTION_FEATURES\.map/.test(subscriptionSource), 'subscription page must use settings-driven features');
  assert.match(appSource, /subscriptionFeatures: normalizeSubscriptionFeatures/);
});

test('bundle totals honour admin-customized feature prices', () => {
  assert.match(accessSource, /getFeatureBundleMonthlyTotal = \(featureKeys: SubscriptionFeatureKey\[\], bundleMonthly = SUBSCRIPTION_FEATURE_BUNDLE_MONTHLY, features: SubscriptionFeature\[\] = SUBSCRIPTION_FEATURES\)/);
  assert.match(accessSource, /getFeatureBundleCycleTotal = \(featureKeys: SubscriptionFeatureKey\[\], billingCycle: SubscriptionBillingCycle, bundleMonthly\?: number, features\?: SubscriptionFeature\[\]\)/);
});
