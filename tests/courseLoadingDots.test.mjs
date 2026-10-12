import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
const read = p => fs.readFileSync(p, 'utf8');
test('course loading uses the reference dots without changing readiness', () => {
  const app = read('src/CoursePlayerApp.tsx');
  assert.match(app, /<CourseLoadingDots \/>/);
  assert.match(app, /data-course-player-loading\s+role="status"\s+aria-live="polite"/);
  assert.match(app, /const isReady = readinessStages.access && readinessStages.playback/);
  assert.doesNotMatch(app, /border-t-violet-500|animationDirection: 'reverse'/);
  const component = read('src/course/CourseLoadingDots.tsx');
  assert.match(component, /length: 5/);
  assert.match(component, /aria-hidden="true"/);
});
test('reference geometry, timing, palette and reduced-motion support are scoped', () => {
  const css = read('src/course/course-loading-dots.css');
  postcss.parse(css);
  for (const value of ['height: 20px', 'width: 20px', '1.5s infinite ease-in-out', '#b3d4fc', '#6793fb', 'scale(0.8)', 'scale(1.2)', 'animation-delay: -0.3s', 'animation-delay: -0.1s', 'animation-delay: 0.1s', 'prefers-reduced-motion: reduce', 'animation: none']) assert.ok(css.includes(value));
  assert.match(css, /adamgiebl/);
  assert.doesNotMatch(css, /(?:^|\n)\.dot\b|@keyframes pulse\b/);
});
