// src/course/MusicPanel.tsx
//
// Course Player → the MUSIC tab of the footer navigation.
//
// Owner brief (2026-10-14):
//
//   "Course player mein footer navigation mein ek aur button add karo music
//    ka — click karne par music ka vahi already design UI jo course player ke
//    andar hai vahi open ho, aur usmein LIBRARY ka button ho. Library par click
//    karte hi user har tarah ka song — poori library ka, internet ka koi bhi
//    song — play kar sake."
//
// ── Same player, no fork ──────────────────────────────────────────────────
// The "already designed UI" is the AI Canvas Glass Music Player the lessons
// use (`src/course/AudioPlayer.tsx`). This pane renders THAT component — no
// copy, no restyle — so the disc, the transport row and the per-song colour
// are byte-identical to the lesson player, and a fix there lands here too.
//
// ── The LIBRARY (the button inside the player) ────────────────────────────
// One responsive library workspace, three shelves, all of it playable:
//
//   · COURSE AUDIO — every `type: "audio"` resource in this course, with its
//     module path. Already in the player; now it is one tap away.
//   · MY FILES     — the learner's own songs, picked off the device. They are
//     stored locally (IndexedDB, `musicDb.ts`) and never uploaded anywhere.
//   · LINKS        — a pasted YouTube / Spotify / SoundCloud / direct-audio
//     URL. Each one plays through that platform's OWN official surface: the
//     same youtube-nocookie embed the lessons use, Spotify's embed player,
//     SoundCloud's widget, or the glass player itself for a plain file.
//
// Search goes through YouTube's official Data API when a key is configured
// (`musicSearch.ts`) and otherwise hands the query to YouTube's own search
// page, whose link the learner pastes straight back — which this library
// plays. Nothing here scrapes a stream or bypasses a platform's player.
//
// ── Playing while the learner studies ─────────────────────────────────────
// The pane takes the same `active` flag every player surface does: leaving the
// tab pauses a song (the glass player banks its position; an embed is
// unmounted so it cannot keep singing behind a Notes page) and coming back
// resumes it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, ExternalLink, LayoutGrid, Library, Link2, LoaderCircle, MonitorPlay, Music, Music2,
  Pause, Play, Rows3, Search, Trash2, Upload, X,
} from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import { toast } from "../components/ui/glass-toast";
import {
  MUSIC_UPLOAD_MAX_BYTES, addMusicLink, filterMusicTracks, loadLastMusic, loadMusicLinks,
  musicRowBadge, removeMusicLink, saveLastMusic, saveMusicLinks, youTubeIdFrom,
  youTubeThumbnailUrl, type MusicTrack,
} from "./musicLibrary";
import { listLocalSongs, removeLocalSong, songObjectUrl, storeLocalSong } from "./musicDb";
import {
  resolveMusicTitle, searchYouTube, subscribeYouTubeKey, youTubeSearchAvailable, youTubeSearchUrl,
} from "./musicSearch";

interface MusicPanelProps {
  /** The signed-in learner — the library and the local songs are keyed on it. */
  uid?: string | null;
  /** Every audio resource this course ships (`collectCourseAudio`). */
  courseAudio?: MusicTrack[];
  /** False while the pane is mounted but off screen: playback pauses. */
  active?: boolean;
}

type Shelf = "course" | "upload" | "link";
type LibraryFilter = "all" | "course" | "device" | "online";
type OnlineView = "list" | "youtube";
type YouTubeDisplayMode = "audio" | "video";
type MusicLayoutMode = "compact" | "wide";

const SHELF_TITLE: Record<Shelf, string> = {
  course: "Course",
  upload: "Device",
  link: "Online",
};

const SHELF_EMPTY: Record<Shelf, string> = {
  course: "This course has no audio lesson yet.",
  upload: "No songs from your device yet.",
  link: "No links saved yet.",
};

const providerIcon = (track: MusicTrack) =>
  track.provider === "youtube" ? <Play size={15} />
    : track.provider === "soundcloud" ? <Music2 size={15} />
    : track.provider === "spotify" ? <Music size={15} />
    : <AudioLines size={15} />;

/** Search artwork travels with the row; older/pasted YouTube rows derive it. */
const thumbnailForTrack = (track: MusicTrack): string =>
  track.thumbnailUrl || (track.provider === "youtube" ? youTubeThumbnailUrl(youTubeIdFrom(track.url)) : "");

export default function MusicPanel({ uid = null, courseAudio = [], active = true }: MusicPanelProps) {
  const [links, setLinks] = useState<MusicTrack[]>(() => loadMusicLinks(uid));
  const [uploads, setUploads] = useState<MusicTrack[]>([]);
  const [current, setCurrent] = useState<MusicTrack | null>(() => loadLastMusic(uid));
  const [sheetOpen, setSheetOpen] = useState(() => !loadLastMusic(uid));
  const [query, setQuery] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [playUrl, setPlayUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** The blob URL currently held for a local song — revoked before the next one. */
  const blobUrlRef = useRef("");
  /**
   * A YouTube Data API key is what turns the search box into an in-player
   * result list (`musicSearch.ts`). It is read at render, and re-read the
   * moment a key is injected or cleared, so the owner can set one in a live
   * browser and watch the button appear.
   */
  const [searchKeyReady, setSearchKeyReady] = useState(youTubeSearchAvailable);
  const [searched, setSearched] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [onlineView, setOnlineView] = useState<OnlineView>("list");
  const [youTubeMode, setYouTubeMode] = useState<YouTubeDisplayMode>("video");
  const [youTubePlaying, setYouTubePlaying] = useState(false);
  const [layoutMode, setLayoutMode] = useState<MusicLayoutMode>("compact");
  const panelRef = useRef<HTMLElement>(null);
  const youTubeFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => subscribeYouTubeKey(() => setSearchKeyReady(youTubeSearchAvailable())), []);

  /**
   * The split pane — not the browser viewport — decides the workspace shape.
   * A wide pane puts the library beside the player; a narrow one stacks the
   * library inside the same available area, below the player. Watching the
   * panel itself means dragging the Course Player divider reflows it live.
   */
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return undefined;
    const update = () => setLayoutMode(node.clientWidth >= 640 ? "wide" : "compact");
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * Load the learner's own files. A local database that refuses (private
   * window, no IndexedDB) is not an error worth a banner: the shelf simply
   * shows its empty state and every other shelf keeps working.
   */
  useEffect(() => {
    let cancelled = false;
    if (!uid) { setUploads([]); return () => { cancelled = true; }; }
    listLocalSongs(uid).then((rows) => { if (!cancelled) setUploads(rows); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [uid]);

  /**
   * A different learner (or a sign-out) starts from THEIR shelf. This must not
   * run on the first render — the initial state already read storage, and
   * re-reading here would force the library open over a song the learner had
   * left playing (pinned by the music pane runtime test).
   */
  const uidRef = useRef(uid);
  useEffect(() => {
    if (uidRef.current === uid) return;
    uidRef.current = uid;
    setLinks(loadMusicLinks(uid));
    setCurrent(loadLastMusic(uid));
    setSheetOpen(true);
  }, [uid]);

  /**
   * Resolve what the stage actually plays: a stored song needs a blob URL from
   * the local database; every other provider already carries its URL.
   */
  useEffect(() => {
    let cancelled = false;
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
    const localId = current?.localId;
    if (!localId) { setPlayUrl(current?.url || ""); return () => { cancelled = true; }; }
    if (!uid) { setPlayUrl(""); setNotice("Sign in to play a file saved on this device."); return () => { cancelled = true; }; }
    setResolving(true);
    songObjectUrl(uid, localId).then((url) => {
      if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
      blobUrlRef.current = url || "";
      setPlayUrl(url || "");
      setResolving(false);
      if (!url) setNotice("That file is no longer stored on this device — add it again.");
    }).catch(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [uid, current]);

  const select = useCallback((track: MusicTrack) => {
    setCurrent(track);
    saveLastMusic(uid, track);
    setNotice("");
    // Wide workspaces keep the library beside the playing song. Compact
    // workspaces return to the full player so the chosen song gets the area.
    if (layoutMode === "compact") setSheetOpen(false);
  }, [layoutMode, uid]);

  const courseTracks = courseAudio;
  const shelves: Array<{ shelf: Shelf; tracks: MusicTrack[] }> = useMemo(() => ([
    { shelf: "course", tracks: filterMusicTracks(courseTracks, query) },
    { shelf: "upload", tracks: filterMusicTracks(uploads, query) },
    { shelf: "link", tracks: filterMusicTracks(links, query) },
  ]), [courseTracks, uploads, links, query]);

  const total = courseTracks.length + uploads.length + links.length;
  const visibleShelves = shelves.filter(({ shelf }) =>
    libraryFilter === "all"
    || (libraryFilter === "course" && shelf === "course")
    || (libraryFilter === "device" && shelf === "upload")
    || (libraryFilter === "online" && shelf === "link"));
  const showSearchResults = results.length > 0 && (libraryFilter === "all" || libraryFilter === "online");
  const libraryFilters: Array<{ key: LibraryFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: total },
    { key: "course", label: "Course", count: courseTracks.length },
    { key: "device", label: "Device", count: uploads.length },
    { key: "online", label: "Online", count: links.length },
  ];

  useEffect(() => {
    setYouTubePlaying(false);
  }, [current?.id]);

  /** The official embed accepts the IFrame API's own command channel. */
  const sendYouTubeCommand = useCallback((func: "playVideo" | "pauseVideo") => {
    const frame = youTubeFrameRef.current;
    if (!frame?.contentWindow) return;
    let origin = "*";
    try {
      origin = new URL(frame.src).origin;
    } catch {
      /* the frame's own origin is only a postMessage target, never a URL we build */
    }
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      origin,
    );
  }, []);

  const chooseYouTubeMode = useCallback((mode: YouTubeDisplayMode) => {
    setYouTubeMode(mode);
    if (mode === "audio") {
      // Start from a known state under the artwork: the learner presses the
      // large audio control when they want the sound to begin.
      setYouTubePlaying(false);
      sendYouTubeCommand("pauseVideo");
    }
  }, [sendYouTubeCommand]);

  const toggleYouTubePlayback = useCallback(() => {
    const next = !youTubePlaying;
    setYouTubePlaying(next);
    sendYouTubeCommand(next ? "playVideo" : "pauseVideo");
  }, [sendYouTubeCommand, youTubePlaying]);

  /** Add a pasted link, then rename the row from the platform's own oEmbed. */
  const addLink = useCallback(async () => {
    const raw = linkDraft.trim();
    if (!raw) return;
    const added = addMusicLink(uid, raw);
    if (!added) {
      setNotice("That link is not playable here. Paste a YouTube, Spotify or SoundCloud link, or a direct .mp3 / .m4a file.");
      return;
    }
    setLinkDraft("");
    setLinks(added.tracks);
    select(added.track);
    setNotice("");
    // The platform's own oEmbed knows the real song name — ask it once, and
    // rename the row in place. A failure just leaves the fallback title.
    if (added.track.provider !== "audio") {
      const title = await resolveMusicTitle(added.track);
      if (!title) return;
      const renamed = { ...added.track, title };
      const next = loadMusicLinks(uid).map((row) => (row.id === renamed.id ? renamed : row));
      saveMusicLinks(uid, next);
      setLinks(next);
      setCurrent((current) => (current && current.id === renamed.id ? renamed : current));
    }
  }, [linkDraft, uid, select]);

  const onPickFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!uid) { setNotice("Sign in to save a song from this device."); return; }
    setBusy(true);
    try {
      const track = await storeLocalSong(uid, file);
      const rows = await listLocalSongs(uid);
      setUploads(rows);
      select(track);
      toast({ title: `“${track.title}” added to My files`, variant: "success", duration: 2200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Songs are capped at ${Math.round(MUSIC_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`;
      setNotice(message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [uid, select]);

  const forget = useCallback(async (track: MusicTrack) => {
    if (track.source === "upload" && uid && track.localId) {
      await removeLocalSong(uid, track.localId);
      setUploads(await listLocalSongs(uid));
    } else {
      setLinks(removeMusicLink(uid, track.id));
    }
    if (current?.id === track.id) { setCurrent(null); saveLastMusic(uid, null); }
  }, [uid, current]);

  const runSearch = useCallback(async () => {
    const text = query.trim();
    if (!text || !searchKeyReady) return;
    setBusy(true);
    const found = await searchYouTube(text);
    setResults(found);
    setSearched(true);
    setLibraryFilter("online");
    // A key can be valid and still return nothing (quota, offline, a
    // filter). Say so, and hand the query to YouTube itself.
    setNotice(found.length ? "" : "YouTube se results nahin mile (quota ya network). Neeche wale link se YouTube par search karo, phir link yahan paste kar do.");
    setBusy(false);
  }, [query, searchKeyReady]);

  const stageVisible = Boolean(current) && active;
  const embed = current && current.provider !== "audio" ? current.embedUrl : "";

  const workspaceStyle = layoutMode === "wide"
    ? { gridTemplateColumns: sheetOpen ? "minmax(300px, 42%) minmax(0, 1fr)" : "minmax(0, 1fr)" }
    : { gridTemplateRows: sheetOpen ? "minmax(240px, 42%) minmax(0, 1fr)" : "minmax(0, 1fr)" };

  return (
    <section ref={panelRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f6f7f9] text-slate-900" data-course-music-panel data-music-active={active ? "true" : "false"}>
      {/* No separate page header: the player itself owns the whole surface,
          and its Library control lives inside that surface. On a wide split
          the library takes the neighbouring column; on a narrow split it
          takes the lower part of this same workspace. The stage stays in
          the same grid cell either way, so opening the library never
          unmounts a playing song. */}
      <div
        className="grid min-h-0 min-w-0 flex-1"
        data-music-layout={layoutMode}
        data-music-library-open={sheetOpen ? "true" : "false"}
        style={workspaceStyle}
      >
      {/* ── Stage: the full-space music player ─────────────────────────── */}
      <div
        className={`relative grid min-h-0 min-w-0 place-items-center overflow-hidden ${layoutMode === "wide" && sheetOpen ? "border-r border-slate-200" : ""} ${layoutMode === "compact" && sheetOpen ? "border-b border-slate-200" : ""}`}
        style={{
          background:
            "radial-gradient(circle at 12% 0%, rgba(244, 114, 182, 0.20), transparent 34%), radial-gradient(circle at 88% 8%, rgba(99, 102, 241, 0.18), transparent 36%), linear-gradient(145deg, #ffffff 0%, #eef2ff 56%, #fdf2f8 100%)",
        }}
        data-music-stage={current ? current.provider : "empty"}
      >
        {!current ? (
          <div className="grid max-w-md gap-3 px-5 py-16 text-center" data-music-empty>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-slate-950 text-white shadow-xl shadow-indigo-200">
              <AudioLines size={28} />
            </span>
            <p className="text-xl font-black tracking-tight text-slate-950">Apna music library kholo</p>
            <p className="text-sm font-medium leading-6 text-slate-500">
              Course ke audio lessons, device ke apne songs, aur YouTube / Spotify / SoundCloud links — sab ek jagah.
            </p>
            <button type="button" onClick={() => setSheetOpen(true)}
              className="mx-auto inline-flex h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-xs font-black text-white shadow-lg shadow-slate-300 hover:bg-slate-800">
              <Library size={15} /> Library kholo
            </button>
          </div>
        ) : resolving ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3.5 py-2 text-[11px] font-semibold text-slate-600 shadow-sm">
            <LoaderCircle size={15} className="animate-spin" /> Song load ho raha hai…
          </span>
        ) : current.provider === "youtube" && stageVisible && embed ? (
          <div className="absolute inset-0 min-h-0 overflow-hidden bg-black" data-music-youtube-player data-music-youtube-mode={youTubeMode}>
            {youTubeMode === "audio" ? (
              <div className="absolute inset-0 overflow-y-auto bg-[#f8fafc] px-5 pb-16 pt-14 text-center" data-music-youtube-audio>
                <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-[26px] bg-slate-950 shadow-2xl shadow-slate-300">
                    {thumbnailForTrack(current) ? (
                      <img src={thumbnailForTrack(current)} alt="" className="h-full w-full object-cover" data-music-youtube-thumbnail />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-white"><Play size={44} /></span>
                    )}
                    <span className="absolute inset-0 bg-slate-950/10" aria-hidden="true" />
                  </div>
                  <h2 className="mt-5 line-clamp-2 text-xl font-black leading-tight tracking-tight text-slate-950">{current.title}</h2>
                  <p className="mt-1 max-w-full truncate text-sm font-semibold text-slate-500">{current.subtitle}</p>
                  <button type="button" onClick={toggleYouTubePlayback} data-music-youtube-play-toggle
                    aria-label={youTubePlaying ? `Pause ${current.title}` : `Play ${current.title}`}
                    className="mt-5 grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-white shadow-xl shadow-slate-300 transition hover:scale-105 hover:bg-slate-800">
                    {youTubePlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" className="ml-1" />}
                  </button>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Audio mode · official YouTube player</p>
                </div>
              </div>
            ) : null}
            <iframe
              ref={youTubeFrameRef}
              key={embed}
              data-music-embed={current.provider}
              src={embed}
              title={current.title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={() => { if (youTubeMode === "audio") sendYouTubeCommand("pauseVideo"); }}
              className={youTubeMode === "video"
                ? "absolute inset-0 h-full w-full border-0 bg-black"
                : "pointer-events-none absolute bottom-2 right-2 h-[2px] w-[2px] border-0 opacity-0"}
            />
            <div className="absolute left-3 top-3 z-30 flex rounded-full border border-white/60 bg-white/90 p-1 shadow-lg shadow-slate-950/10 backdrop-blur" data-music-youtube-mode-control>
              <button type="button" onClick={() => chooseYouTubeMode("audio")} data-music-youtube-mode-option="audio"
                aria-pressed={youTubeMode === "audio"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black ${youTubeMode === "audio" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"}`}>
                <AudioLines size={13} /> Audio
              </button>
              <button type="button" onClick={() => chooseYouTubeMode("video")} data-music-youtube-mode-option="video"
                aria-pressed={youTubeMode === "video"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black ${youTubeMode === "video" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"}`}>
                <MonitorPlay size={13} /> Video
              </button>
            </div>
          </div>
        ) : current.provider === "audio" || !stageVisible ? (
          // A direct file (course lesson or the learner's own upload) keeps the
          // glass player MOUNTED through a tab switch — it pauses and banks its
          // position, exactly like an audio lesson does.
          current.provider === "audio" && playUrl ? (
            <AudioPlayer url={playUrl} name={current.title} active={active} />
          ) : (
            <p data-music-paused className="mx-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-[11px] font-bold text-slate-700 shadow-sm">
              <Pause size={14} /> Playback paused — {current.title}
            </p>
          )
        ) : embed ? (
          // The platform's own player, framed. `allow` carries exactly what a
          // media embed needs and nothing more.
          <iframe
            key={embed}
            data-music-embed={current.provider}
            src={embed}
            title={current.title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0 bg-black"
          />
        ) : (
          <p className="px-5 text-center text-[11px] font-semibold text-slate-500">Ye song abhi load nahi ho paya.</p>
        )}

        {/* The Library control belongs to the player surface itself — never
            to a separate page header. */}
        <button type="button" data-music-library-toggle onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen} aria-label={sheetOpen ? "Close the music library" : "Open the music library"}
          className="absolute right-3 top-3 z-40 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3.5 text-[11px] font-black text-slate-800 shadow-lg shadow-slate-950/10 backdrop-blur hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          {sheetOpen ? <X size={14} /> : <Library size={14} />}
          Library
        </button>
      </div>

      {/* ── Library: white, light, and searched from the very top ─────── */}
      {sheetOpen && (
        <aside className="flex min-h-0 min-w-0 flex-col bg-white text-slate-900" data-music-library-sheet data-music-theme="light">
          <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-3 pb-3 pt-3 sm:px-4">
            <div className="flex items-center gap-2"
              data-music-search-mode={searchKeyReady ? "api" : "external"}>
              <span className="relative min-w-0 flex-1">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && searchKeyReady) void runSearch(); }}
                  data-music-search placeholder="Library mein dhoondo…" aria-label="Search the music library"
                  className="h-11 w-full rounded-full border border-slate-300 bg-white pl-10 pr-9 text-sm text-slate-900 shadow-[0_2px_10px_rgba(15,23,42,0.06)] outline-none placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10" />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear music search"
                    className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X size={14} />
                  </button>
                ) : null}
              </span>
              {searchKeyReady ? (
                <button type="button" onClick={runSearch} disabled={busy || !query.trim()} data-music-search-run
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-4 text-[11px] font-black text-white shadow-md shadow-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />} YouTube
                </button>
              ) : (
                // No API key: hand the query to YouTube itself. An ANCHOR, so it
                // opens correctly in a browser, a PWA and the native shell alike.
                <a href={youTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer"
                data-music-search-external
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 text-[11px] font-black text-slate-800 shadow-sm hover:bg-slate-50">
                  <ExternalLink size={14} /> YouTube
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Music library filters" data-music-filters>
              {libraryFilters.map((filter) => (
                <button key={filter.key} type="button" onClick={() => setLibraryFilter(filter.key)}
                  data-music-filter={filter.key} data-active={libraryFilter === filter.key ? "true" : "false"}
                  aria-pressed={libraryFilter === filter.key}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition ${libraryFilter === filter.key ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}>
                  {filter.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${libraryFilter === filter.key ? "bg-white/15 text-white" : "bg-white text-slate-400"}`}>{filter.count}</span>
                </button>
              ))}
              <span className="ml-auto hidden text-[10px] font-semibold text-slate-400 min-[420px]:inline">
                {total} saved & course song{total === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2" data-music-search-view>
                <span className="text-[11px] font-bold text-slate-500">Online results ka view</span>
                <span className="flex rounded-full bg-slate-100 p-1">
                  <button type="button" onClick={() => setOnlineView("list")} data-music-view-option="list"
                    aria-pressed={onlineView === "list"}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-black ${onlineView === "list" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    <Rows3 size={13} /> List
                  </button>
                  <button type="button" onClick={() => setOnlineView("youtube")} data-music-view-option="youtube"
                    aria-pressed={onlineView === "youtube"}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-black ${onlineView === "youtube" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    <LayoutGrid size={13} /> Bade thumbnails
                  </button>
                </span>
            </div>

            {/* Add rows stay available under the filters: a link, or a file
                off the device. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative min-w-[180px] flex-1">
                <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void addLink(); }}
                  data-music-link placeholder="YouTube / Spotify / SoundCloud / .mp3 link paste karo"
                  aria-label="Paste a song link"
                  className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-8 pr-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:bg-white" />
              </span>
              <button type="button" onClick={() => void addLink()} disabled={!linkDraft.trim()} data-music-add-link
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-3.5 text-[11px] font-black text-white hover:bg-slate-800 disabled:opacity-50">
                <Play size={14} /> Add
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} data-music-upload
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} Device se
              </button>
              <input ref={fileRef} type="file" accept="audio/*" className="hidden" data-music-file
                aria-label="Choose an audio file from this device"
                onChange={(event) => void onPickFile(event.target.files?.[0])} />
            </div>
          </div>

          {notice && (
            <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" data-music-notice>
              {notice}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
            {searchKeyReady && searched && results.length === 0 && (
              <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" data-music-no-results>
                YouTube se kuch nahin mila.{" "}
                <a href={youTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer" data-music-search-external
                  className="underline decoration-amber-400 underline-offset-2">
                  YouTube par khud search karo
                </a>{" "}
                aur link yahan paste kar do — library usi ko chala degi.
              </p>
            )}
            {showSearchResults && (
              <div className="mb-4" data-music-results data-music-results-view={onlineView}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">YouTube results</p>
                <ul
                  className={onlineView === "youtube" ? "grid gap-3" : "grid gap-1.5"}
                  style={onlineView === "youtube" ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))" } : undefined}
                >
                  {results.map((track) => {
                    const thumbnail = thumbnailForTrack(track);
                    return (
                      <li key={track.id}>
                        <button type="button" data-music-result onClick={() => { setLinks(addMusicLink(uid, track.url)?.tracks ?? links); select(track); }}
                          className={onlineView === "youtube"
                            ? "block w-full overflow-hidden rounded-[20px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                            : "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"}>
                          {onlineView === "youtube" ? (
                            <>
                              <span className="relative block aspect-video w-full overflow-hidden bg-slate-950" data-music-result-thumbnail>
                                {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : null}
                                <span className="absolute inset-0 grid place-items-center bg-slate-950/15 text-white">
                                  <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-950/85 shadow-xl"><Play size={19} fill="currentColor" className="ml-0.5" /></span>
                                </span>
                                <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">YouTube</span>
                              </span>
                              <span className="block p-3">
                                <span className="block line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950">{track.title}</span>
                                <span className="mt-1 block truncate text-[11px] font-semibold text-slate-500">{track.subtitle}</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-xl bg-slate-950 text-white" data-music-result-thumbnail>
                                {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : null}
                                <span className="absolute inset-0 grid place-items-center bg-slate-950/10"><Play size={16} fill="currentColor" /></span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-bold text-slate-900">{track.title}</span>
                                <span className="block truncate text-[10px] font-semibold text-slate-500">{track.subtitle}</span>
                              </span>
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {visibleShelves.map(({ shelf, tracks }) => (
              <div key={shelf} className="mb-4" data-music-section={shelf} data-music-section-count={tracks.length}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  {SHELF_TITLE[shelf]} · {tracks.length}
                </p>
                {tracks.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-medium text-slate-500">
                    {query ? "Kuch nahin mila." : SHELF_EMPTY[shelf]}
                  </p>
                ) : (
                  <ul
                    className={shelf === "link" && onlineView === "youtube" ? "grid gap-3" : "grid gap-1.5"}
                    style={shelf === "link" && onlineView === "youtube" ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))" } : undefined}
                  >
                    {tracks.map((track) => {
                      const thumbnail = thumbnailForTrack(track);
                      const large = shelf === "link" && onlineView === "youtube";
                      const playing = current?.id === track.id;
                      return (
                        <li key={track.id}>
                          <div
                            data-music-track={track.id}
                            data-music-track-source={track.source}
                            data-music-playing={playing ? "true" : "false"}
                            className={large
                              ? `overflow-hidden rounded-[20px] border bg-white shadow-sm ${playing ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"}`
                              : `group flex items-center gap-3 rounded-2xl border p-2 shadow-sm ${playing ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                            {large ? (
                              <>
                                <button type="button" onClick={() => select(track)} aria-label={`Play ${track.title}`}
                                  className="relative block aspect-video w-full overflow-hidden bg-slate-950 text-left text-white">
                                  {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" data-music-track-thumbnail /> : null}
                                  <span className="absolute inset-0 grid place-items-center bg-slate-950/15">
                                    <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-950/85 shadow-xl">{providerIcon(track)}</span>
                                  </span>
                                  <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-wider">
                                    {musicRowBadge(track)}
                                  </span>
                                </button>
                                <div className="flex items-start gap-2 p-3">
                                  <span className="min-w-0 flex-1">
                                    <span className="block line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950">{track.title}</span>
                                    <span className="mt-1 block truncate text-[11px] font-semibold text-slate-500">{track.subtitle}</span>
                                  </span>
                                  {track.source !== "course" && (
                                    <button type="button" onClick={() => void forget(track)} aria-label={`Remove ${track.title}`}
                                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => select(track)} aria-label={`Play ${track.title}`}
                                  className={shelf === "link"
                                    ? "relative aspect-video w-20 shrink-0 overflow-hidden rounded-xl bg-slate-950 text-white"
                                    : "relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-950 text-white shadow-md shadow-slate-200 hover:bg-slate-800"}>
                                  {thumbnail ? <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" data-music-track-thumbnail /> : null}
                                  <span className="absolute inset-0 grid place-items-center bg-slate-950/10">{providerIcon(track)}</span>
                                </button>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12px] font-bold text-slate-900">{track.title}</span>
                                  <span className="block truncate text-[10px] font-semibold text-slate-500">{track.subtitle}</span>
                                </span>
                                <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500 min-[420px]:inline-flex">
                                  {musicRowBadge(track)}
                                </span>
                                {track.source !== "course" && (
                                  <button type="button" onClick={() => void forget(track)} aria-label={`Remove ${track.title}`}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}

            <p className="pt-1 text-[10px] font-medium leading-relaxed text-slate-500">
              YouTube, Spotify aur SoundCloud apne hi official player se chalte hain — DRM songs kisi doosre player mein chal hi nahi sakte.
              Device se add kiye songs sirf is device par rehte hain, max {Math.round(MUSIC_UPLOAD_MAX_BYTES / (1024 * 1024))} MB per file.
            </p>
          </div>
        </aside>
      )}
      </div>
    </section>
  );
}
