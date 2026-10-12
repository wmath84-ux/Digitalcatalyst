import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
import { brainCardTint, brainCardTextScale } from '../src/course/brainCardAppearance.ts';
const read = p => fs.readFileSync(p, 'utf8');
test('four visible question cards have distinct stable brand tints', () => {
  assert.equal(new Set([0, 1, 2, 3].map(brainCardTint)).size, 4);
  assert.equal(brainCardTint(1), brainCardTint(5));
  assert.equal(brainCardTint(NaN), brainCardTint(0));
  assert.match(read('src/course/BrainQuestionDeck.tsx'), /background: brainCardTint\(item.index\)/);
});
test('text reacts to both width and height while preserving a readable floor', () => {
  assert.equal(brainCardTextScale(0, 0), 1);
  assert.equal(brainCardTextScale(1200, 900), 1.25);
  assert.ok(brainCardTextScale(900, 230) < brainCardTextScale(900, 700));
  for (const w of [120, 220, 390, 720, 1200]) for (const h of [90, 180, 300, 700, 1400]) {
    const scale = brainCardTextScale(w, h);
    assert.ok(scale >= .85 && scale <= 1.25);
  }
});
test('long content has a bounded scroll area and expired card measurements do not squeeze the deck', () => {
  const deck = read('src/course/BrainQuestionDeck.tsx');
  assert.match(deck, /height: scrolls \? "100%" : undefined/);
  assert.match(deck, /items.slice\(0, VISIBLE\).reduce/);
  assert.match(deck, /const contentFloor = box.height/);
});
test('player and body-portalled overlays use shared tokens with no layout changes', () => {
  const css = read('src/course/courseBrandColors.css');
  for (const scope of ['.course-player-shell', '[data-course-theme-portal]', '[data-course-confirm-dialog]', '[data-mindmap-json-import]', '[data-experiment-self-composer]', '[data-self-mindmap-composer]']) assert.ok(css.includes(scope));
  for (const token of ['--dc-brand', '--dc-ink', '--dc-line', '--dc-brand-soft']) assert.ok(css.includes(token));
  postcss.parse(css).walkDecls(decl => assert.ok(decl.prop.startsWith('--') || ['color', 'background', 'background-color', 'border-color', 'outline-color'].includes(decl.prop), `Unexpected non-colour property ${decl.prop}`));
  for (const protectedContent of ['.course-rich-surface *', '.excalidraw *', '[data-course-lesson-content] *', '[data-course-strip-nav] *']) assert.ok(css.includes(protectedContent));
});
