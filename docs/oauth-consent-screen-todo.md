# TODO: Fix Google account-picker "blue bar" (OAuth consent screen branding)

## What the issue is

When users sign in with Google (Firebase Auth `signInWithPopup` /
`signInWithRedirect` / native credential flow — see
`src/context/AuthContext.tsx`), the Google account-picker shows a generic,
unbranded header (the "blue bar") instead of the app's name and logo. It may
also show the raw Firebase auth domain (e.g. `my-website-761e9.firebaseapp.com`)
and/or an "unverified app" style presentation.

## Why it can't be fixed in this repo

The account-picker's branding is rendered by **Google's own sign-in pages**,
and its content comes entirely from the **OAuth consent screen** configuration
in **Google Cloud Console** — not from any file in this codebase.

We confirmed there is no in-repo consent configuration:

- `google-services.json` — contains only OAuth **client IDs** (project
  `my-website-761e9`, number `930483750234`), no branding.
- `.env.example` / env vars — no OAuth/consent-related settings.
- `src/context/AuthContext.tsx` — uses Firebase `GoogleAuthProvider`; the SDK
  offers no API to change the consent-screen branding.

Do **not** attempt a code workaround (e.g. custom sign-in chrome) — Google
policy requires its own consent UI for OAuth.

## Manual steps required (Google Cloud Console)

In the Google Cloud project backing this Firebase project
(`my-website-761e9`), open **APIs & Services → OAuth consent screen** and:

1. **App name** — set the user-facing product name (this replaces the generic
   header text).
2. **App logo** — upload the product logo (triggers verification review if the
   app is External).
3. **User support email** — set a monitored support address.
4. **App domain / Authorized domains** — add the production domain(s),
   including the Firebase auth domain if still used
   (`my-website-761e9.firebaseapp.com`) and any custom `authDomain`.
5. **Developer contact information** — set it.
6. **Publish App** — move the consent screen from *Testing* to *In production*
   and complete **brand verification** if prompted (logo + domain changes
   require it). Until verification completes, Google keeps showing the
   unbranded picker.

Also verify in **Firebase Console → Authentication → Settings → Authorized
domains** that the production domain is listed, and consider setting a custom
`authDomain` so users see your domain instead of `*.firebaseapp.com`.

## Link

- Project OAuth consent screen: `<https://console.cloud.google.com/apis/credentials/consent?project=my-website-761e9>` <!-- TODO: confirm project ID / link -->
