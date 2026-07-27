import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductPriceDetails, getProductPriceHistoryPoints } from '../utils/productPrice.js';

test('uses an explicit zero sale price as the current price', () => {
  const product = {
    price: '₹1999',
    salePrice: '₹0',
    priceHistory: [],
  };

  const details = getProductPriceDetails(product);

  assert.equal(details.currentPrice, 0);
  assert.equal(details.displayPriceText, '₹0');
  assert.equal(details.originalPrice, 1999);
});

test('falls back to the base price when no sale price is present', () => {
  const product = {
    price: '₹1499',
    salePrice: '',
    priceHistory: [],
  };

  const details = getProductPriceDetails(product);

  assert.equal(details.currentPrice, 1499);
  assert.equal(details.displayPriceText, '₹1499');
});

test('builds chart points from the original and current price when history is missing', () => {
  const product = {
    price: '₹1000',
    salePrice: '₹800',
    priceHistory: [],
  };

  const points = getProductPriceHistoryPoints(product);

  assert.deepEqual(points.map(point => point.price), [1000, 800]);
  assert.equal(points[0].label, 'Original');
  assert.equal(points[1].label, 'Current');
});
