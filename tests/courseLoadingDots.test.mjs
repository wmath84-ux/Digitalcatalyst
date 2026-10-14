import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
const read = p => fs.readFileSync(p, 'utf8');
test('course loading uses the Nawsome book without changing readiness', () => {
  const app = read('src/CoursePlayerApp.tsx');
  assert.match(app, /<CourseBookLoader \/>/);
  assert.match(app, /data-course-player-loading\s+role="status"\s+aria-live="polite"/);
  assert.match(app, /const isReady = readinessStages.access && readinessStages.playback/);
  assert.doesNotMatch(app, /CourseLoadingDots|Object.entries\(readinessStages\)/);
  const component = read('src/course/CourseBookLoader.tsx');
  assert.match(component, /length: 6/);
  assert.match(component, /aria-hidden="true"/);
  assert.doesNotMatch(component, /fetch\(|https?:/);
});
test('book geometry, page turns, palette and reduced motion are scoped', () => {
  const css = read('src/course/course-book-loader.css');
  postcss.parse(css);
  for (const value of ['width: 200px', 'height: 140px', '--book-duration: 3s', '#23C4F8', '#275EFE', 'rotateY(180deg)', 'rotateY(0deg)', 'perspective: 600px', 'prefers-reduced-motion: reduce', 'animation: none']) assert.ok(css.includes(value), value);
  assert.match(css, /Nawsome.*MIT-licensed/);
  assert.doesNotMatch(css, /(?:^|\n)(?:ul|li|\.loader)\s*\{|@keyframes page\b/);
});
