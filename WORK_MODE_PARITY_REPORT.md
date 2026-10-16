# Work mode — plus deck, placeable navigation aur Personal Library check — report

**Owner brief:** 2026-10-16 (dusra message) · **Scope:** Work mode **≥ 768 px**; mobile par Work bilkul waisa hi
**Commit:** is branch ka latest commit (dekhein `git log -1`)
**Verification:** `./node_modules/.bin/tsc --noEmit` EXIT 0 · `npm run build:low-heap` EXIT 0 (50.65 s, `/tmp/build7.log`) · full sweep **4333 tests / 4139 pass / 0 fail / 194 skipped** EXIT 0 (`/tmp/sweep11.log`)

---

## 0 · Aapne kya kaha (aapke hi shabdon mein)

> "Work mode mein bhi same split-screen behaviour, same footer-navigation behaviour aur naye notes page, mind map page aur sketch ke design — **sab kuchh exactly same** chahiye."
> "Dekho **personal library ke course player** mein bhi sab acche se kaam kar raha hai ki nahin."

Isliye is wave ke do hisse hain: **(A) Work mode ko Course Player ke naye system ke saath barabar karna**, aur **(B) Personal Library ke course player ka check** — dono ke saath proof.

---

## 1 · Work mode — ek-ek cheez, aur wo kahan hai

| # | Aapne kaha | Implement | Proof |
|---|---|---|---|
| 1 | **Same split-screen behaviour** (char dabbe, `+` shape, do divider, har divider hamesha drag) | Work apna deck **nahin banata** — wahi `src/course/QuadDeck.tsx` mount hota hai `src/work/WorkQuadDeck.tsx` ke through: `player / notes / resources / mindmap` — chaar ready nodes, bilkul waise hi jaise Course Player deta hai. Do divider, chaar dot, ek cluster, sab kuchh wahi | runtime: "Work's four blocks are the owner's mapping, drawn by the player's own deck" (ek vertical divider, ek horizontal, **chaar** dot) |
| 2 | **Same split logic** — Notes aur Mind map apne block mein rehte hain, baaki page doosra block lete hain | `WORK_CONTENT_PAGES` = myday · sketch · ai · revision (notes/mindmap nahin). c11 = aap jo page par hain, c21 = doosra content block (khaali ho to page-picker), c12 = Notes, c22 = Mind map | runtime: picker ke page **exactly** `["myday","sketch","ai","revision"]`; runtime: pick report hota hai `[["c21","sketch"]]` |
| 3 | **Same navigation behaviour** — wahi placeable navigation (icons + labels, 6 px chhota, left/right/bottom/header, dropdown khali jagah ki taraf) | Wahi component: `HeaderNavView` (`src/course/CourseHeaderNav.tsx`) Work ke chhe page le kar (`WORK_PAGES`), wahi placement button + dropdown + wahi stored choice (`useFooterNavigationPlacement`). Chaaron placement Work mein bhi asli hain | contract: "the navigation is the shared placeable one, with Work's own six pages" (chaaron placement + `nav={workNavNode}`) |
| 4 | **Same behaviour**: jab editor khula ho to navigation chhup jaye (Course ka wahi rule) | `quadNavVisible = quadWide && !anyImmersive` — Work ka apna immersive signal (sketch / revision / note editor / mind map editor) | contract: "the navigation is the shared placeable one…" (aakhri line) |
| 5 | **Single divider wala format** mein navigation content ke **niche** (Course ka wahi rule) | `quadNavInDeck = quadWide && quadState.format === "pair"` par shell apni nav nahin draw karta — deck khud navigation content block ke niche rakhta hai | runtime: "the navigation moves under the content block in the single-divider shape" |
| 6 | **Naye Notes / Mind map / Sketch designs exactly same** | Ye teeno pehle se hi **wahi panels** hain (`NotesPanel`, `MindMapPanel`, `SketchPanel`, `storageOnly`) — is wave mein koi design copy nahin hui; deck ke blocks mein bhi wahi panels mount hote hain, wahi headless pages | contract: `renderPage("notes", "deck:c12:notes")` / `renderPage("mindmap", "deck:c22:mindmap")`; poori Work suite (122 tests) green |
| 7 | **Course view page** (zoom + chaar divider switch) Work mein bhi | Page ko `PlayerPanel.tsx` se nikaal kar shared `src/course/CourseViewPanel.tsx` banaya — Course Player aur Work **ek hi component** render karte hain, ek hi store (`courseViewSettings.ts`) se. Work mein gear (`data-work-view-toggle`) → "Work view" popover (`data-work-view-settings`) | contract: "the Course-view page is the player's own component, and the shape is remembered"; runtime: zoom 120 % deck par lagta hai (`data-quad-zoom="120"`, `scale(1.2)`) |
| 8 | **Shape yaad rahe** (per device) | `loadQuadLayout("work")` / `saveQuadLayout("work", …)` — key `dc.course.quadLayout.v1.work`, yaani Course ke layouts se alag | contract: "the Course-view page is the player's own component, and the shape is remembered" |
| 9 | **Mobile mein kuchh na badle** | `quadWide` (768 px gate) se niche aaj ka `WorkDeck` + `WorkFooterNav` bilkul waisa hi; deck ka header/rails/popover `work-quad.css` mein 767 px par `display:none` | contract: "tablet/desktop gets the deck, a phone keeps today's Work deck untouched"; Work ki poorani suites (122) bina badle green |
| 10 | Navigation ke dabane par block wapas aaye (Course ka `reveal` rule) | notes → `c12`, mindmap → `c22` (closed ho to khul jaye aur glow kare), baaki page → c11 + hash `#/work/<page>` | contract + runtime: "a navigation press brings a closed block back, through the player's reveal signal" |

---

## 2 · Work ke chaar block ka mapping (yeh mera faisla hai — badalna ho to ek line)

Aapne Course Player ke liye mapping di thi: **left-top main video, left-bottom Resource Library, right-top Notes, right-bottom Mind map.** Work mein video/Resource Library nahi hote, isliye wahi dhaancha is tarah lagaya:

| Block | Course Player mein | **Work mode mein** |
|---|---|---|
| c11 (left-top) | main player / video | **aap jo page par hain** (My Day · Sketch · AI · Revision) |
| c21 (left-bottom) | Resource Library | **doosra content block** — page-picker, ya pichhla page |
| c12 (right-top) | Notes | **Notes** (wahi panel) |
| c22 (right-bottom) | Mind map | **Mind map** (wahi panel) |

Agar aap chahein ki c21 par kuchh aur ho (jaise "My Day hamesha c21 par"), to sirf `WorkQuadDeck` ke `secondary` prop ka default badalna hai — poora deck, dividers, formats, dots, zoom wahi rahenge.

---

## 3 · Nayi / badli hui files

**Nayi**
* `src/course/CourseViewPanel.tsx` — Course view page (zoom + chaar divider switch), `PlayerPanel.tsx` se **bilkul waisa hi** nikaala gaya, taaki Course aur Work ek hi page render karein.
* `src/work/WorkQuadDeck.tsx` — Work ke chaar block + khaali block ka page-picker (`data-work-quad-prompt`, sirf content pages offer karta hai).
* `src/work/WorkQuadHeader.tsx` — 768 px se upar Work ki **ek** header line: exit · page · navigation slot · view settings · theme. (WorkApp mein theme control nahi daala, kyunki us par purana contract hai — `workModePhase2Contract`.)
* `src/work/work-quad.css` — sirf Work ka shell: header line, left/right rail, bottom strip, popover; neeche 767 px par sab `display:none`.
* `tests/workModeQuadParityContract.test.mjs` (7 tests) · `tests/workModeQuadParityRuntime.test.mjs` (5 tests, asli render) · `tests/personalLibraryCoursePlayerParity.test.mjs` (5 tests).

**Badli hui**
* `src/course/CourseHeaderNav.tsx` — drawing (`HeaderNavView`) aur Course ke rules alag kiye, taaki **ek hi design** dono jagah lage; placement dropdown ab "fit" bhi check karta hai (agar rule wali side par jagah na ho to doosri side, kabhi screen ke bahar nahin).
* `src/work/WorkApp.tsx` — 768 px se upar naya branch: quad state (`loadQuadLayout("work")`), reveal signal, chaaron placement, `WorkQuadDeck`, view-settings popover; 768 se niche aaj ka deck + footer nav.
* `src/work/pages/WorkPageSurface.tsx` — naya `headless` prop (deck mein har page bina apne header ke, wahi jaise Course ke chaar block), aur `WORK_ACCENT_WASH` export.
* `tests/coursePlayerQuadDeckContract.test.mjs` — Course view page ke pins shared file par, + `HeaderNavView` ke pins.
* `tests/workAiPageHeaderContract.test.mjs`, `tests/workModeHeadlessContract.test.mjs` — `showHeader = !headless && !immersive && page !== "ai"` (AI ka rule wahi rehta hai).

---

## 4 · Personal Library ke course player ka check

Aapka sawaal: *"personal library ke course player mein bhi sab acche se kaam kar raha hai ki nahin?"*

**Jawab: haan — aur is wave mein Personal Library ke player mein koi bug nahin mila.** Jo check kiya gaya:

| Check | Nateeja |
|---|---|
| Personal Library ka player **wahi** player hai? | Haan — `src/personal-library/MyCoursePlayerPage.tsx` (`#/my-course/<id>`) wahi `CoursePlayerApp` kholta hai `mine={{ courseId }}` ke saath, `key={course.id}` (course badalne par player saaf) |
| Plus deck Personal Library mein bhi milta hai? | Haan — deck/nav/rails ka koi hissa `isMine` dekhta hi nahin (device gate hi ek gate hai). `quadOverlay` ke config mein `isMine` kahin nahin |
| Naye pages (Notes / Mind map / Sketch) wahan chalte hain? | Haan — wahi teen panels, wahi `storageOnly`-type stores, teeno `storageProductId` par (yaani `mine-<courseId>`) |
| Learner apne course ka data kisi official course se mil jayega? | **Nahi** — notes, mind map, sketch, progress aur **deck ka shape bhi** `mine-<courseId>` par keyed hai (`dc.course.quadLayout.v1.mine-abc`) |
| Kya Paid tab Personal Library mein dikhta hai? | Nahi — `MINE_HIDDEN_TABS = ["paid"]` sirf wahi ek tab chhupta hai (navigation mein 9 button) |
| Resource Library mein "apne modules kholo" wala entry? | Personal Library mein jaan-boojh kar nahin (`libraryPersonalEntry = null` jab `isMine`), kyunki poora course hi learner ka apna hai |
| Course view page (zoom + divider switch)? | Haan — wahi shared page, Player tab ke settings mein |

**Proof:** `tests/personalLibraryCoursePlayerParity.test.mjs` — 5 tests, jinme ek **asli localStorage round-trip** hai: learner ke course ka shape (`pair`, `c22` band, col 32, row 71) save hota hai, wapas wahi milta hai, aur official course ki key **bilkul chhui** nahin jaati.

---

## 5 · Kaise verify karein

```bash
cd /home/user/Digitalcatalyst
./node_modules/.bin/tsc --noEmit                     # EXIT 0
node --test tests/workModeQuadParityContract.test.mjs tests/workModeQuadParityRuntime.test.mjs
node --test tests/personalLibraryCoursePlayerParity.test.mjs
node --test tests/workMode*.test.mjs tests/workAi*.test.mjs tests/myDay*.test.mjs
node --test --test-concurrency=4 tests/*.test.mjs    # 4333 / 4139 pass / 0 fail / 194 skipped
npm run build:low-heap                               # EXIT 0 (50.65 s)
```

App mein dekhne ke liye: `#/work/notes` (ya koi bhi Work page) **tablet/desktop width (≥ 768 px)** par kholein → chaar block, do divider, dots; nav header mein (ya Place button se left/right/bottom), gear se "Work view" (zoom + dividers). Phone width par aaj ka Work bilkul waisa hi.

---

## 6 · Saaf-saaf limits (jo abhi bhi nahin hua)

1. **Navigation ki placement ek hi stored choice hai dono environments ke liye.** Aapne Course mein nav ko right rail par rakha, to Work mein bhi right rail rahegi. Agar dono ke liye alag choice chahiye, ek key jodni hai (`dc-footer-navigation-placement.work`) — chhota change hai, bas aapka ishaara chahiye.
2. **Deck mein My Day editor apna Back/Delete pill nahi dikhata** (`showEditorFooter` sirf phone ke bottom slot par) — kyunki deck mein shell ki navigation upar hi rehti hai. Chahein to pill wapas aa sakta hai.
3. **Editor khula ho to poori navigation chhup jaati hai** (Course ka wahi rule) — chahe editor ek hi block mein ho. Ye Course ke saath bilkul barabar rakha gaya hai.
4. **Work view page ka title "Course view" hi hai** (shared page ki apni heading). Work mein "Work view" likhwana ho to ek prop ka kaam hai — jaan-boojh kar design ek hi rakha.
5. **Personal Library ka check code + storage level par hai, browser click-through nahin** — is sandbox mein Chromium nahin hai, isliye wahan ki browser suites skip hoti hain (sweep mein 194 skipped). Runtime proof usi jsdom + asli localStorage round-trip se hai.
6. **Zoom sirf deck par lagta hai** (768 px se upar). Phone par Work/Course ka koi zoom nahin — jaise Course mein bhi nahin hai.
