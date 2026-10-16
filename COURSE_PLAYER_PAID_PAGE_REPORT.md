# Course player ka Paid page — har cheez **ek hi baar**, lock **sahi jagah**, aur tap seedha **product page ke Paid section** par

**Owner brief:** 2026-10-16 · **Scope:** course player ka **Paid page** + product detail page ka **Paid section**
**Commit:** `c3d6f88` (isi branch par; neeche `git log -1`)
**Verification:** `./node_modules/.bin/tsc --noEmit` EXIT 0 · full sweep **4347 tests / 4153 pass / 0 fail / 194 skipped** EXIT 0 (`/tmp/sweep13.log`) · `npm run build:low-heap` EXIT 0 (42.39 s, `/tmp/build-paid2.log`)

---

## 1 · Aapne kya kaha, aur wo kahan hai

| # | Aapki baat | Implement | Proof |
|---|---|---|---|
| 1 | "Paid module **baar-baar** dikhaye ja rahe hain… **ek hi baar** dikhna chahiye" | Pehle do jagah se do rows banti thi: (a) har update ka apna folder, aur (b) usi update ke andar ka paid module **phir se** apna folder. Ab ek hi niyam hai — `src/course/paidListing.ts` → `buildPaidEntries()` — aur Paid page ke **dono** builder usi se aate hain (`PaidLibraryPanel` ke folders + flat `paidRows`) | runtime `paidListingRuntime` #1 (duplicate update id = 1 row; covered module = 0 row) aur #2 (ancestor rule: folder ke andar ka kuchh bahar nahi) · runtime DOM `coursePaidPageListingRuntime` #1 (page par sirf 2 folder: `update:upd-1`, `module:m-2`) |
| 2 | "Agar **folder** hai to keval folder per **ek baar**" | Folder ka **ek** lock uske naam se pehle (section head ka icon slot). Folder ke andar ke contents par **koi doosra lock nahi** — wo visible rehte hain, par select nahi hote | runtime `coursePaidPageListingRuntime` #2: har folder head par exactly **1** lock, contents par **0**, aur poore page par locks = folders + separate resources |
| 3 | "Alag-alag **resources** hai to sab per **individual lock**" | Jo locked resource kisi folder ke andar nahi hai wo **apni row** banata hai (kind `resource`) aur usi row par apna individual lock + apna price | runtime `coursePaidPageListingRuntime` #2 + #1 (`resource:f-3` apni row, apna lock) · model `paidListingRuntime` #3 (`lock: "folder"` vs `lock: "self"`) |
| 4 | "Click karne per **seedhe product detail page ke paid section** me chala jaye" | Paid page ki koi row ab checkout shuru nahi karti. `CoursePlayerApp.handleOpenPaid()` `#/product/<productId>?tab=Paid&paid=<rowKey>` likhta hai (rowKey = PDP ke apne keys `update:` / `module:` / `resource:`) | wiring `paidPageToProductPageWiring` #1 (`rememberPdpReturn` → `window.location.hash = buildPaidDeepLink(...)`, isi order me) · runtime DOM #3 (tap par `onOpenPaid("update:upd-1")`, aur kuch bhi khareeda nahi gaya) |
| 5 | "Wahi **paid module ya paid type** highlight ya **blink** ho jaye jaise use dikh jaye" | Product page `?tab=Paid&paid=…` padhta hai, Paid tab kholta hai, us **exact row** tak smooth scroll karta hai aur blink karta hai (`[data-pdp-paid-focus]` + keyframes `dc-pdp-paid-blink`; `prefers-reduced-motion` par blink ki jagah steady ring) | wiring #2 (marker, keyframes, reduced-motion, 6 s baad marker hat jaata hai, rows load hone tak retry) |
| 6 | "Aur **wahin se purchase** kar sake" | Product page ka apna Paid section hi purchase karta hai (wahi checkboxes + "Review selection" + checkout). Player se sirf **link** jaata hai, buy kabhi player me nahi hota | runtime DOM #3: `bought` bilkul khaali rehta hai · wiring #1: `onBuyModule` / `onBuyUpdate` pins abhi bhi hain (Modules library ka flow waisa hi) |
| 7 | (aapke shabdon me) course chhoot na jaye | Product page ka back control **"Course"** ho jaata hai aur usi course par wapas le jaata hai; Paid section ke upar ek line bhi: "Opened from your course… go back to the course" | wiring #3 · `src/course/paidListing.ts` + `src/utils/paidDeepLink.ts` (per-product, ek hi baar use hota hai) |

### Faisle jo isme liye (badalna ho to ek line ka kaam)

* **Paid page ab "dekhne + kharidne ka darwaza" hai, kharidne ki jagah nahi.** Aapke brief ke mutabiq har paid row product page par le jaati hai. **Modules library** ka apna locked-resource flow (jo pehle se checkout karta hai) **chhua nahi gaya** — wo alag surface hai.
* **Folder par pehla tap = folder khulta hai** (andar contents + "Unlock this …" row + price). Product page par **le jaane wala tap** wahi "Unlock this update / this module" row hai (aur separate resource ki poori row). Agar aap chahte ho ki folder ke **naam par hi** seedha product page khule, to `onToggle` ke saath `openPaid(entry)` jodna hai — bataiye, kar dunga.
* **Contents par doosra lock nahi** dikhaya (aapki baat: "keval folder per ek baar") — isliye folder ke andar ke naam saaf dikhte hain, bas disabled.
* **"Alag-alag resources"** ka matlab: jo locked resource kisi listed folder ke andar nahi hai (na update me, na kisi paid-module folder me) — sirf wahi apni row banate hain. Isse page par kuchh bhi do baar nahi aata.
* **Hidden module** ka kuchh bhi page par nahi aata (module aur uski files dono).
* **Owned update** apne modules samet page se hat jaata hai (kharidne ko kuchh bacha hi nahi).

---

## 2 · Nayi / badli hui files

**Nayi**
* `src/course/paidListing.ts` — **theek ek jagah** par Paid page ka poora niyam: kaun ek row banega, kahan lock baithega (`lock: "folder" | "self"`), price label (`₹1,299`), contents (dedupe), depth, aur uska `paidKey` (`update:` / `module:` / `resource:`) jo product page ka apna key hai.
* `src/utils/paidDeepLink.ts` — link banane/padhne ka ek hi source: `buildPaidDeepLink(productId, paidKey)`, `readPaidDeepLink(hash)`, aur "wapas course par" ka per-product memory (`rememberPdpReturn` / `readPdpReturn` / `takePdpReturn`).
* `tests/paidListingRuntime.test.mjs` (6) — asli model, node se seedha chalaya gaya.
* `tests/coursePaidPageListingRuntime.test.mjs` (4) — **asli DOM**: asli `PaidLibraryPanel` (asli `BranchedMenu`) jsdom me mount karke rows, locks aur taps gine jaate hain.
* `tests/paidPageToProductPageWiring.test.mjs` (4) — dono sire ka wiring + blink CSS + route resolution.

**Badli hui**
* `src/course/CourseOverlay.tsx` — `PaidLibraryPanel` ab `buildPaidEntries()` se banta hai (repeat khatam), folder par ek lock, contents bina lock, separate-resource row apne lock ke saath; naya prop **`onOpenPaid(paidKey)`**; flat `paidRows` bhi wahi model. Panel runtime suite ke liye export bhi kiya (behaviour bilkul wahi).
* `src/CoursePlayerApp.tsx` — naya `handleOpenPaid()` (course yaad rakho → link par jao) aur `onOpenPaid` overlay tak.
* `src/PdpApp.tsx` — `?tab=Paid&paid=<rowKey>` padhna (reviews wale effect ke bilkul saath), Paid tab auto-open, row tak scroll + blink (rows load hone tak retry, marker 6 s me hat jaata hai), back control "Course"/"Store", aur "Opened from your course" line.
* `src/pdp-minimal.css` — blink animation (`dc-pdp-paid-blink`), row par purple ring + left bar, aur `prefers-reduced-motion: reduce` par blink band.
* `tests/coursePaidLibraryDesignContract.test.mjs` (5) aur `tests/coursePlayerUx.test.mjs` (42) — purane pins **jaan-boojh kar** naye niyam par repinned (pehle wo "har resource par lock" pin karte the).

---

## 3 · 30 second me khud dekh lijiye

1. Course player kholiye → **Paid** tab.
2. Ek hi nazar me: har update/module **ek hi row**, folder ke naam se pehle **ek** lock, price usi row par, aur jo locked resource kisi folder me nahi wo **apni row + apna lock**.
3. Kisi folder ka **"Unlock this update / this module"** dabaiye (ya separate resource ki row) → aap seedha **product detail page** par pahunch jayenge, **Paid tab khula hoga**, wahi row **blink** kar rahi hogi.
4. Wahin se select karke **Review selection / checkout** — kharid wahi hoti hai. Wapas jaane ke liye upar **Course** (back control) ya "go back to the course".

---

## 4 · Verification

* `./node_modules/.bin/tsc --noEmit` → **EXIT 0**
* Focused: `paidListingRuntime` 6/6 · `coursePaidPageListingRuntime` 4/4 · `paidPageToProductPageWiring` 4/4 · `coursePaidLibraryDesignContract` 5/5 · `coursePlayerUx` 42/42 · quad/Work/Personal-Library suites 105/105 (0 fail)
* Full sweep: **4347 tests · 4153 pass · 0 fail · 194 skipped** (`/tmp/sweep13.log`, EXIT 0). *(194 skipped wahi purane Chromium-wale browser suites hain — is sandbox me Chromium nahi hai; unme kuchh badla nahi.)*
* `npm run build:low-heap` → **EXIT 0**, 42.39 s (`/tmp/build-paid2.log`)

---

## 5 · Jo maine jaan-boojh kar nahi badla (aur honest limits)

* **Modules library ka apna locked-resource flow** — pehle jaisa hi (wo surface aapke brief me nahi tha).
* **Product page ka purchase logic** (selection, quotes, checkout) — chhua nahi; sirf usi tak pahunchne ka rasta bana.
* **Personal Library ka course player** — usme Paid tab hi nahi hota (`MINE_HIDDEN_TABS = ["paid"]`), isliye wahan ye poora page dikhta hi nahi; baaki deck/nav/panels ka check apni jagah green hai (`personalLibraryCoursePlayerParity`, 5 tests).
* **Blink tuning**: 4 baar, ~1.15 s each, mark ~6 s baad hat jaata hai — zyada/log kam chahiye to `dc-pdp-paid-blink` ke numbers aur `6000` ms badal dena.
* Browser (Chromium) suites skip hain — is sandbox me browser nahi hai; in sab features ka proof **asli DOM (jsdom) + asli model** se diya gaya hai.
