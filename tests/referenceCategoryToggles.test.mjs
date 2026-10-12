import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
const require = createRequire(import.meta.url);
const read = p => fs.readFileSync(p, 'utf8');
const output = path.resolve('node_modules/.cache/category-toggle-tests.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
buildSync({ entryPoints: ['src/home/components/CategoryNav.tsx'], outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' }, external: ['react', 'react-dom', 'react/jsx-runtime'] });
const CategoryNav = require(output).default;

test('home native radios retain category selection and unique group names', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'); const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const picked = [];
  function Demo() {
    const [active, setActive] = React.useState('all');
    return React.createElement(CategoryNav, { categories: [{id:'all',label:'All',icon:''},{id:'video',label:'Video',icon:''}], activeCategory:active, onSelect:id=>{picked.push(id);setActive(id);} });
  }
  await React.act(async () => root.render(React.createElement(Demo)));
  const radios = [...document.querySelectorAll('input[type="radio"]')];
  assert.equal(radios.length, 2); assert.ok(radios[0].checked);
  await React.act(async () => radios[1].closest('label').click());
  assert.deepEqual(picked, ['video']); assert.ok(radios[1].checked); assert.ok(!radios[0].checked);
  assert.equal(radios[0].name, radios[1].name);
  assert.equal(document.querySelector('[role="radiogroup"]').getAttribute('aria-label'), 'Browse learning content by category');
  await React.act(async () => root.unmount()); dom.window.close();
});

test('home reference is horizontal, scoped and motion-accessible', () => {
  const css = read('src/home/components/category-radio.css'); postcss.parse(css);
  for(const value of ['curly-robin-81','flex-direction: row','width: 200px','min-height: 50px','border-radius: 25px','#2260ff','#b5bfd9',':focus-visible','overflow-x: auto','prefers-reduced-motion']) assert.ok(css.includes(value));
  assert.doesNotMatch(read('src/home/components/CategoryNav.tsx'), /GlassToggle/);
});

test('store uses connected reference segments without replacing real filter state', () => {
  const store = read('src/components/StorePage.tsx');
  assert.match(store, /checked=\{activeFilter.id === filter.id\}/);
  assert.match(store, /onChange=\{\(\) => setActiveFilterId\(filter.id\)\}/);
  assert.match(store, /productMatchesStoreFilter\(p, activeFilter\)/);
  assert.match(store, /name=\{filterGroupName\}/);
  assert.match(store, /onPointerDown=\{chipDrag.onPointerDown\}/);
  const css = read('src/components/store-filter-radio.css'); postcss.parse(css);
  for(const value of ['slimy-warthog-37','#dee7ff','#0043ed','#3e4963',':first-child',':last-child',':only-child',':focus-visible']) assert.ok(css.includes(value));
  assert.doesNotMatch(css, /(?:^|\n)(?:label span|:focus)\s*\{/);
});
