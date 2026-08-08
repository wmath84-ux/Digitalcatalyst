import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PRIMARY_ADMIN_EMAIL,
  describeAdminProductWriteError,
  describeFirebaseError,
  isAdminRoleValue,
  isPrimaryAdminEmailAddress,
  normalizeAdminEmail,
} from '../utils/adminFirestoreGuard.js';

const appSource = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const firestoreRules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = fs.readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const firebaseJson = JSON.parse(fs.readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const firebaseRc = JSON.parse(fs.readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// --- Unit: pure helpers ---------------------------------------------------

test('primary admin email helpers match the primary admin account exactly and case-insensitively', () => {
  assert.equal(PRIMARY_ADMIN_EMAIL, 'wmath84@gmail.com');
  assert.equal(isPrimaryAdminEmailAddress('wmath84@gmail.com'), true);
  assert.equal(isPrimaryAdminEmailAddress('  WMath84@Gmail.COM '), true);
  assert.equal(isPrimaryAdminEmailAddress('other@gmail.com'), false);
  assert.equal(isPrimaryAdminEmailAddress(null), false);
  assert.equal(normalizeAdminEmail('  X@Y.Z '), 'x@y.z');
});

test('admin role values are exactly admin or super_admin', () => {
  assert.equal(isAdminRoleValue('admin'), true);
  assert.equal(isAdminRoleValue('super_admin'), true);
  assert.equal(isAdminRoleValue('user'), false);
  assert.equal(isAdminRoleValue('Admin'), false);
  assert.equal(isAdminRoleValue(null), false);
  assert.equal(isAdminRoleValue(undefined), false);
});

test('describeFirebaseError keeps the exact Firebase error code and message', () => {
  const err = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  assert.equal(describeFirebaseError(err), '[permission-denied] Missing or insufficient permissions.');
  assert.equal(describeFirebaseError('plain failure'), 'plain failure');
});

test('permission-denied product write errors surface the real error and the deployed-rules action', () => {
  const err = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const message = describeAdminProductWriteError(err, 'update', { uid: 'uid-1', email: 'wmath84@gmail.com', role: 'admin' });
  assert.match(message, /Firestore security rules rejected the product update/);
  assert.match(message, /permission-denied/);
  assert.match(message, /Missing or insufficient permissions/);
  assert.match(message, /uid-1/);
  assert.match(message, /firebase deploy --only firestore:rules,storage/);
  assert.doesNotMatch(message, /Firebase problem occurred/i);
});

test('pre-flight guard failures are surfaced verbatim instead of masked', () => {
  const err = new Error('ADMIN_WRITE_NOT_AUTHENTICATED: Firebase Auth has no signed-in user at write time.');
  assert.equal(describeAdminProductWriteError(err, 'update'), err.message);
});

test('unknown product write failures still include the raw Firebase error', () => {
  const err = Object.assign(new Error('The internet connection appears to be offline.'), { code: 'unavailable' });
  const message = describeAdminProductWriteError(err, 'delete');
  assert.match(message, /Product delete failed/);
  assert.match(message, /\[unavailable\]/);
});

// --- Contract: the app write path is actually guarded ----------------------

test('admin product writes run through the Firestore write guard before setDoc/deleteDoc', () => {
  assert.match(appSource, /requireAdminFirestoreWriteAccess = async \(action: 'add' \| 'update' \| 'delete'\)/);
  assert.match(appSource, /const diagnostics = await requireAdminFirestoreWriteAccess\(action\);/);
  assert.match(appSource, /publishProductToFirebase\(productWithId, 'add'\)/);
  assert.match(appSource, /publishProductToFirebase\(updatedProduct, 'update'\)/);
  assert.match(appSource, /writeDiagnostics = await requireAdminFirestoreWriteAccess\('delete'\);/);
  // The guard must run before the writes, not after.
  const publishBody = appSource.match(/const publishProductToFirebase[\s\S]*?return \{ product: publishableProduct, diagnostics \};\n  \};/);
  assert.ok(publishBody, 'publishProductToFirebase body not found');
  assert.ok(
    publishBody[0].indexOf('requireAdminFirestoreWriteAccess(action)') < publishBody[0].indexOf('await setDoc('),
    'write guard must execute before setDoc'
  );
});

test('admin product write failures alert the exact Firebase error, not a generic rules message', () => {
  assert.doesNotMatch(appSource, /alert\('Product was not saved to Firebase\. Please check Firebase admin permission\/rules and try again\.'\)/);
  assert.doesNotMatch(appSource, /alert\('Product update was not saved to Firebase\. Please check Firebase admin permission\/rules and try again\.'\)/);
  assert.doesNotMatch(appSource, /alert\('Product was not deleted from Firebase\. Please check Firebase admin permission\/rules and try again\.'\)/);
  assert.match(appSource, /describeAdminProductWriteError\(e, 'add', writeDiagnostics\)/);
  assert.match(appSource, /describeAdminProductWriteError\(e, 'update', writeDiagnostics\)/);
  assert.match(appSource, /describeAdminProductWriteError\(e, 'delete', writeDiagnostics\)/);
});

// --- Contract: security rules stay strict and role-based -------------------

test('firestore rules keep products publicly readable and admin-only writable', () => {
  const productBlock = firestoreRules.match(/match \/siteProducts\/\{productId\} \{\s*allow read: if true;\s*allow write: if isAdmin\(\);\s*\}/);
  assert.ok(productBlock, 'siteProducts read/write rule block must stay: read public, write admin-only');
});

test('firestore rules admin check is role-based and supports custom claims without weakening identity', () => {
  assert.match(firestoreRules, /function hasAdminUserRecord\(\)/);
  assert.match(firestoreRules, /data\.role in \['admin', 'super_admin'\]/);
  assert.match(firestoreRules, /function hasAdminCustomClaim\(\) \{\s*return signedIn\(\) && request\.auth\.token\.admin == true;\s*\}/);
  assert.match(firestoreRules, /function isAdmin\(\) \{\s*return hasAdminUserRecord\(\)\s*\|\| hasAdminCustomClaim\(\)\s*\|\| isPrimaryAdminEmail\(\);\s*\}/);
});

test('firestore rules still block non-admin writes to restricted collections', () => {
  const catchAll = firestoreRules.match(/match \/\{document=\*\*\} \{\s*allow read, write: if isAdmin\(\);\s*\}/);
  assert.ok(catchAll, 'default-deny catch-all must remain admin-only');
  assert.match(firestoreRules, /match \/siteOrders\/\{orderId\} \{\s*allow create: if signedIn\(\) && request\.resource\.data\.customerUid == request\.auth\.uid;/);
});

test('storage rules keep admin content uploads admin-only via user role', () => {
  assert.match(storageRules, /match \/adminProductContent\/audio\/\{productId\}\/\{fileName\}/);
  assert.match(storageRules, /allow write: if isAdmin\(\)/);
  assert.match(storageRules, /match \/\{allPaths=\*\*\} \{\s*allow read, write: if isAdmin\(\);\s*\}/);
});

// --- Contract: deployment configuration exists and targets the app project -

test('firebase.json wires the repository rules for deterministic deployment', () => {
  assert.equal(firebaseJson.firestore?.rules, 'firestore.rules');
  assert.equal(firebaseJson.storage?.rules, 'storage.rules');
});

test('.firebaserc targets the same Firebase project the frontend uses', () => {
  const clientConfig = fs.readFileSync(new URL('../firebase.ts', import.meta.url), 'utf8');
  const projectId = clientConfig.match(/projectId:\s*"([^"]+)"/)?.[1];
  assert.ok(projectId, 'client projectId not found');
  assert.equal(firebaseRc.projects?.default, projectId);
});

test('npm scripts expose rules deployment and the admin access verifier', () => {
  assert.equal(packageJson.scripts?.['deploy:rules'], 'firebase deploy --only firestore:rules,storage');
  assert.equal(packageJson.scripts?.['verify:admin-access'], 'node scripts/verify-admin-access.mjs');
});

test('admin access verifier exists and uses the client SDK so real rules are enforced', () => {
  const verifier = fs.readFileSync(new URL('../scripts/verify-admin-access.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /from 'firebase\/auth'/);
  assert.doesNotMatch(verifier, /firebase-admin/);
  assert.match(verifier, /product-create-write/);
  assert.match(verifier, /product-update-write/);
  assert.match(verifier, /product-delete-write/);
  assert.match(verifier, /rules-deny-anonymous-write/);
});
