import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dock = fs.readFileSync('src/components/glass-dock/GlassDock.tsx', 'utf8');
const css = fs.readFileSync('src/components/glass-dock/neutral-footer-glass.css', 'utf8');
test('one neutral material reaches every shared footer without the old vibrant lens', () => {
  assert.match(dock, /import '\.\/neutral-footer-glass.css'/);
  assert.match(dock, /data-neutral-glass=""/);
  assert.doesNotMatch(dock, /<GlassMaterial/);
  assert.match(css, /#e8e8e8 !important/);
  assert.match(css, /conic-gradient/);
  assert.match(css, /mask-composite: exclude/);
});
test('drag shine uses the original spring and does not replace scale or lift', () => {
  assert.match(dock, /const sheenPosition = useTransform\(waveScale/);
  assert.match(dock, /data-dock-glass-sheen style=\{\{ backgroundPosition: sheenPosition \}\}/);
  assert.match(dock, /const scale = useTransform\(\[waveScale, press\]/);
  assert.match(dock, /y: lift/);
  assert.match(css, /:active \[data-dock-glass-sheen\]/);
  assert.doesNotMatch(css, /transform:/);
});
test('glyphs are black unfilled outlines without blur; keyboard and reduced motion supported', () => {
  assert.match(css, /stroke: #000 !important; fill: none !important/);
  assert.match(css, /stroke-width: 2.5px/);
  assert.match(css, /filter: none !important/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
