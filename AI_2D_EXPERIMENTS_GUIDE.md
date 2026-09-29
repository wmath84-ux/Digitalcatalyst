# AI se 2D experiment banwao → Course Player me chalाओ

**Ek line me:** Course me ek naya file type add hua hai —
**`interactive` = "Interactive 2D experiment"**. Iski file **ek single HTML file**
hoti hai (HTML + CSS + JS sab usi ek file me). Aap AI (ChatGPT / Claude / Gemini)
se wo file banwaate ho, paste/upload karte ho, aur wo **My Study Library ke course
ke andar, Course Player me seedha chal jaati hai** — bina hosting, bina internet,
bina kisi developer ke.

> **Kya main koi "special" file type bana sakta hoon jo AI se banwaakar directly
> integrate ho jaye?** Haan — aur wahi sabse practical rasta hai: **ek self-contained
> `.html` file**. AI ise har baar 30 second me bana deta hai, aur player ise sandboxed
> iframe me chalata hai. JSON/scene format ya custom player SDK ki zarurat nahi.

---

## 1. Kaam kaise karta hai (learner ka flow)

```
My Study Library  →  "+" (naya course / edit)
      →  module ke andar  →  Add resource  →  "Interactive 2D experiment"
      →  Step 1: prompt copy karo → AI me paste karo → single HTML file milegi
      →  Step 2: us file ka code paste karo, ya .html upload karo, ya starter template chuno
      →  Step 3: live preview (bilkul wahi stage jo player me chalega)
      →  Save & play  →  Course Player  →  Modules tab  →  tap  →  experiment stage pe
```

Course Player me experiment **poora stage leta hai** (Split Deck ka content hissa),
apna Restart/Pause HUD rakhta hai, progress bar deta hai, aur khatam hone par
**lesson apne aap complete** mark kar deta hai (agar experiment `complete()` call kare).

---

## 2. File format — AI ko ye rules dene padte hain (aur kyun)

Builder ka **"Copy prompt for AI"** button ye sab pehle se likh kar deta hai:

| Rule | Kyun |
| --- | --- |
| **Ek complete HTML file** (`<!doctype html>` … `</html>`), no separate .css/.js | Yahi format player me jata hai; hosting ki zarurat nahi |
| **`<canvas>` (2D) + `requestAnimationFrame`**, koi library nahi (no p5.js/three.js CDN) | 200 KB ki limit, aur **offline** (APK me bhi) chalna chahiye |
| **Do ya zyada controls** (slider/button) + **Reset** | Interactive hone se hi concept clear hota hai |
| **Formula, units, labels screen par** | Experiment khud padhata hai |
| **Phone-friendly**: `viewport` meta, canvas window se fit, **pointer events** + `touch-action:none` | Class 6–12 learners phone/tablet par padhte hain; hover-only controls kaam nahi karte |
| **No `localStorage` / cookie / `alert()` / `fetch` / external URL** | Sandboxed frame me ye sab block milte hain — warna page "khaali" ya dead dikhta hai |
| **`window.parent` ko touch nahi karna** | Isolation: experiment app ke DOM/data ko nahi chhoo sakta |
| **< 150 KB source** | Course document me store hota hai (Firestore 1 MB limit) |

**Ek optional (par bahut kaam ka) bridge** — AI ko bolo rakhe:

```js
window.dcExperiment.progress(0.4);   // 0…1 → player ka progress
window.dcExperiment.complete();      // lesson complete mark karo
document.addEventListener("dc:pause", () => { /* loop roko */ });
document.addEventListener("dc:play",  () => { /* loop chalao */ });
document.documentElement.dataset.dcTheme; // "dark" | "light"
```

Ye na bhi ho to chalega — bas player ko "ready" aur "complete" ka pata nahi chalega
(shell khud ready/error report kar deta hai).

---

## 3. Ready-made starter templates (zero AI)

Builder me 4 templates ek tap par hain — inhe seedha use karo ya AI ko example dikhao:

| Template | Subject | Kya sikhata hai |
| --- | --- | --- |
| **Projectile motion** | Physics | angle/speed/gravity sliders, trajectory, velocity vectors, range/height/time |
| **Simple pendulum** | Physics | bob drag karo, T = 2π√(L/g), mass ka koi asar nahi |
| **Wave superposition** | Physics/Maths | do waves + unka sum, constructive/destructive interference |
| **Sorting algorithms** | CS | bubble/selection/insertion/merge race + comparison/swap counters |

Source: `src/personal-library/experiments/*.html` (dono jagah — builder preview aur
player — **wahi bytes** use hote hain, isliye "preview me chala par player me nahi"
aisa bug nahi ho sakta).

---

## 4. Kuch tootey to kya karo (troubleshooting)

| Symptom | Sach | Fix (AI ko wahi line bhejo) |
| --- | --- | --- |
| Blank/white box | External `<script src>` block/offline | "Rewrite with no external files — plain JavaScript only" |
| "It uses browser storage" warning | Sandbox me `localStorage` throw karta hai | "Keep state in variables instead of localStorage" |
| Alert/confirm dikhta hi nahi | Dialog block | "Show that message on the canvas" |
| Text bohat chhota / scroll aa jata hai | Fixed pixel layout | "Fill the viewport, be responsive from 320px, use devicePixelRatio" |
| 200 KB se bada | Embeded libraries/duplicate code | "Minify: remove comments, shorten names, drop libraries, same behaviour" — ya file host karke uska https link lagao |
| Touch par drag nahi hota | Mouse-only handlers | "Use pointer events and `touch-action:none`" |

Player **kabhi** silent fail nahi karta: experiment crash ho to neeche amber strip me
error + **Restart** dikhta hai, aur builder me har warning ka saaf reason likha hota hai.

---

## 5. Integration (code me kahan kya laga)

### Type (additive — official catalogue chhua nahi gaya)

```ts
// src/types/course.ts
"youtube" | … | "brain"            // CourseFileType — 13 official, unchanged
export const EXPERIMENT_FILE_TYPE = "interactive" as const;
export type CourseContentFileType = CourseFileType | CourseInteractiveFileType;
```

Isliye admin editor, AI reader registry (`utils/aiFileReaders.js`), lumen ke
`ResourceType` aur personal-course registry **waisi ki waisi** hain (registry tests
green). AI chat abhi is file ko `embed` samajhta hai (metadata-only) — reader entry
ek follow-up hai.

### Storage — file course document ke andar hi rehti hai

| Cheez | Value |
| --- | --- |
| Field | `MyCourseResource.interactiveHtml` → `CourseFile.interactiveHtml` |
| Per-experiment cap | **200 KB** (`MY_EXPERIMENT_MAX_BYTES` / `EXPERIMENT_MAX_BYTES`) |
| Per-course cap | **640 KB** (`MY_COURSE_MAX_EXPERIMENT_BYTES`) |
| Kaun enforce karta hai | Client (`src/lib/myCourseClient.ts` → `myCourseExperimentBudgetError`, Save se pehle throw) **aur** server (`utils/myCourseDoc.js` → codes `EXPERIMENT_TOO_LARGE` / `EXPERIMENTS_TOO_LARGE`) |
| Bada experiment | `.html` ko host karo, uska **https link** resource ke Link field me daalo — player hosted page ko bhi sandbox me chalata hai |

Kuch aur chahiye nahi: na Firebase Storage, na Cloudinary, na `firestore.rules`
change (rules owner-scoped hain aur type allowlist nahi rakhte). Offline queue
(Firestore cache) me experiment bhi save ho jata hai, isliye APK offline bhi chalega.

### Player

- `src/course/ExperimentStage.tsx` — sandboxed iframe stage + shell injection +
  message bridge + Restart/Pause HUD + progress bar + error strip.
  **`sandbox` me `allow-same-origin` jaan-boojh kar nahi hai** (inline `srcDoc` frame
  ko opaque origin milta hai — warna pasted HTML app ka DOM/Firebase session padh leta).
- `src/course/ResourceViewer.tsx` — `interactive` ke liye **apni branch** (embed nahi):
  download = apni `.html` (blob), "Open in a new tab" = wrapped document (blob),
  fullscreen = normal player fullscreen.
- `src/CoursePlayerApp.tsx` — `experimentFiles` + `playableFiles`: experiment
  first-lesson/deep-link selection, **resume**, aur **progress denominator** me
  count hota hai; khatam hone par `completeFromExperiment` sirf complete karta hai
  (kabhi un-complete nahi).
- `src/course/CourseOverlay.tsx` — Modules tab me row (FlaskConical icon,
  "Interactive 2D experiment" subtitle) — bina URL bhi visible.
- `src/utils/experimentSpec.ts` — pure spec: sandbox tokens, size checks,
  `buildExperimentDocument()` (shell + bridge), `experimentIssues()`, AI prompt builder.

### Builder (My Study Library)

- `src/personal-library/MyCourseEditorPage.tsx` — `TYPE_OPTIONS` me naya type.
- `src/personal-library/MyCourseExperimentEditor.tsx` — 3-step panel: AI prompt
  (topic/level/language/details + copy), source (paste / `.html` upload **as text** /
  4 templates), live preview + warnings.
- `src/personal-library/experimentTemplates.ts` — 4 templates, `?raw` imports.

### Builder (Admin — official products)

- `src/components/admin/products/ModulesResourcesEditor.tsx` — `RESOURCE_TYPES` me
  `interactive` ("Interactive 2D experiment"), Study Library jaisa hi card: optional
  hosted-link field + builder panel + ready/warn pill + amber draft state.
- `src/components/admin/products/ExperimentEditor.tsx` — wahi 3-step flow
  (AI prompt → paste/upload/4 templates → **wahi** `ExperimentStage` preview →
  checks), sirf admin ki light theme me. Templates, prompt aur checks dono
  builders me **same modules** se aate hain, isliye design kabhi diverge nahi hota.
- `src/components/admin/products/ProductEditor.tsx` — publish checklist
  (source required, over-size block) + **har save** (draft bhi) par budget gate.
- `utils/productMapping.js` — `interactive` har mapper se guzarta hai
  (`editor → canonical → legacy CourseFile`, `editor → Firestore → editor`);
  URL-less inline source usable hai, khaali resource drop hota hai (Brain jaisa rule).
- Budget: per-experiment **200 KB** (same), per-product **320 KB single-count**
  (`PRODUCT_EXPERIMENT_MAX_BYTES`) — kyunki official document tree ko **do baar**
  store karta hai (`courseContent` + `adminProduct`), stored ≈ 640 KB, learner
  budget ke barabar.

---

## 6. Limits / jo abhi nahi hua

1. ~~**Official (admin) courses** me ye type abhi nahi hai~~ — **ho gaya:**
   admin product editor (`Modules & Resources` tab) me "Interactive 2D experiment"
   type hai, Study Library wale builder ke saath. Product ke saath module ke andar
   resource ki tarah add hota hai aur Course Player me waisa hi chalta hai.
2. **AI chat** is file ko `embed` ki tarah dekhta hai (`asResourceType` demotion) —
   experiment ki HTML ko AI context me dena next step ho sakta hai.
3. **Blob "new tab"** kuch purane Android WebViews me kaam nahi karta — Restart +
   fullscreen player me hamesha available hain.
4. Experiment ka source **ek hi course document** ke andar rehta hai (isi wajah se
   offline APK me bhi chalta hai) — lekin 640 KB ka poora budget usi document me
   kharch hota hai. Bahut se bade experiments ke liye hosted link behtar hai.

---

## 7. Verification

```bash
npx tsc --noEmit -p tsconfig.json        # naye errors: 0
npx vite build                           # green
node --test tests/*.test.mjs             # baseline ke exactly wahi 76 purane failures, 0 naye
node --test tests/coursePlayerInteractiveExperimentsContract.test.mjs
node --test tests/adminInteractiveExperimentsContract.test.mjs
```

Naya contract suite (`tests/coursePlayerInteractiveExperimentsContract.test.mjs`,
15 tests) pin karta hai: additive type, sandbox tokens (inline me `allow-same-origin`
**nahi**), bridge + shell injection, builder checks + prompt rules, dual-writer caps,
player wiring (visibility/resume/denominator/completion), aur **jsdom runtime** me
chaaron templates ka asli run (`ready` + `progress` messages, zero errors).

Admin suite (`tests/adminInteractiveExperimentsContract.test.mjs`) pin karta hai:
admin type + builder panel (prompt → paste/upload/templates → live preview →
checks), `utils/productMapping.js` ka end-to-end carry (`editor → Firestore →
editor`, `editor → canonical → legacy `CourseFile``), Brain ka untouched rehna,
aur official budget (200 KB / file, 320 KB / product single-count).
