# Course Player — Sketch personal library + "Your annotations" (Read uploads)

Owner brief (2026-10-04):

1. *Sketch ke personal library me jo bhi items upload/save kiye ja rahe hain wo
   actually save nahi ho rahe* — close the Sketch tab, reopen, the library is blank.
2. *Library se direct Excalidraw me add nahi ho raha* — the item had to be
   downloaded and imported by hand.
3. The Read/PDF library page needed a **plus icon in the top-right** so a learner
   can upload their own PDF, with **every annotation and all activity saved and
   synced** — and (clarified) learners should be able to build modules with
   their own material the way the admin product builder allows.

All three are implemented in this branch.

---

## 1. Sketch personal library — why it was blank, and the fix

**Root cause.** `@excalidraw/excalidraw` ships the library *panel* but no
storage: the editor reports every change through `onLibraryChange` and expects
the HOST to persist it (that is what its own `useHandleLibrary({ adapter })`
hook is for). `src/course/SketchPanel.tsx` did neither, so the items lived in
the editor instance only — unmount the Sketch tab (or reload) and the library
was empty again.

**Fix.**

| File | What it does now |
| --- | --- |
| `src/course/useSketchLibrary.ts` *(new)* | Owner-scoped store + the editor's `LibraryPersistenceAdapter` (`load`/`save`), a localStorage device mirror, debounced writes with retries, flush on `pagehide` / `visibilitychange` / unmount. |
| `src/course/SketchPanel.tsx` | Calls `useHandleLibrary({ excalidrawAPI, adapter, validateLibraryUrl })` and forwards `onLibraryChange` as a second writer; shows a small library read-out in the save line (count / "Adding library…" / error). |
| `src/CoursePlayerApp.tsx` | Hands the panel the signed-in learner's `uid`; opens the Sketch tab once when a library install is waiting. |
| `firestore.rules` | New owner-only `users/{uid}/sketchLibraries/{libraryId}` block (`libraryId == 'main'`, `items` string ≤ 900 000 chars, `itemCount` ≤ 500). |

Storage is one document per learner — `users/{uid}/sketchLibraries/main` — with
the library items as a JSON string (the same nested-array reasoning as the
sketch boards and mind maps). The device copy is authoritative when the cloud
write is refused/offline, and it is pushed up again when the cloud answers.

## 2. "Add to Excalidraw" — no more download + import

Excalidraw's browse flow opens `libraries.excalidraw.com` with a `referrer` and
`useHash=true`; the site's **Add to Excalidraw** sends the browser back to
`<referrer>#addLibrary=<url>&token=<id>`. This app routes with `#/…`, so that
return URL would land on an unknown route and drop the learner out of the
Course Player.

| File | Role |
| --- | --- |
| `utils/excalidrawLibraryLink.js` (+ `.d.ts`) *(new)* | Pure: parse the link out of the hash (current) or the query (legacy), keep only the hosts the editor itself trusts (excalidraw.com, raw.githubusercontent.com/excalidraw/excalidraw-libraries), park it in sessionStorage, and rewrite the URL back to the route the learner was on. |
| `src/main.tsx` | Runs the interception **before React renders** (and on `hashchange`), before the route-chunk warm-up — so the raw token never reaches the router and the right chunk is preloaded. |
| `src/course/useSketchLibrary.ts` | When the Sketch panel opens, fetches the parked library and installs it with the editor's own `updateLibrary({ libraryItems, merge: true, defaultStatus: "published" })`; the toast confirms it and the adapter persists it. |
| `src/course/SketchPanel.tsx` | Sets `libraryReturnUrl` (a stable `origin + pathname`) so "Browse libraries" comes back to this app at all. |

Result: one tap on a library page → the items are in the learner's own library,
synced to their account — no `.excalidrawlib` download and manual import.

## 3. The Read library's "+" — the learner's own PDFs

The plus button lives in the **Read library header (top-right)**, as asked. All
the learner's own PDFs appear in a separate section titled **"Your annotations"**,
above the course PDFs, grouped by a module label the learner can edit inline.

| File | Role |
| --- | --- |
| `utils/readUploads.js` (+ `.d.ts`) *(new)* | Pure model: ids, name/module clamps, `userReadUploads/{uid}/{uploadId}-{slug}.pdf` paths, the Firestore payload, the parse that survives a hand-edited document, grouping/sorting and every UI label. |
| `src/course/useReadUploads.ts` *(new)* | Live controller: `onSnapshot` on `users/{uid}/readUploads`, `uploadBytesResumable` with real progress, rename / module / delete, `saveAnnotations`, debounced `recordActivity`. |
| `src/course/ReadLibraryPanel.tsx` | The header "+", the progress/error/notice strips, the "Your annotations" groups, the module editor and delete confirm, plus the reader overlay with the annotation-state pill, **Save**, and a blocked-leave banner when the storage write fails. |
| `src/course/PdfJsGenericViewer.tsx` | Unchanged viewer bootstrap + a new optional `onAnnotationApi` bridge: `{ isDirty, saveAnnotatedBytes, currentPage, annotationCount, pageCount }`. `isDirty` chains the viewer's own `annotationStorage.onSetModified/onResetModified` (re-attached on `documentloaded`/`pagesinit`) with a size-growth safety net; `saveAnnotatedBytes()` is `pdfDocument.saveDocument()` — the exact bytes the viewer's own Save produces, annotations included. |
| `storage.rules` | New `userReadUploads/{uid}/{fileName}`: owner-only write, PDF MIME, same 100 MiB ceiling; owner/admin read. |
| `firestore.rules` | New owner-only `users/{uid}/readUploads/{uploadId}` block; `storagePath` must resolve inside the learner's own folder, every numeric field is clamped to the same caps the client uses, and the reserved privileged fields stay unreachable. |

**Annotations + activity are saved and synced**: *Save* writes the annotated
bytes back over the learner's own object and updates the row (`hasAnnotations`,
`annotationCount`, `annotatedAt`, refreshed URL, size); page changes write
`lastPage` / `lastOpenedAt` through a debounce (flushed on tab switch and
unmount), so the next device opens the same marks at the same page. Leaving the
reader while a save is pending blocks the exit instead of lying about it, with
"Leave anyway" as the escape hatch.

## 4. Learner-built modules with the learner's own PDFs

"Your annotations" rows now offer **Save to my module**: the file is handed to
the SAME "Add to My Module" dialog the Player settings use, and lands in a
My Study Library course as a `read` resource that carries its owned Storage
path. That course's Read tab then resolves it (`readResources.js` learned the
second owned-upload tree) and opens it in the same annotated viewer.

- `utils/readResources.js`: `isOwnedLearnerReadUploadPath` + the upload branch of
  `normalizeReadResourceUrl` now accept the learner's own tree as well as the
  admin product tree.
- `utils/readUploads.js`: `readUploadModuleDraft(row)` builds the resource draft.
- `src/types/myCourse.ts`, `src/lib/myCourseClient.ts`, `src/lib/myCourseAdapter.ts`:
  `read` is a valid learner resource type and its library fields survive the
  course-document round trip.
- `src/course/ReadLibraryPanel.tsx` → `CourseOverlay` → `CoursePlayerApp`: the
  action is forwarded to the player, which owns the dialog and the write.

## Verification

- `bash run_tests.sh` (273 files at the start of this work): **no new failures**.
  38 failures already exist on the base commit `f03d310` (store/My Day/revision/
  branding contracts, an APK workflow assertion and the sketch dock-tab pin for
  the `read` tab); the same 38 fail with these changes, and the three new test
  files pass.
- New tests: `tests/readUploads.test.mjs` (15), `tests/courseSketchLibrary.test.mjs`
  (10), `tests/readUploadToModule.test.mjs` (4) — pure-Node runtime checks for the
  two new utils plus source contracts for the wiring and both rules files.
- `tests/firestoreRules.emulator.mjs` gained emulator coverage for
  `readUploads` and `sketchLibraries` (runs in CI — the sandbox has no JVM).
- `npx tsc --noEmit` and `npx vite build` are clean (same 9 pre-existing unused
  symbol errors as the base commit).

## Known follow-ups

- The admin Read PDFs (shared course content) still cannot be annotated per
  learner — their Storage objects are admin-only, so only the learner's OWN
  uploads have a writable annotated copy. Per-user annotation overlays for
  course PDFs would be a separate feature.
- The My Study Library editor offers `read` resources only through this
  player-side action; adding an explicit "Annotatable PDF" resource type (with
  an in-editor upload that writes into `userReadUploads/{uid}/…`) is the natural
  next step.
- An admin Read PDF can't be copied into a learner module (its object belongs to
  the product folder); only link-type Read resources could be re-used there.
