
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

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
let app;
try {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
}

export const db = app ? getFirestore(app) : {} as any;
export const storage = app ? getStorage(app) : {} as any;
export const auth = app ? getAuth(app) : {} as any;