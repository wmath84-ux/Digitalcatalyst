# Update report — 2026-09-24

Three owner-requested updates: (1) Course Player settings' "Add to My Module" +
"Save for later" now write into the NEW My Study Library, (2) My Purchases is a
square grid of store-design cards carrying only thumbnail + title + the
"Watch Now" button, (3) deep-research fix for the Google ID picker opening with
the Chrome toolbar (website, PWA and APK).

---

## 1. Course Player settings → the NEW My Study Library (`myCourses`)

**Files:** `src/CoursePlayerApp.tsx`, `src/personal-library/AddOfficialResourceDialog.tsx`,
`src/lib/myCourseClient.ts`

The two settings rows under the active file used to submit to the OLD
server-backed personal-modules tree (`personalCourse.official.add` →
`users/{uid}/personalCourseModules`) — a surface the rebuilt My Study Library
page no longer renders. Both buttons now write into the learner-owned course
shelf at `users/{uid}/myCourses/{courseId}` — the same documents the Study
Library page, the course builder and the self-authored player read — so
everything saved from the player is visible on the shelf immediately.

* **"Save for later"** appends the active official resource to a reserved
  shelf course `saved-for-later` (one root module "Saved"), creating it on
  first use. Duplicate guard: same link (or name+type when link-less) anywhere
  in the shelf course → "Already saved" info toast.
  If the live snapshot has not resolved yet, the action reads Firestore once
  (`fetchMyCourses`) instead of guessing the shelf is empty — a guess that
  would overwrite the existing shelf document.
* **"Add to My Module"** opens the rebuilt destination dialog backed by the
  live `useMyCourses()` controller: pick an existing course → existing module
  (nested modules listed with indentation) or create a new module, or create a
  brand-new course + first module. Writes go through `myLibrary.save()` —
  the same optimistic patch + `setDoc(merge)` the builder uses — so no plan
  gating applies (the new library is deliberately not entitlement-gated).
* The resource mapping keeps name, type, link, description and Brain practice
  sets (`CoursePracticeQuestion` is byte-identical to `MyCourseQuestion`).
* The old `usePersonalModules` + `PersonalModulesPanel` ("My Modules" manager
  inside official courses) stay untouched for previously saved data.

## 2. My Purchases — store-style square grid, minimal card

**File:** `src/components/OtherTabs.tsx`

The purchases list (rows with a button floating above each card) is now the
STORE's square grid, verbatim: `data-store-grid` container (same Tailwind
column/gap rhythm as the store's default grid; index.css tablet/desktop
auto-fill rules apply), and each card is the store `ProductCard` material
(`GlassCard` + `dc-store-glass` light-blue lens, tint 0.62, radius 22,
4:3 artwork band, `dc-store-card-title` two-line heading).

Card content is EXACTLY what the owner listed — **image, title, Watch Now** —
nothing else (no instructor, category, "Owned" pill, price, rating or the old
button row above the card). The button is the same My Purchases
`WatchActionButton` (uiverse "spicy-liger-32"), scaled to card size with an
inline `font-size: 11px` (the control is authored in `em`, so one font-size
scales shell + padding + goo layers + press as one unit; the inline style is
required because `watch-action-button.css` is unlayered author CSS that would
beat any Tailwind utility). Page-level header, count badge and search remain.

## 3. Google ID picker opening with the Chrome toolbar — FIXED (FedCM One Tap)

**Files:** `src/lib/googleIdentity.ts` (new), `src/context/AuthContext.tsx`,
`.env.example`, `docs/google-signin-web.md`

**Root cause (deep research):** `signInWithPopup()` requests a popup window,
but mobile Chrome cannot open popup windows at all — since Chrome 59 every
`window.open` on Android becomes a full browser tab (crbug.com/723655). So on
phones, tablets and installed PWAs the Google account chooser always opened
wrapped in Chrome's toolbar, yanking the learner out of the app. Desktop
Chrome still opens a real chromeless popup, which is why desktop looked fine.
No Firebase flag changes this — it is browser behaviour.

**Fix:** Google's own replacement UI. On the web, tapping "Continue with
Google" now first asks Google Identity Services for its **native account
sheet** — GIS One Tap with FedCM (`use_fedcm_for_prompt`): the browser draws a
"Choose an account" sheet INSIDE the page (bottom sheet on phones, anchored
card on desktop; no tab, no toolbar, no third-party cookies on Chrome 120+).
The returned ID token is exchanged via
`signInWithCredential(auth, GoogleAuthProvider.credential(idToken))` — the
exact same web-SDK session as before, so profile sync, Firestore rules and
every screen are unchanged. `loginWithGoogle()` AND `loginAdminWithGoogle()`
both use it.

Every failure degrades to the previous popup flow — never a dead button:
skipped (no Google session / One Tap cooldown / FedCM-less browser /
origin not authorized) and unavailable (GIS script blocked) → popup;
dismissed → treated as a cancel, same message as closing the popup today.

**APK:** unchanged native path (`@capacitor-firebase/authentication` → Play
Services sheet — already a system UI with no Chrome chrome). If the plugin is
missing/misconfigured the build says exactly that instead of opening a
browser. PWA: FedCM works in the standalone window; if it ever can't show,
popup fallback (previous behaviour).

**One-time console step** (documented in docs/google-signin-web.md): the
OAuth **Web** client (`930483750234-7b4upatuokv8smst1ctljsgpchs9r39m…`, same
project) needs every serving origin in *Authorized JavaScript origins*
(`https://eduvora.shop`, `https://www.eduvora.shop`, Vercel preview URLs,
`http://localhost:5173`). A missing origin is not a failure — the sheet simply
never shows and sign-in falls back to the popup flow. Override the client via
`VITE_GOOGLE_WEB_CLIENT_ID`.

**Tests:** `tests/googleSignInReturnContract.test.mjs` now pins the One
Tap-before-popup order, the GIS FedCM flags and the ID-token exchange;
`tests/personalLibraryUiContract.test.mjs` pins the new `myCourses`-backed
settings actions. Full suite: 2563 pass / 39 fail — the 39 failures are
pre-existing on the base commit (verified by stashing this change) and
unrelated (My Day editor, revision surfaces, pre-existing CSS contracts).
`npm run build` and `tsc --noEmit` pass.
