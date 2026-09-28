# Sanctuary Notes + Mind Map Cloud Save & My Study Library All-Account Access – Final Report

## Issue Summary (owner, 2026-09-28)

1. **"Sanctuary ke notes aur mind map save nahi ho rahe"** — notes/mind map properly
   Firebase me save hone chahiye aur render hone chahiye.
2. **"My Study Library keval mere developer admin account (`wmath84@gmail.com`) se hi
   chal raha hai"** — koi dusra user apni email se login kare to library chalti hi nahi.
   Analyze and fix, guaranteed.

Both were reproduced from the code, root-caused (not symptom-patched), fixed, and
pinned with contract + runtime tests.

---

## Issue 1 — Root Cause Analysis

### 1a. Notes never touched Firebase at all

- `src/course/notesStore.ts` wrote the whole note list to `localStorage`
  (`dc.courseNotes.{uid}.{productId}`) and **nothing else**. There was no Firestore
  document, no listener, no upload path.
- The type comment in `src/types/course.ts` already claimed
  *"Multi-device sync is automatic via the Firestore listener"* — that listener never
  existed. So the codebase believed it was synced; it was not.
- Consequence: a note taken on the 3D Sanctuary board (or on a phone) existed on that
  one device only, never rendered anywhere else, and vanished the moment site data was
  cleared. `saveNote` / `editNote` / `deleteNote` / `linkNote` in `src/CoursePlayerApp.tsx`
  all ended in `persistLocalNotes(...)`.
- The AI path had the same hole: `src/ai/aiNotes.ts` kept "Save as note" local.
- The unmount draft-rescue in `CoursePlayerApp` also wrote only to `localStorage`, so a
  note left open in the editor when the player closed was device-only too.

### 1b. The Sanctuary mind map was written into an unscoped namespace

- `src/nature3d/boards/StudyBoards.tsx` gave the mind-map board `moduleId: null`.
- `useCourseMindMap` treated an empty/absent scope as *"unscoped but usable"* instead of
  refusing it, so board maps were saved under a document key nothing else ever read
  back — the map "saved" but never reappeared, and could not be tied to a course.

### Why it looked like "admin account me chalta hai"

`firestore.rules` ends with `match /{document=**} { allow read, write: if isAdmin(); }`.
The developer's account can read/write **every** path, so any rules gap is invisible to
that account and fatal for everybody else. Notes had **no rule block at all**.

---

## Issue 1 — Solution

**One document per note at `users/{uid}/notes/{noteId}`**, exactly like the existing
`mindMaps` collection, with Firestore as the source of truth and `localStorage` demoted
to an offline mirror.

| File | What it does now |
| --- | --- |
| `utils/courseNotes.js` (+ `.d.ts`) **(new)** | Pure note logic shared by client and server: `normalizeNote`, `parseCloudNote`, `toFirestoreNote`, `mergeNoteSets`, `applyNoteLinks` (symmetric wires), `removeNoteFromSet`, `newNoteId`/`sanitizeNoteId`, and the caps (`MAX_NOTES_PER_COURSE`, html ≤ 60 000, text ≤ 20 000, links ≤ 50 × 80 chars). Because the caps live here, `firestore.rules` can never reject a payload the client built. |
| `src/course/cloudNotes.ts` **(new)** | The only module that talks to Firestore for notes: live `subscribeCloudNotes` (`onSnapshot`, equality-only query → no composite index needed), `fetchCloudNotes` one-shot fallback, `uploadCloudNotes` (batched ≤ 400), `deleteCloudNotes`, `cloudNotesUid` (a write is attempted only for the **verified** signed-in uid), `appendCloudNote` / `patchCloudNote` for the two paths that run with no hook mounted, `isNotesPermissionError`, `describeNotesError` (Hinglish, names the real Firestore code). |
| `src/course/useCourseNotes.ts` **(new)** | The single controller behind **both** surfaces (Course Player Notes tab *and* the Sanctuary note board): device mirror paints first, cloud listener is authoritative and stays live, `mergeNoteSets` decides what is pending, debounced + batched commits, exponential backoff (≤ 8 attempts), tombstones so a deleted note can never be resurrected by a stale snapshot, flush on unmount / `visibilitychange` / `pagehide`, `reload()` for the UI's "Try again", and a **memoised** return so the 3D boards do not rebuild their panels. |
| `src/course/notesStore.ts` | Kept as the offline mirror + new tombstone store (`notesDeletedKey`, `loadDeletedNoteIds`, `persistDeletedNoteIds`, pruned once Firestore confirms the delete). |
| `src/CoursePlayerApp.tsx` | Notes come from `useCourseNotes({ uid, productId: storageProductId })`; `saveNote`/`editNote`/`deleteNote`/`linkNote` are now thin calls into the controller; the unmount draft rescue uses `appendCloudNote` / `patchCloudNote` so a draft left in the editor reaches Firebase too. |
| `src/nature3d/boards/StudyBoards.tsx` | Rewritten notes plumbing (`useBoardNotes` → `useCourseNotes`), `SANCTUARY_COURSE_MAP_SCOPE` so the mind map is **always** scoped, `boardSubtitle()` that tells the learner whether the map/notes reached Firebase instead of failing silently. |
| `src/course/useCourseMindMap.ts` | `scoped` now requires a **non-empty** `productId` *and* `moduleId` — an empty scope is refused, so no caller can repeat the unscoped-write bug. |
| `src/ai/aiNotes.ts` | `saveAiNote` uploads to the cloud best-effort (mirror first, so a failure never loses the note). |
| `firestore.rules` | New owner-scoped `match /notes/{noteId}` block: read/delete `isOwner(uid) || isAdmin()`, create/update re-derive ownership from the path, require `id == noteId`, every field type-checked, caps identical to `utils/courseNotes.js`, `aiKind` whitelist, and a blocklist of privileged keys (`role`, `coinBalance`, `email`, …). |

**Migration is automatic**: on the first open after this change, `mergeNoteSets` sees
notes that exist only on the device and queues them as `pendingUploads`, so every
pre-cloud note is pushed to Firebase without any user action.

---

## Issue 2 — Root Cause Analysis

- `firestore.rules` had **no `match /entitlements/{entitlementId}` block**. Reads of
  `entitlements` therefore fell through to the admin-only catch-all.
- `entitlements` is the canonical "this learner owns this course/module/update" record,
  written by the Admin SDK inside the payment transaction (`api/_lib/entitlements.ts`).
- Two client paths read it directly with `onSnapshot`:
  - `src/hooks/useCourseAccess.ts` → `query(collection(db, "entitlements"), where("uid","==",uid))`
  - `src/nature3d/boards/useOwnedCourses.ts` → same query (the Sanctuary reading board's course list)
- Result: the developer's admin account resolved all purchased courses; every other
  learner's listener was refused with `permission-denied`, so their library looked
  empty and "Try again" hit the same wall.
- Second, compounding risk: **rules drift**. Rules are deployed by hand, so any gap
  between this repo and the deployed project is invisible to the admin account and
  breaks the library for everyone else. A client-only fix could not be "guaranteed".

Disproven on the way (documented so nobody re-walks them): there is no client-side admin
gate in the library path; `PersonalCourseModules` rules belong to the older "My Modules"
feature; `storage.rules` does not block uploads; the existing `myCourses` rule block is
correct; `CatalogContext` does not read `entitlements`.

---

## Issue 2 — Solution (two independent doors, so one can never strand the learner)

**Door 1 — fix the rules**

```
match /entitlements/{entitlementId} {
  allow read: if isAdmin() || (signedIn() && resource.data.uid == request.auth.uid);
  allow write: if false;   // server-only: no client can ever grant itself a course
}
```

**Door 2 — a guaranteed server path for My Study Library**

| File | What it does |
| --- | --- |
| `utils/myCourseDoc.js` (+ `.d.ts`) **(new)** | Server-side sanitizer with the *same* caps the client and the rules use (title ≤ 120, description ≤ 600, module title ≤ 120, module description ≤ 400, resource name ≤ 120 / description ≤ 400, ≤ 200 top-level and ≤ 400 total modules, ≤ 400 resources, depth ≤ 4, cover ≤ 440 000 chars, url ≤ 2000). Rejects missing/reserved course ids and an oversized cover with a message the learner can act on. |
| `api/_lib/myCourses.ts` **(new)** | `myCourses.list` / `.save` / `.delete` with the Admin SDK (which does not consult security rules). The uid comes from the **verified Firebase ID token** (`requireFirebaseUser`) — never from the body — and the collection path is built from it, so one learner can never touch another's course. Unknown actions are answered as *this* feature, never as leaderboard data. |
| `api/referral-leaderboard.ts` | Registers the route in `SHARED_ROUTES`, `ROUTE_LABEL` and the dispatch — a **rewrite onto the already-deployed function**, because the Hobby plan caps the project at 12 serverless entries. |
| `vercel.json` | `"/api/my-courses"` → `"/api/referral-leaderboard"`. |
| `src/lib/myCourseClient.ts` | Firestore first (faster, works offline through Firestore's write queue); on `permission-denied` / `unauthenticated` / `failed-precondition` / `unavailable` it switches reads to `subscribeMyCoursesViaApi` (15 s poll + `online` event) and writes to the API. A sticky flag avoids paying for another rejection, clears itself the moment a Firestore listener answers again, and a one-shot read re-tests Firestore a minute after the last refusal. |
| `src/hooks/useMyCourses.ts` | All errors go through `describeMyCoursesError`, so the learner sees *"Firebase ne is account ko rok diya (permission-denied) — course aapke device par safe hai…"* instead of a generic "Your library could not be loaded". |
| `.github/workflows/firebase-rules-deploy.yml` **(new)** | Deploys `firestore.rules`, `firestore.indexes.json` and `storage.rules` on every push to `main` using `secrets.FIREBASE_SERVICE_ACCOUNT` — this closes the rules-drift gap permanently instead of once. |

---

## Verification

```
npx tsc --noEmit -p tsconfig.json      → clean (only the pre-existing, unrelated
                                         sanctuaryModules.ts unused-import error)
npx tsc --noEmit -p tsconfig.api.json  → clean
npm run build                          → ✓ built (vite production bundle)
node --test tests/*.test.mjs           → 56 failures before the change,
                                         56 failures after  → ZERO regressions
```

**New tests — 58 tests across four new files, all passing**

- `tests/courseNotesCloudSyncContract.test.mjs` (23) — cloud path, live listener, batched
  writes, mirror + tombstones, one hook for both surfaces, AI upload, draft rescue,
  migration, retry/backoff + disposal guard, flush-on-leave, scope guard, rules↔caps
  parity, and runtime checks of merge/link/delete/payload/normalisation.
- `tests/sanctuaryMindMapScopeContract.test.mjs` (6) — `boardModuleId` fallback,
  `moduleId`/`productId` never empty-string scoped, the hook's own guard, `boardSubtitle`,
  rules, empty-board contract.
- `tests/myStudyLibraryAllAccountsContract.test.mjs` (17) — no admin gate anywhere in the
  client path (comment-stripped check), the `myCourses` + `entitlements` rule blocks, the
  catch-all still last, the deploy workflow, the server handler's token-derived uid, the
  rewrite + multiplexer registration, the client fallback + sticky flag,
  `describeMyCoursesError`, the Sanctuary tray, caps parity across
  `utils/myCourseDoc.js` / `src/types/myCourse.ts` / `firestore.rules`, and the runtime
  sanitizer.
- `tests/courseNotesCloudSyncRuntime.test.mjs` (12) — **behaviour, not text**: the real
  hook + real cloud layer + real device mirror mounted in React 19 inside jsdom against an
  in-memory Firestore (only the two I/O boundaries are stubbed, exactly like
  `tests/libraryMentorFlowsRuntime.test.mjs` stubs `apiBase`). Proves a note reaches
  `users/{uid}/notes/{id}`, renders, appears live from another device, is mirrored,
  survives an offline write and lands on retry, is deleted at once and never resurrected
  by a tombstoned cloud copy, is flushed when the learner leaves, never mixes between
  courses, never writes for a uid the session cannot verify, keeps a stable controller
  identity for the 3D boards, and rescues an editor draft with no hook mounted.

That runtime suite caught one real bug during development: a failed **final** flush used
to re-arm its own retry loop on an already torn-down hook (a dead controller waking itself
for ~30 s). Fixed — retries are disposed with the controller (`disposedRef`, cleared again
on every effect setup so a StrictMode remount is unaffected) — and pinned by both the
runtime test and the contract test.

Seven existing suites were updated to the new cloud-notes contract
(`coursePlayerUxRuntime`, `coursePlayerUx`, `coursePlayerPanelSessionContract`,
`coursePlayerResumeCompleteToggleNotesContract`, `classroom3dRemovalContract`,
`myStudyLibraryCourseBuilderContract`, `nature3dSanctuaryContract`).

---

## Deployment checklist (the fix is not live until step 1 is done)

1. **Deploy the rules** — either merge to `main` (the new workflow does it) or run once:
   ```
   firebase deploy --only firestore:rules,firestore:indexes,storage:rules --project my-website-761e9
   ```
   Add the `FIREBASE_SERVICE_ACCOUNT` repo secret so the workflow can keep doing it.
2. Deploy the app + functions to Vercel as usual (`/api/my-courses` is a rewrite, so no
   new serverless function is created — the Hobby 12-function cap is untouched).
3. Sanity check with a **non-admin** account: open My Study Library (should list, create,
   edit and delete), open a course in the Sanctuary, write a note on the board and a mind
   map, then reload on a second device — both must appear.

Until step 1 lands, non-admin learners are still served correctly by the API door for My
Study Library; notes need the rules (their write path is client-direct by design, so
Firestore's offline queue keeps working on a flaky connection).
