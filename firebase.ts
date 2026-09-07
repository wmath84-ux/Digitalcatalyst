
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
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
    // Persistent IndexedDB cache (stale-while-revalidate).
    //
    // With the persistent local cache enabled, Firestore serves every
    // listener's LAST-KNOWN snapshot from IndexedDB instantly on app open,
    // while the onSnapshot listeners silently refresh against the server in
    // the background — the same stale-while-revalidate pattern Gmail and
    // Twitter use. Cold first-ever load still needs the network for data;
    // every open after that paints products/purchases/reviews from cache
    // before (or without) the server round-trip, so a learner who reloads
    // offline still sees the full catalog instead of a blank/error screen.
    //
    // API note: in the modular SDK v10+ (this repo pins firebase 12.x,
    // @firebase/firestore 4.x) the cache is configured through the
    // `localCache` settings field with the persistentLocalCache() factory
    // (the older global enable-persistence function is deprecated and is
    // intentionally not used). The multiple-tab manager lets open tabs
    // share one IndexedDB connection; on platforms where persistence is
    // unavailable (Node, a WebView with IndexedDB disabled) the factory
    // throws, and we fall back to the default in-memory cache rather than
    // failing Firestore init.
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Either Firestore was already initialized (getFirestore returns it) or
    // persistent storage is unavailable in this runtime — memory cache.
    try {
      return getFirestore(app);
    } catch {
      return {} as any;
    }
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