# Course Player Sketch persistence + multi-canvas, Read PDF upload, Home footer — 2026-10-05

Three fixes, each at its root cause, reusing the existing hooks / collections /
components (no parallel persistence or navigation system, no Firebase rule or
API-contract changes).

---

## Part 1 — Sketch: reliable persistence + multiple canvases

### Root causes
1. **Stale editor overwrote the cloud board.** The editor's `initialData` was
   memoised on `sceneKey` only, and the memo was computed *while the cloud read
   was still loading*. When the read finished, the key did not change, so the
   editor kept showing the blank/old scene. The next onChange from that editor
   then saved the blank scene over the real cloud board.
2. **Late onChange from an old editor.** After a module or board switch, the
   previous Excalidraw instance could still fire one onChange, which was
   applied to the *new* scene.
3. **Disposed sessions dropped in-flight writes.** Unmounting (tab switch,
   leaving the player) during a write discarded its chaining/outbox.
4. **Refresh raced auth.** The owner check read `auth.currentUser` before
   Firebase restored the session and was never retried. On refresh the cloud
   board was never loaded, and was later overwritten.
5. The player auto-selects the first lesson and then the resume logic switches
   module, which made (1) happen on almost every open.
6. The status showed **"Saved"** while edits were still in the debounce window.

### Fix (`src/course/useCourseSketch.ts`, `utils/sketchScene.js`)
- `sceneKey` bumps when loading completes, so the editor remounts with the
  loaded scene.
- `onChange` is tagged with its scene key, so stale editors are ignored.
- Writes and the outbox continue after a session is disposed.
- An auth waiter and a read gate run before *any* cloud write. A late cloud
  read is reconciled against the device copy **as it was at open**: replace,
  merge (`mergeSketchScenes`: newer element version wins, nothing dropped), or
  push.
- New `pending` status ("Unsaved changes…"), `deviceSaved`, and `retry()`. An
  error shows a Retry button and tells the learner whether the device copy is
  safe.
- **Multiple canvases** use the same `users/{uid}/sketches` collection. The
  doc id is `sketchDocId(uid, product, module, key)`, so the first board keeps
  its old id and nothing is migrated.
  - Board list = local index + Firestore equality query.
  - **"+"** creates a blank board instantly, with a unique key from
    `createSketchKey`. It is auto-selected and registered, with an 800 ms
    double-click guard and a 30-board cap.
  - The last-used board is remembered per module.
  - Corrupt or missing data falls back to an empty board without throwing.
- UI (`SketchPanel.tsx`): orange "+" button, a "Canvas N" switcher with item
  counts (listbox popover; closes on Escape or outside click), and the status
  line. Excalidraw's toolbar, zoom/pan, keyboard and split mode are untouched.

---

## Part 2 — Read: custom PDF upload stuck at ~40 %

### Root cause (`src/course/useReadUploads.ts`)
- A 3.5 s "stall" timer **cancelled the resumable upload** if no progress event
  had arrived yet. 3.5 s is simply how long the session handshake plus first
  chunk take on a phone.
- It then set a hard-coded **0.45** and started a progress-less `uploadBytes`.
- The cancel fired the error observer, which set a hard-coded **0.40** and
  started a *second* `uploadBytes`.
- So two multipart uploads with no progress and no timeout were racing, and
  the bar sat at 40 %. The SDK can retry for up to 10 minutes.
- Separately, the compose sheet (`absolute inset-0`) covered the progress row,
  so the learner only ever saw a spinner.

### Fix
- **One `uploadBytesResumable` task.** The percentage comes only from its
  `bytesTransferred / totalBytes`.
- **Stages**:
  - `preparing`: header sniff, bounded token refresh, lazy SDK load.
  - `uploading`: real byte progress.
  - `finalizing`: download URL plus library doc, shown as an indeterminate bar.
- **Inactivity watchdog** (60 s with no bytes; every progress event re-arms
  it). A slow-but-moving large file is never cut off.
- `offline` pauses the task and `online` resumes it ("Waiting for a connection
  — resumes automatically"). Offline time never counts as a stall.
- **Every await is bounded**: header read 15 s, token 10 s, SDK 20 s,
  `getDownloadURL` 30 s.
  - The library `setDoc` is bounded at 15 s. After that it is treated as
    queued, since Firestore's offline queue already shows the row.
  - A later refusal from that write is still surfaced, with Retry.
- **Cancel** stops the task and the whole batch, and leaves no error. The
  picked files stay in the sheet so they can be sent again.
- **Retry** re-sends the last failed file. If its bytes already reached
  Storage, it **only finishes** (no second upload).
- **Attempt identity**: callbacks from a cancelled or superseded attempt never
  write state. On unmount the upload finishes on its own (the PDF appears in
  the library) but stops touching state.
- **Validation**: `%PDF-` signature in the first 1024 bytes (`isPdfHeader`).
  Android pickers that report an empty or `octet-stream` type are accepted;
  renamed non-PDFs are refused before upload.
- Errors say what to do and name the file. Previously uploaded PDFs are never
  touched by a failed upload.
- UI (`ReadLibraryPanel.tsx`): one `UploadStatus` block (stage, MB / %,
  indeterminate bar, Cancel, error + Retry/Dismiss), rendered in the library
  **and inside the compose sheet**.

---

## Part 3 — Home footer always visible

### Root cause
Home mounts `<BottomNav peek>`, which renders `SitePeekFooter`:
`open = hover || pinned`, with the panel `height:0; opacity:0; inert` until the
line is hovered or tapped. On desktop / tablet-landscape, `DesktopPeekDock`
behaves the same way.

### Fix
- `SitePeekFooter` has a new `alwaysOpen` prop, plumbed through
  `SiteFooterNav` and `BottomNav` as `peekAlwaysOpen`, and set **on Home only**.
  - `open = alwaysOpen || hover || pinned`, and the panel is never `inert` or
    `aria-hidden`.
  - The line is no longer a toggle (no tap-to-pin). It stays as an optional
    hold-drag strip for the magnification wave and drag-to-select.
- Clearance: the nav is now always full height, so the existing
  `utils/footerNavSpace.ts` publishes the real `--dc-footer-nav-h`, and Home's
  `main::after` reserves exactly that.
- Desktop / tablet-landscape:
  - `DesktopPeekDock` is always open on the Home route (`isHomeDockRoute`;
    the leaderboard and unknown routes also light "home", so `active` alone
    is not enough).
  - `DesktopShell` marks `[data-desktop-content]` with
    `data-desktop-dock-clearance`, and a CSS rule reserves 7.5 rem so the last
    row scrolls clear of the dock.
- Design, icons, routes, active states, z-index and safe-area padding are
  unchanged. **My Day keeps its peek footer** (not requested).

---

## Tests

| Suite | Result |
|---|---|
| `tests/courseSketchMultiBoardRuntime.test.mjs` (new): load race, stale key, late auth merge/read, "+" unique/guarded/isolated, reload + new device, in-flight close, pending, corrupt data | 9/9 |
| Sketch suites (scene, cloud-sync runtime, contract, library, multi-board) | 63/63 |
| `tests/readUploadPipelineRuntime.test.mjs` (new; real hook, controllable Storage task, fake timers) | 10/10 — the slow-first-chunk and byte-ratio tests **fail on the original hook** |
| `tests/coursePanelsBrowser.test.mjs` (new, real Chromium + real Excalidraw) | 11/11 |
| ↳ Sketch | draw → pending → saved → reload restores and never blanks the cloud; "+" double-click creates exactly one blank selected canvas; canvases isolated and restored on reopen; module switch / unmount mid-debounce loses nothing; refused write → Retry → saved; layout at 360 / 768 / 1440 |
| ↳ Read | progress climbs through the middle (> 40 %) to done, one task, no `uploadBytes`; cancel + late events from the old task; fake PDF refused; finish-only retry |
| `tests/homeFooterAlwaysVisibleBrowser.test.mjs` (new, real Chromium) | 8/8 — first load, taps/scroll, clearance, viewport sizes/keyboard, drag, My Day control, desktop Home + not-Home. The first-load and desktop tests **fail on the original source** |
| `tests/peekDockRevealBrowser.test.mjs` | 6/7 — the failing course-dock test fails identically on the untouched baseline |
| Full `node --test tests/*.test.mjs` | 3235 tests; the 34 failures are **exactly the pre-existing baseline set** (0 new) |
| `npx tsc --noEmit` | the same 22 pre-existing errors in unrelated files, 0 new |
| `npx vite build` | succeeds |

No console errors or page errors were recorded in any browser test. The repo
has no `lint` script.

## Remaining limitations
- No real Firebase project or emulator was available (no JVM). Storage,
  Firestore and rules were exercised through stubs, so real network behaviour
  on a device (Capacitor WebView, a real 50 MB PDF on 3G) has not been
  observed.
- After Cancel or a stall, a retry re-uploads from byte 0. The SDK does not
  expose the resumable session URL needed to continue it.
- In a multi-file pick, Retry covers the last failed file only.
- Leaving the Read panel mid-upload hides the progress (the upload still
  completes, and the PDF appears).
- Phone landscape is portrait-locked outside the Course Player (existing
  design). The 640–1023 px landscape band uses the desktop shell's dock, which
  is now always open on Home.
