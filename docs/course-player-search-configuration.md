# Course Player search — apni configuration (Settings)

> Course Player ke search box ke teen jawab hain: **ye course**, **YouTube**,
> aur **poora web (Google)**. Dono online jawab apni key / configuration par
> chalte hain, aur dono **Settings** me configure hoti hain — Course Player
> me koi configuration UI nahi hai.

---

## 1. Kahan kya hai (ek nazar me)

| Kya | Kahan | Kaise chalega |
|-----|-------|----------------|
| YouTube search | Course Player → **Music tab** + **Resource Library** | Settings → **YouTube search** me key |
| Google (web) search | Course Player → **Resource Library** ke search box me **Google icon** | Settings → **Google search** me key + Search Engine ID |
| Music library me Google | **Nahi hai** (sirf YouTube) | — |

---

## 2. Settings → YouTube search (ek value)

YouTube Data API v3 key. User ke browser me, per account.

### User ke liye 4 steps

1. [Google Cloud Console](https://console.cloud.google.com/) → project chunein.
2. [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   → **Enable**. *(Billing ki zaroorat nahi — free quota milta hai.)*
3. [Credentials](https://console.cloud.google.com/apis/credentials) →
   **Create credentials → API key** → copy.
4. Restrict karein: **API restriction** → sirf *YouTube Data API v3*;
   **Application restriction** → *Websites* → `https://eduvora.shop/*`.

### Owner ke liye

`VITE_YOUTUBE_API_KEY` **khali** rakho → school ka account kabhi charge nahi
hoga. Apni testing ke liye:
`localStorage.setItem("dc.music.youtubeKey", "AIza…")`.

---

## 3. Settings → Google search (do values)

Google search ko **do** cheezein chahiye — isliye uska card do input rakhta hai:

| Value | Kahan se | Kya hai |
|-------|----------|---------|
| **API key** | Google Cloud → Credentials | `Custom Search API` wali key |
| **Search Engine ID (cx)** | Programmable Search Engine | engine ki id, jaise `0123…:abc…` |

### User ke liye 3 steps

1. [Custom Search API](https://console.cloud.google.com/apis/library/customsearch.googleapis.com)
   kholein → **Enable**. *(Billing ki zaroorat nahi.)*
2. [Programmable Search Engine](https://programmablesearchengine.google.com/)
   → naya engine → **Search the entire web** → **Add to the list** → engine
   page par **Search Engine ID** copy karein (ye `cx` value hai).
3. [Credentials](https://console.cloud.google.com/apis/credentials) →
   **Create credentials → API key** → copy. Restriction: **API** →
   *Custom Search API*, **Application** → *Websites* → app ka origin.

### Owner ke liye

`VITE_GOOGLE_SEARCH_API_KEY` aur `VITE_GOOGLE_SEARCH_CX` **khali** rakho →
har user apni configuration use karega, school ka bill zero.

---

## 4. Configuration ka order (dono ke liye ek jaisa)

1. **User ka apna** — uske account slot me (`dc.google.searchKey.u.<uid>`,
   `dc.music.youtubeKey.u.<uid>`);
2. **Device ka** — `dc.google.searchKey` / `dc.music.youtubeKey`;
3. **Owner ka** — build constants (`VITE_GOOGLE_SEARCH_*`,
   `VITE_YOUTUBE_API_KEY`).

User ka apna **hamesha** pehle. Isiliye owner ke values khali hone par bhi
app poora chalta hai — aur owner charge nahi hota.

---

## 5. Google search page (Course Player me)

Resource Library ka search page kholo → search box ke **andar, right side**
me **Google icon** (🔴🔵🟡🟢 G) → ek tap par **Google page** khulta hai:

- apna strip: back arrow + box + format button;
- pehle **recent searches ka board** (YouTube search page jaisa);
- phir **results** (Enter dabane par);
- history apni alag list me save hoti hai
  (`dc.searchHistory.v1.course-library-google`) — course library ki history
  alag rehti hai;
- result koi bhi web page hota hai → naye tab me khulta hai.

Configuration na hone par page khul kar ye batata hai aur Google par khud
search karne ka link deta hai — chup chap fail nahi hota.

### 5.1 Results page Google jaisa dikhta hai

Google ka API jo deta hai, sab kuch yahin dikhta hai — kuch bhi chhupaya
nahi gaya:

| Google ka field | Screen par |
|-----------------|-----------|
| `title` | neela title (Google ka `#1a0dab`) |
| `displayLink` + URL ka path | upar breadcrumb (site ka naam + path) |
| `snippet` / `htmlSnippet` | neeche snippet, **matched words bold** |
| `pagemap.cse_image` / `og:image` | page ki picture, right side |
| `pagemap.cse_thumbnail` | chhoti thumbnail (Images tab) |
| `fileFormat` / `mime` / `fileSize` | file ka badge (PDF, XLS…) aur size |
| `article:published_time` | page ki date |
| `searchInformation.formattedTotalResults` | "About 1,230,000 results" |
| `searchInformation.formattedSearchTime` | "(0.42 seconds)" |
| `queries.nextPage` | **Next ›** pager (Google 10 result ek page deta hai) |
| `searchType=image` | **Images** tab (Google ki picture grid) |

Do tabs hote hain — **All** (web pages) aur **Images** (pictures), bilkul
Google jaisa. Format button web tab par listing badalta hai (rows ↔ cards) aur
Images tab par **thumbnail ka size** (chhota ↔ bada) — Google ka apna switch.

### 5.2 Google page ka back — do step

```
Results --(header back)--> Board (history + khaali box) --(back)--> Library ka search page
```

Aur **results par box par tap karte hi wapas board** — bilkul YouTube page
jaisa. Footer bhi wahi rule: board par footer chhupta hai, results par wapas
aata hai.

---

## 5.3 Music library ka search box (YouTube search page)

Music library (Course Player ka Music tab) ka search box **ab har jagah**
YouTube search page kholta hai — page, player ke upar wala "Music library"
panel, aur video ke neeche wali library — bilkul module library jaisa:

- box par tap → **board** (recent searches + khaali box);
- type karke Enter → **results page**;
- back arrow: results → board → library;
- results par box par tap → board.

Shelf ka filter (Course / Device / Online / URL) search page par koi rok
nahi deta — wahan search hamesha YouTube ka hota hai.

---

## 5.4 Key kahan se aayegi — aapka choice (dono engines me)

Settings → **YouTube search** aur Settings → **Google search** — dono cards me
ek switch hai:

| Option | Kya hota hai |
|--------|--------------|
| **Meri apni key** (default) | Pehle aapki hi key chalti hai. Aapki daily quota khatam ho jaye to **master ki key apne aap chalu ho jati hai** — wahi query dobara bhejti hai, results aa jaate hain, aapko koi tok nahi dikhti. |
| **Master ki key** | Seedha school ki key se chalega — aapka apna quota bilkul nahi lagega. |

**Ye choice kabhi trap nahi hai:** jis key ki choice ki hai, wo agar maujood hi
nahi hai to doosri key use hoti hai — chalta hua search zyada acha hai.

Master ki key school ke build me hoti hai (`.env`):
`VITE_YOUTUBE_API_KEY`, `VITE_GOOGLE_SEARCH_API_KEY`, `VITE_GOOGLE_SEARCH_CX`.
Jab tak owner inhe nahi bharta, "Master ki key" option grey rehta hai aur likha
hota hai *"School ki key abhi configure nahi hai"*.

Choice **har user ka apna** hota hai (account slot → device slot), aur
browse karte hi turant apply ho jaata hai.

---

## 6. Fail hone par kya dikhta hai

Har failure ka apna message hai (sab "kuch nahin mila" nahi):

| Code | Message |
|------|---------|
| `invalid-key` | key galat hai |
| `api-disabled` | project me API enable nahi |
| `quota` | daily quota khatam |
| `referrer` | website restriction mismatch |
| `invalid-cx` | Search Engine ID galat |
| `network` | internet nahi |

Aur har message ke saath ek pointer: **Settings → YouTube search** (ya
**Settings → Google search**) me key badlo.

---

## 7. Files

| File | Kya hai |
|------|---------|
| `src/course/googleSearch.ts` | Google configuration ka order, poori API parsing, pager, error diagnosis, test |
| `src/course/GoogleResults.tsx` | Google jaisa result row, card aur Images grid |
| `src/course/googleResults.css` | un sab ka look |
| `src/course/GoogleSearchCard.tsx` | Settings ka Google card (key + cx) |
| `src/course/GoogleGlyph.tsx` | Google ka apna "G" (chaar rang) |
| `src/course/musicSearch.ts` | YouTube key ka order, per-account slot, **quota handover**, error diagnosis |
| `src/course/searchKeySource.ts` | "meri key ya master ki" — choice ka storage (per engine, per account) |
| `src/course/KeySourceSwitch.tsx` | Settings ka switch (dono cards me) |
| `src/course/YouTubeKeyCard.tsx` | Settings ka YouTube card |
| `src/course/CourseResourceLibrary.tsx` | search box me Google icon + Google page |
| `src/course/MusicPanel.tsx` | YouTube search + do-step ka back |
| `src/settings/SettingsPage.tsx` | dono configuration sections |
| `vite.config.ts`, `index.html` | build-time constants |
| `tests/coursePlayerGoogleSearch.test.mjs` | Google search ka pura contract |
| `tests/coursePlayerMusicSearch.test.mjs` | YouTube key ka pura contract |
