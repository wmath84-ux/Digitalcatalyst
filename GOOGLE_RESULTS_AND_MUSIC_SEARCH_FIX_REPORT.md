# Google results page (poori fidelity) + Music library ka search box — report

**Date:** 2026-10-17
**Branch:** `arena/6bdb33d3-digitalcatalyst`

Owner ke teen request, teen hisso me:

1. **Google search result page "properly dekhna"** — Google jaisa, API ka
   pura data (image, text, sab kuch), bina kisi dikkat ke.
2. **Google page par wahi back behaviour** — header ka back button, search box,
   aur box par click karne par wapas search page.
3. **Sabse badi problem** — Music library ka search box, click karne par bhi
   YouTube search page khule (jaisa module library me khulta hai), aur search
   result page bhi khule. "Kisi bhi halat me."

---

## 1. Google ka API — ab poori tarah padha jaata hai

Pehle sirf 5 field lete the (title, link, displayLink, snippet, image). Ab
Google ke **poore response** ka hisaab lagta hai — uska apna reference:
<https://developers.google.com/custom-search/v1/reference/rest/v1/Search>

Naye file: `src/course/googleSearch.ts`

| Google ka field | Ab kya hota hai |
|-----------------|------------------|
| `searchInformation.formattedTotalResults` | "About 1,230,000 results" |
| `searchInformation.formattedSearchTime` | "(0.42 seconds)" |
| `queries.nextPage[].startIndex` | **Next ›** pager (Google 10/ page, max 100) |
| `htmlSnippet` | snippet, **matched words bold** (markup page me nahi jaata) |
| `pagemap.cse_image[]`, `pagemap.cse_thumbnail[]` | picture + thumbnail (dimensions ke saath) |
| `pagemap.metatags[]` (`og:site_name`, `og:image`, `twitter:image`) | site ka naam, social-card picture |
| `article:published_time`, `og:updated_time` | page ki date |
| `mime`, `fileFormat`, `fileSize` | PDF/XLS ka badge aur size |
| `pagemap.productimages[]` | product image |
| `image.thumbnailLink` (image search) | Images tab ki picture |
| `duar` | "Popular" ka mark |
| `spelling.correctedQuery` | Google ki spelling correction |
| `searchType=image` | **Images** tab |

Naye type: `GoogleResult` (16 fields), `GoogleSearchOutcome` (rows + count +
time + pager + corrected query).

Naye constants: `GOOGLE_PAGE_SIZE = 10`, `GOOGLE_MAX_START = 91`,
`googlePageOf(start)`.

`searchGoogleOutcome(query, signal, uid, { start, type })` — ab page aur
result-kind dono le sakta hai. Purana call (`(query, signal, uid)`) bilkul
same chalta hai.

**Safety:** snippet ka `<b>` markup React nodes me todha jaata hai — raw HTML
kabhi page me nahi jaata. `dangerouslySetInnerHTML` kahin use nahi hua.

---

## 2. Results page — Google jaisa dikhta hai

Naye file: `src/course/GoogleResults.tsx` + `src/course/googleResults.css`

**Web result (Google ki row):**

```
[■]  arXiv  ›  /pdf/1706.03762              [PDF]
      Attention is all you need
      A neural network reads the paper.  ← "neural" bold
      12 Jun 2017
                                        [picture]
```

- site ka mark (domain ka pehla akshar), site ka naam, URL ka path;
- title Google ke link blue me;
- snippet, matched words **bold**;
- file ka badge (PDF) + size + date;
- page ki picture right side, `<img loading="lazy">` (background image nahi —
  tab browser sach me picture load karta hai).

**Do tabs (Google jaisa):** `All` (web pages) aur `Images` (picture grid).

**Pager:** `‹ Previous · Page 2 · Next ›` — Google ke `nextPage.startIndex`
ke hisaab se, 10 results per page, 100 tak.

**Format button:** web tab par listing (rows ↔ cards), Images tab par
Google ka thumbnail-size switch (chhota ↔ bada).

---

## 3. Google page ka back — do step (YouTube page jaisa)

```
Results --(header back)--> Board (history + khaali box) --(back)--> Library ka search page
```

- `googleStage: "board" | "results"` — nayi state;
- header back: results ⇒ board, board ⇒ Google page band;
- **results par box par tap** ⇒ board (box ka `onFocus` ye karta hai);
- Enter dabate hi box ka caret chala jaata hai (blur), taaki baad me box par
  tap se wapas board par ja sake — bilkul Music/YouTube page jaisa;
- footer bhi wahi rule follow karta hai: board par chhupta hai, results par
  wapas aata hai.

---

## 4. Music library ka search box — "kisi bhi halat me"

Yehi sabse badi problem thi. Pehle YouTube search page **sirf** Music tab ke
page surface par khulta tha. Ab:

| Surface | Pehle | Ab |
|---------|-------|-----|
| Music tab ka page | ✅ khulta tha | ✅ khulta hai |
| Player ke upar wala **"Music library" panel** | ❌ inline search | ✅ YouTube search page |
| Video ke neeche wali library | ❌ inline search | ✅ YouTube search page |

`src/course/MusicPanel.tsx`:

- `searchPageActive` ab `searchPageOpen && !urlMode` (mode ki koi shart nahi);
- har surface ka box `onSearchIntent: openSearchPage` deta hai;
- **results page hamesha khulti hai**: pehle `submitSearch` filter "course"
  ya "device" par chup ho jaata tha (`filter !== "all" && filter !== "online"`
  par return) — ab search page par filter ko koi rok nahi deta, aur box par
  Enter ka button bhi hamesha rehta hai (`canSearchOnline` me `searchPageOpen`
  jud gaya);
- search chalne par filter "online" ho jaata hai (app ka apna rule: "a search
  is an online act"), taaki results library me bhi dikhein.

---

## 5. Tests

| File | Kya badla |
|------|-----------|
| `tests/coursePlayerGoogleSearch.test.mjs` | 8 → **10**: poori API parsing, count/time, pager, `searchType=image`, start limit |
| `tests/courseResourceLibrarySearchRuntime.test.mjs` | 10 → **12**: Google ka do-step back, box-tap back, poora row (image/badge/bold/count), Images tab + pager |
| `tests/coursePlayerMusicPaneRuntime.test.mjs` | 16 → **17**: music library ka box — page, panel aur video — teenon par search page + results page |
| `tests/coursePlayerMusicTabContract.test.mjs` | contract: `searchPageActive` aur `canSearchOnline` ke naye rules |

Poora suite: `node --test tests/*.test.mjs` → **4412 tests, 0 fail**.

---

## 6. Docs

- `docs/course-player-search-configuration.md` — naye sections:
  5.1 (Google ka field → screen), 5.2 (do-step back), 5.3 (Music library ka
  search box).
- Yeh file: `GOOGLE_RESULTS_AND_MUSIC_SEARCH_FIX_REPORT.md`.
