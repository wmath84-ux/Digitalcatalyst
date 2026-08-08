// Admin Firestore write guard.
//
// The admin product editor previously wrote to Firestore `siteProducts` blindly:
// it never verified that a real Firebase Auth session existed at write time and
// it discarded the underlying Firebase error, so a rules/permission failure was
// reported as a vague "check Firebase admin permission/rules" alert.
//
// This module adds the same class of pre-flight verification the Storage upload
// path already had (ensureAdminUploadAuth in components/admin/ProductManagement.tsx)
// to every admin Firestore product write, and turns Firebase failures into exact,
// actionable diagnostics. It never bypasses Firestore security rules — it only
// verifies the request will carry a valid, fresh admin credential and surfaces
// the real error when the deployed rules still reject the write.
//
// The module is import-safe in Node tests: Firebase is loaded lazily with
// dynamic imports, so importing this file never initializes the Firebase app.

export const PRIMARY_ADMIN_EMAIL = 'wmath84@gmail.com';

export const normalizeAdminEmail = (email) => String(email || '').trim().toLowerCase();

export const isPrimaryAdminEmailAddress = (email) => normalizeAdminEmail(email) === PRIMARY_ADMIN_EMAIL;

export const isAdminRoleValue = (role) => role === 'admin' || role === 'super_admin';

export const ADMIN_WRITE_ERROR_PREFIX = Object.freeze({
  noAuthUser: 'ADMIN_WRITE_NOT_AUTHENTICATED',
  tokenRefreshFailed: 'ADMIN_WRITE_TOKEN_REFRESH_FAILED',
  roleCheckReadFailed: 'ADMIN_WRITE_ROLE_LOOKUP_FAILED',
  roleMissing: 'ADMIN_WRITE_ROLE_MISSING',
});

/**
 * Verify that the CURRENT Firebase Auth session can attempt admin Firestore writes.
 *
 * @returns {Promise<{uid: string, email: string|null, role: string|null, isPrimaryAdminEmail: boolean}>}
 * @throws {Error} Prefixed with ADMIN_WRITE_* when the local session cannot make
 *   an admin write request (stale localStorage session, dead token, missing role).
 *   A thrown error here means the request never reached Firestore.
 */
export const ensureAdminFirestoreWriteAccess = async () => {
  const [{ auth, db }, firestore] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/firestore'),
  ]);
  const { doc, getDoc } = firestore;

  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      `${ADMIN_WRITE_ERROR_PREFIX.noAuthUser}: Firebase Auth has no signed-in user at write time. ` +
      'The admin panel session was restored from local storage, but the real Firebase Auth session is gone. ' +
      'Log in to the admin panel again before saving products.'
    );
  }

  let idToken;
  try {
    // Force-refresh so a long-lived admin tab never writes with an expired ID token.
    idToken = await user.getIdToken(true);
  } catch (error) {
    throw new Error(
      `${ADMIN_WRITE_ERROR_PREFIX.tokenRefreshFailed}: Could not refresh the Firebase ID token for UID ${user.uid}. ` +
      `${describeFirebaseError(error)} Log in again and retry.`
    );
  }
  if (!idToken) {
    throw new Error(
      `${ADMIN_WRITE_ERROR_PREFIX.tokenRefreshFailed}: Firebase returned an empty ID token for UID ${user.uid}. ` +
      'Log in again and retry.'
    );
  }

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', user.uid));
  } catch (error) {
    throw new Error(
      `${ADMIN_WRITE_ERROR_PREFIX.roleCheckReadFailed}: Could not read users/${user.uid} to verify the admin role. ` +
      describeFirebaseError(error)
    );
  }

  const role = userSnap.exists() ? (typeof userSnap.data().role === 'string' ? userSnap.data().role : null) : null;
  const email = user.email || null;
  const primaryAdmin = isPrimaryAdminEmailAddress(email);

  if (!isAdminRoleValue(role) && !primaryAdmin) {
    throw new Error(
      `${ADMIN_WRITE_ERROR_PREFIX.roleMissing}: users/${user.uid}.role is "${role ?? 'missing'}" (expected "admin" or "super_admin") ` +
      `and the signed-in email "${email ?? 'none'}" is not the primary admin. ` +
      'Set the role field to "admin" on the user document in Firestore, then log in again.'
    );
  }

  return { uid: user.uid, email, role, isPrimaryAdminEmail: primaryAdmin };
};

/** Extract the exact Firebase error code and message from any thrown value. */
export const describeFirebaseError = (error) => {
  if (!error || typeof error !== 'object') return String(error || 'Unknown error');
  const code = typeof error.code === 'string' && error.code ? error.code : null;
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  return code ? `[${code}] ${message}` : message;
};

/**
 * Build an actionable, exact message for an admin product write failure.
 * Always preserves the underlying Firebase error code/message so a real
 * permission-denied is visible instead of a generic "check rules" alert.
 *
 * @param {unknown} error error thrown by the Firestore write
 * @param {'add'|'update'|'delete'} action product CRUD action being attempted
 * @param {{uid?: string, email?: string|null, role?: string|null}|null} diagnostics
 * @returns {string}
 */
export const describeAdminProductWriteError = (error, action, diagnostics = null) => {
  const actionLabel = action === 'update' ? 'update' : action === 'delete' ? 'delete' : 'save';
  const raw = describeFirebaseError(error);
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : '';
  const identity = diagnostics && diagnostics.uid
    ? ` Signed-in account: ${diagnostics.email || 'no email'} (UID ${diagnostics.uid}, role: ${diagnostics.role || 'missing'}).`
    : '';

  // Pre-flight guard failures already contain an exact diagnosis.
  if (typeof error?.message === 'string' && /ADMIN_WRITE_(NOT_AUTHENTICATED|TOKEN_REFRESH_FAILED|ROLE_LOOKUP_FAILED|ROLE_MISSING)/.test(error.message)) {
    return error.message;
  }

  if (typeof error?.message === 'string' && error.message.startsWith('PRODUCT_DOC_TOO_LARGE')) {
    return error.message;
  }

  if (code === 'invalid-argument' && /exceeds the maximum allowed size/.test(raw)) {
    return (
      `This product is too large for a single Firestore document (1 MiB hard limit).${identity}\n\n` +
      `Exact Firebase error: ${raw}\n\n` +
      'The app now offloads embedded images/files to Firebase Storage automatically before saving, so this ' +
      'only happens when the document is still oversized (very long text content). Shorten the largest ' +
      'text fields or split the content into multiple products/modules, then save again.'
    );
  }

  if (code === 'permission-denied') {
    return (
      `Firestore security rules rejected the product ${actionLabel} (permission-denied).${identity}\n\n` +
      `Exact Firebase error: ${raw}\n\n` +
      'This means the Firestore rules DEPLOYED on the Firebase project do not recognize this account as admin, ' +
      'even if this device is logged in correctly. Deploy the repository rules to the project with ' +
      '`firebase deploy --only firestore:rules,storage` (see firebase.json) and run `npm run verify:admin-access`, ' +
      'then retry the save.'
    );
  }

  return `Product ${actionLabel} failed — exact Firebase error: ${raw}.${identity}`;
};
