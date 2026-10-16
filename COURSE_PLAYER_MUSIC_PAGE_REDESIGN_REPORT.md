# The Music page, rebuilt — one search bar, one white tray, five filters, and a real player page

Owner brief (2026-10-15), in full:

> Course player ke andar music player ka UI redesign karna hai, music page
> flexible design karna hai taki kisi bhi chhote se bade screen per ekadam
> badhiya sa dikhe sab kuchh. Music page open hote hi header ki jagah per
> search bar hoga YouTube wala aur use search bar ke niche horizontal tray
> hoga jiska color pura white hoga aur use tray per sabhi button honge jo abhi
> already hain filter button aur usmein ek aur button add karna hai URL ka, aur
> ine button per click karne ke according list badlegi … agar koi music na ho to
> All per center mein vertical column row ki tarah saare options dikhenge
> (search online · device · course audio · URL) … device filter per click karte
> hi bottom-right mein Plus ka icon … online filter mein vah sabhi dikhenge jo
> user search karke dekh chuka hai … URL filter mein wahi search box URL input
> ban jaaye (arrow + Enter = add) … search results ke image ke upar jo white
> overlay dikh raha hai, us problem ko fix karo … jab user kisi audio per click
> kare to audio player full screen page ka pura area le, card ki tarah na dikhe,
> library icon add karo aur top-left ke arrow se wapas library page … top-right
> ka library button remove kar do … YouTube video compact mein khule: player ke
> niche library aur beech mein draggable horizontal divider; full screen par
> divider aur library hide ho jaayein; compact wapas aane par phir dikhen …
> audio/YouTube player par footer navigation hide rahe, library page par wapas
> dikhe … aur compact shape mein search box chhota ho jaye aur right side mein
> ek arrow ho jo seedha full-screen library page par le jaaye.

Everything above is built. This note is the map of it.

---

## 1. The library page IS the page (no header, no sheet, no floating pill)

`src/course/MusicPanel.tsx`

Opening the Music tab lands on the library page, in this order, top to bottom:

| # | What | Contract hooks |
| --- | --- | --- |
| 1 | The **YouTube-style search bar** where a header used to be | `data-music-searchbar`, `data-music-search`, `data-music-searchbar-layout` |
| 2 | The **pure-white horizontal tray** with every filter button | `data-music-tray`, `data-music-tray-theme="white"`, `data-music-filters` |
| 3 | The list the active filter asks for | `data-music-body`, `data-music-section`, `data-music-track`, `data-music-list="list\|grid"` |
| 4 | The Device filter's **bottom-right ＋** | `data-music-add-fab` |

The tray renders **one list** — `MUSIC_FILTERS`, All FIRST:
**All · Course · Device · Online · URL** — with a live count on each button. It
scrolls sideways on a phone (no scrollbar), centres at `max-w-3xl` on a wide
pane, and carries the list/thumbnail switch at its right end.

## 2. One search box, five behaviours (`src/course/musicFilters.ts`)

| Filter | What the page lists | What the box does |
| --- | --- | --- |
| **All** | every shelf (Course + Device + Online), grouped with counts | free-text filter over all of them; with a key, Enter/▶ also searches YouTube |
| **Course** | this course's `type: "audio"` lessons | filters **only** the course audio |
| **Device** | the learner's own files (IndexedDB, never uploaded) | filters **only** the device songs; the ＋ button is here |
| **Online** | what the learner searched + the links they saved | free-text filter + YouTube search; results stay after a filter hop |
| **URL** | the pasted links | **the box becomes a URL input**: the arrow appears with the first character, Enter (or the arrow) adds it, and the platform's own player opens it |

Every empty page says the right thing, in the owner's own words
(`MUSIC_EMPTY_TITLE`): *Search to view library* · *There is no audio from this
course.* · *There is no music from this device yet.* · *There is no online music
yet.* · *There is no saved link yet.*

**All is special on purpose** (`musicStartOptionsVisible`): while the library is
empty it shows a centred **vertical column** of ways to start — *Search online ·
Device · Course audio · URL* — and each row routes into that filter (Device
opens the learner's picker straight away). The moment anything is in the library
(course, device, online — or a search result the learner is looking at) the
column disappears and All simply lists the music.

## 3. The artwork bug is fixed (`src/course/MusicTrackList.tsx`)

The reported "pura white white sa overlay" over search thumbnails is gone by
construction:

* a song **with** artwork paints the picture edge to edge — `object-cover`, no
  translucent wash, no white scrim, no colour layer (a test now fails the build
  if any `bg-white/*` layer ever wraps a thumbnail again);
* the only things on top are a hairline inner ring and a small **dark** play
  chip;
* a song **without** artwork — every direct audio file: course lessons, a
  `.mp3` link, a device upload — gets a proper **audio tile** (dark gradient +
  provider glyph) with its real title beside it, never an empty box;
* two presentations, chosen by room: compact rows on a narrow pane, 16:9
  thumbnail **cards** on a wide one (with a manual list/thumbnail switch).

## 4. What a tap opens

### Audio → the course's own player, at FULL AREA

`presentation="full"` on `src/course/AudioPlayer.tsx` — the same glass player
every audio lesson uses, but as a **page**:

* it FILLS its pane (no 320 px card, no scale-to-fit frame). It publishes
  `--audio-ui`, `--audio-stage-min` and `--audio-body-direction` from its own
  measurement (`audioStageScale` / `audioStageDirection` in `panelFit.ts`), so
  **dragging the Course Player's divider re-lays the real thing out** — the
  vinyl, the title, the seek bar, the transport — instead of magnifying a card;
* the disc moves **beside** the controls on a wide pane and **above** them on a
  narrow one, both solved from the pane itself;
* the top-left control is the **BACK arrow** (back to the library page), the
  **library glyph** sits on the same row, and the old floating black `Library`
  pill is **gone** — that is the one the owner flagged;
* the lesson card presentation is untouched: same width, same frame, same
  scaler, same every call site.

The song is **hidden, never unmounted** while the learner browses the library,
so music does not stop because they went back to the list. The library glyph
opens the same library surface over the player, with a close button and an
arrow through to the full-page library.

### YouTube / Spotify / SoundCloud → the platform's own player, COMPACT by default

* the official embed on top (the app's single `getCourseEmbed` builder — the
  pane never makes a URL itself),
* a **draggable horizontal divider** (the app's divider language: a 2 px yellow
  core line in a 10 px grab strip, `touch-action: none`, pointer capture,
  ↑/↓ keyboard support, aria separator) — the live drag writes straight to the
  DOM and commits on release,
* the **library below it**: the same search box (shorter), the same white tray,
  the same list, the same empty pages,
* the compact bar's **right-side arrow** jumps straight to the full-page
  library (and resets to All, like opening the tab),
* **full screen hides the divider and the library** — both the pane's own
  toggle and the browser's (the YouTube iframe's own button is detected through
  `fullscreenchange`) — and leaving full screen brings both straight back,
* the video embed only exists while the player page is on screen: leaving the
  Music tab tears it down, so nothing plays behind a Notes page.

## 5. The footer navigation follows the page, not the tab

`src/course/coursePanelSession.ts` grew one field: `musicView: "library" |
"player"`, published by the pane and read by the ONE resolver both footer homes
already share (`isFooterHiddenPage`):

* **player open** (audio or video) → the footer hides;
* **library page** → the footer is back;
* leaving the tab/pane resets it, so the footer can never be stranded hidden.

`src/CoursePlayerApp.tsx` also now passes `active={paneTab === "music"}`: leaving
the tab pauses a song (the glass player banks its position) and unmounts a
video embed; coming back resumes.

## 6. Files

| File | What changed |
| --- | --- |
| `src/course/MusicPanel.tsx` | rebuilt: search bar, white tray, five filters, empty pages, All's start column, ＋ button, audio/video player pages, the divider, full screen |
| `src/course/musicFilters.ts` | **new** — the pure filter model: labels, placeholders, empty copy, All's options, shelf routing, counts |
| `src/course/MusicTrackList.tsx` | **new** — rows/cards, the artwork rules (no wash), the audio tile, the empty page shape |
| `src/course/AudioPlayer.tsx` | the `presentation="full"` page (plus `onBack` / `onOpenLibrary`), one shared `VinylDisc`, one shared audio element |
| `src/course/panelFit.ts` | `audioStageScale` / `audioStageDirection` + their constants |
| `src/course/coursePanelSession.ts` | `musicView` + `setMusicSessionView` + the `case "music"` footer rule |
| `src/CoursePlayerApp.tsx` | `active={paneTab === "music"}` on the main pane's MusicPanel |

Deliberately **not** changed: the search/scrape rules from the last hand (key
gated Data API search, paste-always-works, oEmbed titles, https-only, local-only
device files). One thing WAS removed: the YouTube "audio mode" (a hidden iframe
playing audio only) — the owner's brief is a video player with a library under
it, and that mode was never allowed by YouTube's terms anyway.

## 7. Tests

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/coursePlayerMusicTabContract.test.mjs` | 15 | search bar above the tray, the tray is pure white, five filters with All FIRST and URL new, one box that changes behaviour per filter, every empty page + All's options column, the Device ＋, no white wash over artwork, the full-area player's shape, the video split + divider + full screen, the footer rule, and no scraper anywhere |
| `tests/coursePlayerMusicPaneRuntime.test.mjs` | 10 | mounts the REAL pane: opening state, all five empty pages, the ＋ button and the picker, per-filter filtering, URL add via arrow/Enter → official embed, the full-area player (disc, back arrow, library glyph, panel, no unmount), the video split with a **real pointer drag** (100 px → 400 px of 800 px = 50 %, aria updated), full screen hiding both and restoring both, the compact arrow, online retention, clean thumbnails, the no-key hand-off, and the pane-width layout rule |
| `tests/coursePlayerMusicLibrary.test.mjs` | 13 | unchanged — parsing, storage, access-scoped course audio, upload rules |
| `tests/coursePlayerMusicSearch.test.mjs` | 10 | unchanged — the key's three sources, the exact Data API request, the hand-off URL, oEmbed |

Updated pins (the design legitimately changed):

* `tests/coursePlayerImmersivePagesContract.test.mjs` — Music is now a case in
  the ONE resolver: the library page keeps the footer, an open player hides it;
* `tests/coursePlayerWhiteScreenRecoveryContract.test.mjs` — the MusicPanel call
  site now carries `active`;
* `tests/coursePlayerResumeCompleteToggleNotesContract.test.mjs` — the player's
  prop list grew after `onProgress` (the defaults are unchanged).

Results on this branch:

| Run | Result |
| --- | --- |
| the four music files | **48 tests, 48 pass** |
| `tests/course*.test.mjs` + `workMode*` + `lumen*` | **1009 tests, 989 pass, 0 fail, 20 skipped** |
| `npx tsc --noEmit` | clean |
| `npm run build:low-heap` | OK (43.9 s) — the plain `npm run build` OOMs on this 3 GB sandbox, which is why the low-heap script exists |

## 8. Notes for the next hand

* **The pane has no "stage" of its own any more.** `data-music-stage` still
  reports the current track's provider (compatibility), but the two places are
  `data-music-view="library"` and `data-music-view="player"`.
* **The library surface is one function, three homes** (`page`, `sheet`,
  `video`). Add a rule there and it holds everywhere — that is deliberate.
* **The full player's metrics all go through `var(--audio-ui)`**, published by
  `useFitTarget` → `publishAudioFit`. Never hard-code a px size in that branch;
  the divider drag is the reason.
* A test that hands a jsdom element to `assert` will OOM the runner (see the
  previous hand's note). Every check here is a boolean or a string.
* In this sandbox, `npm run build` needs `build:low-heap`, and a bash command
  carrying backslashes can arrive escaped — keep regex-heavy test text in files,
  not in shell heredocs.
