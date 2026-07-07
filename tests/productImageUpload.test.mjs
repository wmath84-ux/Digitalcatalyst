import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_IMAGE_UPLOAD_MAX_BYTES, validateProductImageUpload } from '../utils/productImageUpload.js';

test('accepts supported product images within the size limit', () => {
  const file = new File(['ok'], 'cover.png', { type: 'image/png' });
  assert.deepEqual(validateProductImageUpload(file), { valid: true });
});

test('rejects unsupported or oversized product images with a helpful message', () => {
  const invalidType = new File(['ok'], 'cover.txt', { type: 'text/plain' });
  assert.deepEqual(validateProductImageUpload(invalidType), {
    valid: false,
    error: 'Please choose a valid image file (PNG, JPG, JPEG, GIF, WEBP, or SVG).',
  });

  const oversized = new File([new Uint8Array(PRODUCT_IMAGE_UPLOAD_MAX_BYTES + 1)], 'cover.png', { type: 'image/png' });
  assert.deepEqual(validateProductImageUpload(oversized), {
    valid: false,
    error: `Product image is too large. Max allowed size is ${Math.round(PRODUCT_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`,
  });
});
