# Google search rok di gayi + YouTube transcript "unavailable" — dono ka guaranteed fix

**Date:** 2026-10-17
**Branch:** `arena/74d99e73-digitalcatalyst`

Owner ka request (Hinglish, verbatim):

> "1. Google search fail ho raha hai — app ye message dikha raha hai *'Google ne
> request rok di — is key ki Website restriction me app ki site ka address add
> karna hoga… Application restriction ko None kar do…'*. Maine wahi kiya jo
> pehle bataya gaya tha (restriction hata di / Application restriction None kar
> diya) par error abhi bhi aa raha hai.
> 2. YouTube transcript fail ho raha hai — panel *'Transcript unavailable'* /
> *'No captions for this video'* / *'This video has no captions (neither manual
> nor auto-generated), so there is no transcript to show.'* dikha raha hai,
> jabki video me captions **available hain**. Video:
> https://www.youtube.com/watch?v=ksTPzTWUb6o
> Dono ka **guaranteed fix** chahiye, aur app APK / PWA / localhost sab par
> chalegi."

Do line ka jawab:

1. **Google:** ab restriction ka koi matlab nahi. Browser wali request refuse
   hote hi app wahi query **apne server ke through** bhejti hai
   (`/api/google-search`), aur server se jaane wali request par **na Origin
   hota hai na Referer** — Google ke paas restrict karne ke liye kuch hi nahi.
   Isliye `None` ho, `Websites` ho, ya `IP addresses` ho — search chalti rahegi.
   Aur jab phir bhi ruke, to page Google ka **asli message** aur **kaun si key
   chal rahi hai** batata hai (asli wajah yahi thi ki jo key aapne console me
   edit ki, wo shayad wo key nahi thi jo app bhej rahi thi).
2. **Transcript:** "no captions" bolne ka rule hi galat tha. Ab server **char
   layer** try karta hai, aur `no_captions` **sirf tab** bolta hai jab uske paas
   saboot ho. Saboot na ho to "read fail hua" bolta hai, aur **browser apni
   taraf se khud try karta hai** — jisme YouTube ka apna transcript panel aur
   **player ki caption list** bhi shamil hai. `ksTPzTWUb6o` jaise video par
   captions hain → ya to lines aa jayengi, ya panel saaf likhega *"Captions
   hain — lekin abhi download nahi ho pa rahe"* (jhooth nahi).

---

## 0. Kya-kya badla (ek nazar me)

| # | Cheez | File |
|---|-------|------|
| 1 | **Naya** server proxy — `/api/google-search` | `api/_lib/googleSearchProxy.ts` |
| 2 | Proxy ka route shared function par | `api/referral-leaderboard.ts`, `vercel.json` |
| 3 | `npm run dev` par bhi **wahi** handler — Google **aur** transcript (localhost = production) | `vite.config.ts` |
| 4 | Client ka **cascade** + path memory + honest error codes | `src/course/googleSearch.ts` |
| 5 | Settings me **"Diagnose karo"** panel | `src/course/GoogleSearchCard.tsx` |
| 6 | Library ke empty page par **Google ka asli message** | `src/course/CourseResourceLibrary.tsx` + `.css` |
| 7 | Transcript pipeline **poora rewrite** (4 layer + trail) | `api/_lib/youtubeTranscript.ts` |
| 8 | Browser ka **second opinion** (3 strategy, 9 s budget) | `src/course/youtubeTranscript.ts` |
| 9 | Player se **caption probe** (`getOption("captions")`) | `src/course/youtubePlayerBus.ts`, `ResourceViewer.tsx` |
| 10 | Panel me **"Details — kya try hua"** disclosure | `src/course/TranscriptPanel.tsx` + `.css` |
| 11 | Server env vars (optional) | `.env.example` |
| 12 | Terminal se diagnosis | `scripts/check-google-search.mjs`, `scripts/check-transcript.mjs` |
| 13 | Naye + badhe hue tests | `tests/googleSearchProxy.test.mjs` (+4 files) |

---

## 1. Google search — asli wajah, aur fix

### 1.1 Restriction hataane se kaam kyun nahi chala

Teen wajah ek saath thi:

| # | Wajah | Kya hota tha |
|---|-------|--------------|
| **a** | **Browser se seedhi request.** Browser `Origin` + `Referer` **khud lagata hai** — ye JavaScript se hataya nahi ja sakta. App teen jagah chalti hai: APK = `https://localhost` (Android) / `capacitor://localhost` (iOS), PWA = `https://eduvora.shop`, dev = `http://localhost:5173`. Key ki "Website" restriction ek origin ko hi pehchaanti hai → baaki do par `403 ipRefererBlocked`. | Console me restriction badalne se **sirf ek** origin theek hota tha; doosra phir se tootta tha. Isliye "hata diya par error aa raha hai". |
| **b** | **Galat key edit ho rahi thi.** App me key teen slot se aa sakti hai: account slot (`dc.google.searchKey.u.<uid>`) → device slot (`dc.google.searchKey`) → build constant (`VITE_GOOGLE_SEARCH_API_KEY`). Aapne jisko console me edit kiya, wo zaroori nahi ki wo ho jo app abhi bhej rahi thi. | Page par **kuch nahi dikhta tha** ki kaun si key chal rahi hai. Ab dikhta hai (fingerprint + slot). |
| **c** | **Har 403 = "referrer".** Purana classifier `accessNotConfigured` (API enable nahi) aur `ipRefererBlocked` dono ko ek hi message me daal deta tha. | Salah galat milti thi: "Website restriction me site add karo" — jabki asli problem API enable na hona thi. |

### 1.2 Fix — `/api/google-search`

Server se Google par jaane wali request par **koi Origin aur koi Referer
nahi** hota. Restriction match karne ke liye kuch hai hi nahi → **request pass
hoti hai**. Ye fix console ke kisi bhi setting par depend nahi karta.

```
Browser se:  Origin: https://localhost      ┐
             Referer: https://localhost/    ┘─▶ googleapis.com  ✗ 403 ipRefererBlocked

Server se:   (koi Origin nahi, koi Referer nahi) ─▶ googleapis.com  ✓ 200 + results
```

**Cascade** — search simply chalti hai, aur page batata hai kaun sa path jeeta:

```
query
  ├─ 1. chuni hui key, browser se seedha        (sabse sasta — restriction na ho to yahi)
  ├─ 2. wahi key, apne server ke through        (restriction yahi todta hai)  ◀── fix
  └─ 3. doosri key (school ki / learner ki)     (dono paths par — pehle jaisa handover)
```

Npm scripts: `npm run test:google-search` (client + proxy, 31 cases) aur
`npm run test:transcript` (API + runtime + tab contract, 32 cases).

Do chhote rules jo waste rok te hain:

* **Quota khatam** → server hop **skip** (proxy quota nahi badha sakta), seedha
  handover.
* **Ek baar browser me refuse** → us key ki 10 minute ki memory → agli search
  **server se shuru** (wahi 403 dobara nahi khareedte). Browser path par
  success mile to memory saaf — matlab restriction sach me hat gayi.

**Suraksha** (proxy ek open relay nahi hai):

| Cheez | Kya kiya |
|-------|----------|
| Learner ki key | **POST body** me jaati hai — query string me kabhi nahi (URL log/cache me leak hota hai) |
| Key wapas | response me **kabhi nahi** jaati; `Cache-Control: no-store` |
| School ki key | **per-IP token bucket** (12 + refill); learner ki apni key par limit nahi — wo quota Google ka apna hai |
| Query | clamp — 400 char, `start` 1–91, `num` 10, `searchType` sirf image/web |
| Timeout | 12 s — hang nahi, `timeout` code |
| Function cap | route **shared dispatcher** par chalta hai (`vercel.json` rewrite), isliye Hobby ka 12-function limit nahi tootta |

### 1.3 Jab phir bhi ruke — ab page jhooth nahi bolta

Google ka **asli status + reason + message** client tak pahunchta hai, aur codes
alag-alag hain:

| Google | Code | Page kya kehta hai |
|--------|------|--------------------|
| `ipRefererBlocked` + "Requests from **referer** …" | `referrer` | key ki website restriction |
| `ipRefererBlocked` + "Requests from **IP address** …" | `ip-blocked` | key ki IP restriction (ye alag hai — fix bhi alag) |
| `forbidden` / `PERMISSION_DENIED` | `permission` | project/key par permission |
| `accessNotConfigured` | `api-disabled` | **Custom Search API enable nahi** |
| `keyInvalid` | `invalid-key` | key galat |
| `dailyLimitExceeded` | `quota` | aaj ka quota khatam |
| `invalid` + `cx` | `invalid-cx` | Search Engine ID galat |
| proxy route deploy nahi (HTML jawab) | `proxy-unavailable` | server path nahi hai — browser wali asli wajah dikhti rahegi |

### 1.4 Settings → Google search → **"Diagnose karo"**

Ek button, do chhoti request (ek browser se, ek server se), aur saaf verdict:

```
Abhi search is key se chalti hai: AIza…x9Kd · aapki · account slot · handover: master
  Browser se seedha Google     ✗ referrer · 403 · 640ms
  App ke server ke through     ✓ chalu · 310ms
Verdict: Server path se search chalu hai — browser wali key restriction se rukti
         hai, par request apne server ke through chali jaati hai.
Steps:  1) Console me Application restrictions kholo … (exact, code se aata hai)
```

Ye `keyFingerprint` + slot batata hai — *"maine to restriction hata di thi"* ka
asli jawab: **kaun si key chal rahi hai**. Diagnose dabate hi path memory saaf
ho jaati hai, isliye ye test bhi hai aur reset bhi.

### 1.5 Library ka empty page

Pehle: *"Google ne request rok di — is key ki 'Website' restriction me …"*
(andaaza). Ab wahi line + ek detail line jisme **Google ka apna message**,
status, key fingerprint, aur **kaun-kaun se path try hue** (`browser direct →
server → master direct`) likha hota hai, aur pointer: **Settings → Google
search → "Diagnose karo"**.

---

## 2. YouTube transcript — asli wajah, aur fix

### 2.1 "No captions" jhooth tha

`ksTPzTWUb6o` par captions hain. Purana code:

| # | Purana behaviour | Natija |
|---|------------------|--------|
| **a** | Server ek hi InnerTube call karta tha. Jawab **striped** aata (YouTube ka bot mitigation: `playabilityStatus: OK` + title, par `captions` aur `streamingData` dono gayab) aur use **"captions nahi hain"** padh leta tha. | `no_captions` — ek jhooth. |
| **b** | Client us `no_captions` par **kuch try nahi karta tha** — seedha panel me error. | Video me captions hone ke bawajood "Transcript unavailable". |
| **c** | Jo fallback tha wo **deprecated** `api/timedtext?type=list` use karta tha (2023 se aksar khaali). | Fallback bhi bekaar. |
| **d** | ANDROID client se mint hui caption URL ko **WEB user-agent** se fetch karte the. | `403` — tracks milte bhi to download nahi hota. |

### 2.2 Fix — layered pipeline + honesty rules

**Server (`api/_lib/youtubeTranscript.ts`), 26 s budget:**

```
1. InnerTube /youtubei/v1/player — 6 client, 2 wave
   wave 1: ANDROID · WEB · TVHTML5_SIMPLY_EMBEDDED_PLAYER
   wave 2: IOS · MWEB · WEB_EMBEDDED_PLAYER
2. Watch page ka ytInitialPlayerResponse   (title + caption list)
3. /youtubei/v1/get_transcript            (YouTube ka apna "Show transcript" panel)
4. Legacy api/timedtext                   (sirf tab, jab koi layer blocked na ho)
   ↓ caption download: json3 → XML → VTT
   ↓ us client ke UA + c/cver ke saath jis client ne URL mint ki thi  (403 fix)
```

**Verdict ke rules** (yahi asli fix hai — tests in ko pin karte hain):

| Situation | Code | Matlab |
|-----------|------|--------|
| Koi layer `429` / bot-check / reCAPTCHA | `too_many_requests` | YouTube ne roka — thodi der me dobara |
| `ERROR` / `LOGIN_REQUIRED` / age / private | `video_unavailable` | video hi nahi khul rahi |
| **Poora** jawab (`streamingData` maujood) + captions khaali + status clean | `no_captions` | **saboot hai** — sach me captions nahi |
| **≥2 alag family** (jaise `innertube` + `watch-page`) kahein "captions nahi" | `no_captions` | do independent saboot |
| Sirf ek **adhura** jawab kehta hai "captions nahi" | `fetch_failed` | **saboot nahi** → retryable → browser apna turn leta hai |

Metadata-only embed clients ka khaali jawab **saboot nahi maana jaata** (wo
streamingData maangte hi nahi) — aur `params: "CgIQBg=="` bhi sirf unhi do par
lagta hai.

**Client (`src/course/youtubeTranscript.ts`), 9 s budget (`BROWSER_BUDGET_MS`):**
server fail hone par browser khud try karta hai — `clientFetchViaInnerTube` →
`clientFetchViaPanel` → `clientFetchViaTimedText`, ek hi AbortController ke
andar. `no_captions` par **ek** second opinion chalti hai (per key yaad rakha
jaata hai, `forgetTranscript` saaf karta hai); `bad_video` /
`video_unavailable` par nahi (wahan second opinion ka koi faida nahi).

**Player caption probe** — sabse pakka saboot, bina kisi key ke:
`ksTPzTWUb6o` chal raha player khud batata hai ki uske paas kaun si caption
tracks hain (`player.getOption("captions", "tracklist")`). Jab server
"captions nahi" kahe par player kahe "tracks hain", to panel jhooth nahi bolta:

```
Captions hain — lekin abhi download nahi ho pa rahe
Player me ye caption tracks maujood hain: English (auto-generated), Hindi.
Matlab video par captions hain — network/YouTube ne download rok diya.
Thodi der me Retry dabao.
[ Details — kya try hua (7) ▾ ]
```

Disclosure me har layer ka Hinglish naam + natija: `App ka server (Vercel)`,
`Aapke browser se YouTube transcript panel`, `YouTube ne rok diya (bot check /
429)`, tracks ki ginti, playability, note.

### 2.3 API contract (badla nahi, sirf badha)

```
GET /api/youtube-transcript?v=ksTPzTWUb6o&lang=hi[&diagnostics=1]
  ✓ {ok, videoId, title, language, languageLabel, autoGenerated, tracks[],
     segments[{start,duration,text}], truncated, fetchedAt, strategy, attempts?}
  ✗ {ok:false, code, error, videoId, attempts[]}
  status: bad_video 400 · video_unavailable/no_captions 404 · no_transcript 422
          too_many_requests 429 · timeout 504 · baaki 502
  success: Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

`attempts` (layer trail) failure par **hamesha** aata hai, success par
`?diagnostics=1` se. `strategy` batata hai kaun si layer jeeti:
`caption-track(en)` · `watch-page(hi)` · `get_transcript-panel` · `timedtext(en)`.

---

## 3. Deploy — kya karna hai

| Kadam | Kya |
|-------|-----|
| 1 | Ye branch deploy karo (Vercel). **Koi naya function nahi** — `/api/google-search` `vercel.json` ke rewrite se `api/referral-leaderboard.ts` par hi chalta hai (Hobby ka 12-function cap safe). `maxDuration: 60` pehle se hai, jo 26 s transcript budget ke liye zaroori hai. |
| 2 | *(Optional)* Vercel → Settings → Environment Variables me `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` daalo **agar** school ki key se server path chalana ho. **Na daalo to bhi chalega** — tab proxy learner ki apni key forward karta hai. |
| 3 | Console me restriction wapas laga sakte ho (**API** → Custom Search API + **Application** → Websites). Ab zaroorat nahi, par key leak se bachne ke liye behtar hai — search fir bhi chalegi. |
| 4 | APK / PWA / localhost teeno par wahi behaviour: localhost par `vite.config.ts` ka dev middleware **wahi** `handleGoogleSearch` + `handleYouTubeTranscript` chalata hai (doosri copy nahi), isliye status codes, cache headers aur `?diagnostics=1` ka layer trail dev me bilkul wahi hain jo Vercel par. *(Pehle dev middleware transcript ka apna chhota copy rakhta tha — usme trail aur cache headers nahi aate the. Ab delegate karta hai, aur ek test ise pin karta hai.)* |

---

## 4. Terminal se diagnosis (do naye script)

Sandbox me network nahi tha, isliye ye do script **aapki machine par** asli
request bhejte hain aur verdict likhte hain:

```bash
# Google — teeno path aazmata hai: browser-style (Origin+Referer ke saath),
# server-style (bina header), aur deployed /api/google-search
npm run check:google-search -- AIza… "0123…:abc…" "mimosa pudica" --api https://eduvora.shop

# Transcript — server pipeline ko LOCAL me chalata hai, har layer ka report
# likhta hai; --api se deployed route se bhi poochhta hai
npm run check:transcript -- ksTPzTWUb6o --lang hi --api https://eduvora.shop
```

Dono ke VERDICT batate hain ki problem **key/restriction** ki hai, **YouTube ka
IP block** ki hai (datacentre IP — jiska jawab browser second opinion hai), ya
video sach me caption-less hai. `check:google-search` env vars
(`GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_CX`) bhi padh leta hai; exit code
0 = koi path chala, 1 = kuch nahi chala, 2 = usage.

---

## 5. Tests

Poora suite: **4306 pass / 0 fail** (`node --test tests/*.test.mjs`, 447 files).

| Suite | Cases | Kya pin karta hai |
|-------|-------|-------------------|
| `tests/googleSearchProxy.test.mjs` **(naya)** | 11 | Google tak **na Origin na Referer**; key POST body me, response me kabhi nahi; server key / 501 honest; Google ka message verbatim; classifier (ip vs referer vs permission vs api-disabled); per-IP limit sirf school key par; clamp; timeout; `vercel.json` + dispatcher + vite wiring |
| `tests/coursePlayerGoogleSearch.test.mjs` | 14 → **20** | purana contract + **cascade**: referrer-block → server se results (via `server`, `attempts` dono); dusri search **server-first**; proxy deployed nahi (HTML) → browser ki asli wajah (`ip-blocked`); galat key → master handover; `googleSearchConfigReport` (account/device/build slot); `diagnoseGoogleSearch` verdict + steps |
| `tests/coursePlayerTranscriptApi.test.mjs` | 9 → **14** | purana contract + **honesty rules**: striped jawab → panel se transcript jeeta (`strategy: get_transcript-panel`); ek adhura jawab = `fetch_failed` (**nahi** `no_captions`); poora jawab + khaali = `no_captions`; caption download **ANDROID UA + `c=ANDROID&cver=`** ke saath; VTT/panel/params parser |
| `tests/coursePlayerTranscriptRuntime.test.mjs` | 4 → **5** | panel mount/lines/timestamp + naya: server fail par browser second opinion chalta hai aur `data-course-transcript-attempts` me **server layer ka trail** dikhta hai; browser-only panel jeet (server 429) par lines aati hain |
| `tests/coursePlayerTranscriptTabContract.test.mjs` | 12 → **13** | purana source contract (bus events, seek/progress, `s-maxage=3600`, `fmt=json3`, vercel rewrite) + **naya**: dev server transcript/Google dono ko **delegate** karta hai, doosri copy nahi rakhta |

Type-check dono tsconfig par clean (`tsconfig.json`, `tsconfig.api.json`),
production build `✓ built in 52.44s`, aur build gate (`oklch(` count in
`dist/index.html`) = **0**.

---

## 6. Imaandaar limits

* **Sandbox me internet nahi tha** — isliye `ksTPzTWUb6o` par asli YouTube
  request nahi chali. Jo cheezein **guaranteed** hain wo unit-tested hain
  (no-Origin request, honesty rules, cascade, UA fix). Jo **verify** karna hai
  wo `npm run check:transcript` se 30 second me ho jayega.
* `get_transcript` panel ka JSON shape YouTube ke apne renderer se liya gaya
  hai (`transcriptSegmentRenderer.startMs/endMs/snippet.runs`); YouTube ye badal
  sakta hai — isliye trail me har layer ka jawab dikhta hai aur shape badalne
  par bhi baaki 3 layer chalti hain.
* Server ka IP datacentre ka hai, isliye YouTube use **kabhi-kabhi** bot-check
  dega (ye humare haath me nahi). Jawab: `too_many_requests` + **browser ka
  second opinion** (learner ke apne IP se, jahan video chal hi rahi hai) +
  player caption probe. Matlab "no captions" ka jhooth kabhi nahi.
* Server path Google ke **ToS ke andar** hai (Custom Search JSON API hi call
  hoti hai, sirf caller badalta hai), par key ka quota school ke project par
  lagega jab learner apni key na de — isliye per-IP limit hai.
