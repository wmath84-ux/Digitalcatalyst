// The Music tab's wiring, pinned to the REDESIGN the owner asked for
// (2026-10-15):
//
//   "music page open hote hi header ki jagah per search bar hoga YouTube wala
//    aur use search bar ke niche horizontal tray hoga jiska color pura white
//    hoga aur use tray per sabhi button honge jo abhi already hain filter
//    button aur usmein ek aur button add karna hai URL ka, aur ine button per
//    click karne ke according list badlegi."
//
// These are source-shape assertions on purpose: the tab has to live in the SAME
// TABS list the strip renders (no second list to drift), the ONE search box has
// to change its behaviour with the filter, the ONE white tray has to render the
// ONE filter list (All first), every empty page has to come from
// `musicFilters.ts`, the player has to be the EXISTING AudioPlayer (no fork),
// every embed has to come from the platform's official surface, and no file may
// carry a scraper.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
/** Code only: a comment may NAME the services we refuse to support. */
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const overlay = read('src/course/CourseOverlay.tsx');
const strip = read('src/course/CoursePeekDock.tsx');
const player = read('src/CoursePlayerApp.tsx');
const panel = read('src/course/MusicPanel.tsx');
const list = read('src/course/MusicTrackList.tsx');
const filters = read('src/course/musicFilters.ts');
const audioPlayer = read('src/course/AudioPlayer.tsx');
const session = read('src/course/coursePanelSession.ts');
const library = read('src/course/musicLibrary.ts');
const db = read('src/course/musicDb.ts');
const search = read('src/course/musicSearch.ts');
const vite = read('vite.config.ts');
const envExample = read('.env.example');
const indexHtml = read('index.html');

test('Music is a real dock tab, appended last so no existing tab or shortcut moves', () => {
  assert.match(overlay, /export type DockTab = "modules" \| "brain" \| "notes" \| "mindmap" \| "ai" \| "paid" \| "player" \| "experiment" \| "sketch" \| "read" \| "music";/);
  assert.match(overlay, /\{ key: "music", label: "Music", heading: "Music", hint: "Music library[^"]*", color: "#FB7185", icon: Music \},/);
  // LAST entry of the tab list — the order below it (and therefore every
  // ⌘/Ctrl+1…9 shortcut) is untouched.
  assert.match(overlay, /icon: Music \},\n\];/);
  assert.match(overlay, /import \{ BookOpen, Brain, File, FileText, FlaskConical, LockKeyhole, Music, Network, NotebookPen, PenLine, ShoppingBag, Sparkles \} from "lucide-react";/);
  // The footer renders THAT list — it never keeps a copy of its own.
  assert.match(strip, /const items = TABS\.filter\(item => !hiddenTabs\.includes\(item\.key\)\)/);
  assert.match(strip, /data-work-nav-cell=\{item\.key\}/);
  assert.match(strip, /<Icon size=\{26\} \/>/);
});

test('the page opens on ONE search bar over ONE pure-white tray, the All button first', () => {
  // The search bar takes the place a header would have: it comes BEFORE the
  // tray in the DOM the pane builds.
  const barAt = panel.indexOf('data-music-searchbar');
  const trayAt = panel.indexOf('data-music-tray');
  assert.ok(barAt > 0 && trayAt > barAt, 'the search bar must sit above the white tray');
  assert.match(panel, /data-music-tray\n\s+data-music-tray-theme="white"/);
  // The tray HIDES on a scroll down and returns at the top (owner,
  // 2026-10-16+): "scroll slide karne per yah hide ho jana chahie".
  assert.match(panel, /trayAway \? "max-h-0 -translate-y-2 py-0 opacity-0" : "max-h-24 translate-y-0 py-2 opacity-100"/);
  assert.match(panel, /data-music-tray-away=\{trayAway \? "true" : "false"\}/);
  // …but never while it rides INSIDE the video player's scroller — there the
  // page's own scrolling carries it away.
  assert.match(panel, /const trayAway = !inFlow && trayScrolledAway;/);
  // ONE filter list — All FIRST — and the tray renders THAT list, never a copy.
  assert.match(filters, /export const MUSIC_FILTERS: readonly MusicFilter\[\] = \["all", "course", "device", "online", "url"\] as const;/);
  assert.match(panel, /\{MUSIC_FILTERS\.map\(\(key\) => \{/);
  assert.match(panel, /data-music-filter=\{key\}/);
  assert.match(panel, /aria-pressed=\{activeBtn\}/);
  assert.match(panel, /\{MUSIC_FILTER_LABEL\[key\]\}/);
  assert.match(panel, /\{musicFilterCount\(key, counts\)\}/);
  // …and the URL button is the NEW one in that list.
  assert.match(filters, /url: "URL",/);
  assert.match(panel, /url: <Link2 size=\{14\} \/>,/);
  assert.match(panel, /\{FILTER_ICON\[key\]\}/);
  // The tray scrolls sideways on a phone and stays centred on a wide pane.
  assert.match(panel, /flex min-w-0 flex-1 items-center gap-1\.5 overflow-x-auto rounded-full border border-slate-200 bg-white p-1/);
  assert.match(panel, /mx-auto flex w-full max-w-3xl items-center gap-2/);
  // Appended last in the dock, appended last among the filters: All is FIRST.
  assert.equal(filters.indexOf('"all", "course", "device", "online", "url"') > 0, true);
});

test('the ONE search box changes behaviour with the filter (URL becomes a URL input)', () => {
  assert.match(filters, /export const isUrlFilter = \(filter: MusicFilter\): boolean => filter === "url";/);
  assert.match(panel, /const urlMode = isUrlFilter\(filter\);/);
  assert.match(panel, /placeholder=\{MUSIC_SEARCH_PLACEHOLDER\[filter\]\}/);
  assert.match(panel, /\{\.\.\.\(urlMode \? \{ "data-music-url": "", "data-music-link": "" \} : \{ "data-music-search": "" \}\)\}/);
  // The arrow appears with the first character, and Enter does the same.
  assert.match(panel, /\{urlMode && query\.trim\(\) \? \(/);
  assert.match(panel, /data-music-url-add/);
  assert.match(panel, /data-music-add-link/);
  assert.match(panel, /<ArrowRight size=\{16\} \/>/);
  assert.match(panel, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); void submitSearch\(\); \}\}/);
  assert.match(panel, /if \(isUrlFilter\(filter\)\) \{ await addLink\(query\); return; \}/);
  // Course + Device: the same box only FILTERS that shelf — no online search.
  assert.match(panel, /const canSearchOnline = filter === "all" \|\| filter === "online" \|\| searchPageOpen;/);
  assert.match(panel, /musicQueryFilter\(shelfTracks\(source\), effectiveQuery\)/);
  assert.match(panel, /const effectiveQuery = urlMode \? "" : query;/);
  // One placeholder per filter, so a learner always knows what the box does.
  for (const placeholder of ['Songs, videos, course — dhoondo…', 'Course ke audio mein dhoondo…', 'Device ke songs mein dhoondo…', 'Online songs dhoondo…']) {
    assert.ok(filters.includes(placeholder), `the ${placeholder} hint is spelled out`);
  }
});

test('every filter has its honest empty page, and All opens a column of options', () => {
  // The owner's own wording: "jaise kuchh nahin hai to simple search to view
  // library likha ho page per … jaise course ka open karta hai vahan per agar
  // koi nahin hai to simple there is no audio from course."
  assert.match(filters, /all: "Search to view library",/);
  assert.match(filters, /course: "There is no audio from this course\.",/);
  assert.match(filters, /device: "There is no music from this device yet\.",/);
  assert.match(filters, /online: "There is no online music yet\.",/);
  assert.match(filters, /url: "There is no saved link yet\.",/);
  assert.match(panel, /<MusicEmptyPage/);
  assert.match(panel, /title=\{query\.trim\(\) && !urlMode \? MUSIC_NO_MATCH : MUSIC_EMPTY_TITLE\[filter\]\}/);
  // The All filter's centred column: Search online · Device · Course audio · URL.
  assert.match(panel, /data-music-start-options/);
  assert.match(panel, /data-music-start-option=\{option\.id\}/);
  assert.match(filters, /\{ id: "search-online", filter: "online", title: "Search online"/);
  assert.match(filters, /\{ id: "device", filter: "device", title: "Device"/);
  assert.match(filters, /\{ id: "course", filter: "course", title: "Course audio"/);
  assert.match(filters, /\{ id: "url", filter: "url", title: "URL"/);
  // …and it is shown ONLY while the library is empty.
  assert.match(filters, /export const musicStartOptionsVisible = \(filter: MusicFilter, counts: MusicLibraryCounts\): boolean =>\n  filter === "all" && counts\.total === 0;/);
  assert.match(panel, /const startOptions = musicStartOptionsVisible\(filter, counts\) && !query\.trim\(\);/);
});

test('the Device filter owns the bottom-right ＋ button, and files stay on the device', () => {
  assert.match(filters, /export const musicAddFabVisible = \(filter: MusicFilter\): boolean => filter === "device";/);
  assert.match(panel, /const addFab = musicAddFabVisible\(filter\) \? \(/);
  assert.match(panel, /data-music-add-fab/);
  assert.match(panel, /data-music-upload/);
  assert.match(panel, /className="absolute bottom-4 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-slate-950 text-white/);
  assert.match(panel, /onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/);
  assert.match(panel, /if \(id === "device"\) fileRef\.current\?\.click\(\);/);
  assert.match(panel, /const track = await storeLocalSong\(uid, file\);/);
  assert.match(panel, /accept="audio\/\*"/);
  assert.match(panel, /URL\.revokeObjectURL\(blobUrlRef\.current\)/);
  assert.match(db, /super\("eduvora-music-tracks"\)/);
  assert.match(db, /this\.version\(1\)\.stores\(\{ songs: "\[uid\+id\], uid" \}\);/);
  assert.match(db, /blob: file\.slice\(0, file\.size/);
  // Local means local: no cloud write anywhere in the music feature.
  for (const [name, source] of [['MusicPanel', panel], ['MusicTrackList', list], ['musicFilters', filters], ['musicLibrary', library], ['musicDb', db], ['musicSearch', search]]) {
    assert.doesNotMatch(codeOnly(source), /from "firebase|firebase\/|getFirestore|getStorage/, `${name} must not reach the cloud`);
  }
});

test('artwork is never washed over — a song without a picture gets an audio plate', () => {
  // The reported bug: a white-ish overlay over the search thumbnails.
  assert.doesNotMatch(codeOnly(list), /bg-white\/\d/, 'no translucent white layer over a thumbnail');
  assert.match(list, /className="absolute inset-0 h-full w-full object-cover"/);
  assert.match(list, /data-music-track-thumbnail/);
  // A song with no artwork is a real tile with its provider glyph…
  assert.match(list, /data-music-audio-tile/);
  assert.match(list, /linear-gradient\(140deg, #1f2937 0%, #0b1220 52%, #4c1d95 100%\)/);
  // …and the only thing over a picture is a hairline ring + a dark play chip.
  assert.match(list, /ring-1 ring-inset ring-white\/10/);
  assert.match(list, /bg-slate-950\/80 text-white/);
  // Two presentations, chosen by room: compact rows, or thumbnail cards.
  assert.match(list, /variant: "list" \| "grid"/);
  assert.match(list, /repeat\(auto-fit, minmax\(min\(215px, 100%\), 1fr\)\)/);
  assert.match(panel, /variant=\{source === "link" && densityMode === "grid" \? "grid" : "list"\}/);
  // ONE control, and it converts ITSELF: the glyph on it is the format the
  // very next tap gives you. No menu, no second option on screen (owner brief).
  assert.match(panel, /data-music-search-format-toggle/);
  assert.match(panel, /data-music-search-format-next=\{densityMode === "list" \? "grid" : "list"\}/);
  assert.match(panel, /const flipDensity = useCallback\(/);
  assert.doesNotMatch(panel, /data-music-view-option/);
});

test('a tap opens the lesson player at FULL AREA — no card, back arrow, library glyph', () => {
  assert.match(panel, /import AudioPlayer from "\.\/AudioPlayer";/);
  assert.match(panel, /presentation="full"/);
  assert.match(panel, /onBack=\{backToLibrary\}/);
  assert.match(panel, /onOpenLibrary=\{\(\) => setSheetOpen\(\(open\) => !open\)\}/);
  // The player itself grew the second presentation…
  assert.match(audioPlayer, /presentation\?: "card" \| "full";/);
  assert.match(audioPlayer, /const full = presentation === "full";/);
  assert.match(audioPlayer, /if \(full\) \{/);
  assert.match(audioPlayer, /data-course-audio-back/);
  assert.match(audioPlayer, /data-course-audio-library/);
  assert.match(audioPlayer, /data-audio-full-player="true"/);
  // …which fills its pane instead of wearing a card: no frame, no scaler.
  assert.match(audioPlayer, /publishVar\(stage, "--audio-ui", String\(audioStageScale\(width, height\)\)\);/);
  assert.match(audioPlayer, /publishVar\(stage, "--audio-stage-min", `\$\{Math\.min\(width, height\)\}px`\);/);
  assert.match(audioPlayer, /publishVar\(stage, "--audio-body-direction", audioStageDirection\(width, height\)\);/);
  assert.match(audioPlayer, /clamp\(104px, calc\(var\(--audio-stage-min, 300px\) \* 0\.44\), 320px\)/);
  assert.match(read('src/course/panelFit.ts'), /export function audioStageScale\(width: number, height: number\): number \{/);
  // The LESSON card is untouched: same width, same frame, same scaler.
  assert.match(audioPlayer, /className="relative isolate w-\[320px\] overflow-hidden rounded-\[32px\]"/);
  assert.match(audioPlayer, /data-course-audio-frame/);
  assert.match(audioPlayer, /data-course-audio-scaler/);
  // And the music pane still never builds an embed URL of its own.
  assert.doesNotMatch(codeOnly(panel), /youtube-nocookie\.com|w\.soundcloud\.com|open\.spotify\.com\/embed/);
  assert.match(library, /import \{ extractYouTubeId, getCourseEmbed \} from "\.\.\/utils\/courseEmbed";/);
  assert.match(library, /export const youTubeEmbedUrl = \(id: string\): string =>\n  getCourseEmbed\(/);
});

test('a video opens COMPACT: official player, draggable divider, library below', () => {
  // The divider is the app's own divider language, horizontal, and draggable.
  assert.match(panel, /data-music-player-divider/);
  assert.match(panel, /role="separator"/);
  assert.match(panel, /aria-orientation="horizontal"/);
  assert.match(panel, /onPointerDown=\{onDividerPointerDown\}/);
  assert.match(panel, /onPointerMove=\{onDividerPointerMove\}/);
  assert.match(panel, /style=\{\{ height: DIVIDER_HIT, touchAction: "none" \} as CSSProperties\}/);
  assert.match(panel, /background: DIVIDER_LINE/);
  // …and the library really is the lower half.
  assert.match(panel, /data-music-video-library/);
  assert.match(panel, /librarySurface\(\{ mode: "video", onOpenFullPage: openFullLibrary \}\)/);
  // Full screen hides the divider AND the library; coming back brings both.
  assert.match(panel, /data-music-video-fullscreen=\{fullscreen \? "true" : "false"\}/);
  // The EXTRA full-screen button is gone (owner, 2026-10-16): YouTube's own
  // player already carries the inbuilt one, so only the browser's native
  // fullscreen state is observed — never toggled from our chrome.
  assert.doesNotMatch(panel, /data-music-fullscreen-toggle/);
  assert.doesNotMatch(panel, /requestFullscreen/);
  assert.match(panel, /\{fullscreen \? \(\n        <div className="relative min-h-0 flex-1" data-music-video-pane>/);
  assert.match(panel, /const fullscreen = nativeFull;/);
  // The compact search bar is shorter and carries the arrow to the full page.
  assert.match(panel, /data-music-searchbar-layout=\{compact \? "compact" : "full"\}/);
  assert.match(panel, /searchBar\(\{\n\s+compact: mode === "video",\n\s+onOpenFullPage,/);
  // Only the library PAGE's bar opens the nested search page on focus — the
  // video pane's compact bar keeps its old behaviour.
  // EVERY surface's box opens the YouTube search page — the page, the panel
  // over the player, and the half under a playing video.
  assert.match(panel, /onSearchIntent: openSearchPage,/);
  assert.match(panel, /const searchPageActive = searchPageOpen && !urlMode;/);
  assert.match(panel, /data-music-open-library/);
  assert.match(panel, /const openFullLibrary = useCallback\(\(\) => \{\n    backToLibrary\(\);\n    chooseFilter\("all"\);/);
  // The platform's own official surface, never a rebuilt player.
  assert.match(panel, /data-music-embed=\{current\.provider\}/);
  assert.match(panel, /allow="autoplay; encrypted-media; picture-in-picture; fullscreen"/);
  assert.match(panel, /allowFullScreen/);
});

test('the footer navigation hides on a player and returns on the library page', () => {
  // One session field, published by the pane…
  assert.match(session, /export type MusicPanelSessionView = "library" \| "player";/);
  assert.match(session, /musicView: MusicPanelSessionView;/);
  assert.match(session, /musicView: "library",/);
  assert.match(session, /export const setMusicSessionView = \(view: MusicPanelSessionView\) => \{/);
  assert.match(panel, /import \{ setMusicSessionView, setSearchScrolledAway, setSearchSurface \} from "\.\/coursePanelSession";/);
  assert.match(panel, /setMusicSessionView\(view === "player" \? "player" : "library"\);/);
  assert.match(panel, /return \(\) => setMusicSessionView\("library"\);/);
  assert.match(panel, /data-music-view=\{view\}/);
  // …read by the ONE resolver both footer homes already share. Since
  // 2026-10-16 the same case also carries the search page and the scroll
  // half of a results page (see footerNavigationVisibilityContract), and
  // Settings can overrule the lot with "Visible footer navigation always".
  assert.match(session, /case "music":[\s\S]{0,400}?state\.musicView === "player"/);
  assert.match(overlay, /const footerNavigationAlways = useFooterNavigationAlways\(\);/);
  assert.match(overlay, /const immersivePage = pageRuleHidesFooter && !footerNavigationAlways;/);
  assert.match(overlay, /\$\{keyboardVisible \|\| immersivePage \? "hidden" : ""\}/);
  assert.match(strip, /const footerNavigationAlways = useFooterNavigationAlways\(\)/);
  assert.match(strip, /const immersivePage = pageRuleHidesFooter && !footerNavigationAlways/);
  assert.match(strip, /if \(keyboardVisible \|\| immersivePage\) return null/);
});

test('search is key-gated, and without a key it hands the query to YouTube itself', () => {
  assert.match(search, /export const youTubeSearchUrl = \(query: string\): string =>/);
  assert.match(search, /https:\/\/www\.youtube\.com\/results\?search_query=/);
  // The key is read as STATE, so a key injected into a live browser is noticed
  // without a reload (the pane re-subscribes to the key event).
  assert.match(panel, /const \[searchKeyReady, setSearchKeyReady\] = useState\(\(\) => youTubeSearchAvailable\(uid\)\);/);
  assert.match(panel, /data-music-search-mode=\{searchKeyReady \? "api" : "external"\}/);
  assert.match(panel, /data-music-search-run/);
  assert.match(panel, /<a\s*\n?\s*href=\{youTubeSearchUrl\(query\)\} target="_blank" rel="noopener noreferrer"\s*\n?\s*data-music-search-external/);
  assert.match(panel, /data-music-results/);
  assert.match(panel, /onPlay=\{playResult\}/);
  // The API call uses the official endpoint and a video id, nothing else.
  assert.match(search, /new URL\("https:\/\/www\.googleapis\.com\/youtube\/v3\/search"\)/);
  assert.match(search, /endpoint\.searchParams\.set\("type", "video"\)/);
});

test('the search box wears the SHARED study-search experience, not one of its own', () => {
  // ONE kit for both libraries — the Course Library's search page and this pane
  // cannot drift apart: the same sentence, the same one-second floor, the same
  // YouTube-shaped recent searches.
  assert.match(panel, /import \{\n  SearchFlashScan, SearchHistoryList, SlidingSearchText, STUDY_SEARCH_SENTENCE,\n  useScrollAwayHidden, useStudySearch,\n\} from "\.\/searchExperience";/);
  assert.match(panel, /useStudySearch<MusicTrack\[\]>\(\{ namespace: "course-music", run: runMusicSearch \}\)/);
  assert.match(panel, /const searchLoading = search\.phase === "loading";/);
  assert.match(panel, /const searched = search\.phase === "results";/);
  // The long sentence slides inside the box while it is empty and quiet.
  assert.match(panel, /<SlidingSearchText text=\{STUDY_SEARCH_SENTENCE\} \/>/);
  assert.match(panel, /!urlMode && !query && !searchFocused/);
  // The Enter button is INSIDE the pill, on its right, and it is the form's own
  // submit — so the keyboard's Enter runs exactly the same search.
  assert.match(panel, /data-music-search-run\n              data-music-search-enter/);
  assert.match(panel, /disabled=\{searchLoading \|\| !query\.trim\(\)\}/);
  // In flight, the flash scan holds the page…
  assert.match(panel, /if \(searchLoading && !urlMode\) \{/);
  assert.match(panel, /<SearchFlashScan rows=\{5\} label="YouTube par search ho raha hai" \/>/);
  // …and while the box is empty with the caret, YouTube's own history shows.
  assert.match(panel, /const showHistory = !urlMode && \(searchFocused \|\| searchPageOpen\) && !query\.trim\(\) && search\.history\.length > 0;/);
  assert.match(panel, /<SearchHistoryList\n      entries=\{search\.history\}/);
  // The placeholder still follows the FILTER (the sentence is an overlay, not
  // the placeholder itself) — the box keeps saying what this filter searches.
  assert.match(panel, /placeholder=\{MUSIC_SEARCH_PLACEHOLDER\[filter\]\}/);
});

test('a key search that finds nothing hands the query back to YouTube', () => {
  assert.match(panel, /setNotice\(\n      \(search\.results \?\? \[\]\)\.length\n        \? ""\n        : "YouTube se results nahin mile/);
  assert.match(panel, /data-music-no-results/);
  assert.match(panel, /<a href=\{youTubeSearchUrl\(query\)\} target="_blank" rel="noopener noreferrer" data-music-search-external/);
});

test('the pane pauses a video embed when its tab is left, and keeps a song alive', () => {
  // A video embed only exists while the player page is the one on screen.
  assert.match(panel, /const videoStage = isVideoCurrent && playerShown \? \(/);
  assert.match(panel, /data-music-embed=\{current\.provider\}/);
  // Direct audio is hidden, never unmounted: the song survives the library page.
  assert.match(panel, /\$\{playerShown \? "flex" : "hidden"\}/);
  assert.ok(panel.includes('{showLibrary ? librarySurface({ mode: "page" }) : null}'), 'the library page is its own surface');
  // The player's own tab truth comes from the player, not from a second guess.
  assert.match(player, /opts\.quad\s*\?\s*Object\.values\(opts\.quad\.state\.pages \?\? \{}\)\.includes\("music"\)\s*:\s*paneTab === "music"/);
  // The pane is a PERSISTENT sibling of the keyed body (the overlay's trick).
  assert.match(overlay, /data-course-music-tab/);
  assert.match(overlay, /const hideKeyedBody = \(Boolean\(props\.aiPanel\) && props\.tab === "ai"\) \|\| props\.tab === "read"\n    \|\| \(Boolean\(props\.musicPanel\) && props\.tab === "music"\);/);
  assert.match(overlay, /export const MUSIC_FALLBACK = \(/);
  assert.match(overlay, /musicPanel \?\? MUSIC_FALLBACK/);
  assert.match(overlay, /musicPanel=\{props\.musicPanel\}/);
});

test('the player hands the pane the course audio and the learner, main pane only', () => {
  assert.match(player, /import MusicPanel from "\.\/course\/MusicPanel";/);
  assert.match(player, /import \{ collectCourseAudio \} from "\.\/course\/musicLibrary";/);
  assert.match(player, /const courseAudio = useMemo\(\n    \(\) => collectCourseAudio\(modules, resolution\.accessibleModuleIds\),\n    \[modules, resolution\.accessibleModuleIds\],\n  \);/);
  assert.match(player, /musicPanel=\{opts\.extra \? undefined : \(\n\s+<MusicPanel\n\s+uid=\{user\?.id \?\? null\}\n\s+courseAudio=\{courseAudio\}/);
  // One speaker per screen: an extra pane never mounts the music tab.
  assert.match(player, /\(\["modules", "notes", "read", "paid"\] as DockTab\[\]\)\.filter\(\(tab\) => !hiddenTabs\.includes\(tab\)\)/);
});

test('the optional YouTube key is INJECTED from the environment — never hard-coded', () => {
  assert.match(vite, /import \{ defineConfig, loadEnv \} from "vite";/);
  assert.match(vite, /const env = loadEnv\(mode, process\.cwd\(\), ""\);/);
  assert.match(vite, /__DC_YOUTUBE_API_KEY__: JSON\.stringify\(env\.VITE_YOUTUBE_API_KEY \|\| ""\),/);
  assert.match(envExample, /VITE_YOUTUBE_API_KEY=/);
  assert.match(indexHtml, /window\.__DC_YOUTUBE_API_KEY__ = "%VITE_YOUTUBE_API_KEY%";/);
  assert.match(search, /const cleanKey = \(value: unknown\): string => \{/);
  // and the un-substituted placeholder is not a key (plain text: no escaping to drift).
  assert.ok(search.includes('!/^%.*%$/.test(key)'), 'the placeholder is never a key');
  assert.match(search, /export const MUSIC_YOUTUBE_KEY_STORAGE = "dc\.music\.youtubeKey";/);
  assert.match(search, /export function subscribeYouTubeKey\(listener: \(\) => void\): \(\) => void \{/);
  // The key is read WITH the account, and the pane listens for it changing.
  assert.match(panel, /subscribeYouTubeKey\(\(\) => \{/);
  assert.match(panel, /setSearchKeyReady\(youTubeSearchAvailable\(uid\)\)/);
  // A key never appears in the source, and is never logged.
  for (const source of [search, panel, library]) {
    assert.doesNotMatch(codeOnly(source), /AIza[0-9A-Za-z_-]{10,}/);
    assert.doesNotMatch(codeOnly(source), /console\.[a-z]+\([^)]*[kK]ey/);
  }
});

test('nothing in the feature scrapes a stream or bypasses a platform player', () => {
  for (const [name, source] of [['MusicPanel', panel], ['MusicTrackList', list], ['musicFilters', filters], ['musicLibrary', library], ['musicDb', db], ['musicSearch', search]]) {
    assert.doesNotMatch(codeOnly(source), /youtube-dl|ytdl|ytmp3|googlevideo|jiosaavn|saavn|gaana\.|soundcloud\.com\/[^"']*\.mp3/i, `${name} must play through official surfaces only`);
  }
  // https only, and a hard per-file ceiling.
  assert.match(library, /return url\.protocol === "https:" \? url\.toString\(\) : "";/);
  assert.match(library, /export const MUSIC_UPLOAD_MAX_BYTES = 60 \* 1024 \* 1024;/);
  assert.match(library, /export const MUSIC_LIBRARY_MAX = 200;/);
  assert.match(library, /export const MUSIC_AUDIO_EXTENSIONS = \/\\\.\(mp3\|mp2\|m4a\|m4b\|aac\|ogg\|oga\|opus\|wav\|wave\|flac\|weba\|webm\|3gp\|mpga\)/);
});
