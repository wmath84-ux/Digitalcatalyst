export const VALID_ENTITLEMENT_STATUSES = Object.freeze(['Completed', 'Verified', 'Active']);

export const normalizePurchaseIds = (ids) => {
  if (!Array.isArray(ids)) return [];

  const normalizedIds = [];
  const seenIds = new Set();

  for (const id of ids) {
    if (id === null || id === undefined || id === '') continue;

    if (typeof id === 'string') {
      const trimmedId = id.trim();
      if (!trimmedId) continue;
      if (!/^\d+$/.test(trimmedId)) continue;
      const normalizedId = Number(trimmedId);
      if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) continue;
      if (seenIds.has(normalizedId)) continue;
      seenIds.add(normalizedId);
      normalizedIds.push(normalizedId);
      continue;
    }

    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      normalizedIds.push(id);
    }
  }

  return normalizedIds;
};

export const mergePurchasedProductIds = (...idGroups) => normalizePurchaseIds(idGroups.flat());

export const isBlockedUserStatus = (status) => status === 'blocked';

export const shouldRestoreEntitlementStatus = (status) => VALID_ENTITLEMENT_STATUSES.includes(String(status || ''));

export const FIREBASE_AUTH_ERROR_MESSAGES = Object.freeze({
  'auth/email-already-in-use': 'This email is already registered. Please login instead or use password reset.',
  'auth/invalid-credential': 'Invalid email or password. Please check your details.',
  'auth/user-not-found': 'No account found with this email. Please sign up first.',
  'auth/wrong-password': 'Incorrect password. If you forgot your password, use the reset link below.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/configuration-not-found': 'Firebase Email/Password authentication is not enabled for this project. Please enable the Email/Password sign-in provider in Firebase Console, then try again.',
  'auth/network-request-failed': 'Network connection failed. Please check your internet and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/popup-closed-by-user': 'Google login was cancelled.',
  'auth/cancelled-popup-request': 'Another Google login window is already open.',
  'auth/popup-blocked': 'Popup was blocked. Redirecting to Google login...',
  'auth/account-exists-with-different-credential': 'An account already exists with this email. Login with the original method, then link Google from Profile.',
  'auth/credential-already-in-use': 'This Google account is already linked to another user.',
  'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication settings.',
  'auth/operation-not-allowed': 'Google login is not enabled. Enable Google provider in Firebase Console.',
});

export const getFirebaseAuthErrorMessageFromCode = (error) => {
  const code = typeof error?.code === 'string'
    ? error.code
    : typeof error?.message === 'string'
      ? error.message.match(/\((auth\/[^)]+)\)/)?.[1]
      : undefined;
  return (code && FIREBASE_AUTH_ERROR_MESSAGES[code]) || 'Unable to continue with Google right now. Please try again.';
};
