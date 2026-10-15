# Startup Home flow + the two initial options — report (2026-10-15)

Owner brief: app open hone par **Home** default rehna chahiye; startup ke do options ka design aur
opening behaviour waise hi rehna chahiye; in options ke visible rehne ke dauran **Home** par click karne par
Home open ho aur **dono** options/overlays band ho jaayen; Home ko koi overlay block na kare; dobara app
open karne par wahi intended startup flow; aur overlay ko sirf visually hide karne ke bajay uska **actual
open/closed state** update ho. Back navigation aur existing startup behaviour mein koi regression nahi.

---

## 1. What was inspected first (evidence, not assumptions)

| Concern | Real owner (verified in the repo) |
| --- | --- |
| Entry point | `index.html` → `<script type="module" src="/src/main.tsx">`; `src/main.tsx` `createRoot(...)` renders `<AuthProvider>…<Root/>…` |
| Routing | hash router inside `RootPage()` in `src/main.tsx` (`#/landing`, `#/home`, `#/work`, `#/store`, …); desktop chrome in `DesktopAppHost`; deep-link/auth guards in `src/utils/appRoutes.ts` |
| Default landing | uninstalled web → `LandingApp` (`#/`); installed PWA / Capacitor APK → `RootPage`'s `skipLandingForInstalledApp` effect normalises an empty hash to `#/home` (`history.replaceState` + `setHash(HOME_HASH)`) |
| Initial option 1 | `src/work/WorkLaunchChooser.tsx` — the startup Home/Work card (portal to `document.body`), styled by `src/work/work-launch.css`; state: `src/work/storage/workPrefs.ts` (`dc.work.launch.v1`, default `ask`) + the Settings section in `src/settings/SettingsPage.tsx` |
| Initial option 2 | `#app-opening-splash` in `index.html`, owned end-to-end by `src/utils/openingSplash.ts` (`attachOpeningSplash()`, `dismiss()`, `replay()`); React only mirrors it (`useOpeningSplashVisible`) |
| Both live at once | yes — the card paints **over** the opening (same stacking level, portal later in DOM; both `z-index: 2147483000`) |

Nothing else paints an initial overlay: a full-document scan (`position: fixed`, `z-index ≥ 50`,
covering ≥ 50 % of the viewport) on APK / installed-PWA / web boots returns exactly the chooser backdrop,
plus the opening splash when Branding → Behaviour has launch playback ON. The install prompt
(`src/components/landing/LandingOverlays.tsx`) only exists on the landing page and never at startup.

## 2. Root cause (reproduced in a real browser, then fixed)

The chooser resolved its once-per-boot answer in a **`useRef`**, and read the route from a **`hash` state**
snapshot taken on its first render.

* The APK / installed PWA boots on an **empty hash**. `RootPage`'s effect normalises it to `#/home` with
  `history.replaceState`, which raises **no `hashchange`** — so the component still believed it was on the
  default route *and* that "Home" was a normal navigation that the app would react to.
* Answering the card therefore set the ref (invisible to React) and re-assigned an **identical** hash
  (`#/home` → `#/home`), which is a silent no-op. Consequence: Home was already rendered *underneath*, the
  card and its **full-screen backdrop** stayed mounted on top, and the backdrop swallowed every subsequent
  tap on Home — the reported "Home click karke bhi Home nahi khulta".
* Same boot with the launch opening ON: the answered card closed (after a navigation that happened to raise
  `hashchange`) but the 10-second `#app-opening-splash` kept the viewport for the rest of the clip
  (`pointer-events: auto`), i.e. the "second overlay" still blocked Home.

Measured before the fix (headless Chromium, APK fingerprint `window.androidBridge`, `#/home`), and the
browser harness still asserts these facts after it:

```
cold start:                     url=/#/home  card=1 backdrop=1  elementFromPoint(centre)=startup-overlay
after tapping the card's Home:  url=/#/home  card=1 backdrop=1  elementFromPoint(centre)=startup-overlay   ← blocked
```

## 3. The change (one component, no new state store, no new navigation layer)

`src/work/WorkLaunchChooser.tsx` — the card's markup/CSS is **byte-identical** (`diff` of the JSX block is
empty), only the state machine changed:

1. `resolvedForThisBoot = useRef(false)` → `answeredForThisBoot = useState(false)`; derived
   `askPending = firstRoute && !answeredForThisBoot` and `asking = askPending && choice === "ask"` (the
   render guard, so a Settings answer can never paint the card over the space it opens).
2. Answering records the answer **before** routing, and only re-assigns the hash when the destination is a
   *different* route. The answer itself is what closes the pair — the backdrop and the card are children of
   one portal, so unmounting it is a real close, not a cosmetic hide.
3. `dismissOpeningOverlay()`: `attachOpeningSplash()` → `isOpeningVisible(opening.state)` →
   `opening.dismiss()`. This is the sanitised path `src/components/offline/OfflineGate.tsx` already uses,
   and it is **conditional**: a boot that decided not to show the clip (`skipped` — tap-only default,
   reduced-motion card, offline, `?opening=off`) is not touched at all, so nothing is replayed, nothing is
   fetched, and the `skipped` state the offline rescue keys off is unchanged. Applied to both options
   (Home and Work) and to the "Always open Home / Work" Settings boots.
4. `#/home` (or any default route) stays the destination for the Home option and for "Always open Home", so
   the default landing page remains Home on every boot — including the next one.

Deliberately **not** changed: the card's design, copy, focus behaviour, `work-launch.css`, the splash's
lifecycle and clip, `index.html`'s boot script, the hash router, `RootPage`'s normalisation, the Settings
section, deep-link handling, and the desktop shell.

## 4. Verification

### 4.1 Automated (in-repo)

* **New** `tests/workLaunchHomeChoiceRuntime.test.mjs` — mounts the **real** component in a real DOM with the
  **real** portal and the **real** device-preference module, and drives the reported boot, a live launch
  opening, a skipped opening, a second Home tap, Back navigation, app reopen, the Settings answers, "Remember
  this device" and a deep link. **7/7 pass with the fix; 5 of the 7 fail against the previous
  implementation** (proved by swapping the old file back in — a real regression detector, not a snapshot).
* **Updated** `tests/workModeFoundationContract.test.mjs` (9 tests) — now pins the new rule instead of the
  removed ref (`answeredForThisBoot` is state, the answer precedes the navigation, and the opening is
  released only while visible).
* `npx tsc --noEmit` on the repo tsconfig: clean.

### 4.2 Browser (real app, headless Chromium, Firestore/Google endpoints blocked)

31 checks, all PASS — phone 390 px, tablet 834 px, desktop 1440 px, APK fingerprint, installed-PWA
fingerprint, web landing, and a deep link:

| Check | Result |
| --- | --- |
| Fresh launch → the app is on `#/home` behind the card; the card owns the pointer | PASS |
| Click the card's Home → Home open, **card + backdrop gone**, nothing of the pair under the pointer | PASS |
| Launch opening ON + card → Home click → card gone **and** splash `data-opening="done"`, `display:none`, `pointer-events:none` | PASS |
| Home again (nav tap / `#/home` / `#/store` → back home) → no duplicate overlay | PASS |
| Reopen (cold start) → the question is asked again, Home still the default | PASS |
| Choosing Work → `#/work`, no overlay left | PASS |
| Settings "Always open Home" → `#/home`, no card, live opening released; "Always open Work" → `#/work` | PASS |
| Web phone: landing → card → Home (no overlay left); deep link `#/store` → untouched | PASS |
| Desktop 1440 / tablet 834: same behaviour | PASS |

### 4.3 Regression sweep vs the pristine commit

43 test files in the startup / navigation / Work / Home / splash / footer / desktop family were run twice:
once on this branch and once on an untouched `git worktree` of the base commit (`59f9302`).

```
baseline (59f9302):  291 tests · 244 pass · 47 fail
this branch:         299 tests · 252 pass · 47 fail      (+8 = the new suite/contract tests, all passing)
diff of the failure sets: EMPTY — identical failures, so none of them is attributable to this change
```

Those 47 are this sandbox's environment-bound suites (Firestore-backed browser fixtures and any test that
needs the production catalog) and they fail identically at the base commit — including
`tests/apkSkipLandingContract` and `tests/authLaunchSplashRoutingContract`, which assert on a
`setHash(HOME_HASH)` string that does not exist anywhere in the base `src/main.tsx` (verified: 0 matches in
a pristine checkout).

## 5. Mobile APK + web

* APK / Capacitor WebView: verified with the Android bridge fingerprint (`window.androidBridge` ⇒
  `Capacitor.isNativePlatform() === true` ⇒ `isNativeApp()` ⇒ `skipLandingForInstalledApp`), which is the
  exact branch that produced the bug. Phone and tablet-portrait widths both pass.
* Web: landing default for browsers, Home default for the installed PWA; the PWA/standalone fingerprint
  (`navigator.standalone` / `display-mode: standalone`) covered explicitly.
* No change is needed in `android/` — the fix is in the shared web bundle that Capacitor loads
  (`npm run android:sync` ships it), and the offline `public/offline.html` path is untouched.
