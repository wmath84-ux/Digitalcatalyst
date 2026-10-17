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
   *Custom Search API*. **Application restriction me kuch bhi chuno —
   `None`, `Websites`, ya `IP addresses` — search chalti rahegi**, kyunki
   browser wali request refuse hone par app wahi query apne server ke
   through bhejti hai (niche §3.1). Website restriction rakhna behtar hai
   (key leak hone par koi doosra use nahi kar sakta), par zaroori nahi.

### Owner ke liye

`VITE_GOOGLE_SEARCH_API_KEY` aur `VITE_GOOGLE_SEARCH_CX` **khali** rakho →
har user apni configuration use karega, school ka bill zero.

Chaaho to **server-side** school ki key bhi set kar sakte ho (browser bundle me
ye value kabhi nahi jaati):

| Variable | Kya hai |
|----------|---------|
| `GOOGLE_SEARCH_API_KEY` | school ki Custom Search key — `/api/google-search` is se chalta hai |
| `GOOGLE_SEARCH_CX` | school ka Search Engine ID |

In dono ke bina bhi server path chalta hai — tab wo **learner ki apni key ko
POST body me le kar** Google tak pahunchata hai (yani restriction ka fix bina
kisi env value ke bhi mil jaata hai). Ye values Vercel dashboard → Project →
Settings → Environment Variables me daalo, aur `npm run dev` ke liye `.env` me
(`.env.example` me section bana hua hai).

---

## 3.1 Server path (`/api/google-search`) — restriction ka permanent jawab

**Problem:** browser se `googleapis.com` par seedhi request jaati hai, aur
browser us par `Origin` + `Referer` **lagata hi hai** — APK me
`https://localhost` (Android) / `capacitor://localhost` (iOS), PWA me
`https://eduvora.shop`, dev me `http://localhost:5173`. Key ki "Website" restriction in me se ek ko hi
pehchaanti hai, isliye baaki jagah `403 ipRefererBlocked`. Console me
restriction badalna kaam karta tha, par **sirf us origin ke liye jo abhi chal
raha hai** — aur app teen jagah chalti hai.

**Fix:** `/api/google-search` — app ke apne server par ek chhota proxy. Server
se jaane wali request par **na Origin hota hai, na Referer** → Google ke paas
restrict karne ke liye kuch hi nahi → **key ki restriction koi bhi ho, request
pass hoti hai**.

```
browser ──(Origin/Referer ke saath)──▶ googleapis.com   ✗ 403 ipRefererBlocked
browser ──POST /api/google-search───▶ app ka server ──(koi header nahi)──▶ googleapis.com   ✓ 200
```

**Cascade (search simply chalti hai):**

1. chuni hui configuration, **browser se seedha** (sabse sasta);
2. wahi configuration, **apne server ke through** — restriction yahi todta hai;
3. **doosri** configuration (school ki, ya learner ki) — dono paths par.

Quota khatam ho to server hop **skip** hota hai (proxy quota nahi badha sakta)
aur seedha handover chalta hai. Ek baar koi key browser me refuse ho gayi, to
agli search **server se shuru** hoti hai (10 minute ki memory) — wahi 403 dobara
nahi khareedte.

**Suraksha:**

* learner ki key **POST body** me jaati hai, query string me kabhi nahi (log /
  cache me leak na ho);
* key response me **wapas nahi** jaati; jawab `Cache-Control: no-store`;
* school ki key **per-IP rate limit** par chalti hai (12 request + refill);
  learner ki apni key par ye limit nahi — wo quota Google ka apna hai;
* Google ka **asli status + reason + message** wapas aata hai, isliye page
  andaaza nahi lagata ki 403 kis cheez ka tha.

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

### 5.4.1 Daily quota khatam hone par — aur quota reset hone par

Ye quota **daily** hota hai: Google ka free daily budget har raat (Pacific
time ki raat) reset ho jaata hai. Isliye master ki key ka takeover ek
**switch nahi, ek pause** hai:

1. Aapki quota khatam hoti hai → master ki configuration apne aap chalu ho
   jaati hai, wahi query dobara jaati hai, results aa jaate hain. Aapko sirf
   ek halki si line dikhti hai: *"aapki key ka daily quota khatam ho gaya —
   ab master ki key se chal raha hai"*.
2. Jaise hi **aapki quota reset ho jaati hai** (Google ka daily reset), app
   **apne aap wapas aapki configuration par shift ho jaata hai** — kuch press
   karne ki zaroorat nahi, koi setting badalne ki zaroorat nahi. Agla search
   seedha aapki hi key se chalta hai.
3. Aap nayi key paste karte ho to bhi purana "quota khatam" record mit jaata
   hai — nayi key ka budget toh fresh hota hai.

Ye dono engines me chalta hai (YouTube aur Google) aur har user ke liye
alag hai (account slot → device slot).

---

## 6. Fail hone par kya dikhta hai

Har failure ka apna message hai (sab "kuch nahin mila" nahi):

| Code | Message |
|------|---------|
| `invalid-key` | key galat hai |
| `api-disabled` | project me API enable nahi |
| `quota` | daily quota khatam |
| `referrer` | key ki **website** restriction ne roka |
| `ip-blocked` | key ki **IP** restriction ne roka |
| `permission` | project/key par permission denied |
| `invalid-cx` | Search Engine ID galat |
| `proxy-unavailable` | server path is deployment par nahi hai |
| `network` | internet nahi |

Har message ke saath **Google ka apna message** bhi dikhta hai (andaaza nahi),
aur ek pointer: **Settings → YouTube search** (ya **Settings → Google search**)
me key badlo.

### 6.1 Settings → Google search → "Diagnose karo"

Ek button jo dono paths ko **ek-ek chhoti request** se aazmata hai aur saaf
batata hai kya chalu hai:

```
Abhi search is key se chalti hai: AIza…x9Kd · aapki · account slot · handover: master
  Browser se seedha Google        ✗ referrer · 403 · 640ms
  App ke server ke through        ✓ chalu · 310ms
Verdict: Server path se search chalu hai — browser wali key restriction se
         rukti hai, par request apne server ke through chali jaati hai.
```

Isme `keyFingerprint` bhi dikhta hai — jo sawab "maine to restriction hata di
thi" ka asli jawab hai: **kaun si key actually chal rahi hai** (account slot /
device slot / build-time constant). Diagnosis chalne par purani memory saaf ho
jaati hai, aur verdict ke saath exact fix steps aate hain.

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
| `vite.config.ts`, `index.html` | build-time constants + dev server ka `/api/google-search` middleware |
| `api/_lib/googleSearchProxy.ts` | server proxy: Google URL, classifier, per-IP limiter, `handleGoogleSearch` |
| `api/referral-leaderboard.ts` | route dispatcher (`google-search` shared function par chalta hai) |
| `vercel.json` | `/api/google-search` ka rewrite |
| `scripts/check-google-search.mjs` | terminal se dono paths ka test (`npm run check:google-search`) |
| `tests/googleSearchProxy.test.mjs` | server proxy ka pura contract |
| `tests/coursePlayerGoogleSearch.test.mjs` | Google search ka pura contract |
| `tests/coursePlayerMusicSearch.test.mjs` | YouTube key ka pura contract |
