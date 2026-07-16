import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const showcase = readFileSync('components/ProductShowcase.tsx', 'utf8');
const card = readFileSync('components/ProductCard.tsx', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

test('store search bar and tag chips use the polished marketplace shell', () => {
  assert.match(showcase, /store-search-field/);
  assert.match(showcase, /store-filter-chip-strip/);
  assert.match(showcase, /store-popular-chip-strip/);
  assert.match(showcase, /Search courses, notes, class, subject/);
  assert.match(showcase, /aria-pressed=\{activeFilter === filter\}/);
});

test('store product cards keep real product logic but use cleaner visual hierarchy', () => {
  assert.match(card, /product-card-shine/);
  assert.match(card, /bg-gradient-to-b from-white to-\[#F8FBFF\]/);
  assert.match(card, /rounded-2xl border border-\[#E6EEF9\]/);
  assert.match(card, /bg-gradient-to-r from-\[#1769FF\] to-\[#6D5CFF\]/);
});

test('store horizontal chip rails hide ugly scrollbars without disabling touch scroll', () => {
  assert.match(indexHtml, /\.store-filter-chip-strip/);
  assert.match(indexHtml, /scrollbar-width: none/);
  assert.match(indexHtml, /-webkit-overflow-scrolling: touch/);
});
