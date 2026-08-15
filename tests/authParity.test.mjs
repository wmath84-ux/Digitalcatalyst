import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirebaseAuthErrorMessageFromCode, isBlockedUserStatus, mergePurchasedProductIds, normalizePurchaseIds, shouldRestoreEntitlementStatus } from '../utils/authParity.js';

test('desktop and mobile purchase id unlocks normalize and de-duplicate identically', () => {
  assert.deepEqual(mergePurchasedProductIds([1, '2', 2], ['3', 'bad'], [1]), [1, 2, 3]);
  assert.deepEqual(normalizePurchaseIds('not-an-array'), []);
});

test('purchase ids ignore blank, decimal, boolean, and non-positive values', () => {
  assert.deepEqual(normalizePurchaseIds([1, '  ', '2', '3.5', true, false, 0, -1]), [1, 2]);
  assert.deepEqual(mergePurchasedProductIds(['4', '  ', 4.8, false], [null, undefined, '5']), [4, 5]);
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


test('restored entitlement ids merge consistently for homepage unlocks', () => {
  const desktopCachedIds = [7, '8', 8, null, undefined];
  const mobileRestoredIds = ['8', '9', 'bad', 9];
  const profileIds = [7, 10, '10'];
  assert.deepEqual(mergePurchasedProductIds(desktopCachedIds, mobileRestoredIds, profileIds), [7, 8, 9, 10]);
});

test('google and password auth errors map through shared Firebase auth messages', () => {
  assert.equal(getFirebaseAuthErrorMessageFromCode({ code: 'auth/popup-closed-by-user' }), 'Google login was cancelled.');
  // Wording drifted ("already has an account" → "is already
  // registered") without the guarantee changing. What matters is that
  // the code maps to a message telling the user to log in or reset —
  // pin that, not the exact sentence, so copy edits are not breakages.
  const inUse = getFirebaseAuthErrorMessageFromCode({ code: 'auth/email-already-in-use' });
  assert.match(inUse, /already (registered|has an account)/i);
  assert.match(inUse, /login instead or use password reset/i);
  assert.match(getFirebaseAuthErrorMessageFromCode({ code: 'auth/wrong-password' }), /^Incorrect password\./);
});
