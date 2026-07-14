import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const mediaCompat = fs.readFileSync(new URL('../utils/mediaCompat.ts', import.meta.url), 'utf8');

test('GitHub blob product image URLs are normalized to raw renderable image URLs', () => {
  assert.match(mediaCompat, /isGitHubBlobImageUrl/);
  assert.match(mediaCompat, /normalizeGitHubRawImageUrl/);
  assert.match(mediaCompat, /raw\.githubusercontent\.com/);
  assert.match(mediaCompat, /if \(isGitHubBlobImageUrl\(trimmed\)\)/);
  assert.match(mediaCompat, /return Array\.from\(new Set\(\[rawUrl, trimmed\]\.map\(cleanUrl\)\.filter\(Boolean\)\)\)/);
});
