# YouTube search — apni API key (Bring Your Own Key)

> Course Player → **Music** tab aur **Resource Library** ke search mein YouTube
> ke andar results laane ke liye key chahiye. Ab ye key **user ka apna** ho
> sakta hai — school ka Google account bilkul touch nahi hota, aur uske
> billing par koi search charge nahi aata.

---

## 1. Problem kya tha

YouTube Data API v3 ki har search **100 quota units** kharch karti hai, aur
har project ki ek free daily quota hoti hai (default **10,000 units/day**,
yaani ~100 searches/day). Agar key app ke bundle mein hoti (yaani
`VITE_YOUTUBE_API_KEY` se build hoti), to:

- har user ka search **school ki quota** jata hai;
- 100 users × kuch searches = quota khatam, aur app "YouTube se results
  nahin mila" dikhata hai;
- quota khatam hone par Google **billing account** maangta hai — jab tak
  billing nahi hai, YouTube search app mein hi dead ho jaata hai.

## 2. Ab kya hai (BYOK)

Key ka order ab ye hai (`src/course/musicSearch.ts`):

| # | Source | Kaun banata hai | Kiski quota |
|---|--------|-----------------|-------------|
| 1 | `dc.music.youtubeKey.u.<uid>` | **User**, app ke andar | **User ki** |
| 2 | `dc.music.youtubeKey` | User (device-wide fallback) ya owner (console) | User ki |
| 3 | `VITE_YOUTUBE_API_KEY` → `__DC_YOUTUBE_API_KEY__` | **Owner** (fallback) | Owner ki |

**User ki apni key hamesha pehle.** Isliye:

- har user ka apna quota use hota hai — school ka nahi;
- owner ki `VITE_YOUTUBE_API_KEY` **khali** rakhne par school **kabhi**
  charge nahi hota;
- billing enable karne ki zaroorat hi nahi — free quota per project kaafi hai.

Key user ke browser ke `localStorage` me rehti hai aur request seedha
browser → Google jaata hai. Key app ke server par nahi jaati, aur code me
`console.log` nahi hoti.

## 3. User kaise key jodta hai

**Ek jagah: Settings → YouTube search.** Course Player me koi configuration
UI nahi hai — wahan sirf ye bataya jata hai ki search **kyun** fail hua, aur
Settings ka pointer diya jata hai.

> Course Player ka Google (web) search bhi isi tarah configure hota hai —
> **Settings → Google search**. Detail: `docs/course-player-search-configuration.md`.

Card me kya hai:

- **Test karo** — key bacha kar check karta hai. Sabse sasta call
  (`videos.list`, **1 quota unit**) use hota hai, isliye test karna free hai.
  Fail ho to **asli wajah** batata hai:
  - `invalid-key` → key galat hai;
  - `api-disabled` → us project me **YouTube Data API v3 enable nahi** hai;
  - `quota` → daily quota khatam;
  - `referrer` → key ki "Website" restriction me app ka origin nahi hai;
  - `network` → internet nahi hai.
- **Save karo** — key us user ke account slot me chala jata hai.
- **Hata do** (trash icon) — key hata deta hai (owner ka fallback chalta
  rehta hai).
- **4 steps** — key kaise banayein, console ke links ke saath.

## 4. User ke liye key banane ka tareeqa (4 steps)

1. [Google Cloud Console](https://console.cloud.google.com/) kholein → project
   chunein (ya naya bana lein).
2. [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   kholein → **Enable**. *(Billing ki zaroorat nahi — free quota milta hai.)*
3. [Credentials](https://console.cloud.google.com/apis/credentials) →
   **Create credentials → API key** → key copy karein.
4. Key ko **restrict** karein (ye zaroori hai, kyunki key browser me jaati hai):
   - **API restrictions** → sirf **YouTube Data API v3**;
   - **Application restrictions** → **Websites** → app ka origin, jaise
     `https://eduvora.shop/*` (dev ke liye `http://localhost:5173`).

## 5. Owner ke liye checklist

- [ ] `VITE_YOUTUBE_API_KEY` **khali** rakho → school ka account kabhi
      charge nahi hoga, aur har user apni key use karega.
- [ ] `VITE_GOOGLE_SEARCH_API_KEY` + `VITE_GOOGLE_SEARCH_CX` bhi **khali**
      rakho → web search bhi har user ki apni configuration se chalega.
- [ ] Apni testing ke liye hi chahiye to ek key bana lo aur browser me daal do:
      `localStorage.setItem("dc.music.youtubeKey", "AIza…")`.
- [ ] Deploy ke baad `.env.example` ke comment padh lo — wahi is feature ka
      contract hai.

## 6. Alternatives (taaki faisla context me ho)

| Tarika | Bill kis par? | Trade-off |
|--------|----------------|-----------|
| **BYOK (ye)** | User | Har user ko key banane ki mehnat; school ka bill zero |
| Owner ki key, bundle me | Owner | Simple, lekin quota ek hi hai; 100 users pe khatam |
| Owner ki key, **server proxy** se | Owner | Key bundle me nahi jaati, quota cache se bach sakti hai; lekin serverless ka cost + quota dono owner ke |
| Owner ki key + **result cache** | Owner | Same key, par repeated searches cache se (quota 90%+ bachta hai) |

BYOK isiliye default hai: aapka billing account off rahe, app poora chalta
rahe, aur har user ko woh mile jo woh use karta hai.

## 7. Files

| File | Kya hai |
|------|---------|
| `src/course/musicSearch.ts` | key ka order, per-account slot, error diagnosis, `testYouTubeKey` |
| `src/course/YouTubeKeyCard.tsx` | the key card (test · save · remove · 4 steps) |
| `src/course/MusicPanel.tsx` | Music tab: "kyun fail hua" banner (Settings ka pointer) |
| `src/course/CourseResourceLibrary.tsx` | Resource Library: Google icon + Google page |
| `src/settings/SettingsPage.tsx` | Settings → YouTube search section |
| `tests/coursePlayerMusicSearch.test.mjs` | key order, per-account slot, error codes, key test |
