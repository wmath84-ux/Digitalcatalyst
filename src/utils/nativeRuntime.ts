// src/utils/nativeRuntime.ts
//
// "Are we running inside the Capacitor Android shell?"
//
// This matters for authentication. The APK is a Capacitor WebView loading the
// same web bundle the browser loads, so ALL the web Firebase Auth code runs
// there too — but two of its paths are blocked by Google inside a WebView:
//
//   · signInWithPopup    → window.open has no browser chrome to return to;
//                          the popup either never opens or never posts back.
//   · signInWithRedirect → Google's OAuth server refuses any embedded
//                          WebView user-agent with `disallowed_useragent`
//                          (this is a Google policy, not a Firebase bug, and
//                          no SHA-1 / OAuth-client change can lift it).
//
// Native Google sign-in inside an APK therefore needs a NATIVE plugin
// (@capacitor-firebase/authentication) which calls the Play Services account
// picker and hands the resulting ID token to Firebase. That plugin IS now
// installed and wired up in src/context/AuthContext.tsx; the helpers below
// decide which path to take at runtime, and let the UI explain itself when
// neither path can work (e.g. an Instagram in-app browser on the web).

export const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  if (!capacitor) return false;
  try {
    if (typeof capacitor.isNativePlatform === "function") return capacitor.isNativePlatform();
    if (typeof capacitor.getPlatform === "function") return capacitor.getPlatform() !== "web";
  } catch {
    /* fall through */
  }
  return false;
};

/**
 * True when the page is inside SOME embedded WebView (the Capacitor shell, an
 * in-app browser like Instagram / Facebook / LinkedIn, or a custom Android
 * WebView). Google's OAuth endpoint rejects all of these.
 */
export const isEmbeddedWebView = (): boolean => {
  if (isCapacitorNative()) return true;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Android WebViews carry `; wv)` in the UA; the rest are known in-app browsers.
  return /;\s*wv\)/i.test(ua) || /\b(FBAN|FBAV|Instagram|Line|MicroMessenger|GSA)\b/i.test(ua);
};

/**
 * True when the native Google sign-in plugin is actually available to call.
 *
 * Checked at RUNTIME rather than at build time on purpose: the same JS bundle
 * is served to the website and packaged into the APK, and only the APK has the
 * native plugin registered on `Capacitor.Plugins`. On the website this returns
 * false and the web popup/redirect flow is used, exactly as before.
 */
export const hasNativeGoogleAuth = (): boolean => {
  if (typeof window === "undefined") return false;
  if (!isCapacitorNative()) return false;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  return Boolean(plugins && plugins.FirebaseAuthentication);
};
