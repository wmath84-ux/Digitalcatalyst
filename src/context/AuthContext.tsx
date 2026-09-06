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
  signInWithCredential,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { APPROVED_ADMIN_EMAIL, clearAdminSession, createAdminSession } from "../utils/adminSession";
import { hasNativeGoogleAuth, isCapacitorNative, isEmbeddedWebView } from "../utils/nativeRuntime";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// On phones and installed PWAs, `signInWithPopup` opens the Google account
// chooser inside a full Chrome tab (blue header + three-dot menu with
// "Desktop site"). Firebase recommends `signInWithRedirect` there instead —
// the account chooser stays in the current window and returns automatically.
const isMobileOrStandalone = () =>
  typeof window !== "undefined" &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia("(display-mode: standalone)").matches);

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
    // The picker was dismissed, or Play Services returned nothing usable.
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

  const commitFirebaseUser = useCallback(async (firebaseUser: FirebaseUser) => {
    const appUser = await ensureUserProfile(firebaseUser);
    setUser(appUser);
    return appUser;
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

  // Consume any leftover redirect result. Missing sessionStorage state is
  // expected after a partitioned-browser bounce — ignore it so login UI works.
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) return commitFirebaseUser(result.user);
        return undefined;
      })
      .catch((error) => {
        const raw = typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message || "")
          : "";
        if (/missing initial state/i.test(raw)) return;
        console.warn("Google redirect sign-in failed", authErrorMessage(error));
      });
  }, [commitFirebaseUser]);

  useEffect(() => {
    if (!user || !auth.currentUser || auth.currentUser.uid !== user.id) return undefined;
    return onSnapshot(doc(db, "users", user.id), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setUser((current) => current && current.id === snapshot.id ? {
        ...current,
        name: String(data.name || current.name),
        mobile: String(data.mobile || ""),
        bio: String(data.bio || ""),
        subscriptionTier: String(data.subscriptionTier || current.subscriptionTier || "basic"),
        photoURL: String(data.photoURL || current.photoURL || ""),
        role: data.role === "admin" ? "admin" : "user",
      } : current);
    }, (error) => console.warn("Live Firebase profile sync failed", error));
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
      const credential = hasNativeGoogleAuth()
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
    if (hasNativeGoogleAuth()) {
      try {
        await setPersistence(auth, browserLocalPersistence);
        const credential = await signInWithGoogleNatively();
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
        // A missing google-services.json / unregistered SHA-1 surfaces here
        // (DEVELOPER_ERROR / ApiException 10), so say what to actually fix.
        if (/DEVELOPER_ERROR|ApiException:?\s*10\b/i.test(raw)) {
          return {
            success: false,
            code: "auth/native-google-misconfigured",
            message: "Google sign-in इस build में configure नहीं है (app का SHA-1 fingerprint Firebase में registered नहीं है)। कृपया email aur password से login करें।",
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

      // --- NATIVE ANDROID BRANCH ADDED HERE ---
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (!result.credential?.idToken) {
          throw new Error("Google Sign-In failed to return an ID token.");
        }
        const credential = GoogleAuthProvider.credential(result.credential.idToken);
        const authResult = await signInWithCredential(auth, credential);
        await commitFirebaseUser(authResult.user);
        return { success: true, message: "Google login successful." };
      }
      // ----------------------------------------

      let credential;
      try {
        credential = await signInWithPopup(auth, googleProvider);
      } catch (popupError) {
        const popupCode = authErrorCode(popupError);
        if (popupCode !== "auth/popup-blocked" && popupCode !== "auth/cancelled-popup-request") {
          throw popupError;
        }
        if (!isMobileOrStandalone()) throw popupError;
        await signInWithRedirect(auth, googleProvider);
        return { success: true, message: "Google login started." };
      }
      await commitFirebaseUser(credential.user);
      return { success: true, message: "Google login successful." };
    } catch (error) {
      return { success: false, message: authErrorMessage(error) };
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
    clearAdminSession();
    await signOut(auth);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
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
    [user, loading, refresh, login, signup, loginWithGoogle, loginAdmin, loginAdminWithGoogle, resetPassword, updateAccount, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
