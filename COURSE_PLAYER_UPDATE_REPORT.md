# Course player — teen pending kaam (2026-10-13)

Aapne poocha tha: "course player ke andar jo bhi updates karni thi sab kiye ki nahin?" — us par teeno khule items ab **kar diye gaye hain**, aur teeno ke liye runtime tests bhi hain. PDF wale point me aapne jo bataya (local upload rahe + PDF **mozilla/pdf.js** se khule), wahi implement hua hai.

---

## 1 · PDF ab pdf.js se khulta hai (course lessons me bhi)

**Pehle:** course ka `pdf` lesson seedha `<iframe src="…pdf">` me jaata tha. Matlab jo dikhta tha wo browser par depend karta tha — desktop Chrome ka apna viewer (design alag, page-resume nahi) aur **APK ke WebView me kuch bhi nahi** (WebView me PDF viewer hi nahi hota).

**Ab:** har direct PDF lesson **bundled Mozilla PDF.js Generic Viewer** (pdfjs-dist `6.3.289`, wahi viewer jo Read tab pehle se use karta hai) me khulta hai — toolbar, thumbnails, search, zoom, save — sab pdf.js ke apne.

* `src/utils/courseEmbed.ts` → `isPdfJsEmbed()` / `pdfJsSourceUrl()`: tay karta hai kaun sa PDF pdf.js me jaayega, aur GitHub ka `blob`/`raw` link ko `raw.githubusercontent.com` me rewrite karta hai (wahi GitHub address jisse bytes padhi ja sakti hain).
* `src/course/ResourceViewer.tsx`: PDF ke liye pdf.js branch (stage par `data-course-pdf-stage="pdfjs"`), page number player ke apne resume store me save hota hai (wahi tarika jo video ka hai).
* **Google Drive** PDF purane tarike se Drive ke apne `/preview` frame me hi rehta hai — uske byte URL par CORS header nahi hota, is liye pdf.js usse padh hi nahi sakta (`docs/read-resources.md` me detail). Ye jaan-boojh kar hai, galti nahi.
* Agar koi host cross-origin read hi refuse kare (CORS), to learner ko asli reason dikhta hai + **"Try the basic viewer"** button (browser ka apna in-frame viewer) — **chupke se** viewer badalna kabhi nahi hota.
* Read tab ka learner **local upload** ("Your annotations") pehle jaisa hi hai aur wahi pdf.js viewer me khulta hai — usme kuch nahi bigda.

Test: `tests/coursePlayerPdfJsViewer.test.mjs` (8/8) — eligibility table, Drive exclusion, GitHub rewrite, player wiring, fallback button.

## 2 · Notes / Mind map: kholte hi fresh (bina live sync)

**Pehle:** Notes aur Mind Map library app khulte hi cloud se **ek baar** padhte the aur phir wahi device copy dikhate the. Isi liye "kabhi sync nahi hota / doosre device par nahi dikhta" wala feel hota tha — jab tak panel band karke dobara na kholo. (Aapne live sync hata ke saved/storage-based updates maange the, is liye listener **nahi** lagaya.)

**Ab:** wahi ek one-shot read do naye maukon par dohraayi jaati hai —

* app/tab wapas visible hone par (`visibilitychange`) ya internet wapas aane par (`online`) — sirf tab jab pichhla read **1 minute se purana** ho;
* Notes / Mind Map **dock tab dobara kholne** par (`CoursePlayerApp`).

Sabse zaroori hissa guard hai: agar is device par koi note/map **abhi upload pending** hai (ya delete pending), to read **bilkul nahi** hota — freshness kabhi aapke unsaved kaam se race nahi karegi. Rule alag pure module me hai: `src/course/cloudFreshness.ts`.

Runtime proof (asli hook + asli Firestore layer, jsdom + React me, in-memory Firebase):
`tests/courseNotesCloudSyncRuntime.test.mjs` 24/24 aur `tests/courseMindMapCloudSyncRuntime.test.mjs` 21/21 — inme naye cases: "doosre device ka note wapas aane par dikh gaya", "fresh read par extra query nahi", "tab kholne par library dobara padhi", aur "pending upload ke saath read nahi hui".

## 3 · Mind map drag lag (60+ nodes)

**Wajah (maine naapa tha):** 61 nodes par ~14 ms per frame, 151 nodes par ~216 ms — aur ye React ka kharcha tha, Firestore ka nahi. Teen cheezein mil rahi thi:

1. React Flow har pointer event par position change bhejta hai — ek frame me 2-3 baar, jabki dikhta sirf aakhri position hai.
2. Position badalne par React Flow node ko dobara render karta hai (wrapper transform lagata hai), is liye 60-node branch = 60 card re-render (jabki card ka markup position par depend hi nahi karta).
3. Plain tap bhi position change bhejta hai (same position) → free me poori branch re-render.

**Fix:**

* `src/course/mindMapDrag.ts` — ek frame = **ek hi batch** (`createFrameCoalescer` + `mergeNodeChanges`; per node sabse nayi absolute position jeetti hai, select/dimensions/remove jaise changes jaise the waise hi rehte hain).
* Jo batch kuch move hi na kare wo `setNodes` tak pahunchti hi nahi (`hasRealPositionChange`) — React bail out kar deta hai.
* `MindNode` aur `RopeEdge` ab `memo` hain, aur comparator **position props ko jaan-boojh kar ignore** karta hai (transform wrapper ka kaam hai, card ka nahi).
* Sirf wahi boxes naya object paate hain jinki position sach me badli.
* Drag stop par pending batch **pehle flush** hota hai (drop wahi position pe commit ho jo ungli ke neeche thi), aur map chhodne par batch **cancel** (ek map ka batch doosri map ke nodes ko hila nahi sakta).

Test: `tests/coursePlayerMindMapDragPerf.test.mjs` (8/8) + `tests/coursePlayerMindMapContract.test.mjs` ka live-drag contract (primary node aur poori branch ek hi update me chalti hai) abhi bhi green. Detail: `docs/course-player-mind-map-drag.md`.

---

## Verification (poore repo ke saath)

* `node --test tests/*.test.mjs` — **3928 tests, 60 failures**, aur wahi 60 failures baseline commit (`f08eb49`) par bhi the — naam-ba-naam compare kiya: **koi naya failure nahi**.
* `npx tsc --noEmit` (app) + `tsc --noEmit -p tsconfig.api.json` (api) — dono clean.
* `npm run build` (is sandbox me low-heap wrapper) — clean; `dist/pdfjs-viewer/6.3.289/pdfjs-viewer-element.js` bundle me maujood hai, is liye lesson PDF ke liye viewer runtime par mil jaayega.
* Naye/modified test files: `coursePlayerPdfJsViewer` (8), `coursePlayerMindMapDragPerf` (8), `courseNotesCloudSyncRuntime` (+3, total 24), `courseMindMapCloudSyncRuntime` (+4, total 21), aur ek purana pine (mind map live-drag) naye (behtar) implementation ke hisaab se update.

## Aage kya ho sakta hai (aap bolo to)

* Product Customization me **course lesson** ke liye bhi "Upload a PDF" button (abhi sirf Read resources me hai) — file Storage me jaayegi aur wahi pdf.js me khulegi.
* Google Drive PDF ko pdf.js me laana possible nahi (Google ke redirect par CORS nahi hota) — ye sirf tab badlega jab Google apni policy badle ya hum server-side proxy banaayein (uske apne kharche/limits hain).
