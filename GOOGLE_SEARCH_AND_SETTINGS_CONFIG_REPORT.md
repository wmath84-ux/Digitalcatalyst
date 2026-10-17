# GOOGLE SEARCH IN THE COURSE PLAYER + SETTINGS-ONLY CONFIGURATION

**Owner ka sawaal (2026-10-17, dobara):**
> "Nahin configuration keval setting mein rakho. Course Player ke YouTube ke
> search box ke andar right ki taraf ek Google icon bhi add karo, jis par
> click karne par Google search page open ho. Google search page design karo
> vaise hi — history save honi chahiye, jaise search page par dikhti hai, board
> function sara hota hai, aur phir search page khulta hai, search result page.
> Aur yah Google search wala music library mein nahi add karna hai. Aur iska
> bhi configuration main bhi kar dunga, aur user ke liye course player ki
> setting mein option add karo configuration ke liye, aur mujhe bata dena kaise
> kya configuration karni hai. Aur ek zaroori cheez fix karna hai: YouTube
> search result page se header mein jo back ka button hota hai, us par click
> karne par — search result page par jo search box hai, us par click karne par
> pehle search page par back kare, aur wahan se jab user kare, tab library page
> par back kare."

**Jo hua — teen kaam:**

1. **Configuration sirf Settings mein** (Course Player se key UI hata diya).
2. **Google icon, search box ke andar** → apna **Google search page** (history
   board + results), sirf **Resource Library** me — music library me nahi.
3. **Do-step ka back** — results → search page → library page.

---

## 1. Configuration sirf Settings mein

| | Pehle (is round se pehle) | Ab |
|---|---|---|
| Course Player → Music tab | 🔑 button + key card | ❌ kuch nahi |
| Course Player → Resource Library | 🔑 button + key card | ❌ kuch nahi |
| **Settings → YouTube search** | ✅ | ✅ |
| **Settings → Google search** | ❌ | ✅ **naya** |

Course Player me jo bhi search **fail** hota hai, ab sirf ** wajah** batata hai
aur Settings ka pointer deta hai — configuration wahan se.

```
YouTube search fail hua → "Is key ki daily quota khatam ho gayi hai…
                            Settings → YouTube search me apni key badal do."
```

---

## 2. Google search — naya

### 2.1 Search box ke ANDAR, right side

Resource Library ke search page ka box (jisme Enter andar hai) ab ek
**Google mark** rakhta hai — chaar rang wala G, box ke andar, right side.
Ek tap → apna Google page.

```
┌──────────────────────────────────────────────┐
│ 🔍  [ search yahan likho…            ]  [G] [↵] │
└──────────────────────────────────────────────┘
```

### 2.2 Google page — same design, apni history

Music library ke YouTube search page jaisa hi:

- apna strip: **back arrow · box · format button**;
- pehle **recent searches ka board** (poora list, YouTube shape);
- phir **results** (Enter dabane par, ek second ka flash scan);
- history **apni alag list** me: `dc.searchHistory.v1.course-library-google`
  (course library ki history alag rehti hai — dono mix nahi hoti);
- result ek web page hai → naye tab me khulta hai (YouTube hit apni jagah
  play hota hai, web page nahi).

**Music library me Google nahi hai** — jaisa aapne kaha. Music tab apna
YouTube-wala search rakhta hai.

### 2.3 Configuration ke liye do values

Google search ko ek key nahi, **do** chahiye:

| Value | Kahan se |
|-------|----------|
| **API key** | Google Cloud → Credentials (Custom Search API wali) |
| **Search Engine ID (cx)** | Programmable Search Engine → engine ki id |

---

## 3. Do-step ka back (the fix)

Pehle: results page → back → seedha library (ek step).

Ab: **results → board → library** (do step).

| Jahan | Back dabane par |
|-------|-----------------|
| Results page | **Search page (board)** — history wapas, results hat jaate hain |
| Board (search page) | **Library page** |

Aur: **results page par search box par click karne par bhi wahi** — board par
wapas. (Woh "search phir se karna hai" ka request hai, purane results dekhte
rahne ka nahi.)

```tsx
const stepBackFromSearch = useCallback(() => {
  if (searchPageStage === "results") { setSearchPageStage("board"); return; }
  setSearchPageOpen(false);
}, [searchPageStage]);
```

Footer navigation ka rule bhi step ke saath chalta hai: board par footer
chhupta hai, results par wapas aata hai.

---

## 4. Configuration kaise karni hai (owner ke liye)

### A. YouTube (ek value)

1. [Google Cloud Console](https://console.cloud.google.com/) → project.
2. [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) → **Enable**. *(Billing ki zaroorat nahi.)*
3. [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → API key**.
4. Restrict: **API** → sirf *YouTube Data API v3*; **Application** → *Websites* → `https://eduvora.shop/*`.
5. App me: **Settings → YouTube search** → paste → **Test karo** → **Save karo**.

### B. Google (do values)

1. [Custom Search API](https://console.cloud.google.com/apis/library/customsearch.googleapis.com) → **Enable**. *(Billing ki zaroorat nahi.)*
2. [Programmable Search Engine](https://programmablesearchengine.google.com/) → **Search the entire web** → **Add to the list** → **Search Engine ID** copy (ye `cx` hai).
3. [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → API key** → copy. Restrict: **API** → *Custom Search API*; **Application** → *Websites* → app ka origin.
4. App me: **Settings → Google search** → key + cx → **Test karo** → **Save karo**.

### C. Owner ke fallback (optional)

`.env` me:

```
VITE_YOUTUBE_API_KEY=          # khali chhodne par school ka bill zero
VITE_GOOGLE_SEARCH_API_KEY=    # khali chhodne par school ka bill zero
VITE_GOOGLE_SEARCH_CX=
```

Ye dono **fallback** hain — user ki apni configuration pehle chalti hai.
Khali chhodne par har user apni configuration use karta hai aur **owner ka
account kabhi charge nahi hota**.

---

## 5. Files

| File | Badlav |
|------|--------|
| `src/course/googleSearch.ts` | **naya** — configuration ka order, search, error diagnosis, test |
| `src/course/GoogleSearchCard.tsx` | **naya** — Settings ka Google card (key + cx, test/save/hatao, 3 steps) |
| `src/course/GoogleGlyph.tsx` | **naya** — Google ka chaar-rang "G" |
| `src/course/CourseResourceLibrary.tsx` | search box me Google icon, Google page, key UI hata |
| `src/course/MusicPanel.tsx` | key UI hata, do-step ka back, board |
| `src/course/musicSearch.ts` | (pehle wala round — `ownYouTubeKeySlot` bhi) |
| `src/course/YouTubeKeyCard.tsx` | Settings ka YouTube card |
| `src/settings/SettingsPage.tsx` | **Google search** section naya |
| `vite.config.ts`, `index.html` | `VITE_GOOGLE_SEARCH_API_KEY` / `VITE_GOOGLE_SEARCH_CX` |
| `src/course/courseResourceLibrary.css` | Google mark + snippet ki style |
| `.env.example` | dono nayi values, saaf instructions |
| `docs/course-player-search-configuration.md` | **naya** — poora guide |

---

## 6. Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| `npm run build:low-heap` | ✅ built |
| Poora suite (`node --test tests/*.test.mjs`) | ✅ **4407 tests, 0 fail** |
| `tests/coursePlayerGoogleSearch.test.mjs` (naya, 8) | ✅ |
| `tests/courseResourceLibrarySearchRuntime.test.mjs` (10) | ✅ |
| `tests/coursePlayerMusicPaneRuntime.test.mjs` (16) | ✅ |
| `tests/coursePlayerMusicTabContract.test.mjs` | ✅ |
| `tests/footerNavigationVisibilityContract.test.mjs` | ✅ |

### Test contract me jaan-boojh kar badlav

| Test | Pehle | Ab | Kyun |
|------|-------|-----|------|
| `courseResourceLibrarySearchRuntime` | strip = `back · box · format · key` | `back · box · format` + Google mark box ke andar | key button hata, Google mark aaya |
| `coursePlayerMusicTabContract` | `onSearchIntent: () => setSearchPageOpen(true)` | `onSearchIntent: openSearchPage` | board par wapas |
| `footerNavigationVisibilityContract` | `(searchPageOpen && !searched)` | `(searchPageOpen && !searchPageOnResults)` | footer rule step ke saath |
| `coursePlayerMusicPaneRuntime` | "learner brings their own key" (pane me) | "key SETTINGS me hai, pane sirf wajah batata hai" + do-step back | nayi rule |
