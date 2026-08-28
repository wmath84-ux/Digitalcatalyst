
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD0F0vSGMNnUc8Oac96jDQuYLcyLcyyFuE",
  authDomain: "my-website-761e9.firebaseapp.com",
  projectId: "my-website-761e9",
  storageBucket: "my-website-761e9.firebasestorage.app",
  messagingSenderId: "930483750234",
  appId: "1:930483750234:web:8d84d7b39739a0ab5d5f63",
  measurementId: "G-5SR5PEEFNQ"
};

// Initialize Firebase only if it hasn't been initialized yet
let app: FirebaseApp | undefined;
try {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

function getDb() {
  if (!app) return {} as any;
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
}
export const db = getDb();
export const storage = app ? getStorage(app) : {} as any;

function getFirebaseAuth() {
  if (!app) return {} as any;
  try {
    // Popup + local persistence avoids the "missing initial state" crash
    // that signInWithRedirect hits when sessionStorage is partitioned
    // (Safari, in-app browsers, PWA standalone, some Chrome profiles).
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = getFirebaseAuth();