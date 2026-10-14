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

test('Music is a real dock tab, appended last so no existing tab or shortcut moves', () => {
  assert.match(overlay, /export type DockTab = "modules" \| "brain" \| "notes" \| "mindmap" \| "ai" \| "paid" \| "player" \| "experiment" \| "sketch" \| "read" \| "music";/);
  assert.match(overlay, /\{ key: "music", label: "Music", heading: "Music", hint: "Music library[^"]*", color: "#FB7185", icon: Music \},/);
  // LAST entry of the tab list — the order below it (and therefore every
  // ⌘/Ctrl+1…9 shortcut) is untouched.
  assert.match(overlay, /icon: Music \},\n\];/);
  assert.match(overlay, /import \{ BookOpen, Brain, FileText, FlaskConical, Music, Network, NotebookPen, PenLine, ShoppingBag, Sparkles \} from "lucide-react";/);
  // The footer strip renders THAT list — it never keeps a copy of its own.
  assert.match(strip, /const items = TABS\.filter\(item => !hiddenTabs\.includes\(item\.key\)\)/);
  assert.match(strip, /music: \['♪', 'Music'\],/);
  // "M" is Modules' letter — the music plate uses the note glyph instead.
  assert.doesNotMatch(strip, /music: \['M'/);
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
  assert.match(panel, /const searchKeyReady = youTubeSearchAvailable\(\);/);
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
