# Work mode = same deck, same navigation, same pages — + Personal Library check

**Owner brief:** 2026-10-16 (latest) · **Scope:** Work mode **tablet + desktop (≥ 768 px)**; mobile ek pixel bhi nahin badla
**Commit:** isi branch ka Work-parity commit (see `git log -1`)
**Verification:** `./node_modules/.bin/tsc --noEmit` EXIT 0 · full sweep **4333 tests / 4139 pass / 0 fail / 194 skipped** EXIT 0 (`/tmp/sweep11.log`) · `npm run build:low-heap` EXIT 0 (50.65 s, `/tmp/build7.log`)

---

## 1 · Aapne kya kaha, aur wo kahan hai

| # | Aapki baat | Implement | Proof |
|---|---|---|---|
| 1 | "Work mode mein bhi same **split-screen behaviour**" — chaar dabbe, `+`, ek horizontal + ek vertical divider, har divider hamesha drag | Work apna deck **banata hi nahin**: `src/work/WorkQuadDeck.tsx` Course ka hi `QuadDeck` mount karta hai (`src/course/QuadDeck.tsx`, `quadLayout.ts`, `course-quad-deck.css`) — wahi do divider, wahi chaar dot, wahi cluster (2 swap + c11…c22 buttons + saare grid formats), wahi zoom layer | runtime: "Work's four blocks are the owner's mapping, drawn by the player's own deck" (1 vertical + 1 horizontal divider, **4** dot) · contract: "Work mounts the Course Player's own plus deck — never a second one" |
| 2 | "Same **split logic**" — panes apne block mein, baaki page doosra block le | `WORK_CONTENT_PAGES` = My Day · Sketch · AI · Revision (Notes aur Mind map kabhi nahin). c11 = aap jo page par hain · c21 = doosra content block (khaali ho to apna page-picker) · c12 = Notes · c22 = Mind map | runtime: picker sirf `myday, sketch, ai, revision` offer karta hai; pick `["c21","sketch"]` report hota hai |
| 3 | "Same **navigation behaviour**" — wahi nav (icons + labels), wahi 6 px chhota size, wahi left/right/bottom/header placement, wahi "jagah wali taraf" dropdown | Wahi component: `HeaderNavView` (`CourseHeaderNav.tsx`) Work ke chhe page le kar; wahi placement store (`dc-footer-navigation-placement`), wahi `footerNavigationSizeVars()` (38 px), wahi dropdown-side rule | contract: "the navigation is the shared placeable one, with Work's own six pages" (chaaron placement + `nav={workNavNode}`) |
| 4 | Pages ke **naye designs exactly same** — Notes / Mind map / Sketch | Naye designs pehle se hi **wahi panels** hain (`NotesPanel`, `MindMapPanel`, `SketchPanel` `storageOnly`); deck ke blocks bhi wahi panels mount karte hain, aur 768 px se upar har page **headless** (ek shell header, koi per-block header) | contract: `renderPage("notes", "deck:c12:notes")`, `renderPage("mindmap", "deck:c22:mindmap")`, `headless={quadWide}` |
| 5 | **Footer-navigation behaviour** — editor khula = nav hat jaye, warna har page par rahe | `quadNavVisible = quadWide && !anyImmersive` (Work ka apna immersive signal: sketch / revision / note editor / mind map editor), aur single-divider shape mein nav content ke **neeche** | contract: "the navigation taps follow the player's rule…"; runtime: "the navigation moves under the content block in the single-divider shape" |
| 6 | Personal Library ke course player ka **check** | Poora audit + nayi parity suite (neeche §3) | `tests/personalLibraryCoursePlayerParity.test.mjs` — 5 tests, ek me **asli localStorage round-trip** |
| 7 | Mobile par kuchh na badle | 768 px gate (`useQuadDeckEnabled()`); niche aaj ka `WorkDeck` + `WorkFooterNav` bilkul waisa; `work-quad.css` mein sab kuchh 767 px par `display: none` | contract: "tablet/desktop gets the deck, a phone keeps today's Work deck untouched"; Work ki purani suites (122 tests) bina badle green |

### Faisle jo isme liye (aur badalna chahein to kahan)

* **Work ke chaar block ka mapping** (Course mein video → Resource Library → Notes → Mind map tha):
  **c11 = aapka page**, **c21 = doosra content page (picker ke saath)**, **c12 = Notes**, **c22 = Mind map**.
  Notes aur Mind map apne block mein hi rehte hain (jaise Course mein), isliye navigation unhe kabhi hilaata nahin. Doosra block `secondary` prop hai — badalna ho to ek line.
* **Nav ki placement dono environments mein ek hi stored choice hai** — course mein nav right par rakha to Work mein bhi right. (Alag chahiye to ek key ka kaam hai; aapka ishaara chahiye.)
* **My Day editor apna Back/Delete pill deck mein nahin dikhata** (`showEditorFooter` sirf phone ke bottom slot par) — deck mein shell navigation upar hi rehti hai, isliye pill double nahin hota.
* **Work view settings page ka naam "Course view"** hai (shared page ki apni heading) — design ek rakhne ke liye jaan-boojh kar.

---

## 2 · Nayi / badli hui files

**Nayi**
* `src/work/WorkQuadDeck.tsx` — Work ke chaar block + khaali block ka page-picker (`data-work-quad-prompt`, `data-work-quad-prompt-page`).
* `src/work/WorkQuadHeader.tsx` — 768 px se upar Work ki **ek** header line: exit · page · nav slot · view settings · theme.
* `src/work/work-quad.css` — Work ka shell (header, left/right rail, bottom strip, popover), mobile par sab hidden.
* `src/course/CourseViewPanel.tsx` — Course view page (zoom 80–140 %, chaar divider switch) `PlayerPanel.tsx` se **bilkul waisa** nikaal kar shared banaya, taaki Course aur Work ek hi page render karein (koi duplicate markup nahin).
* `tests/workModeQuadParityContract.test.mjs` (7) · `tests/workModeQuadParityRuntime.test.mjs` (5, real render) · `tests/personalLibraryCoursePlayerParity.test.mjs` (5).

**Badli hui**
* `src/course/CourseHeaderNav.tsx` — drawing (`HeaderNavView`) aur Course ke rules alag; dropdown ke liye `footerNavigationFitSide()` (rule wali side par jagah na ho to doosri side — "kabhi screen ke bahar nahin" ab sach hai); band button par wahi rule wali side dikhti hai.
* `src/course/PlayerPanel.tsx` — Course view page ab shared component render karta hai (markup wahi, hooks wahi store).
* `src/work/WorkApp.tsx` — deck branch (quad state `loadQuadLayout("work")`, reveal, chaaron placement, view popover), phone branch untouched.
* `src/work/pages/WorkPageSurface.tsx` — naya `headless` prop + `WORK_ACCENT_WASH` export (shell header current page ka plate dikhata hai).
* Repinned: `tests/coursePlayerQuadDeckContract.test.mjs` (shared page + `HeaderNavView`), `tests/workAiPageHeaderContract.test.mjs`, `tests/workModeHeadlessContract.test.mjs` (`!headless` shart), `tests/courseStripNavigationRuntime.test.mjs` (do naye nav tests jode).

---

## 3 · Personal Library ka course player — check ka nateeja

Rasta: `src/personal-library/MyCoursePlayerPage.tsx` (`#/my-course/<courseId>`) → wahi `CoursePlayerApp`, `mine={{ courseId: course.id }}` ke saath. Jo kuchh verify hua:

| Sawal | Jawab |
|---|---|
| Deck aur nav Personal Library mein bhi milte hain? | **Haan** — deck/nav/rails ka koi hissa `isMine` dekhta hi nahin (sirf device gate); `quadOverlay` ke config mein `isMine` kahin nahin |
| Naye pages (Notes / Mind map / Sketch) chalte hain? | **Haan** — wahi teen panels; teeno stores `mine-<courseId>` par keyed |
| Learner ka data official course se mil sakta hai? | **Nahin** — notes, mind map, sketch, progress aur **deck ka shape** (`dc.course.quadLayout.v1.mine-<id>`) sab namespaced |
| Paid tab? | Hidden (`MINE_HIDDEN_TABS = ["paid"]`), baaki 9 destinations waise hi |
| Course view page? | **Haan** — wahi shared page, Player tab ke settings mein |
| Resource Library mein "apne modules kholo" entry? | Jaan-boojh kar nahin (`libraryPersonalEntry = null` jab `isMine`) — poora course hi learner ka apna hai |

**Proof:** parity suite ka aakhri test asli `localStorage` round-trip karta hai — learner ke course ka shape (`pair`, `c22` band, col 32, row 71) save → wapas wahi, aur official course ki key **bilkul** chhui nahin jaati.

Is audit mein Personal Library side par koi bug **nahin** mila — jo bhi naya system hai, wo `mine` player mein bhi waise hi chalta hai (device gate par, entitlement par nahin).

---

## 4 · Verify kaise karein

```bash
cd /home/user/Digitalcatalyst
./node_modules/.bin/tsc --noEmit                                  # EXIT 0
node --test tests/workModeQuadParityContract.test.mjs             # 7/7
node --test tests/workModeQuadParityRuntime.test.mjs              # 5/5
node --test tests/personalLibraryCoursePlayerParity.test.mjs      # 5/5
node --test tests/workMode*.test.mjs tests/workAi*.test.mjs tests/myDay*.test.mjs   # 122 pass
node --test --test-concurrency=4 tests/*.test.mjs                 # 4333 / 4139 pass / 0 fail / 194 skipped
npm run build:low-heap                                            # EXIT 0 (50.65 s)
```

App mein: `#/work/notes` (ya koi bhi Work page) **768 px se bada** width par → chaar block, do divider, dots; nav header mein, ya "Place" se left/right/bottom; gear → zoom + dividers. Phone width par Work aaj jaisa hi.

---

## 5 · Saaf-saaf limits (honest)

1. **Nav ki placement ek hi choice hai** Course aur Work ke liye. Alag chahiye to ek storage key jodni hai — chhota change, aapka ishaara chahiye.
2. **Editor khula ho to poori navigation chhup jaati hai**, chahe editor sirf ek block mein ho — ye Course ke bilkul barabar rakha gaya hai (wahi rule).
3. **My Day editor ka pill deck mein nahin** (upar bataya) — mangal ho to wapas aa sakta hai.
4. **Personal Library ka check code + storage level par hai** (jsdom + asli localStorage round-trip), browser click-through nahin — is sandbox mein Chromium nahin hai, isliye wahan ki browser suites skip hoti hain (194 skipped sweep mein).
5. **Zoom sirf deck par** (768 px se upar) — phone par Course/Work dono mein zoom nahin, jaise pehle se hai.
