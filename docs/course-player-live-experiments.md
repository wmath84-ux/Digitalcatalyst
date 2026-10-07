# Live Experiments — the Course Player's Experiment page

An **interactive 2D experiment** is one self-contained HTML file (HTML + CSS +
JS, no build step, no CDN) that plays inside a sandboxed iframe in the Course
Player. It is the one file type a *learner* authors, and the Experiment tab is
where those experiments live:

```
Experiment tab (src/course/ExperimentPanel.tsx)
  MASTER  the course's own `interactive` resources, opened in the viewer stack
  SELF    the learner's own, created here with the “+”

  “+”  →  dropdown (AI prompt · starter templates)
       →  composer (src/course/ExperimentComposer.tsx)
       →  MyCourseExperimentEditor   ← the Study Library's own builder
       →  Create  →  users/{uid}/myCourses/my-experiments
```

One builder serves both surfaces on purpose: the sheet inside the player is the
very same editor My Study Library shows (`src/personal-library/
MyCourseExperimentEditor.tsx`), so the AI prompt, the paste/upload/template row,
the live preview and the checks can never drift apart between the two places.

## The page

`ExperimentPanel` renders the same MASTER/SELF language as the Brain tab:

- **MASTER** — every `interactive` resource of the open course, in curriculum
  order, carrying its module's own access state (a locked module's experiment
  is listed with its lock instead of opening). Opening one goes through
  `selectFile`, so official progress/completion keeps working exactly as it did
  from the Modules tab.
- **SELF** — the learner's own experiments for this course, read from the Study
  Library shelf through the player's live listener
  (`selfExperimentsFromCourses`, `src/utils/selfExperiments.ts`). Opening one
  goes through `selectPersonalFile`, which deliberately leaves course progress
  alone.
- The filter itself is the shared, per-learner, per-feature preference
  (`useMasterSelfPreference("experiment", uid)`) — one `MasterSelfControl`,
  identical to Notes / Mind Map / Brain.

## The “+” and its dropdown

The header “+” opens a small sheet with the ways in, and every way in ends in
the same composer and the same save:

1. **Ask an AI for it** — opens the composer with Step 1 ready: the CMD, its
   editable **Topic** and **Level** slots, the rule pills and **Copy prompt for
   AI**.
2. **Or start from a template** — the four shipped starter experiments
   (projectile motion, simple pendulum, wave superposition, sorting visualizer),
   each one tap, landing in the composer already loaded and previewing.

Tapping “+” while MASTER is showing switches to SELF first, so the list behind
the dropdown is exactly where the new experiment will appear.

## The composer

The sheet is the Study Library's builder plus only what the player surface
needs:

- an **Experiment name** (prefilled with the module being watched, else the
  course title) and an **optional hosted link** for a file too big to store;
- the editor's own three steps — AI prompt + Copy, paste / upload / template,
  live preview in the *same* sandboxed stage the lesson plays in, and the
  honest checks (external script, storage, `alert`, over-size …);
- **Create**, refused until the draft is runnable (`selfExperimentIssues` —
  the shared `experimentBlockingIssues` rule) and until the name is set. On
  success the sheet closes; on failure it stays open with the reason.

## Where a created experiment lives, and why

| Piece | Value |
| --- | --- |
| Library course | `users/{uid}/myCourses/my-experiments` — “My experiments”, created on first use |
| Module | the module the learner was watching, else the course title |
| Resource | `type: "interactive"`, `interactiveHtml` (the one file), `size`, and `experimentSourceProductId` = the player's scope (`storageProductId`) |

So the experiment syncs to every device on the Study Library shelf, is editable
there with the same editor, and appears in the Experiment page's SELF list only
for the course it was made in. The 200 KB per experiment / 640 KB per course
budgets already enforced by `myCourseClient` (and the server twin) keep
applying.

## Tests

- `tests/coursePlayerInteractiveExperimentsContract.test.mjs` — the file type,
  the sandbox, the bridge, the checks, the stored source and the player that
  plays it.
- `tests/adminInteractiveExperimentsContract.test.mjs` — the admin's twin
  builder and the editor → Firestore → player mapping.
- `tests/coursePlayerSelfExperimentContract.test.mjs` — THIS flow: the shelf
  course and its scope tag, the SELF filter, the composer being the library's
  own builder (no second prompt), Create's runnability gate, the “+” dropdown
  with its templates, and the player wiring
  (`selfExperiments` → `onCreateSelfExperiment` → `myLibrary.save`).
