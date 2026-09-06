# Google Sign-In in the Android APK — why it fails, and the real fix

## TL;DR

The APK's Google login does **not** fail because of a missing SHA-1 fingerprint
or a missing Android OAuth client. It fails because **Google refuses to serve
its OAuth consent page inside an embedded WebView**, and the Capacitor APK is
an embedded WebView running the same web bundle the browser runs.

Adding a SHA-1 is still required later — but only as *step 3* of the real fix,
which is installing a native sign-in plugin. On its own, a SHA-1 changes
nothing, because the web SDK never reaches the native credential path.

---

## What is actually in this repo

| Thing | Status |
| --- | --- |
| `android/app/google-services.json` | **Not present**, and `.gitignore:41` excludes it. It has never been committed. |
| `@capacitor-firebase/authentication` (native Google sign-in) | Was **not installed** — this is what actually broke sign-in. Now installed at 7.5.0 and registered with Gradle. |
| Firebase Android SDK in Gradle | Was `firebase-messaging` only (push), no `firebase-auth`. The plugin now pulls in `firebase-auth` + Play Services auth. |
| Auth code | Was 100% web SDK (`signInWithPopup` / `signInWithRedirect`). Now takes the native path inside the APK and the web path in browsers. |

There was no `FirebaseAuthentication.signInWithGoogle()` in the project at all,
so the APK was falling into the **web** popup/redirect path — and that is the
path Google blocks. That is the whole bug.

## Why SHA-1 alone cannot fix it

`google-services.json` and its `oauth_client` entries are consumed by the
**native** Google Play Services sign-in flow. The web SDK inside the WebView
never calls Play Services; it opens `accounts.google.com` as a web page.

When that page is loaded from an embedded WebView user agent, Google's
[Secure Browser Policy](https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html)
returns **`403 disallowed_useragent`**. That check happens before any client id
or certificate fingerprint is examined, so:

- adding an Android OAuth client (`client_type: 1`) → still blocked
- adding the release **and** debug SHA-1 → still blocked
- switching popup → redirect → still blocked

This is also why the same account signs in fine on the website: a real Chrome
tab is an allowed user agent.

## What was changed in the code (this PR)

The app can't install a native plugin on the user's behalf, but it should never
show a button that is guaranteed to fail. So:

1. **`src/utils/nativeRuntime.ts`** (new) — detects the Capacitor shell, any
   Android WebView (`; wv)` in the UA), known in-app browsers (Instagram,
   Facebook, Line, WeChat), and whether a native `FirebaseAuthentication`
   plugin has been registered.

2. **`loginWithGoogle()`** now returns a clear, actionable error instead of a
   silent failure when it detects a blocked WebView with no native plugin —
   telling the learner to use email/password, or to open the site in Chrome.

3. **`AuthForm`** disables the Google button in that environment and shows an
   amber explanation, so nobody taps a dead button repeatedly.

Once the native plugin below is installed, `hasNativeGoogleAuth()` returns
`true`, the guard switches itself off automatically, and the button comes back.

---

## The real fix — native Google sign-in (IMPLEMENTED)

Steps 1, 2 and 4 below are **already done in this repo**. Only step 3 —
registering your SHA-1 fingerprints and dropping `google-services.json` onto
the build machine — has to be done by you in the Firebase Console, because
that file is gitignored and must never be committed.

Run this any time to see exactly what is still missing:

```bash
npm run verify:google-signin
```

It is also wired into `android:sync`, `android:assemble:debug` and
`android:bundle:release`, so a misconfigured APK can no longer be built by
accident.

### 1. Install the plugin — DONE

`@capacitor-firebase/authentication@7.5.0` is installed (7.x is the line that
matches Capacitor 7 — 8.x requires Capacitor 8). Its declared peer is
`firebase@^11`, while the app ships `firebase@12`; the plugin only exchanges an
ID token, so `package.json` pins the peer to the app's own firebase version via
`overrides`, and `.npmrc` sets `legacy-peer-deps=true` so a plain `npm install`
succeeds. A clean `rm -rf node_modules && npm install` was verified.

`capacitor.config.ts` enables the provider:

```ts
FirebaseAuthentication: {
  skipNativeAuth: false,
  providers: ["google.com"],
},
```

`android/variables.gradle` sets **`rgcfaIncludeGoogle = true`**, which is what
promotes the plugin's Google dependencies from `compileOnly` to
`implementation`. Without that flag the APK compiles and then throws
`NoClassDefFoundError` at runtime — a very easy trap to miss.

### 2. Add `google-services.json` — YOUR STEP

Firebase Console → Project settings → **Your apps** → Android app with package
`app.eduvora.shop` (create it if it doesn't exist) → download
`google-services.json` → place it at `android/app/google-services.json`.

It is gitignored on purpose; it must be present on whatever machine builds the
APK.

### 3. *Now* the SHA-1 matters — YOUR STEP

In the same Firebase Console screen, add the SHA-1 of **every** key that will
sign the app:

```bash
# debug builds
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android

# your release keystore
keytool -list -v -keystore android/app/eduvora.keystore -alias eduvora
```

If you use **Play App Signing**, also copy the SHA-1 that Play Console shows
under *Release → Setup → App signing* — Google re-signs your upload, so that
is the fingerprint end users' installs actually carry. Missing this is the #1
reason sign-in works on a sideloaded APK but fails from the Play Store.

After adding fingerprints, **re-download `google-services.json`** — the file
must contain the new `client_type: 1` entries.

### 4. Route the call natively — DONE

`signInWithGoogleNatively()` in `src/context/AuthContext.tsx` opens the Play
Services picker and exchanges the returned ID token for a normal **web-SDK**
session, so `auth.currentUser`, `onAuthStateChanged`, Firestore rules and every
existing screen behave exactly as they do after a browser sign-in:

```ts
const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
const result = await FirebaseAuthentication.signInWithGoogle();
const credential = GoogleAuthProvider.credential(result.credential?.idToken);
return signInWithCredential(auth, credential);
```

The import is dynamic so the website bundle never pays for it. Both
`loginWithGoogle()` and `loginAdminWithGoogle()` take this path when
`hasNativeGoogleAuth()` is true, and the untouched web popup/redirect path
otherwise. Two failure modes are translated into plain language rather than
raw exceptions: a dismissed picker becomes a "cancelled" message, and
`ApiException: 10 / DEVELOPER_ERROR` — the signature of an unregistered SHA-1 —
tells the learner to use email/password and tells you what to fix.

---

## Issue 2 — "the correct password is rejected"

Your diagnosis is right, and the code now handles it.

With **Email Enumeration Protection** on (the default for Firebase projects
created after Sept 2023), these three cases all return the single generic code
`auth/invalid-credential`:

1. the password really is wrong,
2. no account exists for that email,
3. **the account exists but has no password** — it was created with "Continue
   with Google", so there is nothing to compare against and a "correct"
   password can never work.

Case 3 is the one that feels like a bug. `login()` now detects it via
`fetchSignInMethodsForEmail` and returns a specific message —
*"यह account Google sign-in से बना है… Continue with Google से login करें"* —
and the UI rings the Google button so the next tap is the right one.

Note the honest limitation: with enumeration protection **on**, that API
returns an empty list, so detection degrades to "unknown" and the learner gets
the generic message. The generic message was therefore also rewritten to
mention Google sign-in. We deliberately do **not** query Firestore for this —
`users/{uid}` is owner-or-admin readable (`firestore.rules:69`), and opening it
to signed-out reads would recreate exactly the enumeration oracle the
protection prevents.

### How to confirm an account is Google-only

Firebase Console → Authentication → Users → find the email → look at the
**Providers** column:

- Google icon only → no password exists; sign in with Google, or use *Forgot
  password* to set one (this adds a password provider to the same account).
- Google + email icons → a password exists and a genuinely wrong one was typed.

### A permanent cure for affected accounts

Ask the learner to tap **Forgot password**. Firebase sends a reset link, and
setting a password attaches a `password` provider to the existing Google
account — after that, both sign-in methods work for the same user.


---

## Issue 3 — "Forgot password sends no email"

### The code was never the problem

`resetPassword()` in `src/context/AuthContext.tsx` has always called
`sendPasswordResetEmail`, and `AuthForm` has always had a working
*Forgot password?* button. What was missing was **feedback**, and the
Firebase Console side of the setup.

### Why no email arrives

With **Email Enumeration Protection** ON (default for new projects),
`sendPasswordResetEmail` **resolves successfully even when no account exists**
for that address. Firebase will not confirm or deny existence — it just sends
nothing. The old success message said *"link sent, check inbox"*, which is
indistinguishable from a real send.

Confirmed against this project's Authentication → Users list: it contains
**exactly one account**, `wmath84@gmail.com`. So every reset attempted for any
other address was silently a no-op, correctly.

### The likeliest real-world cause: the sender is unverified

Firebase's default sender is `noreply@<project>.firebaseapp.com` —
here `noreply@my-website-761e9.firebaseapp.com`. Gmail and most providers
treat that domain as unauthenticated bulk mail and route it to **Spam**, or
drop it entirely. Check these in the Console:

1. **Authentication → Templates → Password reset** — confirm the template is
   enabled and note the *From* address.
2. **Authentication → Settings → Authorized domains** — must list every origin
   the app is served from (`eduvora.shop`, `localhost`, the Vercel preview
   domain). A missing origin makes the new `continueUrl` fail.
3. **Templates → customise the domain** — for reliable delivery, point the
   sender at your own verified domain (`noreply@eduvora.shop`) and add the
   SPF/DKIM records Firebase shows. This is the single biggest fix for
   "the email never arrives".

### What changed in the code

- Empty or malformed address is rejected **before** the call, with a clear
  instruction, instead of firing a request that can only fail.
- The success message no longer claims an email definitely arrived. It names
  the exact sender address, tells the learner to check Spam/Promotions, and
  says that no email within 2–3 minutes means **no account exists for that
  address — sign up first**.
- A `continueUrl` (`<origin>/#/auth`) is attached so the learner lands back on
  the app's login screen after resetting, instead of a bare Firebase page.
  If the origin is not in Authorized domains, Firebase rejects it with
  `auth/unauthorized-continue-uri`; the code catches exactly that and retries
  without the continue URL, so the email still goes out.
- The button now reads *"Forgot password? Reset link भेजें"* and shows a
  sending state, so it is obviously actionable.

---

## Your SHA-1 fingerprints

You supplied two, which is exactly right — both must be registered:

```
28:36:58:85:94:5f:42:58:95:bd:02:8c:83:c0:2d:28:82:22:48:df
b2:ef:77:7d:dc:f9:3f:8b:6f:00:20:d1:39:9f:3f:1c:91:8a:fc:4b
```

Add BOTH under Firebase Console → Project settings → Your apps → the Android
app for `app.eduvora.shop`, then **re-download `google-services.json`** and put
it at `android/app/google-services.json`.

The native plugin is now installed, so these fingerprints finally *do* matter —
they are what Play Services checks before handing back an ID token. Verify with
`npm run verify:google-signin`, which fails loudly if the downloaded file has
no `client_type: 1` entry (i.e. no SHA-1 registered).

Also confirm whether you use **Play App Signing**. If so, Play Console →
Release → Setup → App signing shows a *third* SHA-1 (Google's re-signing key),
and that is the one end users' installs actually carry — it must be added too.
