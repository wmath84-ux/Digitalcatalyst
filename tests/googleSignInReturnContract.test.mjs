import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveAuthSuccessDestination } from "../src/utils/appRoutes.ts";

const auth = fs.readFileSync("src/context/AuthContext.tsx", "utf8");
const form = fs.readFileSync("src/components/auth/AuthForm.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const firebaseConfig = fs.readFileSync("firebase.ts", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

/**
 * The bug this file pins: "Google picker khula, account select kiya, app mein
 * wapas aaya — login nahin hua."
 *
 * Two independent causes, both fixed:
 *   1. the web flow preferred `signInWithRedirect()` on phones / installed
 *      PWAs. Firebase documents that redirect only works unchanged when the
 *      app is served from `<project>.firebaseapp.com`; anywhere else the return
 *      leg needs cross-origin storage, a partitioning browser withholds it, and
 *      `getRedirectResult()` resolves to `null` — no error, no session.
 *   2. even when a session DID come back, nothing moved the learner off
 *      `#/auth`, so a successful sign-in looked exactly like a failed one.
 */

const storage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
};

test("login lands on the ?return= route the guard asked for", () => {
  const hash = "#/auth?mode=login&return=%23%2Fcheckout";
  assert.equal(resolveAuthSuccessDestination(hash, storage(), "#/home"), "#/checkout");
});

test("login falls back to the parked route, then to the caller's fallback", () => {
  assert.equal(
    resolveAuthSuccessDestination("#/auth", storage({ authReturnHash: "#/my-day" }), "#/home"),
    "#/my-day",
  );
  assert.equal(resolveAuthSuccessDestination("#/auth", storage(), "#/store"), "#/store");
  assert.equal(resolveAuthSuccessDestination("", null), "#/home");
});

test("an auth screen can never be a post-login destination (no bounce loop)", () => {
  const hash = "#/auth?mode=login&return=%23%2Fauth";
  assert.equal(
    resolveAuthSuccessDestination(hash, storage({ authReturnHash: "#/admin-login" }), "#/home"),
    "#/home",
  );
});

test("a malformed return argument is ignored instead of navigating nowhere", () => {
  assert.equal(
    resolveAuthSuccessDestination("#/auth?return=https%3A%2F%2Fevil.example", storage(), "#/home"),
    "#/home",
  );
});

test("the web Google flow tries the popup on EVERY device, phone included", () => {
  // The device sniff that forced redirect on mobile must stay gone…
  assert.doesNotMatch(auth, /isMobileOrStandalone/);
  // …and inside loginWithGoogle the popup must be attempted BEFORE any
  // redirect, so a phone never starts with the flow that cannot come back.
  const loginFn = auth.slice(auth.indexOf("const loginWithGoogle = useCallback"));
  const popupAt = loginFn.indexOf("signInWithPopup(auth, googleProvider)");
  const redirectAt = loginFn.indexOf("signInWithRedirect(auth, googleProvider)");
  assert.ok(popupAt > 0, "loginWithGoogle no longer calls signInWithPopup");
  assert.ok(redirectAt > popupAt, "redirect must only run as a fallback after the popup");
  // Only a blocked/unsupported popup falls through — a learner closing the
  // picker is a cancel, not a reason to reload the whole tab.
  assert.match(auth, /POPUP_FALLBACK_CODES/);
  assert.match(auth, /auth\/popup-blocked/);
  assert.match(auth, /auth\/operation-not-supported-in-this-environment/);
});

test("the redirect fallback leaves a marker so an empty return is explainable", () => {
  assert.match(auth, /GOOGLE_REDIRECT_MARKER_KEY/);
  const loginFn = auth.slice(auth.indexOf("const loginWithGoogle = useCallback"));
  assert.ok(
    loginFn.indexOf("writeGoogleRedirectMarker()") < loginFn.indexOf("signInWithRedirect(auth, googleProvider)"),
    "the marker must be written before the tab navigates away",
  );
});

test("boot consumes the redirect result and never fails silently", () => {
  assert.match(auth, /getRedirectResult\(auth\)/);
  // A null result WITH a fresh marker is the storage-partitioning failure: it
  // must reach the learner as a message plus a retry, not as a dead screen.
  assert.match(auth, /setGoogleNotice\(/);
  assert.match(auth, /markerIsFresh/);
  assert.match(auth, /setRestoringSession\(false\)/);
});

test("a Firestore hiccup after sign-in still publishes the session", () => {
  assert.match(auth, /const authRecordUser = /);
  const commit = auth.slice(auth.indexOf("const commitFirebaseUser = useCallback"));
  assert.ok(commit.indexOf("authRecordUser(firebaseUser)") < commit.indexOf("}, []);"));
});

test("the app shell leaves #/auth as soon as a session exists", () => {
  assert.match(main, /resolveAuthSuccessDestination\(hash, window\.sessionStorage, HOME_HASH\)/);
  const guard = main.slice(main.indexOf("Leave the login screen the moment a session exists"));
  assert.match(guard, /if \(loading \|\| !user\) return;/);
  assert.match(guard, /hash\.startsWith\(AUTH_HASH\)/);
  assert.match(guard, /window\.location\.hash = destination;/);
});

test("the auth form shows the restore state and a retry instead of a dead button", () => {
  assert.match(form, /restoringSession/);
  assert.match(form, /googleNotice/);
  assert.match(form, /Google session wapas aa रहा है…/);
  assert.match(form, /Google से फिर कोशिश करें/);
  // The Google button is disabled while the restore is in flight.
  assert.match(form, /const googleBusy = googleSubmitting \|\| restoringSession;/);
});

test("the native APK path distinguishes a cancel from a misconfigured build", () => {
  assert.match(auth, /auth\/native-google-no-id-token/);
  assert.match(auth, /Google account select हो गया, लेकिन app को ID token नहीं मिला/);
});

test("authDomain can be moved onto the app's own domain (redirect Option 3)", () => {
  assert.match(firebaseConfig, /VITE_FIREBASE_AUTH_DOMAIN/);
  assert.match(firebaseConfig, /authDomain: AUTH_DOMAIN/);
  // Default stays the Firebase Hosting helper domain, so nothing changes until
  // the Google OAuth redirect URI is registered for the custom domain.
  assert.match(firebaseConfig, /"my-website-761e9\.firebaseapp\.com"/);
});

test("vercel proxies /__/auth/* so a custom authDomain stays first-party", () => {
  const rewrite = (vercel.rewrites || []).find((entry) => entry.source === "/__/auth/:path*");
  assert.ok(rewrite, "missing the /__/auth/:path* rewrite");
  assert.match(rewrite.destination, /^https:\/\/my-website-761e9\.firebaseapp\.com\/__\/auth\/:path\*$/);
});

/**
 * The APK half of the same report: "Android mein Google login click karne par
 * Google ID picker open hi nahin hota, ek message dikhta hai ki login nahin ho
 * sakte." Two independent causes, both fixed:
 *
 *   1. `AuthForm` DISABLED the button whenever `hasNativeGoogleAuth()` read
 *      false — and it reads false on a cold screen even in a correctly built
 *      APK, because the plugin's JS module (the thing that registers the proxy
 *      on `Capacitor.Plugins`) is imported lazily. So the app showed
 *      "Google sign-in उपलब्ध नहीं है" and never even attempted the native
 *      picker.
 *   2. `android/app/google-services.json` is gitignored and Gradle silently
 *      skipped the google-services plugin without it, producing an APK that has
 *      no `default_web_client_id` — the native picker cannot request an ID
 *      token at all.
 */
const nativeRuntime = fs.readFileSync("src/utils/nativeRuntime.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const gradle = fs.readFileSync("android/app/build.gradle", "utf8");

test("inside the APK the Google button is never disabled on a lazy-plugin reading", () => {
  assert.match(form, /!isCapacitorNative\(\) && isEmbeddedWebView\(\) && !hasNativeGoogleAuth\(\)/);
  // …and the shell warms the plugin proxy so the first tap reaches the picker.
  assert.match(form, /warmNativeGoogleAuth\(\)/);
  assert.match(auth, /if \(isCapacitorNative\(\)\) void warmNativeGoogleAuth\(\);/);
  assert.match(nativeRuntime, /export const warmNativeGoogleAuth/);
});

test("a build without the native plugin says so instead of 'try again'", () => {
  assert.match(auth, /auth\/native-google-plugin-missing/);
  assert.match(auth, /native plugin मौजूद नहीं है/);
  assert.match(auth, /auth\/native-google-misconfigured/);
});

test("the android build scripts put google-services.json where Gradle reads it", () => {
  assert.ok(fs.existsSync("scripts/ensure-google-services.mjs"));
  assert.equal(pkg.scripts["ensure:google-services"], "node scripts/ensure-google-services.mjs");
  for (const script of ["android:sync", "android:assemble:debug", "android:bundle:release", "android:run"]) {
    assert.match(pkg.scripts[script], /ensure:google-services/, `${script} must ensure google-services.json`);
  }
});

test("Gradle no longer skips the google-services plugin silently", () => {
  assert.match(gradle, /logger\.warn\("android\/app\/google-services\.json/);
  assert.doesNotMatch(gradle, /logger\.info\("google-services\.json not found/);
});
