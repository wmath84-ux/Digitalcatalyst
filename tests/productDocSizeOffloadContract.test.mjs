import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  EMBEDDED_DATA_URL_OFFLOAD_MIN_BYTES,
  FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES,
  PRODUCT_DOC_SAVE_BUDGET_BYTES,
  buildDataUrlOffloadPlan,
  buildOffloadStoragePath,
  collectEmbeddedDataUrls,
  describeOversizeProductDocument,
  estimateFirestoreDocumentBytes,
  getLargestLeafFields,
  isDataUrl,
  parseDataUrl,
} from '../utils/productFirestoreDoc.js';
import { describeAdminProductWriteError } from '../utils/adminFirestoreGuard.js';

const appSource = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

const makeBase64DataUrl = (mime, payloadBytes) =>
  `data:${mime};base64,${'A'.repeat(Math.ceil((payloadBytes * 4) / 3))}`;

// --- Unit: data URL detection ----------------------------------------------

test('data URL parsing recognizes base64 media and estimates decoded bytes', () => {
  const parsed = parseDataUrl(makeBase64DataUrl('image/jpeg', 3000));
  assert.equal(parsed.mime, 'image/jpeg');
  assert.equal(parsed.isBase64, true);
  assert.ok(Math.abs(parsed.bytes - 3000) <= 2, `expected ~3000 bytes, got ${parsed.bytes}`);
  assert.equal(isDataUrl('data:image/jpeg;base64,QUJD'), true);
  assert.equal(isDataUrl('https://example.com/a.jpg'), false);
  assert.equal(isDataUrl(null), false);
});

test('collector finds nested data URLs and ignores small placeholders and https URLs', () => {
  const product = {
    title: 'Notes',
    images: ['https://cdn.example.com/cover.jpg', makeBase64DataUrl('image/png', 120 * 1024)],
    courseContent: [
      { modules: [{ files: [{ name: 'pin', url: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E' }, { name: 'sheet', url: makeBase64DataUrl('image/jpeg', 80 * 1024) }] }] },
    ],
  };
  const all = collectEmbeddedDataUrls(product, 0);
  assert.equal(all.length, 3);
  const largeOnly = collectEmbeddedDataUrls(product, EMBEDDED_DATA_URL_OFFLOAD_MIN_BYTES);
  assert.equal(largeOnly.length, 2);
  assert.deepEqual(largeOnly[0].path, ['.images', '[1]']);
  assert.equal(largeOnly[1].mime, 'image/jpeg');
});

// --- Unit: size estimation --------------------------------------------------

test('document size estimator scales with content and stays within sane bounds', () => {
  const small = estimateFirestoreDocumentBytes({ title: 'x', price: 99, tags: ['a', 'b'] });
  assert.ok(small > 10 && small < 1024, `small doc estimate ${small}`);
  const big = estimateFirestoreDocumentBytes({ blob: 'x'.repeat(500 * 1024) });
  assert.ok(big > 500 * 1024, `big doc estimate ${big}`);
  assert.equal(typeof PRODUCT_DOC_SAVE_BUDGET_BYTES, 'number');
  assert.ok(PRODUCT_DOC_SAVE_BUDGET_BYTES < FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES);
});

test('offload plan removes payloads largest-first until the document fits the budget', () => {
  const product = {
    title: 'Notes',
    coverText: 'y'.repeat(120 * 1024),
    images: [makeBase64DataUrl('image/jpeg', 600 * 1024)],
    file: { url: makeBase64DataUrl('audio/mpeg', 300 * 1024) },
  };
  const estimate = estimateFirestoreDocumentBytes(product);
  assert.ok(estimate > PRODUCT_DOC_SAVE_BUDGET_BYTES, 'fixture must exceed budget');
  const plan = buildDataUrlOffloadPlan(product);
  assert.ok(plan.planned.length >= 1, 'plan must offload at least the biggest payload');
  const after = estimateFirestoreDocumentBytes({ title: product.title, coverText: product.coverText, images: ['https://x'], file: { url: 'https://y' } });
  assert.ok(after <= PRODUCT_DOC_SAVE_BUDGET_BYTES, 'document must fit after planned offloads');
  // The 600KB image is the dominant payload and must be part of the plan.
  assert.ok(plan.planned.some((entry) => entry.path.join('') === '.images[0]'));
});

test('offload storage paths stay inside the admin-only Storage rule scopes', () => {
  assert.equal(
    buildOffloadStoragePath({ mime: 'image/png', productId: 42, index: 0 }).startsWith('adminProductImages/42/embedded/'),
    true
  );
  assert.equal(buildOffloadStoragePath({ mime: 'audio/mpeg', productId: 42, index: 1 }).startsWith('adminProductContent/audio/42/'), true);
  assert.equal(buildOffloadStoragePath({ mime: 'video/mp4', productId: 42, index: 2 }).startsWith('adminProductContent/video/42/'), true);
  assert.equal(buildOffloadStoragePath({ mime: 'application/pdf', productId: 42, index: 3 }).startsWith('adminProductContent/pdf/42/'), true);
  assert.equal(buildOffloadStoragePath({ mime: 'application/zip', productId: 42, index: 4 }).startsWith('adminProductContent/ebook/42/'), true);
});

test('oversize descriptor names the largest fields for genuinely too-big text products', () => {
  const fits = describeOversizeProductDocument({ title: 'small' });
  assert.equal(fits, null);
  const monster = { body: 'z'.repeat(900 * 1024), other: 'q'.repeat(500 * 1024) };
  const message = describeOversizeProductDocument(monster);
  assert.ok(message, 'expected an oversize message');
  assert.match(message, /PRODUCT_DOC_TOO_LARGE/);
  assert.match(message, /body/);
});

// --- Unit: error descriptor handles the real production failure -------------

test('invalid-argument oversize Firebase error becomes an actionable message', () => {
  const err = Object.assign(
    new Error("Document 'projects/my-website-761e9/databases/(default)/documents/siteProducts/1782545401609' cannot be written because its size (1,234,076 bytes) exceeds the maximum allowed size of 1,048,576 bytes."),
    { code: 'invalid-argument' }
  );
  const message = describeAdminProductWriteError(err, 'update', { uid: 'uid-9', email: 'wmath84@gmail.com', role: 'admin' });
  assert.match(message, /too large for a single Firestore document/);
  assert.match(message, /1,234,076 bytes/);
  assert.match(message, /offloads embedded images\/files to Firebase Storage/);
  assert.doesNotMatch(message, /permission/i);
});

test('PRODUCT_DOC_TOO_LARGE guard errors are surfaced verbatim', () => {
  const err = new Error('PRODUCT_DOC_TOO_LARGE: This product document is about 1.40 MB, above Firestore\'s 1 MiB per-document limit.');
  assert.equal(describeAdminProductWriteError(err, 'update'), err.message);
});

// --- Contract: save path actually runs offload + guard before setDoc --------

test('publishProductToFirebase offloads embedded media and guards size before setDoc', () => {
  const body = appSource.match(/const publishProductToFirebase[\s\S]*?return \{ product: publishableProduct, diagnostics \};\n  \};/);
  assert.ok(body, 'publishProductToFirebase body not found');
  assert.match(body[0], /offloadProductEmbeddedData\(normalizedProduct, String\(normalizedProduct\.id\)\)/);
  assert.match(body[0], /describeOversizeProductDocument\(payload\)/);
  assert.ok(body[0].indexOf('offloadProductEmbeddedData') < body[0].indexOf('await setDoc('), 'offload must run before setDoc');
  assert.ok(body[0].indexOf('describeOversizeProductDocument') < body[0].indexOf('await setDoc('), 'size guard must run before setDoc');
  assert.match(appSource, /ADMIN_PRODUCT_EMBEDDED_MEDIA_OFFLOADED/);
});

test('firebase-dependent offload stays import-safe for Node tests (lazy dynamic imports)', () => {
  const moduleSource = fs.readFileSync(new URL('../utils/productFirestoreDoc.js', import.meta.url), 'utf8');
  assert.doesNotMatch(moduleSource, /^import .* from 'firebase/m);
  assert.match(moduleSource, /import\('\.\.\/firebase\.ts'\)/);
  assert.match(moduleSource, /import\('firebase\/storage'\)/);
});
