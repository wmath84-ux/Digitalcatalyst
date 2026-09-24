// src/lib/googleIdentity.ts
//
// Google Identity Services (GIS) loader + One Tap controller.
//
// WHY THIS EXISTS (owner report, 2026-09-24): "Google ID picker Chrome
// toolbar ke saath khulta hai" — Firebase's `signInWithPopup()` on phones
// and installed PWAs opens Google's account chooser as a FULL BROWSER TAB
// (mobile Chrome cannot open real popup windows; `window.open` on Android
// always creates a tab with the toolbar/address bar, and an installed-PWA
// window hands the chooser to a separate Chrome window). The learner leaves
// the app, picks an account inside Chrome's UI, and lands back through a
// jarring tab switch.
//
// THE FIX is Google's own browser-native account picker: the GIS "One Tap"
// prompt with FedCM (`use_fedcm_for_prompt: true`), which Chrome draws
// INSIDE the page — a bottom sheet on phones, an anchored card on desktop.
// No new tab, no toolbar, no leaving the app. This is Google's documented
// migration path (developers.google.com/identity/gsi/web/guides/
// fedcm-migration): One Tap + Button with FedCM is the browser-mediated UI
// and needs NO third-party cookies on Chrome 120+.
//
// The ID token it returns signs into Firebase with
//   signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
// — the exact same web-SDK session the popup flow produced, so
// `onAuthStateChanged`, Firestore rules and every screen behave unchanged.
// (The Android APK keeps its native Play-Services sheet via
// @capacitor-firebase/authentication — that sheet already has no Chrome UI.)
//
// EVERY failure here degrades to the app's existing popup flow, never to a
// dead button:
//   · script blocked / GIS missing            → "unavailable" → popup
//   · One Tap skipped (no Google session in
//     the browser, cooldown, unsupported
//     browser, unauthorized client origin)    → "skipped"    → popup
//   · learner closes the sheet                → "dismissed"  → treated as a
//     cancel, exactly like closing the popup today.
//
// CONFIG: a Google Cloud **Web** OAuth client ID whose "Authorized
// JavaScript origins" include the origin serving the app (eduvora.shop,
// www.eduvora.shop, preview domains, localhost for dev). It must belong to
// the SAME Google Cloud project as Firebase (project 930483750234 =
// my-website-761e9). Set VITE_GOOGLE_WEB_CLIENT_ID to override the default,
// which is the web client this project already ships for the APK flow
// (capacitor.config.ts → plugins.FirebaseAuthentication.webClientId).

export interface GoogleIdentityIdConfiguration {
  client_id: string;
  callback: (response: { credential?: string }) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  itp_support?: boolean;
  use_fedcm_for_prompt?: boolean;
  use_fedcm_for_button?: boolean;
  error_callback?: (error: { type?: string }) => void;
}

interface GoogleIdApi {
  initialize: (config: GoogleIdentityIdConfiguration) => void;
  prompt: (listener?: (notification: PromptMomentNotification) => void) => void;
  cancel?: () => void;
}

interface PromptMomentNotification {
  isDisplayMoment?: () => boolean;
  isDisplayed?: () => boolean;
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getDismissedReason?: () => string;
}

interface GoogleAccountsNamespace {
  id: GoogleIdApi;
}

const readGoogle = (): GoogleAccountsNamespace | null => {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }).google;
  return candidate?.accounts?.id ? (candidate as unknown as GoogleAccountsNamespace) : null;
};

/** The project's existing Web OAuth client (same project as Firebase). */
export const DEFAULT_GSI_WEB_CLIENT_ID =
  "930483750234-7b4upatuokv8smst1ctljsgpchs9r39m.apps.googleusercontent.com";

export const gsiWebClientId = (): string => {
  const fromEnv =
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_GOOGLE_WEB_CLIENT_ID || "").trim();
  return fromEnv || DEFAULT_GSI_WEB_CLIENT_ID;
};

let scriptPromise: Promise<boolean> | null = null;

/**
 * Inject `https://accounts.google.com/gsi/client` once. Resolves `true` when
 * `google.accounts.id` is ready, `false` when the script cannot load (offline,
 * blocked by an extension/VPN) — never throws.
 */
export function loadGoogleIdentityScript(timeoutMs = 9000): Promise<boolean> {
  if (readGoogle()) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") {
      scriptPromise = null;
      resolve(false);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) scriptPromise = null; // allow a later retry
      resolve(ok && Boolean(readGoogle()));
    };
    const timer = window.setTimeout(() => {
      script.remove();
      finish(false);
    }, timeoutMs);
    script.onload = () => {
      window.clearTimeout(timer);
      // The client evaluates asynchronously — poll briefly for the API.
      let tries = 0;
      const poll = window.setInterval(() => {
        tries += 1;
        if (readGoogle()) {
          window.clearInterval(poll);
          finish(true);
        } else if (tries > 40) {
          window.clearInterval(poll);
          finish(false);
        }
      }, 100);
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      finish(false);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type GoogleOneTapOutcome =
  | { kind: "credential"; idToken: string }
  | { kind: "skipped" }
  | { kind: "dismissed" }
  | { kind: "unavailable" };

// One GIS initialization per page: `initialize()` replaces the callback, and
// a second `prompt()` while one is pending is skipped by Google. These
// module-level fields serialise the whole flow.
let initializedClientId: string | null = null;
let pendingResolve: ((outcome: GoogleOneTapOutcome) => void) | null = null;
let credentialArrived = false;

const resetPending = () => {
  pendingResolve = null;
  credentialArrived = false;
};

/**
 * Show Google's native (FedCM) account chooser and resolve with the outcome.
 *
 * Resolves (never throws):
 *   · "credential"  — the learner picked an account; `idToken` is a Google
 *                     ID token (JWT) for signInWithCredential.
 *   · "skipped"     — Google did not / could not show the chooser (caller
 *                     should fall back to the popup flow).
 *   · "dismissed"   — the learner closed the chooser (treat as a cancel).
 *   · "unavailable" — GIS could not be loaded or is missing the prompt API.
 */
export async function promptGoogleOneTap(options?: {
  clientId?: string;
  timeoutMs?: number;
}): Promise<GoogleOneTapOutcome> {
  const clientId = (options?.clientId || gsiWebClientId()).trim();
  const ready = await loadGoogleIdentityScript(options?.timeoutMs);
  const googleId = readGoogle();
  if (!ready || !googleId || !clientId) return { kind: "unavailable" };

  // A prompt is already in flight — don't fight Google's one-prompt-per-page
  // rule; report it as skipped so the caller can use its popup fallback.
  if (pendingResolve) return { kind: "skipped" };

  return new Promise<GoogleOneTapOutcome>((resolve) => {
    credentialArrived = false;
    const finish = (outcome: GoogleOneTapOutcome) => {
      pendingResolve = null;
      resolve(outcome);
    };
    pendingResolve = finish;

    if (initializedClientId !== clientId) {
      try {
        googleId.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          // THE fix: the browser draws the chooser natively (FedCM) instead
          // of Google's legacy popup page — no tab, no toolbar.
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
          callback: (response: { credential?: string }) => {
            const idToken = String(response?.credential || "");
            if (!idToken || !pendingResolve) return;
            credentialArrived = true;
            finish({ kind: "credential", idToken });
          },
          error_callback: () => {
            // Configuration/type errors (e.g. unauthorized origin): same
            // handling as a skip — the popup fallback still signs in.
            if (pendingResolve && !credentialArrived) finish({ kind: "skipped" });
          },
        });
        initializedClientId = clientId;
      } catch {
        finish({ kind: "unavailable" });
        return;
      }
    }

    try {
      googleId.id.prompt((notification: PromptMomentNotification) => {
        if (!pendingResolve) return;
        // Under FedCM the display-moment notifications are not delivered
        // (Google removed them); skip/dismissed still fire.
        if (typeof notification?.isSkippedMoment === "function" && notification.isSkippedMoment()) {
          finish({ kind: "skipped" });
          return;
        }
        if (typeof notification?.isDismissedMoment === "function" && notification.isDismissedMoment()) {
          // A credential usually lands with (or just before) a dismissed
          // moment that says so — never turn a success into a cancel.
          if (credentialArrived) return;
          const reason = typeof notification.getDismissedReason === "function"
            ? notification.getDismissedReason()
            : "";
          if (/credential/i.test(reason)) return;
          finish({ kind: "dismissed" });
        }
      });
    } catch {
      finish({ kind: "skipped" });
    }
  });
}

/** Best-effort cancel of a visible prompt (used when a flow abandons it). */
export function cancelGoogleOneTap(): void {
  if (pendingResolve) {
    pendingResolve({ kind: "dismissed" });
  }
  try {
    readGoogle()?.id.cancel?.();
  } catch {
    /* nothing to cancel */
  }
  resetPending();
}
