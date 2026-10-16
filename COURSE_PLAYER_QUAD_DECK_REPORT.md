# Course Player — Plus Deck (desktop/tablet) report

**Owner brief:** 2026-10-16 · **Scope:** tablet (every size) + desktop, **≥ 768 px**; mobile untouched
**Commit:** the branch's quad-deck commit (see `git log -1`)
**Verification:** `tsc --noEmit` EXIT 0 · `npm run build:low-heap` EXIT 0 (48.59 s) · full test sweep **4314 tests / 4120 pass / 0 fail / 194 skipped** (`/tmp/sweep10.log`)

---

## 1 · Aapki list, ek-ek point, aur wo kahan hai

| # | Aapne kaha | Implement | Proof |
|---|---|---|---|
| 1 | Puri screen char parts mein, `+` shape — **ek** horizontal + **ek** vertical divider (char divider nahin) | `src/course/QuadDeck.tsx` — deck ek CSS grid hai jiske row/column templates `src/course/quadLayout.ts` (pure model) se aate hain; sirf **do** divider render hote hain (`hasVertical` / `hasHorizontal`) | runtime: “the deck is a + of four blocks”, “the deck draws exactly two dividers, never four” |
| 2 | **Har divider hamesha drag/resizable** | drag path par koi mode/gate/unlock nahin — `handlePointerDown/Move/Up` dono axis ke liye; live drag seedha DOM par `--quad-col` / `--quad-row` likhta hai (React re-render per frame nahin), release par commit | runtime: “the vertical divider drags…”, “the horizontal divider drags too…”, “a hidden divider segment still drags” |
| 3 | Mapping: left-top = **main player/video**, niche **Resource Library**, right-top **Notes**, right-bottom **Mind map** | `QUAD_PANE_SLOT`: `c11: player · c12: notes · c21: resources · c22: mindmap`; deck ko char nodes milte hain (`playerPane`, `notes`, `resources`, `mindmap`) | runtime: “the deck is a + of four blocks: player, notes, resources, mind map” |
| 4 | Segment ke **theek centre** par click → chhota popup: 2 swap (left↔right, top↔bottom); bahar click se band; swap dabane ke baad bhi band | har divider do **half segments** mein banta hai aur har half ke centre par uska **dot** hai (`data-course-quad-dot`) — cross par chaar dot. Ek hi cluster khulta hai: `document` capture-phase par outside-click band karta hai, Escape bhi; swap/blocks/format press par `setMenu(null)` | runtime: “the two segment dots sit on each divider — four in all”, “a dot opens ONE cluster…”, “outside click closes…”, “a swap press swaps and closes…” |
| 5 | Usi popup mein **c11, c12, c21, c22** close/open; band wala `c22+` likhe aur dabane par khul jaye | `quadPaneButtons()` — band block ka text `${pane}+`, `data-quad-pane-open="false"`; last bacha block band nahin ho sakta (deck kabhi khaali nahin) | runtime: “closing c22 hides that block; its button then reads c22+ and reopens it” |
| 6 | Aur grid-format buttons: **1-upar/3-neeche** + ulta, **2-upar/1-neeche** + ulta (sabse zaruri), aur **single divider 2-screen** (right = Resource page + **uske niche footer navigation**, left = player) | `QUAD_FORMATS`: `top1 · bottom1 · top2 · bottom2 · pair` (+ `quad` = 2×2 wapas). `pair` = `[[c11, c21]]` — ek hi divider, aur deck navigation ko Resource Library ke **niche** draw karta hai (`data-quad-pane-nav`) | runtime: “the grid shapes rearrange the blocks exactly as they are named”, “the single-divider shape puts the navigation under the Resource Library” |
| 7 | Desktop header: **progress bar + Settings + footer navigation ek hi line mein** | `CoursePlayerApp.tsx` ke top rail mein, 768 px se upar, progress bar `flex-1` + Settings `shrink-0` + nav slot `data-course-nav-slot` (nav `CourseHeaderNav`) | contract: “the header carries the progress bar, Settings and the navigation in ONE line” |
| 8 | Footer navigation ka size **6 px chhota** | `footerNavigationSizeVars()`: 44 px → **38 px**, cell 40 px, padding 9 → 6 (icons wahi). CSS: `[data-quad-nav-shrunk] …` sirf 768 px se upar (`course-quad-deck.css`, `course-header-nav.css`) | contract + runtime: “the navigation's box comes down by exactly the owner's 6px” |
| 9 | Naya header button — **sirf tablet/desktop par dikhe** — nav ko **left / right / bottom / header** kahin bhi place kare; dropdown **jahan jagah hai us taraf** khule (top→neeche, bottom→upar, left→right, right→left), kabhi screen ke bahar na jaye | `CourseHeaderNav.tsx` → `FooterNavigationPlacementButton` (`useFooterNavigationPlacementEnabled()` = `(min-width: 768px)`), 4 options, aur `footerNavigationMenuSide()` = down/up/right/left. Button **navigation ke saath chalta hai**, isliye direction har placement par sach hai | runtime: “the placement dropdown always opens toward the free space”, “the placement sticks, defaults to the header…”; CSS mein chaaron `data-side` rules |
| 10 | Ye pura system **sirf badi screen** ke liye; mobile mein kuch na badle | `QUAD_MIN_SCREEN_PX = 768` + `useQuadDeckEnabled()`. 768 se niche: SplitDeck waisa hi, peek dock waisa hi, koi rail/na header slot/na `data-quad-nav-shrunk`. Course view settings bhi “accordingly” ko chhua nahin | contract: “the whole system starts at 768px and the phone keeps today's player”; sweep ke purane 4277 tests bina badle chalte hain |

### Aapke baaki faisle (jo brief ke saath aaye the)

* **Ek hi cluster, saare button ek saath, groups mein** — `Swap · Blocks · Grid format`, aur **~6 row visible** (`.dc-quad-menu__scroll` = `max-height: min(52vh, 300px)` + scroll) — “Bas wahi dikhna chahiye jo visible space me aa sake, baaki scroll ho.”
* **Dots guide karenge** — har button par uska dot (`data-quad-dot`), jo choice live hai uska dot lit; divider ke segment ka dot us segment ke *exact centre* par.
* **Format icons samajh mein aane wale** — har format aur har block button par **patli bars** wala mini-layout (`QuadGlyph`): jitne block, utni bars, usi jagah par; `c11` par accent bar.
* **Peek / “+” wala block** — jo block band hai wo button `c22+` ban jata hai, aur jab deck par cross hi nahin bacha (ek hi row/column ya ek hi block), to usi cluster ka ek chhota darwaza (`data-course-quad-menu-button`) deck ke corner par rehta hai — wapas aane ka rasta kabhi band nahin.
* **Settings gear → “Course view” page** — `PlayerPanel.tsx` (`data-course-view-page`): **zoom** smaller/larger (`80–140%`, step 10) aur **char divider switches** (vTop · vBottom · hLeft · hRight). Zoom **har format mein carry** karta hai (`data-quad-zoom`), 100% se upar deck **pan** karta hai (root scroll), aur `prefers-reduced-motion` par scale jump karta hai. Charon switch ON = purana 4-divider look; switch off sirf line (aur uska dot) chhupata hai — **drag kabhi band nahin hota**.
* **Entry par default format** — shape + dono ratio per course persist hote hain (`loadQuadLayout/saveQuadLayout`, key `dc.course.quadLayout.v1.<courseId>`), isliye player khulta hi learner ke last layout par hota hai, fresh par nahin.
* **Har divider ka menu har format mein** — dots sabhi formats mein maujood; divider par **double-click** bhi cluster kholta hai; keyboard par Enter/Space, `s` se swap, arrow keys se resize.
* **Nav-space rule** — deck par `data-quad-nav-side` publish hota hai; nav right par ho to panel ke `+`/tick controls **left** ho jaate hain, nav left par ho to **right** (CSS: `[data-course-quad-deck][data-quad-nav-side="right"] [data-course-notes-add]` …). Isse wo button kabhi nav ke area mein nahin baithta.
* **Desktop par footer strip hata di** — 768 px se upar `CoursePeekDock` render hi nahin hota; uski jagah wahi navigation (icons + labels, apni row, saare current button kaam karte hain) header / left rail / right rail / bottom strip mein lagta hai. Uske page-visibility rules (edit mode, Brain deck, live experiment, PDF reader, Music player, search pages) waise hi rehte hain — sirf size aur position badalti hai.

---

## 2 · Naye/modified files

**Naye**
* `src/course/quadLayout.ts` — pure model: char block, formats, band (20–80 / 15–85), band block ka `+` reading, persistence, `useQuadDeckEnabled()` (768 px).
* `src/course/QuadDeck.tsx` — deck, dono divider (half segments + centre dots), ek cluster, zoom layer, no-cross door, borrowed block (player + tab body, dono mounted).
* `src/course/course-quad-deck.css` — deck/dividers/cluster/glyph geometry, “−6px” rules, nav-space rules.
* `src/course/CourseHeaderNav.tsx` — placeable navigation (icons + labels) + placement button & dropdown.
* `src/course/course-header-nav.css` — chaar placement + chaar dropdown-side rules.
* `src/utils/footerNavigationPlacement.ts` — placement store (`header` default), menu-side rule, −6px size maths, device gate hook.
* `src/course/courseViewSettings.ts` — Course view: zoom + char divider switches (store + hooks).
* `tests/coursePlayerQuadDeckContract.test.mjs` (17 source-shape tests) · `tests/coursePlayerQuadDeckRuntime.test.mjs` (20 bundled jsdom tests).

**Modified**
* `src/CoursePlayerApp.tsx` — quad state + persistence, placement rails/slot/bottom strip, nav tab handler (notes→c12, mindmap→c22, modules→c21 reveal), mind map block “always open on a big stage”, `data-quad-nav-shrunk`.
* `src/course/CourseOverlay.tsx` — `quad?: CourseOverlayQuadConfig`, deck render, borrowed block + `persistentSurfaces` (Music/AI/Read ek hi definition, dono pane mein), footer strip deck mein nahin.
* `src/course/PlayerPanel.tsx` — Course view page (zoom + char switch, app ka apna `GlassPrefToggle`, koi native control nahin).
* `src/components/ui/glass-pref-toggle.tsx` — additive `dataAttrs` hook (test hooks ke liye).
* 3 contract tests repinned: `courseFooterWorkspacePillContract`, `coursePlayerDockMagneticNotesKeyboardContract`, `coursePlayerKeyboardFooterContract` (footer dock + studyBody ab deck ke saath do jagah likhe jaate hain, mount ek hi hota hai).

---

## 3 · Tab kaun kahan dikhta hai (naya behaviour, 768 px se upar)

| Nav button | Kya hota hai |
|---|---|
| **Notes · Mind map · Modules** | Teen tab ke apne **block** hain (c12 · c22 · c21). Button dabate ho → block band tha to **wapas khulta hai aur ek baar glow** karta hai (session signal `{ pane, count }`). |
| **Player** aur baaki sab (Read, Music, Brain, Experiment, Sketch, AI, Paid) | c11 (main area) **udhaar** de deta hai — aur player **mounted rehta hai**, chhupa ke. Isliye chal raha video apni jagah nahin khota, aur Music/AI/Read ke panels hamesha mounted rehte hain — gaana ya chat tab badalne se nahin rukta. |
| **Placement button** | Navigation ko header / left / right / bottom bhejta hai; dropdown us taraf khulta hai jahan jagah hai. |

---

## 4 · Verify kaise karein

```bash
./node_modules/.bin/tsc --noEmit                 # EXIT 0
node --test tests/coursePlayerQuadDeckRuntime.test.mjs   # 20/20
node --test tests/coursePlayerQuadDeckContract.test.mjs  # 17/17
node --test --test-concurrency=4 tests/*.test.mjs        # 4314 / 4120 pass / 0 fail / 194 skipped
npm run build:low-heap                                   # EXIT 0, 48.59 s
```

Browser checks (768 px se upar): char blocks dikhne chahiye; dono divider drag karke ratio badle; divider ke segment ke **beech wale dot** par click se cluster khule; bahar click se band; `c22` button dabao → Mind map block gayab, button `c22+`; wapas dabao → block wapas; `2 upar · 1 niche` dabao → c11+c21 upar, c12 niche; `pair` dabao → left player, right Resource Library + uske niche navigation; gear → Settings → **Course view** → zoom badlo (har format mein wahi zoom) aur koi bhi divider switch off karo (line ghati, drag chalta rahega). Screen ko 760 px par laao → sab kuch purana mobile player.

---

## 5 · Honest limits (jo maine deliberately nahin kiya)

1. **“4 divider visibility checkboxes”** ko maine cross ke **chaar half-segments** ki tarah lagaya (do divider × do half) — shape hi `+` hai, isliye chaar *divider* nahin ho sakte; chaaron ON = purana chaar-divider look, aur Course view page yahi kehta hai.
2. **Nav placement ke button par nav chalta hai**: nav agar edit-mode wagairah se chhupa ho to us waqt placement button bhi chhupa rehta hai (nav ke saath hi). Us haalat se bahar aate hi wapas aa jata hai.
3. **Nav-space rule** panel ke *floating* `+`/tick controls ko nav se door rakhta hai (CSS); panels ke apne full-page trays (jo deck ko hi dhaanp lete hain) us rule se bahar hain.
4. 16:9 wale chhote laptop par teen block row (1-upar/3-neeche) mein Resource Library/Notes/Mind map ki width kam lag sakti hai — ye layout aapne maanga tha, isliye block content apne andar scroll karta hai; `2 upar · 1 niche` “sabse zaruri” wala comfortable hai.
