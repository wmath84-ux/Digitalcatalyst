# Music in the Course Player — the footer button, the library, and the honest answer about YouTube

Owner brief (2026-10-14):

> Course player mein footer navigation mein ek aur button add karo **music** ka —
> click karne per music ka vahi already design UI jo course player ke andar hai
> vahi open ho, aur usmein **library** ka button ho. Library par click karte hi
> user har tarah ka song — poori library ka, internet ka koi bhi song — play kar
> sake. Kya aisa feature 100% possible hai, kya tarika hai? Aur batao: ham direct
> **YouTube** ko embed kar sakte hain apne course player ke andar, ya kya doosra
> tarika hai taki user direct YouTube se video koi bhi dekh sake?

Short answer up front: **the Music tab and its library are built** (one new
footer button, the existing glass player, three shelves, real search), and
**YouTube is already embedded** in the app — the Music library now makes "any
YouTube video, inside the player" a two-tap job. The one thing that is **not**
100% possible is playing a song *out of* a DRM streaming service (Spotify
Premium, JioSaavn, Gaana, Apple Music, YouTube Music) inside our own player.
Everything else is shipped.

---

## 1. One more button in the footer navigation

`src/course/CourseOverlay.tsx`

* `DockTab` grows `"music"`, and `TABS` grows one entry — **appended last**, so
  no existing tab's dock position, colour or ⌘/Ctrl+1…9 shortcut moves (only
  digits 1–9 have shortcuts, so the eleventh key simply has none).
* Plate colour `#FB7185`, icon `Music` (lucide), heading "Music".
* `src/course/CoursePeekDock.tsx` gives the plate its own letter — **`♪`**, not
  `M`, because Modules already owns that letter. The strip still renders the
  ONE `TABS` list, so there is nothing to keep in sync.

The pane is a **persistent sibling** of the keyed tab body (the trick the AI
chat and the Read library already use), so a song keeps playing while the
learner reads Notes or browses Modules. Leaving the tab does not stop the music.

## 2. The pane opens the SAME glass player the lessons use

`src/course/MusicPanel.tsx`

* Audio plays through **`src/course/AudioPlayer.tsx`** — the AI-Canvas "Glass
  Music Player" every `type: "audio"` lesson renders. No copy, no re-skin: the
  disc, the transport row, the per-song colour and the fit-to-stage scaling are
  the lesson player, so a fix there lands here too. (Pinned by a contract test:
  the pane may not build its own disc, and may not build an embed URL itself.)
* YouTube / Spotify / SoundCloud play in **that platform's own official
  player**, framed (`youtube-nocookie` embed built by the app's single
  `getCourseEmbed()`, Spotify's embed player, SoundCloud's widget).
* A video embed only mounts while the Music tab is the visible one — switching
  to Notes does not leave a video singing behind the page. Direct audio stays
  mounted and simply pauses (the glass player banks its position).

## 3. The LIBRARY button — three shelves, all playable

| Shelf | What it is | Where it comes from |
| --- | --- | --- |
| **Course audio** | every `type: "audio"` resource in this course, with its module path | read off the same course tree every other list uses, access-scoped (a locked module contributes nothing) |
| **My files** | songs picked off the learner's own device (MP3 / M4A / WAV / OGG / FLAC / AAC, 60 MB ceiling) | stored **locally** in IndexedDB (`musicDb.ts`, db `eduvora-music-tracks`) — bytes never leave the device |
| **Saved links** | a pasted YouTube / Spotify / SoundCloud / direct-audio URL | parsed by `musicLibrary.ts`, saved per learner in localStorage (`dc.music.library.v1:{uid}`) |

Details that make it feel finished:

* **A paste always works.** `parseMusicLink()` understands `youtube.com/watch`,
  `youtu.be`, `/shorts/`, `/embed/`, `music.youtube.com`, a bare 11-char id,
  Spotify links with a `/intl-de/` locale in the middle, SoundCloud pages, and
  plain `https://…/song.mp3?token=…`. Anything else is **refused with a
  sentence** that says what to paste instead — never stored as a dead row.
* **Titles come from the platform itself.** After a link is added, the pane
  asks that service's **public oEmbed endpoint** (no key, no scraping) for the
  real song name and renames the row. A failure just leaves the fallback title.
* **Search is key-gated and honest.** With a YouTube Data API v3 key configured
  (`window.__DC_YOUTUBE_API_KEY__`, or Vite `define`) the pane searches YouTube
  inside the player and plays any result in the embed. Without a key — which is
  the default — the search box filters the library instantly and the button
  hands the query to **YouTube's own search page**, whose link the learner
  pastes straight back. There is no legal, key-free way to search YouTube from
  a page: the old `listType=search` embed parameter was retired in 2020, and
  scraping `youtube.com/results` is both CORS-blocked and against the terms.
* **Storage never breaks the pane.** A refused quota, a private window, a
  corrupt payload, a foreign track object — all read as "empty shelf", never as
  a crash. Corrupt rows and non-https URLs are dropped on load.
* **The last song comes back.** `dc.music.last.v1:{uid}` remembers what was
  playing, so reopening the tab resumes it instead of starting at an empty list.

## 4. "Internet ka koi bhi song" — what is 100% and what is not

| Route | Possible? | How it works here |
| --- | --- | --- |
| Course's own audio lessons | **100%** | glass player, as before |
| The learner's own files | **100%** | local IndexedDB, glass player |
| Direct audio URLs (`https://…/x.mp3`) — archive.org, Jamendo, ccMixter, Pixabay, a creator's own CDN | **100%** | glass player (https only) |
| **YouTube** — any public video/song | **100%** | the same `youtube-nocookie` embed the lessons use (a creator *can* disable embedding — that is their switch, not ours) |
| **SoundCloud** — full tracks | **100%** | SoundCloud's own widget |
| **Spotify** tracks / albums / playlists | **100% for the embed** — 30-second preview when nobody is logged in, full track when the listener is logged into Spotify | Spotify's own embed player |
| Spotify Premium / JioSaavn / Gaana / Apple Music / YouTube Music audio **extracted into our player** | **0% — not possible, and not legal** | their streams are DRM-encrypted and their terms forbid third-party playback. Every "music downloader API" that claims otherwise is scraping, breaks monthly, and puts the app (and its stores listing) at risk |

So the honest line for the product: **we play what a platform allows us to play,
and we never pretend to play what it does not.** That is also why the feature has
no downloader, no stream extractor and no private API — a contract test asserts
those strings never appear in the code.

## 5. YouTube inside the Course Player — already there, three ways

The app has had first-class YouTube support since the resource types were
defined; **nothing new was needed to embed it**:

1. **Admin route (courses).** A resource of type `youtube` (link or video id) is
   rendered by `src/utils/courseEmbed.ts` → `https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&enablejsapi=1`,
   and `src/course/ResourceViewer.tsx` drives it through the **official IFrame
   Player API** — so switching modules pauses at the exact second and resumes
   there, the same lossless behaviour every other viewer has.
2. **Learner route (own content).** `My Modules` / `My Study Library` accepts a
   `youtube` resource the learner adds themselves (personal course registry), so
   a learner can keep their own video list inside the app.
3. **Music route (new).** Paste any YouTube link into the Music library → it is
   saved on their shelf and plays in the player immediately. That is the
   "koi bhi YouTube video, apne player ke andar" answer.

Constraints worth knowing (they are YouTube's, not ours): embeds require the
video's owner to allow embedding; **audio-only / background playback is not
allowed** by the YouTube terms (no hiding the video, no extracting the audio
track); downloads are not allowed; and inline *search* needs the Data API key
described above. Everything else — autoplay rules, full-screen, quality,
captions — is the platform's own player, which is exactly what keeps it legal
and unbreakable.

## 6. Files

| File | What it is |
| --- | --- |
| `src/course/CourseOverlay.tsx` | the `music` tab, `MUSIC_FALLBACK`, the persistent `data-course-music-tab` sibling |
| `src/course/CoursePeekDock.tsx` | the `♪` plate |
| `src/course/MusicPanel.tsx` | the pane: glass player stage, LIBRARY sheet, three shelves, paste + upload + search |
| `src/course/musicLibrary.ts` | pure data layer: link parsing, embeds, storage, course-audio collection, upload rules |
| `src/course/musicDb.ts` | the learner's own files (Dexie / IndexedDB, local only) |
| `src/course/musicSearch.ts` | key-gated YouTube Data API search, the external hand-off URL, the oEmbed title lookup |
| `src/CoursePlayerApp.tsx` | `collectCourseAudio(modules, accessibleModuleIds)` + the `musicPanel` handed to the overlay (main pane only) |

## 7. Tests

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/coursePlayerMusicLibrary.test.mjs` | 13 | every link shape parses, the YouTube embed is byte-identical to the lesson builder, unsupported/hostile links are refused, the shelf round-trips + dedupes + survives corrupt payloads and refused storage, course audio is access-scoped, upload rules (type/size/empty) |
| `tests/coursePlayerMusicPaneRuntime.test.mjs` | 7 | mounts the REAL pane: the Library button toggles the sheet, a course track plays in the real glass player (`[data-course-audio-player]` + disc) and is remembered, a pasted YouTube link becomes a row + the nocookie embed with the right src, a refused link shows its sentence and stores nothing, the no-key search hands off to YouTube's search URL, the library search filters all three shelves |
| `tests/coursePlayerMusicTabContract.test.mjs` | 9 | the tab is in the ONE `TABS` list (appended last), the pane renders the existing player (never a disc of its own, never a hand-built embed URL), the LIBRARY button + shelves, key-gated search, persistent pane, main-pane-only mounting, and no scraper anywhere |

Updated pins (the tab list legitimately grew):

* `tests/courseStripNavigationRuntime.test.mjs` — ten tabs, nine plates with one hidden.
* `tests/coursePlayerUx.test.mjs` — "ten study tabs" + `music` in the list.
* `tests/coursePlayerMindMapContract.test.mjs`, `tests/courseReadResourcesContract.test.mjs`, `tests/courseSketchIntegrationContract.test.mjs` — the `DockTab` union and the appended-tab order now end with `… "read" | "music"`.

Results on this branch:

| Run | Result |
| --- | --- |
| the three music files + the split/strip/keyboard suites | **122 tests, 119 pass, 3 fail — all 3 pre-existing** |
| full `tests/course*.test.mjs` sweep | **850 tests, 816 pass, 15 fail — the same 15 pre-existing failures as the untracked baseline, no new ones** |
| `npx tsc --noEmit` | clean |
| `npx vite build` (6 GB heap) | OK |

The runtime test earned its keep: it caught a real bug the source pins could
never see — the "different learner" effect fired on the *first* render too and
forced the library sheet open over a song the learner had left playing. The pane
now compares the uid before resetting.

## 8. Notes for the next hand

* **Never hand a jsdom element to `assert`** — a failed strict comparison makes
  node inspect the element, walk the whole window graph and OOM the runner
  (it cost this build a 3.5 GB SIGKILL). Assert on a `Boolean(...)` or a string.
* Reuse the glass player; do not fork it. If a future provider is added, its URL
  belongs in `musicLibrary.ts` next to the parser — the pane never builds one.
* A YouTube Data API key is a **public** key: it is read from
  `window.__DC_YOUTUBE_API_KEY__` (or a Vite `define`), never from
  `import.meta.env` inside the module, so the pure module still loads in every
  node harness.
* The library is **per device** today (links in localStorage, files in
  IndexedDB). Cloud sync would follow the Read-uploads pattern
  (`users/{uid}/…` + Storage) — the seam is `musicLibrary.ts` + `musicDb.ts`,
  nothing in the pane.
