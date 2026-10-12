import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const mod = { exports: {} };
const source = fs.readFileSync('src/utils/storeShelves.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('exports', compiled)(mod.exports);
const { buildStoreShelves } = mod.exports;
for (const count of [0, 1, 4, 5, 8, 9, 12, 13, 25]) {
  test(`${count} products preserve order, ownership identities and never duplicate`, () => {
    const products = Array.from({ length: count }, (_, id) => ({ id }));
    const sections = buildStoreShelves(products);
    assert.deepEqual(sections.flatMap(s => [...s.gridProducts, ...s.railProducts]), products);
    for (const section of sections) {
      assert.ok(section.gridProducts.length <= 4);
      assert.ok(section.railProducts.length <= 4);
      if (section.railProducts.length) assert.equal(section.gridProducts.length, 4);
    }
    if (count <= 4) assert.ok(sections.every(s => !s.railProducts.length));
  });
}
test('PDP heart uses real wishlist state, with keyboard and reduced-motion support', () => {
  const pdp = fs.readFileSync('src/PdpApp.tsx', 'utf8');
  const css = fs.readFileSync('src/pdp-minimal.css', 'utf8');
  assert.match(pdp, /aria-pressed=\{favorite\} onClick=\{\(\) => onToggleFavorite\(product.id\)\}/);
  assert.match(pdp, /dc-pdp-like-button/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /html\[data-theme="light"\].*dc-pdp-like-button/);
});
