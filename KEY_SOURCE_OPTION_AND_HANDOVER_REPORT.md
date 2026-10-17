# Key source ka option + quota par automatic handover — report

**Date:** 2026-10-17
**Branch:** `arena/6bdb33d3-digitalcatalyst`

Owner ka request (Hinglish, verbatim):

> "tumne directly course player ki setting mein do option add kar diye hain lekin
> aur tumne dynamic rule set kiye hain ki pahle user ka limit use hoga uske bad
> master ka lekin yahan per tum direct course player ki setting mein hi option
> add karo changeable adjustable option — jaise YouTube ke liye ya to vah apna
> use karun ya to master ka use karun — aise hi Google ke liye bhi uske pass
> option ho. Aur abhi jo tumne dynamic rule set kiya hai usko bhi background
> mein chalne do lekin usko ulta kar do: pahle user ka use hoga, aur agar user
> ka limit khatam ho gaya to master ka activate ho jaega apne aap, aur user
> bina kisi interruption ke search kar payega."

Do kaam, ek saath:

1. **Settings me ek CHANGEABLE option** — YouTube aur Google, dono ke liye:
   *"meri apni key"* ya *"master ki key"*.
2. **Dynamic rule background me chalta rahe, par ulta** — pehle user ki key,
   aur user ki quota khatam ho jaye to **master ki key apne aap** chalu ho
   jaye — **bina kisi interruption ke**, search chalta rahe.

---

## 1. Naya option — Settings me ( dono engines me)

Nayi file: `src/course/searchKeySource.ts` (choice ka storage) aur
`src/course/KeySourceSwitch.tsx` (switch ka UI).

**Switch kahan hai:** Settings → **YouTube search** → YouTube key card me, aur
Settings → **Google search** → Google card me. Dono cards me ek hi switch
component chalta hai.

```
Key kahan se aayegi?
[ Meri apni ]  [ Master ki ]
Aapki key pehle chalegi. Aapki quota khatam ho jaye to master ki key apne aap
chalu ho jayegi — search chalta rahega, koi tok nahi.
```

| Option | Behaviour |
|--------|-----------|
| **Meri apni** (default) | Pehle user ki key. Quota khatam → **master apne aap**. |
| **Master ki** | Seedha school ki key — user ka quota bilkul nahi lagta. |

**Storage** (per engine, per account → device → default):

| Engine | Account slot | Device slot |
|--------|--------------|-------------|
| YouTube | `dc.music.youtubeKey.source.u.<uid>` | `dc.music.youtubeKey.source` |
| Google | `dc.google.searchKey.source.u.<uid>` | `dc.google.searchKey.source` |

Value `"mine"` ya `"master"`; koi aur ya koi value = `"mine"` (app kabhi
ghulat-chhoot kar school ka quota nahi jalaega).

**Master ki key kahan se aati hai:** build me — `VITE_YOUTUBE_API_KEY`,
`VITE_GOOGLE_SEARCH_API_KEY`, `VITE_GOOGLE_SEARCH_CX`. Jab tak owner inhe
nahi bharta, "Master ki" option **disabled** rehta hai aur likha hota hai
*"School ki key abhi configure nahi hai"* — dead search kabhi offer nahi hota.

---

## 2. Dynamic rule — ulta, aur background me

Pehle: user → master (bas ek order, quota khatam hone par kuch nahi hota tha).
Ab: **user pehle**, aur **quota khatam hote hi master apne aap** — wahi query
dobara bhejti hai, results aa jaate hain, learner ko koi error nahi dikhta.

### YouTube (`src/course/musicSearch.ts`)

- `youTubeSearchPlan(uid)` → `{ key, origin, handover }`
  - `origin`: `"own"` ya `"master"` (kiska key hai);
  - `handover`: sirf tab `"master"` ka key, jab user ka apna key use ho raha ho.
    **Handover hamesha ek hi taraf jaata hai: apni → master.** Master ka quota
    khatam ho to user ki key par wapas nahi jaata (choice ki izzat).
- `searchYouTubeOutcome()`: pehla request user ki key se → `quota` error →
  **wahi query master ki key se dobara** → results aa gaye to
  `usedFallback: true`.

### Google (`src/course/googleSearch.ts`)

- `googleSearchPlan(uid)` → `{ apiKey, cx, origin, handover }` ( dono values
  saath handover hoti hain — key + `cx`).
- `searchGoogleOutcome()`: wahi rule, wahi `quota` trigger, wahi
  `usedFallback: true`.

### "Choice kabhi trap nahi"

Jis key ki choice ki hai wo maujood nahi hai → doosri use hoti hai:

| Choice | Maujood | Chalega |
|--------|---------|---------|
| mine | user ki nahi, master hai | master |
| master | master nahi, user ki hai | user ki |
| mine | user ki hai, master nahi | user ki |

---

## 3. Learner ko kya dikhta hai

- **Koi error nahi.** Handover ho jaye to results aate hain, error banner
  nahi aata.
- **Ek choti si line** (sirf tab, jab handover hua ho):
  - Music: *"Aapki key ka quota khatam ho gaya — ab master ki key se chal raha
    hai. Search chalta rahega."*
  - Google: *"Aapki configuration ka quota khatam ho gaya — ab master ki
    configuration se chal raha hai. Search chalta rahega."*
- Search box, footer, history — sab waise hi chalte hain.

---

## 4. Files

| File | Kya hai |
|------|---------|
| `src/course/searchKeySource.ts` | **NEW** — choice ka storage + read/write + event |
| `src/course/KeySourceSwitch.tsx` | **NEW** — Settings ka switch (dono cards me) |
| `src/course/musicSearch.ts` | plan (`youTubeSearchPlan`), `setYouTubeKeySource`, quota handover |
| `src/course/googleSearch.ts` | plan (`googleSearchPlan`), `setGoogleSearchSource`, quota handover |
| `src/course/YouTubeKeyCard.tsx` | switch jud gaya |
| `src/course/GoogleSearchCard.tsx` | switch jud gaya |
| `src/settings/SettingsPage.tsx` | dono sections ka description update |
| `src/course/MusicPanel.tsx` | handover ki ek choti line |
| `src/course/CourseResourceLibrary.tsx` | Google page par wahi line |

---

## 5. Tests

| File | Naya kya |
|------|----------|
| `tests/coursePlayerKeySourceSwitch.test.mjs` | **NEW** — switch ka runtime: default "mine", "master" ka tap, master na hone par disabled, dono cards me laga hua |
| `tests/coursePlayerMusicSearch.test.mjs` | 15 → **19**: choice, "trap nahi", quota handover, sirf quota par handover, master choice ki izzat |
| `tests/coursePlayerGoogleSearch.test.mjs` | 10 → **14**: wahi chaar, Google ke saath (key + cx) |
| `tests/coursePlayerMusicPaneRuntime.test.mjs` | 17 → **18**: quota khatam → master ne sambha liya, **koi error banner nahi**, ek choti line |
| `tests/courseResourceLibrarySearchRuntime.test.mjs` | 12 → **13**: Google page par wahi handover |

Poora suite: `node --test tests/*.test.mjs` → **4425 tests, 0 fail** ·
`npm run build:low-heap` → **EXIT=0** · `tsc --noEmit` → clean.
