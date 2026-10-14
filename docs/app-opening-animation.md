# The app opening animation (EduOS clips)

Status: **fixed in `arena/01a06f6e-digitalcatalyst` (2026-09-05)**, then **changed on 2026-10-13**: the
animation is no longer a launch splash by default — it is opt-in behind a faded `ad` in the header, and only
plays at launch when the owner switches that on in Admin → Branding. Both modes use the same controller.
This document exists because the same symptom — "the opening animation does not play, neither the desktop one
nor the mobile one" — was reported across three sessions and every answer so far changed the code without
changing what the user could see. Read this before touching the opening again.

## What ships

| Screen band | File | Size |
|---|---|---|
| `< 768px` (phones) | `public/assets/animations/EduOS_app_opening_mobile.mp4` | 720×1280, 10.006 s, 24 fps |
| `>= 768px` (tablet + desktop) | `public/assets/animations/EduOS_app_opening_desktop.mp4` | 1280×720, same timing |

Both are H.264 High@L3.1 + AAC, `moov` in the first 40 KB (fast-start), so playback begins while the rest
of the 5 MB arrives. The frames are **not** recreated in CSS anywhere — the clips are the design.

## Who owns what (there is exactly one owner now)

* **`index.html`** — the `#app-opening-splash` overlay (outside `#root`) and a *CSS-only brand card*
  (`.app-boot-fallback`: ring + wordmark + shine). Its tiny boot script applies cached branding
  (title/wordmark), picks the clip for the viewport, and then: if `openingPlayOnLaunch` is **false** (the
  default) it marks the splash `data-opening="skipped"` immediately, before a single byte of video is
  requested — the app is interactive at once and the clip is only fetched when the learner taps `ad`; if it is
  true it sets `video.src`, calls `play()` once, and the controller takes over. See "Two modes" below.
* **`src/utils/openingSplash.ts`** — the decision table (`resolveOpeningDecision`, pure) and the runtime
  controller that is the **only** writer of the splash's visibility. It fades the clip in over the card when
  the clip produces a frame, keeps the card if it does not, and holds the opening for at least
  `OPENING_MIN_VISIBLE_MS` (1.4 s).

### The app opens when the clip ends — nothing else

The clip runs to `ended`, then the final frame is held `OPENING_HOLD_AFTER_END_MS` (260 ms) and the splash
fades (`OPENING_FADE_MS`, 380 ms). There is **no deadline on a slow clip**, because a deadline is what made
the animation look broken: the release rule lives in `shouldReleaseOpening()` and the only exits are

| Exit | Fires when |
|---|---|
| `ended` | the clip reached its end (normal case, 10.006 s) |
| `media-error` | the element reported an error (404, unsupported, decode) |
| `load-timeout` | not one frame in `OPENING_LOAD_CEILING_MS` (20 s) — a 5 MB file on a weak link still gets to play |
| `stalled` | `currentTime` has not advanced for `OPENING_STALL_TIMEOUT_MS` (6 s) **and** it is not refilling its buffer |
| `hard-ceiling` | `OPENING_HARD_CEILING_MS` (60 s) — the "never trap the user" backstop, deliberately ~6× the clip |

The old pair that truncated the animation is gone on purpose: `OPENING_FIRST_FRAME_GRACE_MS = 3_000` (a
phone on 4G cannot decode a 5 MB file in 3 s) and `OPENING_MAX_WAIT_MS = 12_006` (a first frame at ~2 s
already pushed the clip past the ceiling, so the last second was cut). `window.__eduosOpening` is the
controller (`replay()`, `dismiss()`, `setDebug(true)`).

While the opening is up the app keeps mounting **underneath** it (auth, catalogue, the winter backdrop), so
the reveal after `ended` is instant — "opens after the animation" is a visual hand-over, not a frozen boot.
The clip is played `muted`: unmuted autoplay is blocked by Chrome/Safari, and a blocked `play()` means no
animation at all, which the user reads as broken. The clip choice is locked at boot (the controller adopts
`window.__eduosBoot.clip`) so a rotation cannot reload the file and restart it halfway.
* **`src/main.tsx`** — calls `attachOpeningSplash()` once before `createRoot`, renders
  `<OpeningAnnouncer />` (screen reader) and the status-bar colour. **React never touches the `<video>`.**
* **`src/components/offline/OfflineGate.tsx`** — asks the controller to `dismiss()`; it no longer writes
  `splash.style.display`.

## The four real causes (all verified by tests, not by reading)

1. **`if (video.ended) finished()`** in the old `AppLaunchSplash`. A PWA / Capacitor app is *resumed*, not
   reloaded; the element from the previous boot was already `ended`, so the opening was declared
   "already handled" and skipped for the session — on every screen size, forever, until a full reload.
2. **The first `error` event ended the opening.** A `<video>` with no `src` at parse time, a dropped range
   request, or a 5 MB clip on a flaky mobile connection → instant hide, with nothing underneath.
3. **`@media (prefers-reduced-motion: reduce) { #app-opening-splash { display: none !important } }`.**
   Android "Reduce animation", Windows Settings → Accessibility → "Animation effects" off, and iOS
   "Reduce Motion" therefore deleted the opening entirely. The code was never the problem on those devices.
   Reduced motion now means "no motion": the clip is replaced by the static brand card, and
   `?opening=force` still plays the clip.
4. **Admin branding could switch it off silently.** `BrandingPage.persist()` wrote
   `merged.openingAnimationEnabled === true`, so any save whose draft value was not exactly `true`
   persisted `false` — and the boot splash reads that cached copy *before* React exists. Now it fails
   open (`!== false`) and the same page has a ▶ Preview button.

## Two modes, one controller (2026-10-13)

The animation used to run on every cold boot, and "app open hote hi animation dikhta hai" was reported as a
problem in its own right. It is now **tap-only unless the owner says otherwise**:

| `openingAnimationEnabled` | `openingPlayOnLaunch` | What the learner gets |
|---|---|---|
| `false` | any | nothing at all — no splash, no `ad` button, the clip is never fetched |
| `true` | `false` *(default)* | a small faded **`ad`** in the header bar; the clip is fetched and played full-screen only when it is tapped |
| `true` | `true` | the launch splash exactly as documented below, and **no `ad`** (it would be a button that plays what already played) |

Both switches live in Admin → Branding → **Behaviour**, next to the three clip URL fields (tap `Upload` /
`Release URL` on the Logo section for the icon; for clips paste the *direct asset* URL —
`.../releases/download/<tag>/<file>.mp4`, not the `releases/tag/<tag>` page). Nothing here needs a code edit.
"▶ Preview the opening now" arms a one-shot runtime override, so the preview plays even while the saved
setting is tap-only.

`ad` is `src/components/ad/OpeningAdControl.tsx`: a lowercase `ad` at 40 % opacity in the header action
cluster of every shell (mobile, desktop, home, landing). It resolves the same clip the launch would use
(`openingClipSrcFor(openingClipForWidth(window.innerWidth))`), renders the player in a portal above every
other layer, releases the buffer on close, and on failure prints the URL it tried plus the
`releases/download` vs `releases/tag` hint. `?opening=on|force` still plays — and the tap uses the same
`resolveOpeningDecision()` table, so an override that says `off` wins over the button too.

### The clip comes from the Branding document, not from the bundle

The three clip URLs are optional. Empty means "use the bundled `public/assets/animations/*.mp4`", and a
non-empty URL **overrides the bundled file** for that band. The override is applied by both `index.html`
(boot) and `openingSplash.ts` (tap), and it is a plain `https://` URL, so a new animation is a Release
upload + one field — never a rebuild.

## Diagnosing on the device that is complaining

`?opening=debug` (any URL, e.g. `/?opening=debug#/home`) shows a persistent corner badge with: the state,
the decision + reason, the clip file, `networkState` / `readyState` / `currentTime` / media-error code,
whether the clip is reachable (a `HEAD` probe: HTTP status, content-type, byte length), the branding cache,
`navigator.onLine` and the reduced-motion flag. It is stored in
`localStorage["eduvora.opening.override.v1"]`, so it survives the app's own hash navigations and the next
reload.

`#/dev/opening` (`src/components/dev/OpeningAnimationPreview.tsx`) is the sandbox: both clips with their own
controls, the resolved decision, a "Replay the real opening (full screen)" button, a "clip probe" read-out,
and a **Copy report for support** button that puts all of the above in the clipboard.

Overrides (all of them are also accepted comma-separated, e.g. `?opening=on,debug`):

| Override | Meaning | Remembered? |
|---|---|---|
| `?opening=on` | play it even if branding says off | no — this URL only |
| `?opening=off` | never play it | 24 h |
| `?opening=force` | play the clip even under reduced motion (and offline) | no |
| `?opening=static` | brand card only — proves the non-video path | no |
| `?opening=debug` | the corner badge + the `HEAD` probe | 24 h |

### An override may never quietly become someone's default

Only `debug` (a badge, changes nothing the learner sees) and `off` (a deliberate
opt-out) may outlive the URL, and both expire after 24 h. Everything that changes
**what plays** is one tap or one URL: the dev page's "Preview the static card"
uses `setOpeningRuntimeOverride()`, which the controller clears when the opening
ends, and `readStoredOverride()` *deletes* a remembered value the policy rejects.

This rule is a scar: the first version of that preview button persisted `static`,
and from then on every boot showed 1.4 s of brand card and then the landing page —
reported as "ek second ka frame dikhta hai, uske baad landing page". A debug
affordance that changes what the user sees, and stays, is a new bug class.

### Reduced motion: honoured, never silent

Reduced motion still replaces the clip with the static card. Because that looks
identical to "the opening is broken", `#/dev/opening` offers an explicit device
opt-in — `localStorage["eduvora.opening.preferFull.v1"] = "1"` — that plays the
whole clip despite the setting. `index.html` reads the same key pre-React, so
there is no card flash before the controller can speak. "Do not show motion
nobody asked for" stays intact: nothing is forced, it only remembers a request.

## Rules for future edits

* Do **not** add another place that hides the splash (`style.display`, a wrapper, a `hidden` attribute).
  Visibility is `#app-opening-splash[data-opening="skipped"|"done"]` + `[data-hiding]` only.
* Do **not** make React own the `<video>` (mount/StrictMode double-invoke aborts `play()`; the abort used to
  be read as "finished").
* Do **not** treat reduced motion as "hide the brand moment". Static card, no motion.
* Do **not** let an error path hide the opening before the minimum visible window — the card exists for that.
* Do **not** re-add a fixed "release the app at N seconds" timer. If a backstop is needed, put it in
  `shouldReleaseOpening()` so it stays testable, and keep it far above clip length + load ceiling.
* Do **not** persist an override that changes what plays. Remembering "less
  motion" is fine; remembering "static preview" strands every later boot.
* Do **not** make the tap-only default silently eager: while `openingPlayOnLaunch` is false, neither
  `index.html` nor React may set `video.src` before the tap. "Loads a 5 MB clip on every boot" is the same bug
  as "shows an animation nobody asked for".
* The `ad` control must stay in `data-header-action-cluster` (it is a header action) and must disappear — not
  merely go inert — when `openingPlayOnLaunch` is true or `openingAnimationEnabled` is false.
* `tests/openingSplashRuntime.test.mjs` boots the real `index.html` in jsdom and asserts all of this —
  including "a clip that keeps advancing is never dismissed", "a remembered
  `static` preview must not replace the clip", "a refused play() waits instead of handing over" and the `shouldReleaseOpening` table; keep it
  green, and extend it instead of adding another "the code says X" grep when a behaviour changes.
