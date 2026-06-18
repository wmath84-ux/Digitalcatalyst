import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirebaseAuthErrorMessageFromCode, isBlockedUserStatus, mergePurchasedProductIds, normalizePurchaseIds, shouldRestoreEntitlementStatus } from '../utils/authParity.js';

test('desktop and mobile purchase id unlocks normalize and de-duplicate identically', () => {
  assert.deepEqual(mergePurchasedProductIds([1, '2', 2], ['3', 'bad'], [1]), [1, 2, 3]);
  assert.deepEqual(normalizePurchaseIds('not-an-array'), []);
});

test('entitlement restore accepts only desktop-valid unlocked statuses', () => {
  assert.equal(shouldRestoreEntitlementStatus('Completed'), true);
  assert.equal(shouldRestoreEntitlementStatus('Verified'), true);
  assert.equal(shouldRestoreEntitlementStatus('Active'), true);
  assert.equal(shouldRestoreEntitlementStatus('Failed'), false);
  assert.equal(shouldRestoreEntitlementStatus('Cancelled'), false);
  assert.equal(shouldRestoreEntitlementStatus(undefined), false);
});

test('login failure and locked account rules are shared', () => {
  assert.equal(isBlockedUserStatus('blocked'), true);
  assert.equal(isBlockedUserStatus('active'), false);
  assert.equal(getFirebaseAuthErrorMessageFromCode({ code: 'auth/invalid-credential' }), 'Invalid email or password. Please check your details.');
  assert.equal(getFirebaseAuthErrorMessageFromCode({ message: 'Firebase: Error (auth/too-many-requests).' }), 'Too many attempts. Please wait and try again.');
});
