// The Music tab's wiring: one more button in the footer navigation, the SAME
// glass player inside it, a LIBRARY behind that, and honest sourcing rules.
//
// These are source-shape assertions on purpose: the tab has to live in the SAME
// TABS list the strip renders (no second list to drift), the pane must render
// the EXISTING player component (no fork), every embed must come from the
// platform's official surface, and no file may carry a scraper.
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
  // The footer renders THAT list — it never keeps a copy of its own — and
  // each cell is the tab's own icon (the Music glyph included) at the
  // Workspace pill's 26px, not a letter plate of its own.
  assert.match(strip, /const items = TABS\.filter\(item => !hiddenTabs\.includes\(item\.key\)\)/);
  assert.match(strip, /data-work-nav-cell=\{item\.key\}/);
  assert.match(strip, /<Icon size=\{26\} \/>/);
});

test('the pane is the EXISTING glass music player — the lesson design, not a copy', () => {
  assert.match(panel, /import AudioPlayer from "\.\/AudioPlayer";/);
  assert.match(panel, /<AudioPlayer url=\{playUrl\} name=\{current\.title\} active=\{active\} \/>/);
  // No second vinyl / disc / transport implementation in the pane.
  assert.doesNotMatch(codeOnly(panel), /vinyl|Vinyl|disc-|rounded-full bg-gradient-to-br/);
  // And the pane never builds an embed URL itself: every provider URL is made
  // in the library module, next to the parser that validated it.
  assert.doesNotMatch(codeOnly(panel), /youtube-nocookie\.com|w\.soundcloud\.com|open\.spotify\.com\/embed/);
  assert.match(library, /import \{ extractYouTubeId, getCourseEmbed \} from "\.\.\/utils\/courseEmbed";/);
  assert.match(library, /export const youTubeEmbedUrl = \(id: string\): string =>\n  getCourseEmbed\(/);
});

test('the LIBRARY button opens three shelves, and a song is always one tap away', () => {
  assert.match(panel, /data-course-music-panel/);
  assert.match(panel, /<button type="button" data-music-library-toggle onClick=\{\(\) => setSheetOpen\(\(open\) => !open\)\}/);
  assert.match(panel, /aria-expanded=\{sheetOpen\} aria-label=\{sheetOpen \? "Close the music library" : "Open the music library"\}/);
  assert.match(panel, /data-music-library-sheet/);
  assert.match(panel, /\{ shelf: "course", tracks: filterMusicTracks\(courseTracks, query\) \}/);
  assert.match(panel, /\{ shelf: "upload", tracks: filterMusicTracks\(uploads, query\) \}/);
  assert.match(panel, /\{ shelf: "link", tracks: filterMusicTracks\(links, query\) \}/);
  assert.match(panel, /data-music-section=\{shelf\} data-music-section-count=\{tracks\.length\}/);
  assert.match(panel, /data-music-track=\{track\.id\}/);
  // A row says where it came from, and the learner can bin it again.
  assert.match(panel, /\{musicRowBadge\(track\)\}/);
  assert.match(panel, /track\.source !== "course" && \(/);
});

test('the redesigned pane is one light, full-space, responsive music workspace', () => {
  // No separate Course Player page header inside Music: the player surface
  // itself owns the Library control.
  assert.doesNotMatch(panel, /CoursePageHeader|<header/);
  assert.match(panel, /data-music-library-toggle/);
  assert.match(panel, /data-music-layout=\{layoutMode\}/);
  assert.match(panel, /new ResizeObserver\(update\)/);
  assert.match(panel, /node\.clientWidth >= 640 \? "wide" : "compact"/);
  assert.match(panel, /gridTemplateColumns: sheetOpen \? "minmax\(300px, 42%\) minmax\(0, 1fr\)"/);
  assert.match(panel, /gridTemplateRows: sheetOpen \? "minmax\(240px, 42%\) minmax\(0, 1fr\)"/);
  // Library opens white/light, search first, filters directly below it.
  assert.match(panel, /data-music-library-sheet data-music-theme="light"/);
  assert.match(panel, /data-music-search placeholder/);
  assert.match(panel, /data-music-filters/);
  for (const filter of ['course', 'device', 'online']) {
    assert.match(panel, new RegExp(`data-music-filter=\\{filter\\.key\\}`));
    assert.match(panel, new RegExp(`label: "${filter === 'course' ? 'Course' : filter === 'device' ? 'Device' : 'Online'}"`));
  }
  // The direct search-page view option makes online music YouTube-like:
  // a large 16:9 thumbnail with the title underneath.
  assert.match(panel, /data-music-search-view/);
  assert.match(panel, /data-music-view-option="youtube"/);
  assert.match(panel, /Bade thumbnails/);
  assert.match(panel, /data-music-result-thumbnail/);
  assert.match(panel, /data-music-track-thumbnail/);
  assert.match(panel, /aspect-video w-full overflow-hidden/);
});

test('YouTube can be heard audio-style or watched in its embedded player', () => {
  assert.match(panel, /data-music-youtube-player data-music-youtube-mode=\{youTubeMode\}/);
  assert.match(panel, /data-music-youtube-mode-option="audio"/);
  assert.match(panel, /data-music-youtube-mode-option="video"/);
  assert.match(panel, /data-music-youtube-audio/);
  assert.match(panel, /data-music-youtube-thumbnail/);
  assert.match(panel, /data-music-youtube-play-toggle/);
  assert.match(panel, /sendYouTubeCommand\(next \? "playVideo" : "pauseVideo"\)/);
  assert.match(panel, /data-music-embed=\{current\.provider\}/);
});

test('a pasted link plays here; an unsupported one is refused with a sentence', () => {
  assert.match(panel, /data-music-link placeholder="YouTube \/ Spotify \/ SoundCloud \/ \.mp3 link paste karo"/);
  assert.match(panel, /const added = addMusicLink\(uid, raw\);/);
  assert.match(panel, /data-music-notice/);
  assert.match(panel, /setNotice\("That link is not playable here\./);
  assert.match(panel, /onKeyDown=\{\(event\) => \{ if \(event\.key === "Enter"\) void addLink\(\); \}\}/);
  // The platform's own oEmbed names the row — best effort, never blocking.
  assert.match(panel, /const title = await resolveMusicTitle\(added\.track\);/);
});

test('the learner\'s own files stay on the learner\'s device', () => {
  assert.match(panel, /import \{ listLocalSongs, removeLocalSong, songObjectUrl, storeLocalSong \} from "\.\/musicDb";/);
  assert.match(panel, /accept="audio\/\*" className="hidden" data-music-file/);
  assert.match(panel, /const track = await storeLocalSong\(uid, file\);/);
  assert.match(panel, /URL\.revokeObjectURL\(blobUrlRef\.current\)/);
  assert.match(db, /super\("eduvora-music-tracks"\)/);
  assert.match(db, /this\.version\(1\)\.stores\(\{ songs: "\[uid\+id\], uid" \}\);/);
  assert.match(db, /blob: file\.slice\(0, file\.size/);
  // Local means local: no cloud write anywhere in the music feature.
  for (const [name, source] of [['MusicPanel', panel], ['musicLibrary', library], ['musicDb', db], ['musicSearch', search]]) {
    assert.doesNotMatch(codeOnly(source), /from "firebase|firebase\/|getFirestore|getStorage/, `${name} must not reach the cloud`);
  }
});

test('search is key-gated, and without a key it hands the query to YouTube itself', () => {
  assert.match(search, /export const youTubeSearchUrl = \(query: string\): string =>/);
  assert.match(search, /https:\/\/www\.youtube\.com\/results\?search_query=/);
  // The key is read as STATE now, so a key injected into a live browser is
  // noticed without a reload (the pane re-subscribes to the key event).
  assert.match(panel, /const \[searchKeyReady, setSearchKeyReady\] = useState\(youTubeSearchAvailable\);/);
  assert.match(panel, /onClick=\{runSearch\} disabled=\{busy \|\| !query\.trim\(\)\} data-music-search-run/);
  assert.match(panel, /<a href=\{youTubeSearchUrl\(query\)\} target="_blank" rel="noopener noreferrer"\n                data-music-search-external/);
  assert.match(panel, /data-music-results/);
  assert.match(panel, /data-music-result onClick=\{/);
  // The API call uses the official endpoint and a video id, nothing else.
  assert.match(search, /new URL\("https:\/\/www\.googleapis\.com\/youtube\/v3\/search"\)/);
  assert.match(search, /endpoint\.searchParams\.set\("type", "video"\)/);
});

test('the pane pauses a video embed when its tab is left, and keeps a song alive', () => {
  // Embeds only mount while the music tab is the visible one.
  assert.match(panel, /data-music-embed=\{current\.provider\}/);
  assert.match(panel, /allow="autoplay; encrypted-media; picture-in-picture; fullscreen"/);
  assert.match(panel, /current\.provider === "audio" \|\| !stageVisible \? \(/);
  // Direct audio stays mounted through a tab switch (the glass player banks its
  // position), so the pane itself is a PERSISTENT sibling of the keyed body.
  assert.match(overlay, /data-course-music-tab/);
  assert.match(overlay, /\{props\.musicPanel \? \(\n        <div\n          className=\{`h-full min-h-0 flex-1 flex-col overflow-hidden \$\{props\.tab === "music" \? "flex" : "hidden"\}`\}/);
  assert.match(overlay, /hidden=\{props\.tab !== "music"\}/);
  assert.match(overlay, /const hideKeyedBody = \(Boolean\(props\.aiPanel\) && props\.tab === "ai"\) \|\| props\.tab === "read"\n    \|\| \(Boolean\(props\.musicPanel\) && props\.tab === "music"\);/);
  // A call site with no panel still gets a hint, never a blank surface.
  assert.match(overlay, /export const MUSIC_FALLBACK = \(/);
  assert.match(overlay, /musicPanel \?\? MUSIC_FALLBACK/);
  assert.match(overlay, /musicPanel=\{props\.musicPanel\}/);
});

test('the player hands the pane the course audio and the learner, main pane only', () => {
  assert.match(player, /import MusicPanel from "\.\/course\/MusicPanel";/);
  assert.match(player, /import \{ collectCourseAudio \} from "\.\/course\/musicLibrary";/);
  assert.match(player, /const courseAudio = useMemo\(\n    \(\) => collectCourseAudio\(modules, resolution\.accessibleModuleIds\),\n    \[modules, resolution\.accessibleModuleIds\],\n  \);/);
  assert.match(player, /musicPanel=\{opts\.extra \? undefined : \(\n        <MusicPanel uid=\{user\?\.id \?\? null\} courseAudio=\{courseAudio\} \/>\n      \)\}/);
  // One speaker per screen: an extra pane never mounts the music tab.
  assert.match(player, /\(\["modules", "notes", "read", "paid"\] as DockTab\[\]\)\.filter\(\(tab\) => !hiddenTabs\.includes\(tab\)\)/);
});

test('the optional YouTube key is INJECTED from the environment — never hard-coded', () => {
  // Build: `VITE_YOUTUBE_API_KEY` reaches the client as one plain constant, so
  // the feature module stays free of `import.meta` and still loads in node.
  assert.match(vite, /import \{ defineConfig, loadEnv \} from "vite";/);
  assert.match(vite, /const env = loadEnv\(mode, process\.cwd\(\), ""\);/);
  assert.match(vite, /__DC_YOUTUBE_API_KEY__: JSON\.stringify\(env\.VITE_YOUTUBE_API_KEY \|\| ""\),/);
  assert.match(envExample, /VITE_YOUTUBE_API_KEY=/);
  // Dev has no identifier replacement, so the key rides in on the document —
  // with the placeholder treated as "not configured".
  assert.match(indexHtml, /window\.__DC_YOUTUBE_API_KEY__ = "%VITE_YOUTUBE_API_KEY%";/);
  assert.match(search, /const cleanKey = \(value: unknown\): string => \{/);
  assert.match(search, /return key && !\/\^%\.\*%\$\/\.test\(key\) \? key : "";/);
  // The three sources, in order: build constant → served global → local override.
  assert.match(search, /declare const __DC_YOUTUBE_API_KEY__: string \| undefined;/);
  assert.match(search, /export const MUSIC_YOUTUBE_KEY_STORAGE = "dc\.music\.youtubeKey";/);
  assert.match(search, /export function subscribeYouTubeKey\(listener: \(\) => void\): \(\) => void \{/);
  // The pane re-reads it live, so a key set in a live browser shows the button.
  assert.match(panel, /const \[searchKeyReady, setSearchKeyReady\] = useState\(youTubeSearchAvailable\);/);
  assert.match(panel, /useEffect\(\(\) => subscribeYouTubeKey\(\(\) => setSearchKeyReady\(youTubeSearchAvailable\(\)\)\), \[\]\);/);
  assert.match(panel, /data-music-search-mode=\{searchKeyReady \? "api" : "external"\}/);
  // A key never appears in the source, and is never logged.
  for (const source of [search, panel, library]) {
    assert.doesNotMatch(codeOnly(source), /AIza[0-9A-Za-z_-]{10,}/);
    assert.doesNotMatch(codeOnly(source), /console\.[a-z]+\([^)]*[kK]ey/);
  }
});

test('a key search that finds nothing hands the query back to YouTube', () => {
  assert.match(panel, /setNotice\(found\.length \? "" : "YouTube se results nahin mile/);
  assert.match(panel, /data-music-no-results/);
  assert.match(panel, /<a href=\{youTubeSearchUrl\(query\)\} target="_blank" rel="noopener noreferrer" data-music-search-external/);
});

test('nothing in the feature scrapes a stream or bypasses a platform player', () => {
  for (const [name, source] of [['MusicPanel', panel], ['musicLibrary', library], ['musicDb', db], ['musicSearch', search]]) {
    assert.doesNotMatch(codeOnly(source), /youtube-dl|ytdl|ytmp3|googlevideo|jiosaavn|saavn|gaana\.|soundcloud\.com\/[^"']*\.mp3/i, `${name} must play through official surfaces only`);
  }
  // https only, and a hard per-file ceiling.
  assert.match(library, /return url\.protocol === "https:" \? url\.toString\(\) : "";/);
  assert.match(library, /export const MUSIC_UPLOAD_MAX_BYTES = 60 \* 1024 \* 1024;/);
  assert.match(library, /export const MUSIC_LIBRARY_MAX = 200;/);
  assert.match(library, /export const MUSIC_AUDIO_EXTENSIONS = \/\\\.\(mp3\|mp2\|m4a\|m4b\|aac\|ogg\|oga\|opus\|wav\|wave\|flac\|weba\|webm\|3gp\|mpga\)/);
});
