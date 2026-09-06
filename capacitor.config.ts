// capacitor.config.ts
//
// TWA / Capacitor configuration for the Eduvora PWA.
//
// The app is mobile-first on the web (vite-plugin-singlefile produces
// one HTML file with the entire JS bundle inlined). Capacitor wraps
// that PWA into a native Android shell (a Trusted Web Activity) that
// runs the same JavaScript inside WebView but can use the device's
// native notification APIs, intent system, and Play Store install.
//
// Why this is on a separate config file and not in vite.config.ts:
// Capacitor's own runtime (the @capacitor/cli invoked at build time
// to call `cap sync android`) reads this file. Keeping it top-level
// means the Capacitor tooling can find it without knowing about Vite
// internals.
//
// What this config does:
//   • appId        — the unique Android package id, used for the
//                    Play Store listing, the signed AAB, and the
//                    FCM token registration namespace.
//   • appName      — what the app is called inside the launcher.
//   • webDir       — the folder Capacitor copies into the native
//                    shell on `npx cap sync android`. Pointed at
//                    `dist` because vite outputs there.
//   • server       — only used in dev mode (`cap run android`).
//                    Production loads files from inside the APK.
//   • android      — all the Android-specific tuning: package id,
//                    signing config (debug by default; release uses
//                    the keystore the user creates in the Play
//                    Console), allowMixedContent=false so the
//                    WebView refuses plain-http XHR (the entire app
//                    is HTTPS), captureInput so the WebView grabs
//                    key events (online tests use keyboard input).
//
//   • plugins      — third-party Capacitor plugins. Push Notifications
//                    and Local Notifications are what give us
//                    100% reliable, exact-time, background delivery
//                    that Web Push on Android Chrome can never match.

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.eduvora.shop",
  appName: "Eduvora",
  webDir: "dist",
  // Local URL for `npx cap run android` during dev. In production the
  // APK loads files from the bundled assets folder, so this field is
  // a no-op for the release build.
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    // Reuse the web manifest's package id so the icon, splash, theme
    // colour and start_url are all picked up automatically.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    // The Play Store install path is the canonical FCM registration
    // namespace. The server-side send.ts uses this same id to know
    // which project the device token belongs to.
    backgroundColor: "#ffffff",
  },
  plugins: {
    PushNotifications: {
      // FCM is enabled at runtime via google-services.json (added
      // during `cap sync android`). No extra config needed here.
    },
    // Native Google Sign-In. Google's Secure Browser Policy blocks its OAuth
    // page inside an embedded WebView, so the web SDK's popup/redirect flows
    // can never complete inside this APK. This plugin instead calls the Play
    // Services account picker natively and returns an ID token, which
    // src/context/AuthContext.tsx exchanges for a normal Firebase web-SDK
    // session (signInWithCredential) so Firestore rules, onAuthStateChanged
    // and every existing screen keep working unchanged.
    //
    // `skipNativeAuth: false` lets the plugin sign in to the native Firebase
    // SDK too, which keeps the native and web sessions in step.
    // Requires android/app/google-services.json with the SHA-1 fingerprints
    // of every signing key registered — see docs/android-google-signin.md.
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
    LocalNotifications: {
      // Capacitor's LocalNotifications plugin can fire a notification
      // at an exact wall-clock time even when the app is closed and
      // the phone is locked. This is what gives us the "1 minute
      // delivery" guarantee that Web Push on Android can never make.
    },
  },
};

export default config;
