// Production verification for the admin product write path.
//
// Uses the Firebase CLIENT SDK (never the Admin SDK), so every probe below is
// evaluated by the REAL deployed Firestore security rules. It definitively
// answers: can the admin account CREATE / READ / UPDATE / DELETE products?
//
// Usage:
//   ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="..." node scripts/verify-admin-access.mjs
//
// Credentials are read from the environment only and are never stored or logged.

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const firebaseSource = readFileSync(new URL('../firebase.ts', import.meta.url), 'utf8');
const pick = (key) => {
  const match = firebaseSource.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  if (!match) throw new Error(`Could not read ${key} from firebase.ts`);
  return match[1];
};

const firebaseConfig = {
  apiKey: pick('apiKey'),
  authDomain: pick('authDomain'),
  projectId: pick('projectId'),
  storageBucket: pick('storageBucket'),
  messagingSenderId: pick('messagingSenderId'),
  appId: pick('appId'),
};

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error('Missing credentials. Run with: ADMIN_EMAIL="..." ADMIN_PASSWORD="..." node scripts/verify-admin-access.mjs');
  process.exit(2);
}

const app = initializeApp(firebaseConfig, 'admin-access-verifier');
const auth = getAuth(app);
const db = getFirestore(app);

console.log(`Project: ${firebaseConfig.projectId}`);
console.log(`Account: ${email}\n`);

let credential;
try {
  credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  record('firebase-auth-login', true, `uid=${credential.user.uid}`);
} catch (error) {
  record('firebase-auth-login', false, `${error.code || ''} ${error.message || error}`);
  process.exit(1);
}

const { user } = credential;

try {
  await user.getIdToken(true);
  record('id-token-refresh', true);
} catch (error) {
  record('id-token-refresh', false, `${error.code || ''} ${error.message || error}`);
}

let role = null;
try {
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  role = userSnap.exists() ? userSnap.data().role ?? null : null;
  record('user-role-document', role === 'admin' || role === 'super_admin', `users/${user.uid}.role=${role ?? 'MISSING'}`);
} catch (error) {
  record('user-role-document', false, `${error.code || ''} ${error.message || error}`);
}

const probeRef = doc(db, 'siteProducts', '__admin_write_probe__');
const probeId = Date.now();

try {
  await setDoc(probeRef, { id: probeId, title: 'admin write probe', probe: true, updatedAt: probeId });
  record('product-create-write', true);
} catch (error) {
  record('product-create-write', false, `${error.code || ''} ${error.message || error}`);
}

try {
  const snap = await getDoc(probeRef);
  record('product-read-after-write', snap.exists() && snap.data().probe === true);
} catch (error) {
  record('product-read-after-write', false, `${error.code || ''} ${error.message || error}`);
}

try {
  await updateDoc(probeRef, { probe: true, probeUpdated: true, updatedAt: probeId + 1 });
  record('product-update-write', true);
} catch (error) {
  record('product-update-write', false, `${error.code || ''} ${error.message || error}`);
}

try {
  await deleteDoc(probeRef);
  record('product-delete-write', true);
} catch (error) {
  record('product-delete-write', false, `${error.code || ''} ${error.message || error}`);
}

// Security regression checks: unauthenticated requests must NOT be able to
// write products, while public product reads must keep working.
await signOut(auth);

try {
  await setDoc(probeRef, { id: probeId, title: 'should be rejected', probe: true });
  record('rules-deny-anonymous-write', false, 'UNAUTHENTICATED WRITE SUCCEEDED — deployed rules are insecure');
  await deleteDoc(probeRef).catch(() => {});
} catch (error) {
  record('rules-deny-anonymous-write', error.code === 'permission-denied', `${error.code || error.message || error}`);
}

try {
  const snap = await getDocs(query(collection(db, 'siteProducts'), limit(1)));
  record('public-product-read-still-works', snap.size >= 0);
} catch (error) {
  record('public-product-read-still-works', false, `${error.code || ''} ${error.message || error}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`}`);
process.exit(failed.length === 0 ? 0 : 1);
