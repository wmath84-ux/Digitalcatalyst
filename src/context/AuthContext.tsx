"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { subscribeSharedDoc } from "../lib/sharedSnapshot";
import { auth, db } from "../../firebase";
import { APPROVED_ADMIN_EMAIL, clearAdminSession, createAdminSession } from "../utils/adminSession";
import { isCapacitorNative, isEmbeddedWebView, warmNativeGoogleAuth } from "../utils/nativeRuntime";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// NOTE ON `signInWithRedirect` (kept here so nobody "optimises" it back):
// an earlier revision preferred the redirect flow on phones / installed PWAs
// because the popup opens the Google account chooser in a separate Chrome tab.
// That flow is broken by design for this app — Firebase's own guidance
// (https://firebase.google.com/docs/auth/web/redirect-best-practices) is that
// `signInWithRedirect()` needs cross-origin storage on the way BACK, and only
// works unchanged when the app itself is hosted on `<project>.firebaseapp.com`.
// This app is served from its own domain, so the returning page's auth iframe
// lands in a different storage partition, `getRedirectResult()` resolves with
// nothing, and the learner arrives back signed out with NO error at all — the
// exact "Google picker khula, id select ki, wapas aaya, login nahin hua"
// report. Popup is the documented fix (Option 2) and needs no console change;
// redirect survives only as a fallback when a popup is blocked, with a marker
// so the return leg can explain itself. See docs/google-signin-web.md.

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  mobile?: string;
  bio?: string;
  createdAt?: string;
  subscriptionTier?: string;
  role: "user" | "admin";
  providerIds: string[];
}

export type AuthResult = {
  success: boolean;
  message: string;
  code?: string;
};

export type SignupDetails = {
  name: string;
  email: string;
  mobile: string;
  password: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /**
   * True while a Google sign-in that left the page (the redirect fallback) is
   * still being resolved on this boot. The auth screen shows a spinner instead
   * of a dead button during that window — otherwise the learner is looking at
   * a normal login form for the second it takes `getRedirectResult()` to come
   * back and taps Google a second time.
   */
  restoringSession: boolean;
  /**
   * Actionable message for a Google sign-in that returned to the app WITHOUT a
   * session (browsers that partition/block the auth helper's cross-origin
   * storage swallow the result silently). `null` in the normal case.
   */
  googleNotice: string | null;
  dismissGoogleNotice: () => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (details: SignupDetails) => Promise<AuthResult>;
  loginWithGoogle: () => Promise<AuthResult>;
  loginAdmin: (email: string, password: string) => Promise<AuthResult>;
  loginAdminWithGoogle: () => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updateAccount: (details: { name: string; mobile: string; bio: string }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── "We left the page for Google" marker ────────────────────────────────────
// `loginWithGoogle()` uses `signInWithPopup()` as its primary web path, but a
// blocked popup still falls back to `signInWithRedirect()`, which navigates the
// whole tab away. This marker is what lets the NEXT boot tell "the learner is
// coming back from Google" apart from "the learner just opened the app".
//
// Without it the failure is completely silent: browsers that partition or block
// the auth helper's cross-origin storage (the documented `signInWithRedirect`
// breakage — see docs/google-signin-web.md) hand `getRedirectResult()` nothing
// at all, so the learner lands back on the login screen signed out with no
// error, no message and no idea what to do next. With the marker we can say
// exactly that, and offer the popup path as a retry.
const GOOGLE_REDIRECT_MARKER_KEY = "eduvora.googleRedirectPending.v1";

const writeGoogleRedirectMarker = (): void => {
  try {
    sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, String(Date.now()));
  } catch {
    // Storage blocked — the redirect still works, we just lose the diagnosis.
  }
};

const readGoogleRedirectMarker = (): string | null => {
  try {
    return sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY);
  } catch {
    return null;
  }
};

const clearGoogleRedirectMarker = (): void => {
  try {
    sessionStorage.removeItem(GOOGLE_REDIRECT_MARKER_KEY);
  } catch {
    /* nothing to clear */
  }
};

/** Popup failures that are worth one redirect retry (as opposed to a cancel). */
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

const normalizeEmail = (email?: string | null) => String(email || "").trim().toLowerCase();

const authErrorCode = (error: unknown): string =>
  typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";

const authErrorMessage = (error: unknown): string => {
  const code = authErrorCode(error);

  const messages: Record<string, string> = {
    "auth/email-already-in-use": "इस ईमेल से अकाउंट पहले से मौजूद है। कृपया Login करें या password reset करें।",
    "auth/invalid-credential": "ईमेल या पासवर्ड सही नहीं है। अगर आपने यह account Google से बनाया था, तो नीचे \u201CContinue with Google\u201D से login करें।",
    "auth/user-not-found": "इस ईमेल से कोई अकाउंट नहीं मिला।",
    "auth/wrong-password": "पासवर्ड सही नहीं है। अगर यह account Google से बना था, तो \u201CContinue with Google\u201D से login करें।",
    "auth/weak-password": "पासवर्ड कम से कम 6 characters का होना चाहिए।",
    "auth/invalid-email": "कृपया valid email address डालें।",
    "auth/network-request-failed": "Network connection failed. Internet check करके फिर कोशिश करें।",
    "auth/too-many-requests": "बहुत अधिक attempts हुए हैं। थोड़ी देर बाद कोशिश करें।",
    "auth/popup-closed-by-user": "Google sign-in window बंद कर दी गई।",
    "auth/popup-blocked": "Browser ने Google sign-in popup block कर दिया। Popups allow करके फिर कोशिश करें।",
    "auth/account-exists-with-different-credential": "इस ईमेल का अकाउंट दूसरे sign-in method से बना है।",
    "auth/operation-not-supported-in-this-environment": "यह sign-in method इस app के अंदर काम नहीं करता।",
    "auth/web-storage-unsupported": "इस browser में storage blocked है, इसलिए login पूरा नहीं हो सका।",
    "auth/unauthorized-domain": "यह domain Firebase Authentication में authorized नहीं है।",
    "auth/operation-not-allowed": "यह sign-in provider Firebase Console में enabled नहीं है।",
    "auth/configuration-not-found": "Firebase Authentication provider configured नहीं है।",
    "auth/missing-or-invalid-nonce": "Login session expire हो गई। कृपया फिर से Google से साइन इन करें।",
    "auth/no-auth-event": "Login session expire हो गई। कृपया फिर से Google से साइन इन करें।",
    "auth/argument-error": "Login session reset हो गई। कृपया फिर से Google से साइन इन करें।",
  };

  const raw = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");

  if (/missing initial state/i.test(raw)) {
    return "Google login session reset हो गई। कृपया फिर से Google से साइन इन करें।";
  }

  return messages[code] || "Authentication पूरा नहीं हो सका। कृपया फिर कोशिश करें।";
};

const getProviderIds = (firebaseUser: FirebaseUser) =>
  Array.from(new Set(firebaseUser.providerData.map((provider) => provider.providerId).filter(Boolean)));

/**
 * A profile built from the Firebase Auth record alone — no Firestore read.
 *
 * Used when the session is real but the `users/{uid}` read/write could not
 * complete (offline boot, slow network right after the Google picker closes, a
 * rules rejection). Without it a Firestore hiccup turned a SUCCESSFUL Google
 * sign-in into "login nahin hua": the learner picked their account, came back,
 * and the app threw the profile write away along with the session. The
 * shared-doc listener (below) replaces these fields with the stored ones as
 * soon as the network answers.
 */
const authRecordUser = (firebaseUser: FirebaseUser): AuthUser => {
  const email = normalizeEmail(firebaseUser.email);
  return {
    id: firebaseUser.uid,
    name: String(firebaseUser.displayName || email.split("@")[0] || "Learner"),
    email,
    mobile: String(firebaseUser.phoneNumber || ""),
    bio: "",
    createdAt: "",
    subscriptionTier: "basic",
    photoURL: String(firebaseUser.photoURL || ""),
    role: "user",
    providerIds: getProviderIds(firebaseUser),
  };
};

const readAppUser = async (firebaseUser: FirebaseUser): Promise<AuthUser> => {
  const profileRef = doc(db, "users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileRef);
  const data = profileSnapshot.exists() ? profileSnapshot.data() : {};
  const email = normalizeEmail(firebaseUser.email || String(data.email || ""));
  const role: AuthUser["role"] = data.role === "admin" ? "admin" : "user";

  return {
    id: firebaseUser.uid,
    name: String(data.name || firebaseUser.displayName || email.split("@")[0] || "Learner"),
    email,
    mobile: String(data.mobile || firebaseUser.phoneNumber || ""),
    bio: String(data.bio || ""),
    createdAt: typeof data.createdAt?.toDate === "function" ? data.createdAt.toDate().toISOString() : String(data.createdAt || ""),
    subscriptionTier: String(data.subscriptionTier || "basic"),
    photoURL: String(data.photoURL || firebaseUser.photoURL || ""),
    role,
    providerIds: getProviderIds(firebaseUser),
  };
};

const ensureUserProfile = async (
  firebaseUser: FirebaseUser,
  signupProfile?: { name: string; mobile: string },
): Promise<AuthUser> => {
  const profileRef = doc(db, "users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileRef);
  const providerIds = getProviderIds(firebaseUser);
  const email = normalizeEmail(firebaseUser.email);

  if (!profileSnapshot.exists()) {
    await setDoc(profileRef, {
      uid: firebaseUser.uid,
      name: signupProfile?.name || firebaseUser.displayName || email.split("@")[0] || "Learner",
      email,
      mobile: signupProfile?.mobile || firebaseUser.phoneNumber || "",
      photoURL: firebaseUser.photoURL || "",
      role: "user",
      status: "active",
      purchasedProductIds: [],
      authProvider: providerIds.includes("google.com") ? "google" : "password",
      providerIds,
      emailVerified: firebaseUser.emailVerified,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    await setDoc(profileRef, {
      email,
      providerIds,
      authProvider: providerIds.includes("google.com") ? "google" : "password",
      emailVerified: firebaseUser.emailVerified,
      lastLoginAt: serverTimestamp(),
      ...(signupProfile?.name ? { name: signupProfile.name } : {}),
      ...(signupProfile?.mobile ? { mobile: signupProfile.mobile } : {}),
      ...(!String(profileSnapshot.data()?.photoURL || "").trim() && firebaseUser.photoURL
        ? { photoURL: firebaseUser.photoURL }
        : {}),
    }, { merge: true });
  }

  return readAppUser(firebaseUser);
};


/**
 * Native Google sign-in for the Android APK.
 *
 * Google's Secure Browser Policy refuses to serve its OAuth consent page to an
 * embedded WebView, which is exactly what the Capacitor shell is — so
 * `signInWithPopup` / `signInWithRedirect` can never complete inside the app,
 * no matter which OAuth clients or SHA-1 fingerprints are registered. Those
 * credentials are consulted only by the NATIVE Play Services flow, which the
 * web SDK never reaches from inside a WebView.
 *
 * This function takes the native path instead:
 *
 *   1. `@capacitor-firebase/authentication` opens the Play Services account
 *      picker (a real system UI, not a web page) and returns an ID token.
 *   2. That token is turned into a Firebase credential and exchanged for a
 *      normal **web-SDK** session via `signInWithCredential`.
 *
 * Step 2 is what keeps the rest of the app untouched: `auth.currentUser`,
 * `onAuthStateChanged`, Firestore security rules and every existing screen
 * behave exactly as they do after a browser sign-in.
 *
 * The plugin is imported dynamically so the website bundle never pays for it
 * and never tries to resolve a native module that isn't there.
 */
const signInWithGoogleNatively = async () => {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) {
    // Two different situations land here and they need different wording, so
    // they get different codes:
    //   · the learner backed out of the Play Services picker → a cancel,
    //   · the picker returned an account but no ID token was bridged to the
    //     web SDK (`result.user` is set) → a build/config problem, and saying
    //     "you cancelled" would send the learner tapping forever.
    const nativeUser = result.user as { uid?: string } | null | undefined;
    if (nativeUser?.uid) {
      throw Object.assign(new Error("Native Google sign-in returned a user but no ID token"), {
        code: "auth/native-google-no-id-token",
      });
    }
    throw Object.assign(new Error("No Google ID token returned"), {
      code: "auth/native-google-no-token",
    });
  }
  const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
  return signInWithCredential(auth, credential);
};

/**
 * Best-effort answer to "was this account created with Google and given no
 * password?".
 *
 * `fetchSignInMethodsForEmail` answers this definitively — but only while
 * Firebase's **Email Enumeration Protection** is OFF. With it ON (the default
 * for projects created after Sept 2023) the API deliberately returns an empty
 * list for every address so that an attacker cannot probe which emails are
 * registered. That is a good default and we do NOT ask anyone to weaken it:
 * we simply treat "empty list" as "don't know" and fall back to the generic
 * message, which now mentions Google sign-in anyway.
 *
 * A signed-out Firestore lookup is deliberately NOT used here — `users/{uid}`
 * is readable only by its owner or an admin (firestore.rules), and opening
 * that up would turn the database into exactly the email-enumeration oracle
 * the protection above exists to prevent.
 */
const isGoogleOnlyAccount = async (email: string): Promise<boolean> => {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (!methods || methods.length === 0) return false; // unknown, not "no"
    return methods.includes("google.com") && !methods.includes("password");
  } catch {
    return false;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // True only when THIS boot is the return leg of a Google redirect (the
  // marker is written in the same tick the tab navigates away), so a normal
  // app open never shows the "session aa raha hai" state.
  const [restoringSession, setRestoringSession] = useState<boolean>(
    () => readGoogleRedirectMarker() !== null,
  );
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);

  // Inside the Capacitor shell, register the native auth plugin's JS proxy as
  // early as possible. The module is imported lazily (the website must never
  // pay for it), and that import is what puts `FirebaseAuthentication` on
  // `Capacitor.Plugins` — so until it runs, every runtime check reads "no
  // native Google sign-in here" even in a perfectly built APK.
  useEffect(() => {
    if (isCapacitorNative()) void warmNativeGoogleAuth();
  }, []);

  const commitFirebaseUser = useCallback(async (firebaseUser: FirebaseUser) => {
    try {
      const appUser = await ensureUserProfile(firebaseUser);
      setUser(appUser);
      return appUser;
    } catch (error) {
      console.warn("[auth] profile sync failed — publishing the auth record instead", error);
      const appUser = authRecordUser(firebaseUser);
      setUser(appUser);
      return appUser;
    }
  }, []);

  const refresh = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      await commitFirebaseUser(firebaseUser);
    } catch (error) {
      console.warn("Firebase profile refresh failed", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [commitFirebaseUser]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        await commitFirebaseUser(firebaseUser);
      } catch (error) {
        console.warn("Firebase session restore failed", error);
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [commitFirebaseUser]);

  /**
   * Consume the return leg of a Google redirect on boot.
   *
   * Three outcomes, and only the first used to be handled:
   *   1. a session came back → commit it (the app shell then moves the learner
   *      off `#/auth`; see the `user`-watching effect in src/main.tsx),
   *   2. NOTHING came back → with a redirect marker this is the storage-
   *      partitioning failure, so say so and offer the popup retry instead of
   *      leaving a silent, permanently stuck login screen,
   *   3. an error → same treatment, with Firebase's own wording when it has one.
   *
   * `getRedirectResult()` resolves to `null` (not a rejection) for outcome 2,
   * which is exactly why the old code could only `console.warn` and the learner
   * saw nothing happen.
   */
  useEffect(() => {
    const marker = readGoogleRedirectMarker();
    // A marker older than the redirect could plausibly take is stale (the
    // learner abandoned Google and reopened the app in the same tab) — never
    // turn that into a scary message on an ordinary app open.
    const markerAge = Number(marker || 0);
    const markerIsFresh = Boolean(marker) && (!markerAge || Date.now() - markerAge < 10 * 60 * 1000);
    if (marker && !markerIsFresh) clearGoogleRedirectMarker();

    let cancelled = false;
    const fail = (message: string) => {
      if (cancelled || !markerIsFresh) return;
      setGoogleNotice(message);
    };

    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          clearGoogleRedirectMarker();
          return commitFirebaseUser(result.user);
        }
        fail(
          "Google se wapas aa gaye, lekin browser ne session wapas नहीं दिया (is browser में third-party storage blocked/partitioned है)। नीचे “Continue with Google” से एक बार फिर कोशिश करें — यह popup से login करेगा, या email + password से login करें।",
        );
        return undefined;
      })
      .catch((error) => {
        console.warn("Google redirect sign-in failed", error);
        fail(authErrorMessage(error));
        return undefined;
      })
      .finally(() => {
        clearGoogleRedirectMarker();
        if (!cancelled) setRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [commitFirebaseUser]);

  useEffect(() => {
    if (!user || !auth.currentUser || auth.currentUser.uid !== user.id) return undefined;
    // Joins the ONE `users/{uid}` listener (src/lib/sharedSnapshot.ts) that the
    // cart/wishlist mirror and the course-access resolver also use. Read-only
    // mapping — the auth flow itself is untouched.
    const watchedId = user.id;
    return subscribeSharedDoc(`users/${watchedId}`, () => doc(db, "users", watchedId), (data, exists, error) => {
      if (error) { console.warn("Live Firebase profile sync failed", error); return; }
      if (!exists || !data) return;
      setUser((current) => current && current.id === watchedId ? {
        ...current,
        name: String(data.name || current.name),
        mobile: String(data.mobile || ""),
        bio: String(data.bio || ""),
        subscriptionTier: String(data.subscriptionTier || current.subscriptionTier || "basic"),
        photoURL: String(data.photoURL || current.photoURL || ""),
        role: data.role === "admin" ? "admin" : "user",
      } : current);
    });
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    clearAdminSession();
    const normalizedEmail = normalizeEmail(email);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await commitFirebaseUser(credential.user);
      return { success: true, message: "Login successful." };
    } catch (error) {
      const code = authErrorCode(error);
      // ── "Sahi password bhi wrong bata raha hai" ─────────────────────────
      // Firebase (with Email Enumeration Protection ON, the default for new
      // projects) collapses THREE different situations into the single
      // generic code `auth/invalid-credential`:
      //
      //   1. the password really is wrong,
      //   2. no account exists for this email at all,
      //   3. the account exists but has NO password — it was created with
      //      "Continue with Google", so there is nothing to compare against
      //      and the correct-looking password can never succeed.
      //
      // Case 3 is the one that makes a learner insist they typed it right,
      // and `fetchSignInMethodsForEmail` no longer distinguishes it either
      // (enumeration protection makes it return an empty list for every
      // address). What we CAN do is look up the profile document the app
      // itself writes on every sign-in: it records `providerIds`, so a
      // Google-only account is identifiable without leaking anything a
      // signed-out attacker could not already guess.
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        const googleOnly = await isGoogleOnlyAccount(normalizedEmail);
        if (googleOnly) {
          return {
            success: false,
            code: "auth/google-only-account",
            message:
              "यह account Google sign-in से बना है, इसलिए इसका कोई password नहीं है। नीचे \u201CContinue with Google\u201D से login करें — या \u201CForgot password\u201D से एक password set कर लें।",
          };
        }
      }
      return { success: false, message: authErrorMessage(error), code };
    }
  }, [commitFirebaseUser]);

  const signup = useCallback(async (details: SignupDetails): Promise<AuthResult> => {
    clearAdminSession();
    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, normalizeEmail(details.email), details.password);
      await updateProfile(credential.user, { displayName: details.name.trim() });
      const appUser = await ensureUserProfile(credential.user, {
        name: details.name.trim(),
        mobile: details.mobile,
      });
      setUser(appUser);
      return { success: true, message: "Account successfully create हो गया।" };
    } catch (error) {
      return { success: false, message: authErrorMessage(error) };
    }
  }, []);

  const loginAdmin = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    clearAdminSession();
    if (normalizedEmail !== APPROVED_ADMIN_EMAIL) {
      return { success: false, message: "This email is not approved for dashboard access." };
    }
    try {
      await setPersistence(auth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await credential.user.getIdToken(true);
      const profileSnapshot = await getDoc(doc(db, "users", credential.user.uid));
      if (!profileSnapshot.exists() || profileSnapshot.data().role !== "admin" || normalizeEmail(credential.user.email) !== APPROVED_ADMIN_EMAIL) {
        await signOut(auth);
        setUser(null);
        return { success: false, message: "Dashboard access requires the approved email and an admin role." };
      }
      const appUser = await readAppUser(credential.user);
      setUser(appUser);
      createAdminSession(appUser.id, appUser.email);
      return { success: true, message: "Admin login successful." };
    } catch (error) {
      clearAdminSession();
      const code = authErrorCode(error);
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        return {
          success: false,
          message: "Firebase Authentication rejected this email/password. The password must match Authentication → Users for wmath84@gmail.com — Firestore role=admin is checked only after Auth succeeds. Use Reset password below if needed.",
          code,
        };
      }
      return { success: false, message: authErrorMessage(error), code };
    }
  }, []);

  const loginAdminWithGoogle = useCallback(async (): Promise<AuthResult> => {
    clearAdminSession();
    try {
      await setPersistence(auth, browserLocalPersistence);
      // Admin Google login is popup-only on the web: redirect cannot finish
      // the approved-email + role check on the same page, and partitioned
      // sessionStorage caused "missing initial state". Inside the APK the
      // popup is impossible at all (Google blocks embedded WebViews), so the
      // native Play Services picker is used there instead — both paths end in
      // the same web-SDK session, so the checks below are unchanged.
      const credential = isCapacitorNative()
        ? await signInWithGoogleNatively()
        : await signInWithPopup(auth, googleProvider);
      const signedInEmail = normalizeEmail(credential.user.email);
      if (signedInEmail !== APPROVED_ADMIN_EMAIL) {
        await signOut(auth);
        setUser(null);
        return { success: false, message: "This Google account is not the approved admin (wmath84@gmail.com)." };
      }

      const profileRef = doc(db, "users", credential.user.uid);
      await setDoc(profileRef, {
        email: signedInEmail,
        role: "admin",
        status: "active",
        authProvider: "google",
        providerIds: getProviderIds(credential.user),
        emailVerified: credential.user.emailVerified,
        lastLoginAt: serverTimestamp(),
        ...(credential.user.displayName ? { name: credential.user.displayName } : {}),
        ...(credential.user.photoURL ? { photoURL: credential.user.photoURL } : {}),
      }, { merge: true });

      const appUser = await readAppUser(credential.user);
      setUser({ ...appUser, role: "admin" });
      createAdminSession(appUser.id, signedInEmail);
      return { success: true, message: "Admin login successful." };
    } catch (error) {
      clearAdminSession();
      return { success: false, message: authErrorMessage(error) };
    }
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<AuthResult> => {
    clearAdminSession();
    setGoogleNotice(null);

    // ── Why Google login fails inside the APK ───────────────────────────────
    // The Android build is a Capacitor WebView running this exact same web
    // bundle, so both of the web SDK's Google paths are attempted here — and
    // Google blocks both inside an embedded WebView:
    //
    //   · signInWithPopup    — there is no browser window to hand the result
    //                          back to, so the popup never resolves;
    //   · signInWithRedirect — Google's OAuth server rejects embedded-WebView
    //                          user agents outright with `disallowed_useragent`.
    //
    // This is Google's Secure Browser Policy, not a Firebase misconfiguration:
    // adding an Android OAuth client or a SHA-1 fingerprint does NOT lift it,
    // because those credentials are only consulted by the NATIVE Play Services
    // sign-in flow, which the web SDK never reaches from inside a WebView.
    //
    // The real fix is a native plugin (@capacitor-firebase/authentication),
    // which opens the Play Services account picker and hands the resulting ID
    // token to Firebase. Until that plugin is installed and registered, fail
    // LOUDLY and usefully rather than leaving the learner on a dead button.
    // Inside the APK, take the NATIVE path — the Play Services account picker.
    // P0 FIX: if we are inside the Capacitor shell, always try native first,
    // even if the Plugins map isn't ready yet (early tap). Guarantees picker opens.
    if (isCapacitorNative()) {
      try {
        await setPersistence(auth, browserLocalPersistence);
        const credential = await signInWithGoogleNatively();
        clearGoogleRedirectMarker();
        await commitFirebaseUser(credential.user);
        return { success: true, message: "Google login successful." };
      } catch (error) {
        const code = authErrorCode(error);
        // The learner backing out of the account picker is not an error worth
        // shouting about — the plugin reports it as a cancellation.
        const raw = typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message || "")
          : "";
        if (code === "auth/native-google-no-token" || /cancel/i.test(raw)) {
          return { success: false, code: "auth/popup-closed-by-user", message: "Google sign-in cancel कर दिया गया।" };
        }
        if (code === "auth/native-google-no-id-token") {
          return {
            success: false,
            code,
            message: "Google account select हो गया, लेकिन app को ID token नहीं मिला — यह build Google sign-in के लिए ठीक से configure नहीं है। कृपया email aur password से login करें।",
          };
        }
        // The plugin's JS is in the bundle but its NATIVE half is not in this
        // APK: built before the plugin was added, `cap sync android` skipped, or
        // android/app/google-services.json missing at build time (Gradle then
        // silently skips the google-services plugin — see scripts/ensure-google-services.mjs).
        // Capacitor reports that as an unimplemented/unavailable plugin. Name
        // the real remedy: retrying inside the same build can never work.
        if (/not implemented on|unimplemented|unavailable|no web implementation|FirebaseAuthentication/i.test(raw)) {
          return {
            success: false,
            code: "auth/native-google-plugin-missing",
            message: "इस APK build में Google sign-in का native plugin मौजूद नहीं है (build पुराना है या google-services.json के बिना बना था)। नया build install करें — `npm run android:assemble:debug` — या अभी email + password से login करें।",
          };
        }
        // A missing google-services.json / unregistered SHA-1 surfaces here
        // (DEVELOPER_ERROR / ApiException 10), so say what to actually fix.
        if (/DEVELOPER_ERROR|ApiException:?\s*10\b/i.test(raw)) {
          return {
            success: false,
            code: "auth/native-google-misconfigured",
            message: "Google sign-in इस build में configure नहीं है — android/app/google-services.json build के समय मौजूद नहीं था, या इस signing key का SHA-1 fingerprint Firebase में registered नहीं है। `npm run verify:google-signin` चलाकर देखें, नया build बनाएँ — या अभी email + password से login करें।",
          };
        }
        return { success: false, message: authErrorMessage(error), code };
      }
    }

    // Any OTHER embedded WebView (Instagram / Facebook / Line in-app browser)
    // has no native plugin to fall back on, and Google will refuse the OAuth
    // page there too — so send the learner to a real browser instead of
    // leaving them on a button that cannot succeed.
    if (isEmbeddedWebView()) {
      return {
        success: false,
        code: "auth/native-google-unavailable",
        message: isCapacitorNative()
          ? "Google sign-in अभी app के अंदर उपलब्ध नहीं है। कृपया email aur password से login करें, या website eduvora.shop को browser में खोलकर Google से sign in करें।"
          : "यह in-app browser Google sign-in को allow नहीं करता। कृपया इस page को Chrome या किसी normal browser में खोलें।",
      };
    }

    try {
      await setPersistence(auth, browserLocalPersistence);
      setGoogleNotice(null);

      // POPUP FIRST — on every device, phones and installed PWAs included.
      //
      // This is Firebase's documented Option 2 for apps that are NOT hosted on
      // `<project>.firebaseapp.com` (redirect-best-practices): the popup hands
      // the result back through `postMessage`, so it never depends on the auth
      // helper's cross-origin storage on the return leg. `signInWithRedirect`
      // DOES depend on it, and in a storage-partitioned browser the learner
      // picks their Google account, comes back to the app… and is still signed
      // out, with `getRedirectResult()` resolving to `null` and no error to
      // show. Redirect now only runs when a popup genuinely cannot open.
      try {
        const credential = await signInWithPopup(auth, googleProvider);
        clearGoogleRedirectMarker();
        await commitFirebaseUser(credential.user);
        return { success: true, message: "Google login successful." };
      } catch (popupError) {
        const popupCode = authErrorCode(popupError);
        // A learner closing the popup is a cancel, not a reason to reload the
        // whole tab — only blocked / unsupported popups fall through.
        if (!POPUP_FALLBACK_CODES.has(popupCode)) throw popupError;
        writeGoogleRedirectMarker();
        setRestoringSession(true);
        // `signInWithRedirect()` deliberately never resolves: Firebase returns a
        // pending promise right after `window.location.assign()`, so nothing
        // after this line runs in the normal case. The return below only covers
        // the (rare) build where it does resolve.
        await signInWithRedirect(auth, googleProvider);
        return { success: true, message: "Google login started." };
      }
    } catch (error) {
      clearGoogleRedirectMarker();
      setRestoringSession(false);
      return { success: false, message: authErrorMessage(error), code: authErrorCode(error) };
    }
  }, [commitFirebaseUser]);

  /**
   * Send the Firebase password-reset email.
   *
   * Three things make this look "broken" when it is actually working, so all
   * three are handled explicitly here:
   *
   *   1. **No account = no email.** With Email Enumeration Protection ON,
   *      `sendPasswordResetEmail` RESOLVES SUCCESSFULLY for an address that
   *      has no account — Firebase refuses to confirm or deny existence, and
   *      simply sends nothing. The old code reported "link sent" in that case,
   *      so a typo'd address (or an account that was never created) looked
   *      identical to a real send. The wording below no longer promises an
   *      email arrived; it says what to do if it doesn't.
   *
   *   2. **Empty / invalid address.** The button previously fired with
   *      whatever was in the email field, including "". Firebase then threw
   *      `auth/invalid-email` and the learner saw a generic failure.
   *
   *   3. **Where the link lands.** Without `actionCodeSettings` the reset link
   *      opens Firebase's own hosted page on `authDomain`. That works, but the
   *      learner is dumped on a bare Google page and never comes back to the
   *      app. Pointing `url` at our own origin returns them to the login
   *      screen after the reset — and the origin MUST be listed under
   *      Firebase Console → Authentication → Settings → Authorized domains,
   *      otherwise Firebase rejects the call with `auth/unauthorized-continue-uri`.
   */
  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { success: false, message: "पहले ऊपर अपना email address डालें, फिर Forgot password दबाएँ।" };
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return { success: false, message: "यह email address सही नहीं लग रहा। कृपया दोबारा check करें।" };
    }
    try {
      // Return the learner to our own login page once the password is reset.
      // Falls back to Firebase's hosted page if the origin isn't authorized.
      const continueUrl =
        typeof window !== "undefined" && /^https?:/.test(window.location.origin)
          ? `${window.location.origin}/#/auth`
          : undefined;
      try {
        await sendPasswordResetEmail(
          auth,
          normalizedEmail,
          continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined,
        );
      } catch (error) {
        // An origin that isn't in Authorized domains must not break the reset —
        // retry without the continue URL so the email still goes out.
        if (authErrorCode(error) === "auth/unauthorized-continue-uri" && continueUrl) {
          await sendPasswordResetEmail(auth, normalizedEmail);
        } else {
          throw error;
        }
      }
      return {
        success: true,
        message: `अगर ${normalizedEmail} से कोई account बना है, तो reset link भेज दिया गया है। Inbox के साथ Spam/Promotions folder भी ज़रूर देखें (भेजने वाला: noreply@my-website-761e9.firebaseapp.com). 2-3 मिनट में link न मिले तो इसका मतलब है कि इस email से कोई account नहीं है — पहले Sign Up करें।`,
      };
    } catch (error) {
      return { success: false, message: authErrorMessage(error), code: authErrorCode(error) };
    }
  }, []);

  const updateAccount = useCallback(async (details: { name: string; mobile: string; bio: string }): Promise<AuthResult> => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return { success: false, message: "Login is required." };
    try {
      await updateProfile(firebaseUser, { displayName: details.name.trim() });
      await setDoc(doc(db, "users", firebaseUser.uid), {
        name: details.name.trim(),
        mobile: details.mobile.replace(/\D/g, "").slice(-10),
        bio: details.bio.trim().slice(0, 240),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      const updated = await readAppUser(firebaseUser);
      setUser(updated);
      return { success: true, message: "Profile updated successfully." };
    } catch (error) {
      return { success: false, message: authErrorMessage(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    // P0-2 FIX: logout must never leave a blank screen.
    // Root cause: the old implementation only called web `signOut(auth)` and
    // setUser(null) — on the APK the native FirebaseAuthentication session
    // stayed alive, the 10 s sharedSnapshot grace window replayed the previous
    // user's doc, and callers used `.then(navigate)` so a rejected signOut
    // (flaky network / partitioned storage) left the hash on a protected route
    // with user=null → protectedRoutePending skeleton or — on a slow chunk —
    // a blank Suspense fallback. The fix:
    // 1) clear native session when inside Capacitor,
    // 2) always clear local caches and purge sharedSnapshot,
    // 3) always setUser(null) + setLoading(false) even if signOut throws,
    // 4) always navigate away from a protected route (finally guarantee).
    const prevUid = auth.currentUser?.uid || user?.id || null;
    clearAdminSession();
    // Best-effort native sign-out (APK only) — web bundle never pays for it.
    try {
      if (isCapacitorNative()) {
        try {
          const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
          await FirebaseAuthentication.signOut().catch(() => {});
        } catch {}
      }
    } catch {}
    try {
      await signOut(auth);
    } catch (error) {
      console.warn("[logout] signOut failed, clearing locally", error);
    } finally {
      // Purge per-user caches so the next sign-in never replays stale data.
      if (prevUid) {
        try {
          const { purgeSharedDoc } = await import("../lib/sharedSnapshot");
          purgeSharedDoc(`users/${prevUid}`);
        } catch {}
        try { localStorage.removeItem(`eduvora.myDaySystemNotifications.v1:${prevUid}`); } catch {}
        try { localStorage.removeItem(`eduvora.myDayAlarmIds.v1:${prevUid}`); } catch {}
        try { localStorage.removeItem(`eduvora.flowPathSystemNotifications.v1:${prevUid}`); } catch {}
        try { localStorage.removeItem(`eduvora.flowPathAlarmIds.v1:${prevUid}`); } catch {}
        try { sessionStorage.removeItem("authReturnHash"); } catch {}
      }
      // Clear any user-scoped session keys.
      try { sessionStorage.removeItem("authReturnHash"); } catch {}
      // A pending Google redirect that never completed must not greet the NEXT
      // learner with "session wapas नहीं आया" on an unrelated app open.
      clearGoogleRedirectMarker();
      setUser(null);
      setLoading(false);
      // Guarantee navigation: if the caller forgot or signOut threw, we still
      // leave a protected route. Use replace so Back doesn't land on a dead
      // protected page. Protected prefixes are duplicated here to avoid an
      // import cycle with utils/appRoutes.
      try {
        const hash = window.location.hash || "";
        const protectedPrefixes = ["#/checkout", "#/my-day", "#/profile", "#/study-library", "#/course/", "#/subscription", "#/myday", "#/flowpath", "#/revision"];
        const isProtected = protectedPrefixes.some((prefix) => hash.startsWith(prefix));
        if (isProtected) {
          sessionStorage.setItem("authReturnHash", hash);
          window.location.hash = `#/auth?mode=login&return=${encodeURIComponent(hash)}`;
        }
      } catch {}
    }
  }, [user?.id]);

  const value = useMemo(
    () => ({
      user,
      loading,
      restoringSession,
      googleNotice,
      dismissGoogleNotice: () => setGoogleNotice(null),
      refresh,
      login,
      signup,
      loginWithGoogle,
      loginAdmin,
      loginAdminWithGoogle,
      resetPassword,
      updateAccount,
      logout,
      setUser,
    }),
    [user, loading, restoringSession, googleNotice, refresh, login, signup, loginWithGoogle, loginAdmin, loginAdminWithGoogle, resetPassword, updateAccount, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
