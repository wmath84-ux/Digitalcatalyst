# Split divider — **safed patti khatam**, **gap + chhota icon**, aur **teen screen side by side**

**Owner brief:** 2026-10-16 (aapke us ek message ke teen sawaal)
**Commits:** `8d0e31c` (ask 1 + 2) · `1bbad28` (ask 3) · `e900e1b` (patali white strip wapas) — isi branch par
**Verification:** `./node_modules/.bin/tsc --noEmit` **EXIT 0** · full sweep **4353 tests / 4159 pass / 0 fail / 194 skipped** EXIT 0 (`/tmp/sweep22.log`) · `npm run build:low-heap` **EXIT 0** 48.32 s (`/tmp/build-strip.log`)

---

## 1 · Aapne kya kaha, aur wo kahan hai

| # | Aapki baat | Implement | Proof |
|---|---|---|---|
| 1 | "Divider ko **edge per le jaate hi ek thin white strip** dikhta hai — hata do" | Wo safed patti divider ki nahi thi — **chhipi hui pane ki 28px rail** par ek frosted glass **plate** thi. Plate poori tarah hata di; ab wahan sirf **saaf gap + patli accent line** rehti hai (koi background nahi, koi plate nahi) | runtime `coursePlayerSplitDividerDragRuntime` #12: edge tak drag karne par rail ka `style.background === ""` (koi plate nahi), aur page par bilkul ek icon |
| 2 | "Do window ko compress karke sata dene par **beech me chhota gap** ho aur **chhota icon theek centre** me; click par **seedha wapas apne pichhle area** me" | Jo divider apni clamp par chala jaata hai (compress ki hui haalat) uske liye: (a) gap **18px** chauda (aam 10px ki jagah), (b) ek **22px ka chhota icon** gap ke **theek centre** par — chevron us taraf jis taraf pane wapas khulta hai, (c) **poore strip par tap** = pane turant **pichhli size** par (jo collapse se pehle thi), default par nahi | mobile/desktop split: runtime #12 (icon ≤26px, centre par, press → pichhla % ±1.5) · multi-split (quad) `coursePlayerQuadDeckRuntime` #11 (62 → clamp 20 → icon → **62**) aur #12 (78 → clamp 85 → icon → **78**) · reversal pin `courseDividerEdgeIconContract` **3/3** (2026-10-14 ka "icon hatao" faisla jaan-boojhkar palat diya; purana breathing animation aur glyphs hataye hi rehte hain) |
| 3 | "**Teen screen side by side** … option button" (vertical columns) | Naya grid shape **"3 · side by side"** — teen **barabar** columns, poori height: **Player \| Notes \| Mind map** (`c11 \| c12 \| c22`), chautha block (c21) off. Shape cluster ke **Grid format** row me hai (baaki sab shapes ke saath). Teen block ek hi row me = **DO vertical dividers**, dono pakad kar ghumane layak, har ek ka apna dot + apna cluster | `coursePlayerQuadDeckRuntime` #13 (press par format `triple`, tracks exactly `33fr · 34fr · 33fr`, page par **2** dividers, dot dono par, c21 off) aur #14 (doosra divider ghumta hai, clamp par 92 par squeeze hota hai, apna icon, apna 85 par wapas, aur dono vertical **kabhi cross nahi** karte) · contract **18/18** |

### Faisle jo isme liye (bataiye to ek line me badal dunga)

* **Teen columns "barabar" hain** — shape me aate hi 33/34/33. Uske baad aap dono
  dividers se apni marzi se chauda/patla kar sakte ho (33/34/33 sirf pehla
  swagat hai, bandhan nahi). Purani saved shape me `col2` na ho to default
  67% aata hai aur wahi se aap set kar lete ho.
* **Dono vertical dividers ek doosre ko cross nahi kar sakte** — beech me hamesha
  **8%** ka gap rehta hai, is liye koi block itna patla nahi ho sakta ki dikhe hi
  na. (Aapki "compress karne par gap dikhna chahiye" wali baat ka hi seedha roop.)
* **Doosra vertical divider sirf us row par khinchi jaati hai jisme 3 block hain**
  (aapki nayi shape, aur "1 upar · 3 niche" wali purani shapes). 2×2 me wo
  wapas apne aap gayab ho jaati hai — page par kabhi faltu line nahi.
* **Divide ho rahi vertical line Course view ke vertical switches (vTop/vBottom)
  ke saath chalti hai** — unme se koi bhi "chalu" ho to dono vertical lines dikhti
  hain. Chahein to chautha switch bana dun, bataiye.
* **Chautha block cluster se wapas aata hai** aur wapas aane par deck apne
  **poore + shape** me chala jaata hai (chaaron block) — ye deck ka purana niyam
  hai har shape ke liye, is liye yahan bhi wahi hai.
* **Mobile par kuchh nahi badla** — system waise hi **768px** se shuru hota hai.
* **Work mode ko ye shape muft me mil gayi** kyunki Work apna plus deck Course
  Player ka hi `QuadDeck` use karta hai — parity apne aap.

---

## 2 · Nayi / badli hui files

* `src/course/quadLayout.ts` — shape `triple` (`rows: [["c11","c12","c22"]]`), `QUAD_FORMAT_ORDER` me 7 buttons, naya field **`col2`** (band **26–92**, default 67), `QUAD_TRIPLE_GAP = 8`, `clampQuadCol2()`, `quadTripleCols()` (do vertical ko order me rakhta hai), `quadRowColumns(count, col, col2)` (3-block row ab dono ratios se bat'ti hai), aur `quadSetFormat` ka 33/67 seeding. `loadQuadLayout` purani saved shape ko bina `col2` bhi load karta hai.
* `src/course/QuadDeck.tsx` — teesri line: `QuadAxisKey = "v" | "v2" | "h"`, `QuadSegment` me `"v2"`, `--quad-col2` live drag, `clampAxis()` (no-crossing), apna squeeze flag + `lastCol2Ref` + `[data-course-quad-restore="v2"]`, apna dot + cluster anchor, keyboard step; generalised `QuadDivider` (vertical/horizontal labels, ranges, icon direction) aur `data-quad-col2` / `data-quad-squeezed` ka updated reading.
* `src/course/course-quad-deck.css` — `.dc-quad-divider--v2` (position `var(--quad-col2)`, top/height row se) — **koi plate, koi strip nahi**, sirf 2px line jaise baaki lines.
* `tests/coursePlayerQuadDeckContract.test.mjs` (18) — "exactly two dividers, never four" → "exactly the dividers a shape needs, never four" (3 lines ankit, `secondVertical` guard ke saath), naye axis/drag/clamp pins, 7 shapes.
* `tests/coursePlayerQuadDeckRuntime.test.mjs` (24) — 2 naye runtime tests (shape #13, doosra divider #14) + counts 6 → 7.
* `tests/personalLibraryCoursePlayerParity.test.mjs` (5) — saved shape ka `col2` bhi round-trip hota hai, aur **`col2` ke bina** save ki gayi purani shape bhi load hoti hai.

---

## 3 · Verification (exact)

```
./node_modules/.bin/tsc --noEmit                    → EXIT 0
node --test tests/*.test.mjs                        → 4353 tests, 4159 pass, 0 fail, 194 skipped, EXIT 0
npm run build:low-heap                              → EXIT 0, built in 50.16s
```
Focused suites: `coursePlayerQuadDeckRuntime` **24/24** · `coursePlayerQuadDeckContract` **18/18** ·
`coursePlayerSplitDividerDragRuntime` **12/12** · `courseDividerEdgeIconContract` **3/3** ·
`coursePlayerSplitDividerContract` + `workModeQuadParity{Runtime,Contract}` + `courseDividerEdgeIconContract`
+ `coursePlayerSplitDividerDragRuntime` ek saath **32/32** · `personalLibraryCoursePlayerParity` **5/5**.
Dev preview (vite, port 5173) naya code serve kar raha hai — check kiya gaya.

## 4 · Honest limits

* Ye browser me khud dekh kar "aankhon se" verify nahi kar saka (sandbox me Chromium nahi) —
  sab kuchh DOM-level runtime tests se pin kiya gaya hai (dividers, tracks, gaps, taps).
* Ghaas-phoos: build ek baar `computing gzip size` par chup-chaap mar gaya (machine 3.9 GB),
  dobara chalane par wahi command EXIT 0 — code se koi lena-dena nahi, memory ka dabaav tha.

---

## 5 · Aur uske baad aapka doosra sandesh (2026-10-16) — patali white strip **wapas**

> "Jo patali white strip banti hai icon ke niche aur donon ke bich mein usko bhi add karo wapas, mobile users desktop sabhi jagah."

Pehla "white strip hatao" wala faisla yahaan **jaan-boojhkar palat diya gaya** — par is baar strip **patli** hai, wo mota 28px plate nahi.

| Aapki baat | Implement | Proof |
|---|---|---|
| "**Patali** white strip" | Ek hi shared number har jagah: **`PEEK_STRIP_PX = 6`** (`src/course/splitMotion.ts`). Strip **6px** hi hai — chahein to badal dun (ek number) | contract `courseDividerEdgeIconContract`: `export const PEEK_STRIP_PX = 6;` + strip ke dono axis ke style pins |
| "**Icon ke niche**" | Strip gap ki **poori lambai** chalti hai aur **chhota icon uske theek upar centre** me baithta hai — is liye wo icon ke **upar aur niche dono** dikhti hai. Strip icon ke **peeche** hai (z-index 1 vs icon ka 3), aur DOM me icon ke **baad** aata hai | runtime `coursePlayerSplitDividerDragRuntime` #12: strip `width 6px`, `top/bottom 0`, `left 50%`, glass + rim maujood, aur `compareDocumentPosition(icon)` = icon baad me |
| "**Donon ke bich mein**" | Strip **do blocks ke beech** rehti hai — gap ke axis par, jahan pehle divider baithta tha (rail ki 28px/18px strip ke theek centre me) | split #12 (row axis) · quad runtime #11 (vertical squeeze), #12 (horizontal squeeze), #14 (aapki 3-column wali **doosri vertical**) — har divider par **exactly 1** strip |
| "**Mobile users desktop sabhi jagah**" | Do hi surfaces hain aur dono cover ho gaye: (a) mobile + desktop split ka **collapsed rail** (`PeekRail` → `data-peek-strip`, dono axis), (b) tablet/desktop ka **plus deck** (`QuadDeck` → `data-course-quad-strip`, vertical + doosri vertical + horizontal) — aur **Work mode** bhi, kyunki wo wahi dono components use karta hai | `grep` se har marker: `studyPanels.tsx` (`data-peek-strip`) + `QuadDeck.tsx` (`data-course-quad-strip`) — koi doosra surface bacha hi nahi |
| Wo mota plate **wapas na aa jaye** | Rail **element** khud aaj bhi kuchh paint nahi karta (na background, na rim) — glass sirf us ek patle child par hai | split #12: rail ka `style.background === ""` (aur boxShadow/backdropFilter bhi) · quad contract: `.dc-quad-divider` rule me koi `background` nahi |

**Do cheezein aap ek line me badal sakte ho:** (a) strip ki motai (`PEEK_STRIP_PX`, abhi 6px); (b) strip parity/sirf-niche — abhi poori lambai chalti hai (aapke "donon ke bich mein" ke hisaab se). Bataiye, badal dunga.
