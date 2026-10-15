// src/course/MusicPanel.tsx
//
// Course Player → the MUSIC tab. Rebuilt to the owner's brief (2026-10-15):
//
//   "music page open hote hi header ki jagah per search bar hoga YouTube wala
//    aur use search bar ke niche horizontal tray hoga jiska color pura white
//    hoga aur use tray per sabhi button honge jo abhi already hain filter
//    button aur usmein ek aur button add karna hai URL ka … aur filter ke
//    according actual mein sabhi pages per jo bhi audio ya video hongi
//    accordingly list ya thumbnail format mein proper dekhe … aur jab user
//    kisi bhi audio per click karega to kaisa interface open hoga — agar koi
//    audio hai to audio player mein open hoga jo already course ka audio player
//    hai … aur agar koi YouTube ka video hai ya koi online URL hai, matlab
//    jiska video chal sakta hai, vah vaise hi YouTube player ke sath open ho."
//
// ── ONE page, ONE search box, ONE white tray ──────────────────────────────
// The pane has exactly two places to be:
//
//   LIBRARY (the page the tab opens on — and the page the footer navigation
//   belongs to)
//     1. the YouTube-style search bar, where a header used to be. It is the
//        SAME box in every filter, and its behaviour follows the filter
//        (`musicFilters.ts`): a library/online search, a plain filter for
//        Course and Device, and a real URL input for URL — where the arrow
//        appears the moment something is pasted and Enter adds it straight
//        away;
//     2. the horizontal tray under it: pure white, every filter button in ONE
//        list with the All button FIRST (All · Course · Device · Online · URL),
//        scrolling sideways on a narrow phone and centring on a wide pane;
//     3. the list the filter asks for — rows on a narrow pane, thumbnail
//        cards on a wide one, a proper audio tile for a song with no artwork,
//        NEVER a white wash over a picture (the reported bug);
//     4. the bottom-right ＋ button, which belongs to the Device filter: tap
//        it and the learner's own file picker opens;
//     5. the honest empty page per filter ("Search to view library", "There is
//        no audio from this course.", …) and, while the whole library IS empty,
//        the All filter's centred column of options (Search online · Device ·
//        Course audio · URL) to start from.
//
//   PLAYER (what a tap opens — the footer navigation hides here)
//     · AUDIO  → the course's own glass player, in its FULL-AREA presentation
//       (`AudioPlayer presentation="full"`): no card, the whole pane, laid out
//       live from the pane's own measurement so a divider drag really widens
//       it. Top-left is the BACK arrow (back to the library page) and a
//       library glyph opens the library over it — the learner's own files,
//       saved links and course audio stay one tap away while a song plays.
//     · VIDEO (YouTube / Spotify / SoundCloud) → that platform's OWN official
//       player on top, the library below it, and a DRAGGABLE HORIZONTAL
//       divider in between. Full screen hides the divider and the library;
//       coming back brings both straight back. In this compact shape the
//       search bar is shorter and carries an ARROW on its right — one tap and
//       the learner is on the full library page.
//
// The library panel (over the audio player) and the video player's lower half
// are the SAME surface as the library page — one implementation, three homes —
// so every search/filter/empty-state rule holds everywhere by construction.
//
// Sources are unchanged and honest: course audio, the learner's own device
// files (local IndexedDB), pasted links, and every online song played in the
// platform's OFFICIAL embed. Nothing here scrapes a stream (pinned by tests).

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import {
  ArrowLeft, ArrowRight, AudioLines, ChevronRight, ExternalLink, Globe, LayoutGrid, Link2, LoaderCircle,
  Maximize2, Minimize2, Music, Plus, Rows3, Search, X,
} from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import { toast } from "../components/ui/glass-toast";
import {
  MUSIC_UPLOAD_MAX_BYTES, addMusicLink, loadLastMusic, loadMusicLinks, removeMusicLink, saveLastMusic,
  saveMusicLinks, type MusicSource, type MusicTrack,
} from "./musicLibrary";
import { listLocalSongs, removeLocalSong, songObjectUrl, storeLocalSong } from "./musicDb";
import {
  resolveMusicTitle, searchYouTube, subscribeYouTubeKey, youTubeSearchAvailable, youTubeSearchUrl,
} from "./musicSearch";
import {
  MUSIC_EMPTY_HINT, MUSIC_EMPTY_TITLE, MUSIC_FILTERS, MUSIC_FILTER_HINT, MUSIC_FILTER_LABEL, MUSIC_NO_MATCH,
  MUSIC_SEARCH_PLACEHOLDER, MUSIC_SHELF_TITLE, MUSIC_START_OPTIONS, isUrlFilter, musicAddFabVisible,
  musicFilterCount, musicQueryFilter, musicShelvesForFilter, musicStartOptionsVisible,
  type MusicFilter, type MusicLibraryCounts,
} from "./musicFilters";
import { MusicEmptyPage, MusicTrackList } from "./MusicTrackList";
import { setMusicSessionView } from "./coursePanelSession";
import { DIVIDER_HIT, DIVIDER_LINE } from "./splitMotion";

interface MusicPanelProps {
  /** The signed-in learner — the library and the local songs are keyed on it. */
  uid?: string | null;
  /** Every audio resource this course ships (`collectCourseAudio`). */
  courseAudio?: MusicTrack[];
  /** False while the pane is mounted but off screen: playback pauses. */
  active?: boolean;
}

/** The pane's two places: the library page, and an open player. */
type MusicView = "library" | "player";
/** `auto` = rows on a narrow pane, thumbnail cards on a wide one. */
type Density = "auto" | "list" | "grid";
type SurfaceMode = "page" | "sheet" | "video";

/** How much of the pane the video player may take (%). */
const MIN_PLAYER_SHARE = 26;
const MAX_PLAYER_SHARE = 84;
/** The pane is "wide" from here: cards, side-by-side layouts, no cramping. */
const WIDE_PANE_PX = 620;

const FILTER_ICON: Record<MusicFilter, ReactNode> = {
  all: <LayoutGrid size={14} />,
  course: <AudioLines size={14} />,
  device: <Music size={14} />,
  online: <Globe size={14} />,
  url: <Link2 size={14} />,
};

const START_ICON: Record<string, ReactNode> = {
  "search-online": <Search size={18} />,
  device: <Plus size={18} />,
  course: <AudioLines size={18} />,
  url: <Link2 size={18} />,
};

export default function MusicPanel({ uid = null, courseAudio = [], active = true }: MusicPanelProps) {
  const [links, setLinks] = useState<MusicTrack[]>(() => loadMusicLinks(uid));
  const [uploads, setUploads] = useState<MusicTrack[]>([]);
  const [current, setCurrent] = useState<MusicTrack | null>(() => loadLastMusic(uid));
  const [view, setView] = useState<MusicView>("library");
  const [filter, setFilter] = useState<MusicFilter>("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [searched, setSearched] = useState(false);
  /** The query that produced the results — kept apart from the box's text, so
   *  the Online list keeps what the learner has already searched even after
   *  they switch filters (which clears the box). */
  const [searchedQuery, setSearchedQuery] = useState("");
  const [playUrl, setPlayUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  /** The library, opened OVER the audio player by the library glyph. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [density, setDensity] = useState<Density>("auto");
  const [layout, setLayout] = useState<"compact" | "wide">("compact");
  const [playerShare, setPlayerShare] = useState(58);
  const [dragging, setDragging] = useState(false);
  /** Our own full-area mode (the toggle the learner presses). */
  const [immersive, setImmersive] = useState(false);
  /** The browser's Fullscreen API — the same element, the platform's button. */
  const [nativeFull, setNativeFull] = useState(false);
  const [searchKeyReady, setSearchKeyReady] = useState(youTubeSearchAvailable);

  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** The blob URL currently held for a local song — revoked before the next one. */
  const blobUrlRef = useRef("");
  const stageRef = useRef<HTMLDivElement>(null);
  const paneTopRef = useRef<HTMLDivElement>(null);
  const paneLibraryRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);
  const shareRef = useRef(playerShare);

  const fullscreen = immersive || nativeFull;

  useEffect(() => subscribeYouTubeKey(() => setSearchKeyReady(youTubeSearchAvailable())), []);

  /**
   * The pane — not the viewport — decides the workspace shape: a wide pane
   * gets thumbnail cards and side-by-side layouts, a narrow one stays a
   * comfortable column. Watching the panel itself means dragging the Course
   * Player divider reflows the music page live.
   */
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return undefined;
    const update = () => setLayout(node.clientWidth >= WIDE_PANE_PX ? "wide" : "compact");
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * The footer navigation rule: while a PLAYER is open this pane hides it, and
   * the moment the learner is back on a library page it returns
   * (coursePanelSession.ts → `isFooterHiddenPage`). Leaving the tab resets it,
   * so the footer can never be left hidden.
   */
  useEffect(() => {
    setMusicSessionView(view === "player" ? "player" : "library");
    return () => setMusicSessionView("library");
  }, [view]);

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
   * re-reading here would throw away a song the learner had left playing.
   */
  const uidRef = useRef(uid);
  useEffect(() => {
    if (uidRef.current === uid) return;
    uidRef.current = uid;
    setLinks(loadMusicLinks(uid));
    setCurrent(loadLastMusic(uid));
    setView("library");
    setFilter("all");
    setQuery("");
    setSheetOpen(false);
  }, [uid]);

  /**
   * Resolve what the player actually plays: a stored song needs a blob URL from
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

  /** The URL box is the one box that must be ready to paste the moment it appears. */
  useEffect(() => {
    if (filter !== "url" || view !== "library") return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [filter, view]);

  /** The platform's own fullscreen button (and ours) both land here. */
  useEffect(() => {
    const doc = typeof document === "undefined" ? null : document;
    if (!doc?.addEventListener) return undefined;
    const onChange = () => {
      const element = doc.fullscreenElement || null;
      setNativeFull(Boolean(element) && Boolean(stageRef.current && (stageRef.current === element || stageRef.current.contains(element))));
    };
    doc.addEventListener("fullscreenchange", onChange);
    return () => doc.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Leave the browser's fullscreen, wherever it was entered from. */
  const exitNativeFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) return;
    try { void document.exitFullscreen?.(); } catch { /* the pane is already back */ }
  }, []);

  /** Unmounting the pane (leaving the Course Player) leaves full screen too. */
  useEffect(() => exitNativeFullscreen, [exitNativeFullscreen]);

  const backToLibrary = useCallback(() => {
    setView("library");
    setSheetOpen(false);
    setImmersive(false);
    setNativeFull(false);
    exitNativeFullscreen();
  }, [exitNativeFullscreen]);

  const select = useCallback((track: MusicTrack) => {
    setCurrent(track);
    saveLastMusic(uid, track);
    setNotice("");
    setSheetOpen(false);
    setImmersive(false);
    setView("player");
  }, [uid]);

  const chooseFilter = useCallback((next: MusicFilter) => {
    setFilter(next);
    setQuery("");
    setNotice("");
  }, []);

  const openFullLibrary = useCallback(() => {
    backToLibrary();
    chooseFilter("all");
  }, [backToLibrary, chooseFilter]);

  /* ── Adding music ─────────────────────────────────────────────────────── */

  /** Add a pasted link, then rename the row from the platform's own oEmbed. */
  const addLink = useCallback(async (raw: string) => {
    const value = String(raw || "").trim();
    if (!value) return;
    const added = addMusicLink(uid, value);
    if (!added) {
      setNotice("That link is not playable here. Paste a YouTube, Spotify or SoundCloud link, or a direct .mp3 / .m4a file.");
      return;
    }
    setQuery("");
    setNotice("");
    setLinks(added.tracks);
    select(added.track);
    // The platform's own oEmbed knows the real song name — ask it once, and
    // rename the row in place. A failure just leaves the fallback title.
    if (added.track.provider !== "audio") {
      const title = await resolveMusicTitle(added.track);
      if (!title) return;
      const renamed = { ...added.track, title };
      const next = loadMusicLinks(uid).map((row) => (row.id === renamed.id ? renamed : row));
      saveMusicLinks(uid, next);
      setLinks(next);
      setCurrent((value) => (value && value.id === renamed.id ? renamed : value));
    }
  }, [uid, select]);

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

  /* ── Searching online (key-gated, never a scraper) ────────────────────── */

  const runSearch = useCallback(async () => {
    const text = query.trim();
    if (!text || !searchKeyReady) return;
    setBusy(true);
    // A search is an ONLINE act: the results are shown in the Online list, and
    // they stay there for the rest of the visit — "online filter mein vah
    // sabhi dikhenge jo user search karke dekh chuka hai".
    if (filter === "all") setFilter("online");
    const found = await searchYouTube(text);
    setResults(found);
    setSearched(true);
    setSearchedQuery(text);
    // A key can be valid and still return nothing (quota, offline, a filter).
    // Say so, and hand the query to YouTube itself.
    setNotice(found.length ? "" : "YouTube se results nahin mile (quota ya network). Neeche wale link se YouTube par search karo, phir link yahan paste kar do.");
    setBusy(false);
  }, [filter, query, searchKeyReady]);

  const submitSearch = useCallback(async () => {
    if (isUrlFilter(filter)) { await addLink(query); return; }
    if (filter === "all" || filter === "online") await runSearch();
  }, [addLink, filter, query, runSearch]);

  const playResult = useCallback((track: MusicTrack) => {
    const added = addMusicLink(uid, track.url);
    if (added) setLinks(added.tracks);
    select(track);
  }, [uid, select]);

  const chooseStartOption = useCallback((id: string, nextFilter: MusicFilter) => {
    chooseFilter(nextFilter);
    if (id === "device") fileRef.current?.click();
  }, [chooseFilter]);

  /* ── Full screen + the draggable divider ──────────────────────────────── */

  const toggleFullscreen = useCallback(async () => {
    if (fullscreen) {
      setImmersive(false);
      setNativeFull(false);
      exitNativeFullscreen();
      return;
    }
    setImmersive(true);
    try { await stageRef.current?.requestFullscreen?.(); } catch { /* iOS: the in-app full area is the fallback */ }
  }, [exitNativeFullscreen, fullscreen]);

  const shareFromClientY = useCallback((clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (!rect.height) return null;
    const share = Math.min(MAX_PLAYER_SHARE, Math.max(MIN_PLAYER_SHARE, ((clientY - rect.top) / rect.height) * 100));
    shareRef.current = share;
    return share;
  }, []);

  const onDividerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = event.pointerId;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* fine without capture */ }
    setDragging(true);
  }, []);

  const onDividerPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    const share = shareFromClientY(event.clientY);
    if (share === null) return;
    // The live drag writes straight to the DOM (no React re-render per frame);
    // the committed value lands in state on pointer-up.
    if (paneTopRef.current) paneTopRef.current.style.flexGrow = String(share);
    if (paneLibraryRef.current) paneLibraryRef.current.style.flexGrow = String(100 - share);
  }, [shareFromClientY]);

  const onDividerPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setPlayerShare(shareRef.current);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    if (paneTopRef.current) paneTopRef.current.style.removeProperty("flex-grow");
    if (paneLibraryRef.current) paneLibraryRef.current.style.removeProperty("flex-grow");
  }, []);

  const onDividerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 6 : -6;
    const next = Math.min(MAX_PLAYER_SHARE, Math.max(MIN_PLAYER_SHARE, shareRef.current + step));
    shareRef.current = next;
    setPlayerShare(next);
  }, []);

  /* ── What every surface is built from ─────────────────────────────────── */

  const courseTracks = courseAudio;
  const shelfTracks = useCallback((source: MusicSource): MusicTrack[] =>
    source === "course" ? courseTracks : source === "upload" ? uploads : links, [courseTracks, uploads, links]);

  /** Search results the learner has not saved yet — the Online list's top half. */
  const freshResults = useMemo(
    () => results.filter((row) => !links.some((saved) => saved.url === row.url)),
    [results, links],
  );

  const counts: MusicLibraryCounts = {
    // A searched (but not yet saved) result is music the learner has in front
    // of them, so it counts: the All filter's start column is for a library
    // that really is empty.
    total: courseTracks.length + uploads.length + links.length + freshResults.length,
    course: courseTracks.length,
    device: uploads.length,
    online: links.length + freshResults.length,
    url: links.length,
  };

  const urlMode = isUrlFilter(filter);
  /** The one search box: a live filter everywhere, a URL input in URL. */
  const effectiveQuery = urlMode ? "" : query;
  const shelves = musicShelvesForFilter(filter);
  const startOptions = musicStartOptionsVisible(filter, counts) && !query.trim();
  const densityMode: "list" | "grid" = density === "auto" ? (layout === "wide" ? "grid" : "list") : density;
  // The results belong to the ONLINE shelf: they stay listed while the learner
  // is on All or Online, whatever the search box currently says.
  const showResults = (filter === "all" || filter === "online") && searched;
  const noResults = showResults && results.length === 0 && searchKeyReady;
  const showCardsToggle = shelves.includes("link") || showResults;

  const visibleSections = shelves
    .map((source) => ({ source, tracks: musicQueryFilter(shelfTracks(source), effectiveQuery) }))
    .filter(({ tracks }) => tracks.length > 0);
  const rowsVisible = visibleSections.length > 0 || (showResults && freshResults.length > 0);

  /* ── The pieces ───────────────────────────────────────────────────────── */

  const searchBar = ({ compact, onOpenFullPage }: { compact: boolean; onOpenFullPage?: () => void }) => {
    const height = compact ? "h-10" : "h-11";
    const canSearchOnline = filter === "all" || filter === "online";
    return (
      <form
        onSubmit={(event) => { event.preventDefault(); void submitSearch(); }}
        className="flex w-full min-w-0 items-center gap-2"
        data-music-searchbar
        data-music-searchbar-layout={compact ? "compact" : "full"}
        data-music-search-mode={searchKeyReady ? "api" : "external"}
      >
        <span className={`relative flex min-w-0 flex-1 items-center rounded-full border border-slate-300 bg-white ${height} shadow-[0_2px_10px_rgba(15,23,42,0.06)] focus-within:border-slate-950 focus-within:ring-2 focus-within:ring-slate-950/10`}>
          {urlMode
            ? <Link2 size={16} className="ml-3.5 shrink-0 text-slate-400" />
            : <Search size={16} className="ml-3.5 shrink-0 text-slate-400" />}
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={MUSIC_SEARCH_PLACEHOLDER[filter]}
            aria-label={urlMode ? "Paste a song link" : "Search the music library"}
            // Two names for the one URL box: `data-music-url` is this design's,
            // `data-music-link` is what the first cut of the pane called it.
            {...(urlMode ? { "data-music-url": "", "data-music-link": "" } : { "data-music-search": "" })}
            className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear the search box"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          ) : null}
          {urlMode && query.trim() ? (
            // "Jaise hi user inter karke uske samne box mein arrow ka nishan
            // bhi ho aur direct keyboard Enter se add ho jaaye." — the arrow
            // appears with the first character, and Enter does the same thing.
            <button
              type="submit"
              data-music-url-add
              data-music-add-link
              aria-label="Add this link"
              className="mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <ArrowRight size={16} />
            </button>
          ) : null}
        </span>

        {!urlMode && canSearchOnline && searchKeyReady ? (
          <button
            type="submit"
            data-music-search-run
            disabled={busy || !query.trim()}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-slate-950 text-[11px] font-black text-white shadow-md shadow-slate-200 hover:bg-slate-800 disabled:opacity-40 ${compact ? "h-10 w-10" : "h-11 px-[13px]"}`}
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}
            {compact ? null : <span>YouTube</span>}
          </button>
        ) : null}
        {!urlMode && canSearchOnline && !searchKeyReady ? (
          // No API key: hand the query to YouTube itself. An ANCHOR, so it opens
          // correctly in a browser, a PWA and the native shell alike.
          <a
            href={youTubeSearchUrl(query)}
            target="_blank"
            rel="noopener noreferrer"
            data-music-search-external
            aria-label="Search this on YouTube"
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white text-[11px] font-black text-slate-800 shadow-sm hover:bg-slate-50 ${compact ? "h-10 w-10" : "h-11 px-[13px]"}`}
          >
            <ExternalLink size={15} />
            {compact ? null : <span>YouTube</span>}
          </a>
        ) : null}
        {onOpenFullPage ? (
          <button
            type="button"
            onClick={onOpenFullPage}
            data-music-open-library
            aria-label="Open the full music library"
            title="Open the full music library"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-950 text-white shadow-md shadow-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <ChevronRight size={18} />
          </button>
        ) : null}
      </form>
    );
  };

  const tray = () => (
    <div className="shrink-0 bg-white px-2 py-2 sm:px-4" data-music-tray data-music-tray-theme="white">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        <div
          role="group"
          aria-label="Music library filters"
          data-music-filters
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-[0_2px_10px_rgba(15,23,42,0.05)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MUSIC_FILTERS.map((key) => {
            const activeBtn = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => chooseFilter(key)}
                data-music-filter={key}
                data-active={activeBtn ? "true" : "false"}
                aria-pressed={activeBtn}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition ${
                  activeBtn ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {FILTER_ICON[key]}
                {MUSIC_FILTER_LABEL[key]}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${activeBtn ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {musicFilterCount(key, counts)}
                </span>
              </button>
            );
          })}
        </div>
        {showCardsToggle ? (
          <span className="flex shrink-0 rounded-full border border-slate-200 bg-white p-1 shadow-[0_2px_10px_rgba(15,23,42,0.05)]" data-music-search-view>
            <button
              type="button"
              onClick={() => setDensity("list")}
              data-music-view-option="list"
              aria-pressed={densityMode === "list"}
              aria-label="List view"
              className={`grid h-7 w-7 place-items-center rounded-full ${densityMode === "list" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <Rows3 size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDensity("grid")}
              data-music-view-option="grid"
              aria-pressed={densityMode === "grid"}
              aria-label="Thumbnail view"
              className={`grid h-7 w-7 place-items-center rounded-full ${densityMode === "grid" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <LayoutGrid size={14} />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );

  /** Every song list in the pane comes out of here — sections, empty page, options. */
  const body = () => {
    if (startOptions) {
      return (
        <div className="grid place-items-center px-3 py-6 text-center" data-music-start-options>
          <p className="text-lg font-black tracking-tight text-slate-950">{MUSIC_EMPTY_TITLE.all}</p>
          <p className="mt-1 max-w-[36ch] text-[11.5px] font-medium leading-5 text-slate-500">{MUSIC_FILTER_HINT.all}</p>
          <div className="mt-4 grid w-full max-w-sm gap-2.5">
            {MUSIC_START_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                data-music-start-option={option.id}
                onClick={() => chooseStartOption(option.id, option.filter)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-950 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">{START_ICON[option.id]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-black text-slate-950">{option.title}</span>
                  <span className="block truncate text-[11px] font-semibold text-slate-500">{option.hint}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (!rowsVisible) {
      return (
        <>
          {noResults ? (
            <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" data-music-no-results>
              YouTube se kuch nahin mila.{" "}
              <a href={youTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer" data-music-search-external
                className="underline decoration-amber-400 underline-offset-2">
                YouTube par khud search karo
              </a>{" "}
              aur link yahan paste kar do — library usi ko chala degi.
            </p>
          ) : null}
          <MusicEmptyPage
            title={query.trim() && !urlMode ? MUSIC_NO_MATCH : MUSIC_EMPTY_TITLE[filter]}
            hint={query.trim() && !urlMode ? MUSIC_FILTER_HINT[filter] : MUSIC_EMPTY_HINT[filter]}
            glyph={filter === "online" || filter === "url" ? "link" : "music"}
          />
        </>
      );
    }

    return (
      <>
        {noResults ? (
          <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" data-music-no-results>
            YouTube se kuch nahin mila.{" "}
            <a href={youTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer" data-music-search-external
              className="underline decoration-amber-400 underline-offset-2">
              YouTube par khud search karo
            </a>{" "}
            aur link yahan paste kar do — library usi ko chala degi.
          </p>
        ) : null}

        {showResults && freshResults.length > 0 ? (
          <div className="mb-4" data-music-results data-music-results-view={densityMode}>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              YouTube results
              {searchedQuery ? <span className="truncate normal-case tracking-normal text-slate-500">“{searchedQuery}”</span> : null}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{freshResults.length}</span>
            </p>
            <MusicTrackList
              asResult
              tracks={freshResults}
              variant={densityMode}
              currentId={current?.id ?? null}
              playing={Boolean(current)}
              onPlay={playResult}
            />
          </div>
        ) : null}

        {visibleSections.map(({ source, tracks }) => (
          <div key={source} className="mb-4" data-music-section={source} data-music-section-count={tracks.length}>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              {MUSIC_SHELF_TITLE[source]}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{tracks.length}</span>
            </p>
            <MusicTrackList
              tracks={tracks}
              variant={source === "link" && densityMode === "grid" ? "grid" : "list"}
              currentId={current?.id ?? null}
              playing={Boolean(current)}
              onPlay={select}
              onRemove={source === "course" ? undefined : forget}
            />
          </div>
        ))}
      </>
    );
  };

  const addFab = musicAddFabVisible(filter) ? (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={busy}
      data-music-add-fab
      data-music-upload
      aria-label="Add music from this device"
      title="Add music from this device"
      className="absolute bottom-4 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.38)] transition hover:scale-105 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60"
    >
      {busy ? <LoaderCircle size={22} className="animate-spin" /> : <Plus size={24} />}
    </button>
  ) : null;

  /**
   * ONE library surface, three homes: the page itself, the panel over the audio
   * player, and the lower half of the video player. Same search box, same white
   * tray, same list, same ＋ button, same empty pages.
   */
  const librarySurface = ({
    mode,
    onOpenFullPage,
    onClose,
  }: {
    mode: SurfaceMode;
    onOpenFullPage?: () => void;
    onClose?: () => void;
  }) => (
    <div className="flex h-full min-h-0 w-full flex-col bg-white" data-music-library={mode}>
      {mode === "sheet" ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[13px] font-black tracking-tight text-slate-950">Music library</p>
          {onOpenFullPage ? (
            // The same shortcut the video player's compact bar carries: straight
            // to the full library page (the song keeps playing behind it).
            <button
              type="button"
              onClick={onOpenFullPage}
              data-music-open-library
              aria-label="Open the full music library"
              title="Open the full music library"
              className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronRight size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            data-music-panel-close
            aria-label="Close the music library"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className={`shrink-0 bg-white ${mode === "video" ? "px-2 pt-2" : "px-3 pt-3 sm:px-5"}`}>
        <div className={`mx-auto w-full ${mode === "video" ? "" : "max-w-3xl"}`}>
          {searchBar({ compact: mode === "video", onOpenFullPage })}
        </div>
      </div>

      {tray()}

      {notice ? (
        <p className="shrink-0 border-y border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" data-music-notice>
          {notice}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div className={`h-full overflow-y-auto px-2.5 pt-2 ${mode === "video" ? "pb-20" : "pb-24"} sm:px-4`} data-music-body>
          <div className={`mx-auto w-full ${mode === "video" ? "" : "max-w-5xl"}`}>{body()}</div>
        </div>
        {addFab}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        data-music-file
        aria-label="Choose an audio file from this device"
        onChange={(event) => void onPickFile(event.target.files?.[0])}
      />
    </div>
  );

  /* ── The player: audio (a page) or video (official embed + library) ────── */

  const isAudioCurrent = Boolean(current && current.provider === "audio");
  const isVideoCurrent = Boolean(current && current.provider !== "audio");
  const showAudioPlayer = isAudioCurrent && Boolean(playUrl);
  const showLibrary = view === "library";
  const playerShown = view === "player";

  const noticePill = notice ? (
    <p className="absolute left-1/2 top-3 z-40 max-w-[80%] -translate-x-1/2 rounded-full bg-slate-950/85 px-3.5 py-2 text-center text-[11px] font-semibold text-white shadow-lg" data-music-player-notice>
      {notice}
    </p>
  ) : null;

  const videoStage = isVideoCurrent && playerShown ? (
    <div
      ref={stageRef}
      className="relative flex min-h-0 flex-1 flex-col bg-slate-950"
      data-music-player="video"
      data-music-player-provider={current?.provider}
      data-music-video-fullscreen={fullscreen ? "true" : "false"}
    >
      {fullscreen ? (
        <div className="relative min-h-0 flex-1" data-music-video-pane>
          {current?.embedUrl ? (
            <iframe
              key={current.embedUrl}
              data-music-embed={current.provider}
              src={current.embedUrl}
              title={current.title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0 bg-black"
            />
          ) : (
            <p className="grid h-full place-items-center px-4 text-center text-[11px] font-semibold text-white/70">
              Ye song abhi load nahi ho paya.
            </p>
          )}
          {chrome()}
        </div>
      ) : (
        <>
          <div
            ref={paneTopRef}
            className="relative min-h-0 w-full"
            style={{ flexGrow: playerShare, flexBasis: 0 }}
            data-music-video-pane
          >
            {current?.embedUrl ? (
              <iframe
                key={current.embedUrl}
                data-music-embed={current.provider}
                src={current.embedUrl}
                title={current.title}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0 bg-black"
              />
            ) : (
              <p className="grid h-full place-items-center px-4 text-center text-[11px] font-semibold text-white/70">
                Ye song abhi load nahi ho paya.
              </p>
            )}
            {chrome()}
          </div>

          {/* The draggable horizontal divider: the app's one divider language —
              a 2px yellow core line in a 10px grab strip — plus a keyboard
              path (↑ / ↓) and a grip that appears on hover. */}
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Video and library divider — drag to resize"
            aria-valuemin={MIN_PLAYER_SHARE}
            aria-valuemax={MAX_PLAYER_SHARE}
            aria-valuenow={Math.round(playerShare)}
            data-music-player-divider
            data-dragging={dragging ? "true" : "false"}
            onPointerDown={onDividerPointerDown}
            onPointerMove={onDividerPointerMove}
            onPointerUp={onDividerPointerUp}
            onPointerCancel={onDividerPointerUp}
            onKeyDown={onDividerKeyDown}
            className="group relative z-30 flex w-full shrink-0 cursor-row-resize items-center justify-center bg-slate-950"
            style={{ height: DIVIDER_HIT, touchAction: "none" } as CSSProperties}
          >
            <span
              aria-hidden
              className="h-[2px] w-full rounded-full"
              style={{ background: DIVIDER_LINE, boxShadow: dragging ? `0 0 16px ${DIVIDER_LINE}` : `0 0 10px ${DIVIDER_LINE}66` }}
            />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-1.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 opacity-0 transition group-hover:opacity-100"
            />
          </div>

          <div
            ref={paneLibraryRef}
            className="min-h-0 w-full overflow-hidden"
            style={{ flexGrow: 100 - playerShare, flexBasis: 0 }}
            data-music-video-library
          >
            {librarySurface({ mode: "video", onOpenFullPage: openFullLibrary })}
          </div>
        </>
      )}
      {noticePill}
    </div>
  ) : null;

  /** The player's own chrome: back to the library, the title, full screen. */
  function chrome() {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-slate-950/85 via-slate-950/35 to-transparent p-2"
        data-music-player-chrome
      >
        <button
          type="button"
          onClick={backToLibrary}
          data-music-back
          aria-label="Back to library"
          className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950/70 text-white backdrop-blur hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft size={17} />
        </button>
        <p className="pointer-events-none min-w-0 flex-1 truncate text-[12px] font-bold text-white drop-shadow">{current?.title}</p>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          data-music-fullscreen-toggle
          aria-pressed={fullscreen}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950/70 text-white backdrop-blur hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    );
  }

  return (
    <section
      ref={panelRef}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900"
      data-course-music-panel
      data-music-active={active ? "true" : "false"}
      data-music-view={view}
      data-music-filter={filter}
      data-music-stage={current ? current.provider : "empty"}
      data-music-layout={layout}
    >
      {/* The audio player stays MOUNTED while the library page is on top of it
          (hidden, never unmounted): a song does not stop because the learner
          went back to the list. */}
      {showAudioPlayer ? (
        <div
          className={`relative min-h-0 flex-1 flex-col ${playerShown ? "flex" : "hidden"}`}
          data-music-player="audio"
          data-music-player-provider="audio"
        >
          <AudioPlayer
            presentation="full"
            url={playUrl}
            name={current?.title || ""}
            active={active}
            onBack={backToLibrary}
            onOpenLibrary={() => setSheetOpen((open) => !open)}
          />
          {resolving ? (
            <span className="absolute left-1/2 top-1/2 z-40 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-slate-950/85 px-3.5 py-2 text-[11px] font-semibold text-white shadow-lg">
              <LoaderCircle size={15} className="animate-spin" /> Song load ho raha hai…
            </span>
          ) : null}
          {noticePill}
          {sheetOpen ? (
            <div className="absolute inset-0 z-50 flex flex-col bg-slate-950/45 backdrop-blur-sm" data-music-library-panel>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close the music library"
                className="min-h-0 flex-1 cursor-pointer"
              />
              <div className="flex h-[78%] max-h-[78%] min-h-0 w-full flex-col overflow-hidden rounded-t-[26px] bg-white shadow-[0_-20px_50px_rgba(2,6,23,0.45)] sm:mx-auto sm:w-[86%] sm:max-w-2xl">
                {librarySurface({ mode: "sheet", onClose: () => setSheetOpen(false), onOpenFullPage: openFullLibrary })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {videoStage}

      {/* A track chosen but not playable (a signed-out local file) still says so. */}
      {playerShown && isAudioCurrent && !playUrl ? (
        <div className="grid min-h-0 flex-1 place-items-center bg-slate-950 px-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-[11px] font-bold text-white">
            <LoaderCircle size={14} className={resolving ? "animate-spin" : ""} /> {notice || "Ye song abhi load nahi ho paya."}
          </p>
        </div>
      ) : null}

      {showLibrary ? librarySurface({ mode: "page" }) : null}
    </section>
  );
}
