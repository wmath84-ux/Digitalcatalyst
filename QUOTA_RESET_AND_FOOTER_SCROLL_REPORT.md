# Daily quota reset + footer scroll rule + pull request

_Owner ke teeno instructions, 2026-10-17. Branch: `arena/6bdb33d3-digitalcatalyst`._

---

## 1. "Usage limit rule" — daily quota khatam hone par, aur quota reset hone par

**Kya tha:** Learner ki apni key (YouTube Data API / Google Custom Search) ki
**daily quota** khatam hoti hai to master ki configuration apne aap chalu ho
jaati thi — search toot'ta nahi tha, par master ki key **har search** par
jal rahi thi, aur koi record nahi tha ki "learner ka quota khatam hua hai".

**Kya fix hua:** Ab quota khatam hona ek **switch nahi, ek pause** hai.

| Step | Behaviour |
|------|-----------|
| 1 | Apni key chalti hai (default). |
| 2 | Quota khatam → master ki configuration apne aap chalu, wahi query dobara, results aa jaate hain, learner ko sirf ek halki line. |
| 3 | **Pause yaad raha** — ab master lead karta hai, apni key se dobara poochha nahi jaata (wasted call nahi). |
| 4 | **Google ka daily reset aate hi apni configuration APNE AAP wapas** — kuch press nahi, koi setting nahi. Agla search seedha apni key se. |
| 5 | Nayi key paste karte hi purana "quota khatam" record mit jaata hai (nayi key ka budget toh fresh hota hai). |

**Reset kab?** Google ka free daily budget **Pacific time (America/Los_Angeles)
ki raat 12 baje** reset hota hai — wahi hisaab rakha gaya hai
(`dailyQuotaResetAt()`).

**Files**
- `src/course/searchQuotaHandover.ts` — **NEW**: quota pause ka memory
  (per account → per device), Pacific midnight ka hisaab, aur
  `markOwnQuotaExhausted` / `ownQuotaExhausted` / `clearOwnQuotaExhausted`.
- `src/course/musicSearch.ts` — plan ab quota yaad rakhta hai; quota error
  par pause likha jaata hai; nayi key par pause mit jaata hai.
- `src/course/googleSearch.ts` — wahi, Google ke liye.
- `src/course/MusicPanel.tsx`, `src/course/CourseResourceLibrary.tsx` — line
  ab ye kehti hai: *"jaise hi aapki quota reset hogi, apni key wapas apne aap
  chal hogi"*.

---

## 2. "Course player ke andar kahin bhi scroll ho to footer navigation hide/show"

**Kya tha:** Footer navigation sirf do search-result pages par scroll par
chhupta tha. Baaki har page (Resource Library ki lambi list, Paid library,
notes, mind map ka panel…) par footer hamesha chipka rehta tha — aur lambi
list ke aakhri rows footer ke neeche chhup jaate the.

**Kya fix hua:** Ab **Course Player ke andar kahin bhi scroll ho**, footer
navigation apne aap behave karta hai:

- **scroll down** → footer piche hata jaata hai (slide hokar, 220 ms);
- **scroll up** → footer turant wapas aa jaata hai;
- **top par wapas** → footer wahan hai;
- footer **unmount nahi hota** — sirf slide hota hai, isliye peeche kuch
  nahi hilta (jump nahi hota).

**Ek jagah se, har scroller:** Scroll event bubble nahi karta, par capture
phase me window se target tak jaata hai. Isliye **ek** capture-phase listener
(window par) poore player ka har scroll dekh leta hai — koi panel, koi
surface, koi nested scroller — aur har scroller apni position yaad rakhta
hai, taaki do alag lists ek dusre ko confuse na karein.

**Files**
- `src/course/footerScrollAway.ts` — **NEW**: pure rule
  (`nextFooterScrollAway`) + hook (`useCourseFooterScrollAway`).
- `src/course/coursePanelSession.ts` — naya session field
  `footerScrolledAway` + `setFooterScrolledAway` + `useFooterScrolledAway`.
- `src/course/CoursePeekDock.tsx` — strip state ko publish karta hai
  (`data-course-strip-scrolled="away" | "home"`).
- `src/course/course-strip-nav.css` — slide-away ka transition (reduced
  motion respected).
- `src/CoursePlayerApp.tsx` — watcher mounted; tab change par footer wapas
  apni jagah.
- `src/utils/footerNavigationVisibility.ts` — Settings ki instruction line
  ab ye rule bhi batati hai.

**Note:** Settings → Footer navigation → **"Visible footer navigation always"**
is rule par bhi chalti hai — "always" chune to footer scroll par bhi nahi
hatega (waise hi, wo har page rule par chalti thi).

---

## 3. Pull request

- Branch: `arena/6bdb33d3-digitalcatalyst`
- PR: **`fix(search+player): daily quota reset par apni configuration wapas + footer navigation ka scroll rule`**

---

## Verification

| Check | Result |
|-------|--------|
| `node --test tests/*.test.mjs` | **4435 tests · 4241 pass · 0 fail** (194 skipped — browser tests, Playwright browsers installed nahi) |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | clean (EXIT 0) |
| `npm run build:low-heap` | EXIT 0 |

**Naye tests**
- `tests/coursePlayerQuotaResetHandover.test.mjs` (6) — reset ka hisaab, pause
  ka yaad rakhna, dono engines me poori curve, nayi key par pause mitna.
- `tests/coursePlayerFooterScrollAway.test.mjs` (3) — pure rule, real hook +
  real session (jsdom me real scroll), real strip ka publish.
- `tests/courseStripNavigationRuntime.test.mjs` — +1 case: real strip
  scroll-away, aur "always" ka override.

**Update kiye gaye tests**
- `tests/courseStripNavigationRuntime.test.mjs` — naye session hook ka stub.

---

## Hinglish me, ek line me

- **Quota:** "Aapki daily quota khatam hui → master ki key apne aap chalu; jaise
  hi Google ka daily reset aaya → aapki key apne aap wapas. Kuch karne ki
  zaroorat nahi."
- **Footer:** "Course player me jahan bhi scroll karo, neeche ka footer scroll
  down par khud chhup jayega aur scroll up par wapas aa jayega."
