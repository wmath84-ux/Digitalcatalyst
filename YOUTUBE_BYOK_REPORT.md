# YOUTUBE BYOK — "user apni API key app me daalei"

**Owner ka sawaal (2026-10-17):**
> "Course player me jo YouTube wala hai, maine apna khud ka API enable kiya hai
> Google cloud console se, uska usage limit count hota hai — lekin abhi billing
> account enable nahin karna chahta. Kya aisa tarika hai jisse code update karke
> user apna khud ka API daalei, app ke andar hi use kare?"

**Jawab: haan — BYOK (Bring Your Own Key).** Neeche poora implementation.

---

## 1. Kya badla (ek line me)

> Ab **user ki apni key** app me daal sakta hai, aur wahi key YouTube search
> chalane ke liye use hoti hai. Owner ka `VITE_YOUTUBE_API_KEY` sirf
> **fallback** hai — use khali rakha to **owner ka account kabhi charge nahi
> hota**, aur billing enable karne ki zaroorat hi nahi padti.

---

## 2. Problem ka asal zarooriya

| | Pehle | Ab |
|---|---|---|
| Key kahan se | bundle me (`VITE_YOUTUBE_API_KEY`) | **user ke browser me** (localStorage) |
| Quota kiski | **owner ki** | **user ki** |
| 100 users ke baad | quota khatam → "results nahin mila" → billing mang raha hai | har user apni key, apna quota |
| User ko key banana | nahi pata | 4 step, app me hi guide |
| Fail hone par | "kuch nahin mila" (sab same dikhta hai) | **asli wajah** + "Key theek karo" button |

Key order ab (`src/course/musicSearch.ts`):

1. `dc.music.youtubeKey.u.<uid>` — **user ka apna** (per account)
2. `dc.music.youtubeKey` — device-wide fallback (user ya owner)
3. `VITE_YOUTUBE_API_KEY` → `__DC_YOUTUBE_API_KEY__` — **owner ka fallback**

User ki key **hamesha** pehle. Isliye school ki quota kabhi user ke search se
nahi jati.

---

## 3. Files

| File | Badlav |
|------|--------|
| `src/course/musicSearch.ts` | key order (user → owner), per-account slot, `saveYouTubeKey` / `clearYouTubeKey` / `ownYouTubeKey`, `searchYouTubeOutcome` (error ke saath), `classifyYouTubeError`, `testYouTubeKey` |
| `src/course/YouTubeKeyCard.tsx` | **naya** — the key card (Test · Save · Hatao · 4 steps · privacy line) |
| `src/course/MusicPanel.tsx` | search bar me **key button (🔑)**, card, "kyun fail hua" banner |
| `src/course/CourseResourceLibrary.tsx` | wahi key button + card + error message, naya `uid` prop |
| `src/CoursePlayerApp.tsx` | library ko `uid` diya |
| `src/settings/SettingsPage.tsx` | **Settings → YouTube search** section |
| `src/course/courseResourceLibrary.css` | `.library-search-keycard` |
| `.env.example` | owner ke liye nayi saaf instructions |
| `docs/youtube-byok.md` | **naya** — poora guide (setup, steps, alternatives) |

---

## 4. Naya behaviour, ek-ek karke

### 4.1 Key ka order badla (ye core hai)

Pehle: `build → serve-time global → localStorage`.
Ab: **user ka account slot → device slot → owner ka build key**.

Isiliye ek user apni key daale to wo **owner ki key ko hila deti** hai —
owner ki quota use nahi hoti.

### 4.2 Per-account slot

`dc.music.youtubeKey.u.<uid>` — har user ki key alag. Ek shared laptop par
do learner: dusre ki key pehli wale ke account me nahi jaati. (AI config
me bhi yahi rule hai — `dc_ai_user_config_<uid>`.)

### 4.3 Fail hone par asli wajah

Pehle har failure ek hi thi: `[]` (empty list). Ab:

```ts
type YouTubeKeyErrorCode =
  | "no-key" | "invalid-key" | "api-disabled"
  | "quota" | "referrer" | "network" | "unknown";
```

Google ke apne error body se reason padha jata hai
(`keyInvalid` / `accessNotConfigured` / `quotaExceeded` / `forbidden`), aur
user ko seedha woh dikhta hai — jaise:

> "Is key ki daily quota khatam ho gayi hai. Kal try karo, ya doosri key use karo."

aur uske bagal me **"Key theek karo"** button.

### 4.4 "Test karo" — 1 quota unit

Key save karne se pehle check hoti hai, aur sabse sasta call lagta hai
(`videos.list`, **1 unit** — `search` 100 units leti hai). Isliye test karna
free hai, aur user ko pata chal jaata hai ki key "chal rahi hai" ya nahi.

### 4.5 Teen jagah, ek hi UX

- **Settings → YouTube search**
- **Course Player → Music tab** → search box ke bagal me 🔑
- **Course Player → Resource Library** → search strip me 🔑

---

## 5. User ke liye 4 steps (app me hi likhe hain)

1. Google Cloud Console → project chunein.
2. **YouTube Data API v3 → Enable** (billing ki zaroorat nahi).
3. **Credentials → Create credentials → API key** → copy.
4. Restrict karein: **API restriction** → sirf *YouTube Data API v3*;
   **Application restriction** → *Websites* → `https://eduvora.shop/*`.

---

## 6. Owner ke liye action

- [ ] `VITE_YOUTUBE_API_KEY` **khali** rakho → **school ka bill zero**.
- [ ] Apni testing ke liye: `localStorage.setItem("dc.music.youtubeKey", "AIza…")`.
- [ ] Deploy ke baad `docs/youtube-byok.md` padh lo.

---

## 7. Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| `npm run build:low-heap` | ✅ built (48.9s) |
| Poora test suite (`node --test tests/*.test.mjs`) | ✅ **4395 tests, 0 fail** |
| Naye runtime test (pane me key → save → quota error → remove) | ✅ |
| `tests/coursePlayerMusicSearch.test.mjs` (14) | ✅ |
| `tests/coursePlayerMusicTabContract.test.mjs` (21) | ✅ |
| `tests/coursePlayerMusicPaneRuntime.test.mjs` (15) | ✅ |
| `tests/courseResourceLibrarySearchRuntime.test.mjs` (9) | ✅ |

### Test contract me jaan-boojh kar badlav

| Test | Pehle | Ab | Kyun |
|------|-------|-----|------|
| `coursePlayerMusicSearch` | "served global beats the local override" | **user ki key owner se pehle** | BYOK ka poora maqsad |
| `coursePlayerMusicTabContract` | `useState(youTubeSearchAvailable)` | `useState(() => youTubeSearchAvailable(uid))` | key ab per-account hai |
| `coursePaidLibraryDesignContract` | `await searchYouTube(text)` | `await searchYouTubeOutcome(text` | library ko reason bhi chahiye |
| `courseResourceLibrarySearchRuntime` | strip = `back · box · format` | `back · box · format · key` | key button strip me aayi |

---

## 8. Security / privacy

- Key user ke browser me rehti hai; app ke server par **kabhi nahi** jaati.
- Request seedha **browser → Google** jaati hai (pehle jaisa hi).
- Key code me **kabhi** nahi likhi, `console.log` nahi hoti.
- Saved key dikhate waqt sirf `AIza…abcd` dikhta hai.
- User ko do restrictions dene ko kaha gaya hai (API + website referrer),
  kyunki browser se chalne wali key public hoti hai.

---

## 9. Baaqi raaste (comparison ke liye)

| Tarika | Bill kis par? | Note |
|--------|----------------|------|
| **BYOK (ye)** | user | school ka bill zero; har user ko key banane ki mehnat |
| Owner ki key, bundle me | owner | simple, lekin ek hi quota; 100 users pe khatam |
| Owner ki key, server proxy | owner | key bundle me nahi jaati; serverless + quota dono owner ke |
| Owner ki key + cache | owner | cache se 90%+ quota bachta hai |

BYOK isiliye default rakha: **aapka billing account off rahe, app poora
chalta rahe.**
