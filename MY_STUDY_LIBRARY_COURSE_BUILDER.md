# My Study Library → self-authored courses (Course Builder)

**What changed, in one line:** My Study Library is no longer a list of links saved
out of official courses — it is the shelf where a learner **builds their own
courses** (cover image, modules, folders inside folders, resources and Brain MCQ
sets) and plays them in the **same Course Player** a purchased course uses.

---

## 1. The shelf — `My Study Library` (`#/study-library`)

The old surface is gone: no separate module cards, no resource grid, no
search/type/module/state filters, no plan-usage panel, no Saved-for-Later bucket
and no study-pack rails.

What is there now:

| Element | What it does |
| --- | --- |
| **Course grid** (`data-my-course-grid`) | One card per course the learner built, drawn with the store's own product-card material (`dc-scene-plate`, radius 24, 4:3 artwork) |
| Card contents | **Cover image**, **title**, **Play**, **Edit** — nothing else (no price, rating, favourite or share row) |
| **"+" tile** in the grid (`data-my-course-create`) | Opens the builder |
| **Floating "+"** (`data-my-course-create-fab`) | The same builder, one tap away on every screen size |
| Empty state | Explains the flow in Hinglish and opens the builder |

**Play** → `#/my-course/<courseId>` · **Edit** → `#/my-course/<courseId>/edit`

## 2. The builder — `+` / `#/my-course/new`

`src/personal-library/MyCourseEditorPage.tsx` (+ `MyCourseBrainEditor.tsx`)

* **Cover image** — upload from the device (Cloudinary when configured →
  Firebase Storage → a downscaled in-document data URL, so it never dead-ends)
  or paste any image URL.
* **Title + description.**
* **Modules** — add, rename, describe, reorder (↑ ↓) and delete, with a
  confirmation before anything destructive.
* **Folders inside folders** — "Sub-module" nests a module inside a module, up
  to 4 levels, exactly like the admin curriculum tree.
* **Resources** per module — `name`, **file type** (YouTube, video, audio, PDF,
  Google Doc / Sheet / Slides, image, Google Form, website embed, e-book,
  Whimsical mind map, **Brain**), a **link OR an uploaded file**, and details.
  A resource the player cannot open is named out loud in the editor.
* **Brain · MCQ practice** — the same capability the admin has:
  paste a block of questions (the shared `parseQuestionText` parser; `✓`, `*`,
  `[correct]`, `Answer: B` all mark the right option) **or** add them by hand
  with prompt, 2–6 options, the marked answer, explanation, difficulty and
  topic. Incomplete questions are listed with what is missing.
* **Save** / **Save & play** / **Delete**.

## 3. Storage

```
users/{uid}/myCourses/{courseId}     ← ONE document: cover, title, modules
                                       (nested), resources, Brain questions
```

* Ownership is re-derived from the **path** by `firestore.rules`, so a browser
  can never read or write another learner's course.
* Writes go straight from the client (the document is the learner's own), which
  means Firestore's offline queue keeps a course built on a flaky connection.
* Reads are defensive: `parseMyCourse` normalises every field, so a malformed
  or legacy document can never white-screen the page.

> **Deploy step:** the new rules ship with this change — run
> `firebase deploy --only firestore:rules` (or deploy the repo's rules) before
> learners start creating courses.

## 4. The player — `#/my-course/<courseId>`

`src/personal-library/MyCoursePlayerPage.tsx` → `src/lib/myCourseAdapter.ts` →
**the same `<CoursePlayer>`** (`src/CoursePlayerApp.tsx`), flagged `mine`.

Identical to a purchased course: viewer stack, Modules tab, Brain practice,
Notes, Mind map, AI chat, footer dock, progress bar, mark-complete, snowfall,
desktop-view, status-bar and footer-dock settings.

Three deliberate differences (`mine` in `CoursePlayerApp` + `PlayerPanel`):

1. **No Paid ("premium") tab** — hidden from the dock and from the
   ⌘/Ctrl+1… tab walk (`MINE_HIDDEN_TABS`).
2. **Settings keep everything except the three official-resource rows** —
   no "Gate personal access", no "Add to My Module", no "Save for later".
3. **Every store is namespaced `mine-<courseId>`** — progress, notes, playback
   positions, mind maps and the AI chat all live under their own key, so
   nothing the learner writes in their own course can touch an official
   course's data (and vice versa).

There is also **no access check**: a learner always owns what they authored, so
the player opens without the entitlement / purchase / subscription listeners.

## 5. Files

| File | Role |
| --- | --- |
| `src/types/myCourse.ts` | The course / module / resource / question model + caps |
| `src/lib/myCourseClient.ts` | Firestore read/write, normalisation, cover + file upload |
| `src/lib/myCourseAdapter.ts` | Learner course → the player's `Product` |
| `src/hooks/useMyCourses.ts` | One live listener feeding the shelf, the builder and the player |
| `src/personal-library/StudyLibraryPage.tsx` | The shelf (grid + "+" entry points) |
| `src/personal-library/MyCourseCard.tsx` | The product-card course tile |
| `src/personal-library/MyCourseEditorPage.tsx` | The builder |
| `src/personal-library/MyCourseBrainEditor.tsx` | The Brain (MCQ) editor |
| `src/personal-library/MyCoursePlayerPage.tsx` | The player route host |
| `src/utils/appRoutes.ts`, `src/main.tsx` | `#/my-course/new`, `#/my-course/<id>`, `#/my-course/<id>/edit` (auth-required, lazy) |
| `firestore.rules` | `users/{uid}/myCourses/{courseId}` owner-scoped rules |
| `tests/myStudyLibraryCourseBuilderContract.test.mjs` | The contract suite for all of the above |

## 6. Note on the old data

Links the learner previously saved through the old library (the server-backed
`users/{uid}/personalCourseModules` tree) are still in Firestore and still
reachable from the Course Player's **My Modules** panel inside official courses.
The Study Library page itself no longer renders them — it is a creation surface
now. Nothing was deleted server-side.
