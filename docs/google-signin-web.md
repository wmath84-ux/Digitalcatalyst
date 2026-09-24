# Google login on the web — "picker khula, account chuna, wapas aaya, login nahin hua"

## 2026-09-24 — the picker now opens WITHOUT the Chrome toolbar (FedCM One Tap)

### The report

> "Jo Google ID picker page open hota hai, vah Chrome toolbar ke saath open
> hota hai" — website, PWA aur APK, teeno jagah.

### Root cause (deep-dive)

`signInWithPopup()` asks the browser for a popup window via `window.open`,
but **mobile Chrome cannot open popup windows at all** — ever since Chrome 59
(crbug.com/723655) every `window.open` on Android becomes a **full browser
tab** with the toolbar and address bar. So on phones, tablets and installed
PWAs the Google account chooser always appeared as a separate Chrome page:
the learner left the app, picked an account inside Chrome's UI, and was
bounced back through a tab switch. (Desktop Chrome still opens a real
chromeless popup; that is why desktop looked fine.) The redirect fallback was
worse — a full-page navigation. No Firebase option changes this: it is
browser behaviour, not a Firebase bug.

### The fix — Google's native account sheet (GIS One Tap + FedCM)

Google's documented replacement for the popup chooser is the **One Tap
prompt with FedCM** (developers.google.com/identity/gsi/web/guides/
fedcm-migration): the *browser itself* draws a "Choose an account" sheet
INSIDE the page — a bottom sheet on phones, an anchored card on desktop —
no new tab, no toolbar, no third-party cookies needed (Chrome 120+). The
learner never leaves the app.

Flow (`src/lib/googleIdentity.ts` + `src/context/AuthContext.tsx`):

1. `https://accounts.google.com/gsi/client` is loaded lazily (only on the
   auth path), then `google.accounts.id.initialize({ client_id, callback,
   use_fedcm_for_prompt: true, use_fedcm_for_button: true, itp_support: true })`.
2. Tapping "Continue with Google" calls `google.accounts.id.prompt()`.
3. The returned ID token is exchanged with
   `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))` —
   the exact same web-SDK session the popup produced, so profile sync,
   Firestore rules and every screen are unchanged (this is also how the APK's
   native sheet already signs in).

Every failure degrades to the previous popup flow — never a dead button:

| Outcome | Meaning | Behaviour |
| --- | --- | --- |
| `credential` | learner picked an account | sign in, done |
| `dismissed` | learner closed the sheet | treated as a cancel (same message as closing the popup) |
| `skipped` | no Google session in the browser, One Tap cooldown (Google suppresses re-prompts after a dismissal), FedCM-less browser (older Chrome/Firefox), or this origin missing from the client | falls back to `signInWithPopup()` |
| `unavailable` | GIS script blocked/failed to load | falls back to `signInWithPopup()` |

`loginWithGoogle()` AND `loginAdminWithGoogle()` both take this path on the
web. The APK keeps its native Play-Services sheet
(`@capacitor-firebase/authentication`) — that sheet is a system UI with no
Chrome chrome, and if it is ever unavailable the build explains itself
(`auth/native-google-plugin-missing` / `auth/native-google-misconfigured`).

### Required console setup (one-time)

The One Tap client must be a **Web** OAuth client in the SAME Google Cloud
project as Firebase (`my-website-761e9` / `930483750234`). The default used
by the app is the project's existing web client
`930483750234-7b4upatuokv8smst1ctljsgpchs9r39m.apps.googleusercontent.com`
(the one `capacitor.config.ts` already ships). In Google Cloud Console →
APIs & Services → Credentials → that client → **Authorized JavaScript
origins**, add every origin the app is served from:

- `https://eduvora.shop`
- `https://www.eduvora.shop` (if served)
- every Vercel preview/production domain used
- `http://localhost:5173` (local dev)

Override the client at build time with `VITE_GOOGLE_WEB_CLIENT_ID` if you
create a dedicated one. **A missing origin is not a failure** — Google then
never shows the sheet and the app quietly uses the popup flow as before.

### Notes & limits (documented by Google)

- FedCM requires Chrome 117+ (older browsers → popup fallback).
- After the learner closes the sheet, Google enforces a cooldown before the
  prompt may show again; during it the popup fallback runs instead.
- With FedCM, `isDisplayed()`/`isNotDisplayed()` notifications are not
  delivered — the code relies only on `skipped`/`dismissed`/callback.
- Inside embedded WebViews (in-app browsers) the app refuses web Google
  sign-in outright (Google's Secure Browser Policy) and says so.

---

# Original report — "picker khula, account chuna, wapas aaya, login nahin hua"

## The report

> Google login per click karta hun, Google ID picker open hota hai, main wahan se
> ID select karta hun, lekin wapas app mein aane ke bad jab redirect karta hai to
> login nahin hota.

The learner is not imagining it, and nothing is wrong with their Google account.
The app was using the one Firebase sign-in flow that **cannot** work for an app
hosted on its own domain, and it was failing *silently*: no error, no toast, just
the login screen again.

## Root cause 1 — `signInWithRedirect()` needs cross-origin storage on the way back

`loginWithGoogle()` preferred `signInWithRedirect()` on phones and installed PWAs
(the `isMobileOrStandalone()` branch). Firebase's own guidance
([Best practices for using signInWithRedirect on browsers that block third-party
storage access](https://firebase.google.com/docs/auth/web/redirect-best-practices))
states that the redirect flow only works unchanged when the app itself is served
from `<project>.firebaseapp.com`. This app is served from `eduvora.shop` (Vercel),
so the flow looks like this:

1. `signInWithRedirect()` writes `pendingRedirect` to **our** sessionStorage and
   navigates the tab to `https://my-website-761e9.firebaseapp.com/__/auth/handler`.
2. Google authenticates. The helper page stores the auth event in **its own**
   (top-level `firebaseapp.com`) storage and sends the tab back to the app.
3. The app boots and calls `getRedirectResult()`, which loads
   `firebaseapp.com/__/auth/iframe` — now a **third-party** frame inside
   `eduvora.shop`. Browsers that partition or block third-party storage give it a
   *different* storage jar than the one step 2 wrote to, so the frame has no event
   to hand over.
4. `RedirectAction.onAuthEvent()` receives the sentinel `unknown` event and
   `getRedirectResult()` **resolves with `null`** — not a rejection. The old code
   only had a branch for a rejected promise, so the learner saw nothing at all.

That is the whole "login nahin hota": the session was created on Google's side,
thrown away on the way back, and the UI had no way to say so.

## Root cause 2 — a restored session never left the login screen

`AuthForm.completeSuccess()` navigates away after a sign-in **it** started. The
redirect return leg is resolved by `AuthProvider` during boot, so no navigation
ever happened: even in the browsers where step 3 *did* work, the learner was left
standing on `#/auth` with a valid session, looking at a login form.

## What changed

| File | Change |
| --- | --- |
| `src/context/AuthContext.tsx` | Web Google sign-in is **popup-first on every device** (Firebase's Option 2 — the popup returns through `postMessage`, so it never depends on cross-origin storage). `signInWithRedirect()` survives only as a fallback when a popup is blocked/unsupported, and writes a `eduvora.googleRedirectPending.v1` marker before the tab leaves. |
| `src/context/AuthContext.tsx` | Boot consumes `getRedirectResult()` and now handles the **empty** result: with a fresh marker it publishes `googleNotice` (explanation + retry) instead of failing silently. Stale markers (>10 min) are dropped so an ordinary app open never shows a scary message. |
| `src/context/AuthContext.tsx` | `restoringSession` is exposed while the return leg resolves, and `commitFirebaseUser()` falls back to a profile built from the Firebase auth record (`authRecordUser`) when the Firestore read/write fails — a network hiccup right after the picker closes no longer looks like a failed login. |
| `src/context/AuthContext.tsx` | Native (APK) path: a picker that returns a user **without** an ID token is now reported as a misconfigured build (`auth/native-google-no-id-token`) instead of "you cancelled". |
| `src/main.tsx` | New shell effect: as soon as `user` exists while the hash is `#/auth`, navigate to the resolved destination. Covers the redirect return, a restored IndexedDB session, and any other path that signs in outside the form. |
| `src/utils/appRoutes.ts` | `resolveAuthSuccessDestination()` — ONE answer for "where does a successful login land?" (`?return=` → parked `authReturnHash` → fallback), shared by the form and the shell so they can never disagree. |
| `src/components/auth/AuthForm.tsx` | Spinner + disabled button while the session restores, an amber notice with **"Google से फिर कोशिश करें"** when the redirect came back empty, and the shared destination helper. |
| `firebase.ts`, `vercel.json`, `.env.example` | Optional upgrade path to make the *redirect* flow first-party too (Firebase's Option 3): `vercel.json` proxies `/__/auth/*` to `<project>.firebaseapp.com`, and `authDomain` can be pointed at the app's own domain through `VITE_FIREBASE_AUTH_DOMAIN`. Off by default — see below. |
| `tests/googleSignInReturnContract.test.mjs` | Pins all of it: popup-before-redirect, the marker, the empty-result notice, the shell leaving `#/auth`, and the destination precedence. |

## Optional: also repair the redirect flow (needs two console clicks)

Popup is the default and needs no configuration. If you *also* want the
same-tab redirect flow to work (nicer on phones — no second tab), do Firebase's
Option 3:

1. **Google Cloud Console** → APIs & Services → Credentials → the web OAuth
   client `930483750234-7b4upatuokv8smst1ctljsgpchs9r39m` → *Authorized redirect
   URIs* → add `https://eduvora.shop/__/auth/handler`.
2. Set `VITE_FIREBASE_AUTH_DOMAIN=eduvora.shop` in the Vercel environment and
   redeploy.

The `/__/auth/*` proxy rewrite is already in `vercel.json`; it is inert until
step 2. **Do not set the variable without step 1** — Google rejects the flow with
`redirect_uri_mismatch` and login breaks harder than before. Every additional
domain that serves the app (preview URLs, a second production domain) needs the
same redirect URI entry.

## Android APK

Unrelated to the above: inside the Capacitor shell the web SDK cannot be used at
all (Google refuses its OAuth page in an embedded WebView), so the APK keeps
using `@capacitor-firebase/authentication` → Play Services account picker →
`signInWithCredential()`. See `docs/android-google-signin.md`, and run
`npm run verify:google-signin` before building.
