# Course Player Notes, Mind Maps & My Study Library — Cloud Sync Report

## Issue summary

Three related persistence/access problems were traced to separate gaps:

1. Course Player notes were written only to the current device, despite the UI
   promising multi-device sync.
2. Mind-map writes needed a complete course/module scope; a blank scope must not
   silently create a document that no course can load later.
3. My Study Library and course-access lookups failed for non-admin learners when
   the deployed Firestore rules did not permit their owner-scoped reads.

The implementation keeps notes, mind maps, and library access separate where
appropriate while retaining a single, consistent ownership model.

---

## Course Player notes

Notes are stored one document per note at
`users/{uid}/notes/{noteId}`. Firestore is the source of truth; `localStorage`
remains an offline mirror for immediate display and pending writes.

- `utils/courseNotes.js` and its declaration file contain normalization,
  payload caps, link operations, note IDs, and cloud/device merge behavior.
- `src/course/cloudNotes.ts` owns Firestore I/O: live snapshots, one-shot reads,
  batched writes/deletes, owner verification, and user-facing error messages.
- `src/course/useCourseNotes.ts` owns the Course Player's notes state, listener,
  device mirror, debounced writes, retry/backoff, tombstones, and flush-on-leave
  behavior. Its controller is memoized for stable React consumers.
- `src/course/NotesPanel.tsx` keeps the panel's compose/edit/list state and open
  draft in the Course Player session; editor exit rescue writes through the same
  cloud helpers.
- `src/ai/aiNotes.ts` uploads AI-saved notes through the same path.
- Notes use the player's course scope (including learner-authored course IDs
  and the existing `__library__` personal-notes scope).
- `firestore.rules` enforces owner scope and the same payload caps as the client.

Device-only notes are queued for upload when the signed-in learner opens the
Course Player. Failed writes remain on-device and retry safely; deletion
tombstones prevent stale cloud snapshots from restoring a deleted note.

## Course Player mind maps

`src/course/useCourseMindMap.ts` scopes each map to its course and module.
A missing/blank course or module scope is read-only rather than creating an
unreachable cloud document. The existing Course Player map library, active-map
selection, revisions, and cloud save behavior remain intact. Panel view state
(list versus canvas) is persisted in `src/course/coursePanelSession.ts` within
the Course Player session.

## My Study Library access

`firestore.rules` grants each signed-in learner owner-scoped access to their
`users/{uid}/myCourses/{courseId}` documents and read access to their own
`entitlements`. Entitlement writes remain server-only.

The `/api/my-courses` path is a rewrite to the shared serverless handler. Its
Admin SDK operations derive the learner ID from a verified Firebase token, not
from request data. The client uses Firestore first and falls back to that API
when rules/authentication errors prevent Firestore access; it returns to the
Firestore path when that service recovers. The Firebase rules workflow runs the
emulator suite before deployment.

## Useful checks

- `npm run test:course-sync` — Course Player notes and mind-map cloud sync,
  panel-session contracts, and revision smart-session cloud-parent coverage.
- `npm run test:firestore:rules` — shared Firestore emulator rules for notes,
  mind maps, and revision sessions.
- `node --test tests/myStudyLibraryAllAccountsContract.test.mjs` — owner rules,
  verified-token API fallback, and shared document caps.

These commands describe the current checks; results depend on the local
JavaScript dependencies and Firebase emulator availability.
