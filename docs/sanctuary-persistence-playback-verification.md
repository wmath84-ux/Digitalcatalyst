# Sanctuary persistence and uninterrupted board playback

Verification date: **2026-09-30**. Changes are on `arena/01a0f36e-digitalcatalyst`; no production deployment was performed.

## What changed

- **Stable media DOM:** each board face remains in one permanently connected host. Camera motion, eye/HUD changes, fit/unfit and board scaling update styles, not DOM ancestry. `CSS3DObject` remains the pose API; a reusable homogeneous projection replaces the DOM-moving `CSS3DRenderer` rendering path.
- **Playback-safe visibility:** hiding a reading face suppresses its paint and interaction without detaching its iframe or calling the player pause API. Actual resource/route changes still have their normal lifecycle.
- **Conservative obstruction:** a world board is culled only when all nine sampled sightlines are blocked. A leaf/trunk across the centre no longer blanks the whole face. A fitted board bypasses scenery occlusion and distance fog.
- **Notes persistence:** a queue captures its account/course, immediately mirrors edits, protects pending edits from stale snapshots, serialises uploads/deletes and flushes outgoing scopes. Cloud failures are displayed rather than acknowledged as saves.
- **Mind-map persistence:** independent per-map drafts/revisions, immediate mirrors, a durable upload/delete outbox, ordered writes/deletions, protected reads and read/write retries. Returned setters are bound to the displayed map: final node-editor teardown commits cannot follow a different map/module or a replacement for a deleted map.
- **Usable standalone workspace:** signed-in learners can save to their private `__sanctuary__` product / `course` map bucket before selecting any course. Course selection is still explicit. Signed-out visitors see a sign-in message rather than an editor that silently cannot save. Scoped panel sessions isolate editor buffers from other courses/accounts and the Course Player.
- **Performance safeguards:** no changes to world quality, draw budgets, adaptive resolution or frame-rate limits. Board matrices/vectors are reused and unchanged camera/projection/configuration renders are cached. No per-frame layout reads were added.

Notes' unsaved editor buffers still require the explicit Save action. A camera/view change does not unmount those editors.

## Executed verification

| Check | Result |
| --- | --- |
| Focused `npm run test:sanctuary`, including Chromium | **171 passed, 0 failed, 0 skipped** |
| Notes hook + actual board-bridge integration | **25 passed** |
| Mind-map hook races/lifecycle/reconnect tests | **17 passed** |
| Real bundled board-engine runtime | **12 passed** |
| Chromium iframe/media/projection/native-click regressions | **3 passed** |
| Production `npm run build` | **Passed** |
| `git diff --check` | **Passed** |
| Complete `tests/*.test.mjs` suite, including Chromium | **3,011 total: 2,928 passed, 74 failed, 9 skipped** |
| TypeScript `tsc --noEmit --incremental false` | **The same 8 pre-existing errors; none introduced** |

The complete suite's **74 failing test names are identical to the pre-change baseline** (2,976 total: 2,893 passed, 74 failed, 9 skipped). This is not a claim that the repository's full suite or typecheck is green.

The board-engine runtime checks 648 camera poses, near/far-plane safety, full versus partial obstruction, stable DOM parents and disposal. **10,000 unchanged renders produce zero DOM attribute mutations.** This measures idle board-layer DOM work, not full-scene device FPS.

The browser fixture uses the real `ResourceViewer` and board engine, a mocked YouTube IFrame API boundary, and a real iframe playing a real canvas-stream HTML video. Its browsing context and advancing playback clock survive board/camera/fit/HUD/size switches, React rerenders, and trusted-click native fullscreen entry/exit. Projection bounds match independently projected corners within 0.1 CSS pixels, native board buttons are clickable, and a foreground tree cannot blank/fog a fitted 3x board.

Persistence runtimes mount the real hooks/models/mirrors in React 19, with controlled Firebase I/O. Board-bridge integration mounts the actual `BoardPortals` with UI probes, including a node editor's passive teardown save. These verify paths, payloads, race handling and rendering; they are **not production Firestore permission tests**.

## Reproduce the focused checks

```sh
npm ci
npx playwright install chromium
npm run test:sanctuary
npm run build
```

Browser regressions skip explicitly when Chromium is unavailable. An existing compatible browser can be supplied through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

For this sandbox's packaged Chromium the executed command was:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
LD_LIBRARY_PATH=/tmp/al2023/lib npm run test:sanctuary
```

## Firebase rules and deployment gate — still pending execution

The checked-in rules contained unsupported JavaScript-style `.all(lambda)` expressions. They have been replaced with bounded indexed Rules-language validation, retaining note-link limits and revision-parent tombstone checks. `tests/sanctuaryFirestoreRules.emulator.mjs` exercises normal-owner note/map CRUD, personal/purchased/self-authored scopes, stranger/schema denials, the 50-link boundary and deleted revision parents against `demo-digitalcatalyst`, never production.

Run with **Java 17 on PATH**:

```sh
npm run test:sanctuary:rules
```

The local attempt stopped before starting Firestore: **`Could not spawn java -version`**. The official emulator download endpoint was also inaccessible here. Consequently **rules compilation and these emulator permission tests have not been verified locally**.

The updated rules-deploy workflow installs Node 22 / Java 17, runs these emulator tests before deployment, supplies Firebase CLI authentication through a restrictive temporary ADC file, and removes it afterwards. That workflow has not been executed for these changes. Do not treat a written CI gate as a successful deployment. Large mixed revision-session parent lists also remain subject to Firestore's ordinary document-access limits; the security checks were not weakened to avoid those limits.

## Required live/device follow-up

1. Pass the real emulator gate and deploy the validated rules/application through the normal release process.
2. Use a **non-admin** signed-in learner on the authorised deployed/staging host. Save a personal note and diagram before selecting a course; reopen from a clean browser/device and confirm Firestore restoration, not just the local mirror.
3. Verify course/module/map switches, slow/offline saves, final in-progress node edits, multiple maps and deletions. Confirm outgoing work never appears in the newly selected scope and save errors remain visible.
4. Play a **live YouTube** lesson, then switch boards/scenery views, eye/HUD state, native/app fullscreen, fit/unfit and all board sizes. Verify continuity on target desktop browsers and Android/WebView devices.
5. Compare full-scene FPS/thermal behaviour on the same target devices and settings. The controlled media tests and idle-cache checks do not certify external YouTube behaviour, production Firebase availability, or hardware FPS.
