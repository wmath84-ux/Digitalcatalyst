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
  ArrowLeft, ArrowRight, AudioLines, ChevronRight, CornerDownLeft, ExternalLink, Globe, LayoutGrid,
  Link2, LoaderCircle, Music, Plus, Rows3, Search, X,
} from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import { toast } from "../components/ui/glass-toast";
import {
  MUSIC_UPLOAD_MAX_BYTES, addMusicLink, addMusicTrack, loadLastMusic, loadMusicLinks, removeMusicLink, saveLastMusic,
  saveMusicLinks, type MusicSource, type MusicTrack,
} from "./musicLibrary";
import { listLocalSongs, removeLocalSong, songObjectUrl, storeLocalSong } from "./musicDb";
import {
  resolveMusicTitle, searchYouTubeOutcome, subscribeYouTubeKey, youTubeSearchAvailable, youTubeSearchUrl,
  type YouTubeSearchOutcome,
} from "./musicSearch";
import {
  SearchFlashScan, SearchHistoryList, SlidingSearchText, STUDY_SEARCH_SENTENCE,
  useScrollAwayHidden, useStudySearch,
} from "./searchExperience";
import {
  MUSIC_EMPTY_HINT, MUSIC_EMPTY_TITLE, MUSIC_FILTERS, MUSIC_FILTER_HINT, MUSIC_FILTER_LABEL, MUSIC_NO_MATCH,
  MUSIC_SEARCH_PLACEHOLDER, MUSIC_SHELF_TITLE, MUSIC_START_OPTIONS, isUrlFilter, musicAddFabVisible,
  musicFilterCount, musicQueryFilter, musicShelvesForFilter, musicStartOptionsVisible,
  type MusicFilter, type MusicLibraryCounts,
} from "./musicFilters";
import { MusicEmptyPage, MusicTrackList } from "./MusicTrackList";
import { setMusicSessionView, setSearchScrolledAway, setSearchSurface } from "./coursePanelSession";
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
  /** An upload in flight — the search's own spinner lives in the shared kit. */
  const [uploading, setUploading] = useState(false);
  /** YouTube shows recent searches when the box has the caret and is empty. */
  const [searchFocused, setSearchFocused] = useState(false);
  /**
   * The music library's OWN nested search page (owner, 2026-10-16+): tapping
   * the search box on the library page opens a separate search page — the
   * same shape the Resource Library wears (back arrow · box · format button,
   * recent searches, the flash scan) — and only its back arrow closes it.
   */
  const [searchPageOpen, setSearchPageOpen] = useState(false);
  const [playUrl, setPlayUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  /** The library, opened OVER the audio player by the library glyph. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [density, setDensity] = useState<Density>("auto");
  const [layout, setLayout] = useState<"compact" | "wide">("compact");
  const [playerShare, setPlayerShare] = useState(58);
  const [dragging, setDragging] = useState(false);
  /** The browser's Fullscreen API — YouTube's own inbuilt button lands here. */
  const [nativeFull, setNativeFull] = useState(false);
  /**
   * Whether a YouTube key is ready. The LEARNER'S own key counts first (their
   * account slot); the owner's build-time key is only the fallback — that is
   * what keeps the school out of the quota bill.
   */
  const [searchKeyReady, setSearchKeyReady] = useState(() => youTubeSearchAvailable(uid));
  /** The last online search's answer — WHY it failed, when it did. */
  const [onlineError, setOnlineError] = useState<YouTubeSearchOutcome | null>(null);
  /**
   * The nested search page has TWO steps, and the back button walks them:
   *
   *   "board"   → the ready-to-write page: the recent searches, the box empty
   *               and waiting (YouTube's own search-page shape);
   *   "results" → what the search answered.
   *
   * So the back arrow on the RESULTS goes back to the board, and the board's
   * back arrow goes back to the library page. Tapping the search box on the
   * results does the same as that first back — the learner is asking to
   * search again, not to stare at the old results.
   */
  const [searchPageStage, setSearchPageStage] = useState<"board" | "results">("board");

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

  const fullscreen = nativeFull;

  /**
   * A key was saved or removed in SETTINGS — the pane re-reads it, and
   * forgets the failure it was showing (that failure belonged to the old
   * key). A different account means a different key, so the account's own
   * slot is what counts, and signing in (or out) re-reads it right away.
   */
  useEffect(() => {
    const read = () => setSearchKeyReady(youTubeSearchAvailable(uid));
    read();
    return subscribeYouTubeKey(() => {
      read();
      setOnlineError(null);
    });
  }, [uid]);

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

  /** The nested search page opened from a tap IN the box, so the box keeps
   *  the caret — and the phone keeps its keyboard up (owner, 2026-10-16:
   *  "search page khulne ke sath sath keyboard bhi user ka open hoga").
   *  Without this the remount into the page's own bar would drop both. */
  useEffect(() => {
    if (!searchPageOpen) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [searchPageOpen]);

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
    setNativeFull(false);
    exitNativeFullscreen();
  }, [exitNativeFullscreen]);

  const select = useCallback((track: MusicTrack) => {
    setCurrent(track);
    saveLastMusic(uid, track);
    setNotice("");
    setSheetOpen(false);
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
    setUploading(true);
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
      setUploading(false);
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

  /**
   * The search itself — the SHARED experience (./searchExperience), the very
   * same one the Course Library's search page wears: the query is remembered in
   * this device's recent searches, the flash scan stays up for a full second
   * however fast the network is (and for as long as it really takes when it is
   * slow), and the results appear the moment they land. No nested page here:
   * the owner asked for the same behaviour on the SAME page structure.
   */
  /**
   * The search — and its ANSWER. The rows are what the list shows; the
   * outcome also says WHY a search found nothing (a wrong key, a dead
   * quota, a referrer the key does not allow), so the pane can offer the fix
   * instead of a dead end.
   */
  const runMusicSearch = useCallback(async (text: string) => {
    const outcome = await searchYouTubeOutcome(text, undefined, uid);
    setOnlineError(outcome);
    // A search that RAN lands on the RESULTS step of the search page.
    setSearchPageStage("results");
    return outcome.rows;
  }, [uid]);
  const search = useStudySearch<MusicTrack[]>({ namespace: "course-music", run: runMusicSearch });

  const searchLoading = search.phase === "loading";
  const searched = search.phase === "results";
  const results = search.results ?? [];
  /** The query that produced the results — kept apart from the box's text, so
   *  the Online list keeps what the learner has already searched even after
   *  they switch filters (which clears the box). */
  const searchedQuery = search.query;

  // A key can be valid and still return nothing (quota, offline, a filter).
  // Say so, and hand the query to YouTube itself.
  useEffect(() => {
    if (search.phase !== "results") return;
    setNotice(
      (search.results ?? []).length
        ? ""
        : "YouTube se results nahin mile (quota ya network). Neeche wale link se YouTube par search karo, phir link yahan paste kar do.",
    );
  }, [search.phase, search.results]);

  const submitSearch = useCallback(async () => {
    if (isUrlFilter(filter)) { await addLink(query); return; }
    // On the search page the search is YOUTUBE's own — the shelf the learner
    // happened to be looking at does not get a say, so the results page opens
    // whatever the filter was.
    if (!searchPageOpen && filter !== "all" && filter !== "online") return;
    const text = query.trim();
    if (!text || !searchKeyReady) return;
    // "Jaise hi Enter karein keyboard close ho jaaye" — the box gives the
    // caret up the moment the search runs, so the results get the screen.
    searchRef.current?.blur();
    // A search is an ONLINE act: the results are shown in the Online list, and
    // they stay there for the rest of the visit — "online filter mein vah
    // sabhi dikhenge jo user search karke dekh chuka hai".
    if (filter !== "online") setFilter("online");
    await search.search(text);
  }, [addLink, filter, query, search, searchKeyReady, searchPageOpen]);

  const playResult = useCallback((track: MusicTrack) => {
    // Save the result AS the provider described it — real title, channel and
    // artwork — never a re-parse of the bare URL (which left a nameless,
    // pictureless "YouTube video" row in the saved list).
    const added = addMusicTrack(uid, track);
    if (added) {
      setLinks(added.tracks);
      select(added.track);
      return;
    }
    select(track);
  }, [uid, select]);

  const chooseStartOption = useCallback((id: string, nextFilter: MusicFilter) => {
    chooseFilter(nextFilter);
    if (id === "device") fileRef.current?.click();
  }, [chooseFilter]);

  /* ── Full screen + the draggable divider ──────────────────────────────── */

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
  /**
   * The format button, self-convertible: ONE button, and its icon is the format
   * that the very next tap gives you. There is no menu, no second option on
   * screen — "options nahin dikhne chahiye, same button dobara dabane se dusra
   * ho jaaye".
   */
  const flipDensity = useCallback(
    () => setDensity(densityMode === "list" ? "grid" : "list"),
    [densityMode],
  );
  // The results belong to the ONLINE shelf: they stay listed while the learner
  // is on All or Online, whatever the search box currently says.
  const showResults = (filter === "all" || filter === "online") && searched;
  const noResults = showResults && results.length === 0 && searchKeyReady;
  /** The last search's REAL reason, when it failed for a reason of its own. */
  const keyProblem = onlineError?.error ? onlineError : null;
  /**
   * The learner's own quota was gone, and the MASTER's key took over — the
   * search went on without a break, so this is one quiet line, not an alarm.
   */
  const fallbackNote = onlineError?.usedFallback
    ? "Aapki key ka daily quota khatam ho gaya — ab master ki key se chal raha hai. Search chalta rahega, aur jaise hi aapki quota reset hogi, apni key wapas apne aap chal hogi."
    : "";
  /** The format control rides with whatever is on screen: saved online songs,
   *  the search's own results, or a search in flight (the flash scan's rows). */
  const showCardsToggle = shelves.includes("link") || showResults || (searchLoading && !urlMode);
  /** YouTube's own habit: the box has the caret, it is empty, and there is
   *  something to come back to. The nested search page keeps the list up
   *  even after the caret leaves the box (its back arrow is the only exit). */
  const showHistory = !urlMode && (searchFocused || searchPageOpen) && !query.trim() && search.history.length > 0;

  const visibleSections = shelves
    .map((source) => ({ source, tracks: musicQueryFilter(shelfTracks(source), effectiveQuery) }))
    .filter(({ tracks }) => tracks.length > 0);
  const rowsVisible = visibleSections.length > 0 || (showResults && freshResults.length > 0);

  /**
   * The music page's own footer rule (owner, 2026-10-16 — the same one the
   * Course Library's search page wears):
   *
   *   · the music LIBRARY page keeps the footer navigation;
   *   · the SEARCH page does NOT — that is the ready-to-write box with the
   *     recent searches open under it (YouTube's own search page shape) and
   *     the flash scan while a search runs;
   *   · once RESULTS are on screen the footer is back, and only the scroll
   *     half below can step it away.
   *
   * The open PLAYER is the other half of the rule and is published above (an
   * open audio player or YouTube player always takes the footer away).
   */
  /** The search page shows its RESULTS only on the results step. */
  const searchPageOnResults = searchPageOpen && searchPageStage === "results" && searched;
  /** …and the footer rule follows that step: the board takes the footer away,
   *  the results give it back. */
  const musicSearchView =
    searchLoading || showHistory || (searchPageOpen && !searchPageOnResults) ? "page" : searched ? "results" : "closed";
  useEffect(() => {
    setSearchSurface("music", musicSearchView);
  }, [musicSearchView]);
  useEffect(() => () => setSearchSurface("music", "closed"), []);

  /** "Scroll down kare to hide, wapas top par aate hi dikhe" — the results
   *  scroll in `[data-music-body]`, whichever of the three homes is up. */
  const { scrollerRef: musicScrollerRef, hidden: resultsScrolledAway } =
    useScrollAwayHidden(musicSearchView === "results");
  useEffect(() => {
    setSearchScrolledAway("music", resultsScrolledAway);
  }, [resultsScrolledAway]);

  /**
   * The filter tray follows the same scroll rule (owner, 2026-10-16+):
   * "header ke niche jo filter box hai vah slide hone per hide ho jana
   * chahie" — scrolling down slides it away, scrolling up (or reaching the
   * top) brings it back. One scroll host feeds both listeners.
   */
  const { scrollerRef: trayScrollerRef, hidden: trayScrolledAway } = useScrollAwayHidden(true);
  const musicBodyRef = useCallback(
    (node: HTMLElement | null) => {
      musicScrollerRef(node);
      trayScrollerRef(node);
    },
    [musicScrollerRef, trayScrollerRef],
  );

  /* ── The pieces ───────────────────────────────────────────────────────── */

  /**
   * The search page's back button, in TWO steps: the results go back to the
   * board, and the board goes back to the library page.
   */
  const stepBackFromSearch = useCallback(() => {
    if (searchPageStage === "results") {
      setSearchPageStage("board");
      return;
    }
    setSearchPageOpen(false);
  }, [searchPageStage]);

  /**
   * Opening (or returning to) the search page always lands on the BOARD —
   * the recent searches, the box ready to write. That is also what the
   * learner gets by tapping the search box on the results.
   */
  const openSearchPage = useCallback(() => {
    setSearchPageOpen(true);
    setSearchPageStage("board");
  }, []);

  const searchBar = ({
    compact,
    onOpenFullPage,
    onSearchIntent,
  }: {
    compact: boolean;
    onOpenFullPage?: () => void;
    /** The library page hands this in: a tap in the box opens the nested
     *  search page (module library's own shape) instead of searching inline. */
    onSearchIntent?: () => void;
  }) => {
    const height = compact ? "h-10" : "h-11";
    // On the search page the search is YOUTUBE's own, so the shelf filter
    // does not get a say: the box always carries its Enter (or the hand-off
    // to YouTube itself) there.
    const canSearchOnline = filter === "all" || filter === "online" || searchPageOpen;
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
            ? <Link2 size={16} className="relative z-[1] ml-3.5 shrink-0 text-slate-400" />
            : <Search size={16} className="relative z-[1] ml-3.5 shrink-0 text-slate-400" />}
          {/* The same long sentence the Course Library's box carries, sliding
              left and right while this box is empty and quiet. The moment the
              learner taps in (or types), it steps aside for the filter's own
              placeholder — "is filter mein kya search hota hai" — which is why
              the input keeps its placeholder either way. */}
          {!urlMode && !query && !searchFocused ? (
            <span className="pointer-events-none absolute inset-y-0 left-9 right-24 z-0 flex items-center overflow-hidden rounded-full bg-white">
              <SlidingSearchText text={STUDY_SEARCH_SENTENCE} />
            </span>
          ) : null}
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              setSearchFocused(true);
              if (!urlMode) onSearchIntent?.();
            }}
            onBlur={() => setSearchFocused(false)}
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
              className="relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
              className="relative z-[1] mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <ArrowRight size={16} />
            </button>
          ) : null}
          {/* The Enter button, INSIDE the box on its right — and since it is the
              form's own submit, the keyboard's Enter runs exactly the same
              search. While the search is in flight it carries the spinner, and
              the flash scan below holds the page. */}
          {!urlMode && canSearchOnline && searchKeyReady ? (
            <button
              type="submit"
              data-music-search-run
              data-music-search-enter
              disabled={searchLoading || !query.trim()}
              aria-label="Search YouTube"
              title="Search YouTube"
              className={`relative z-[1] mr-1.5 grid shrink-0 place-items-center rounded-full bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40 ${compact ? "h-8 w-8" : "h-9 w-9"}`}
            >
              {searchLoading
                ? <LoaderCircle size={15} className="animate-spin" />
                : compact ? <Search size={15} /> : <CornerDownLeft size={16} />}
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
              className={`relative z-[1] mr-1.5 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white text-[11px] font-black text-slate-800 shadow-sm hover:bg-slate-50 ${compact ? "h-8 w-8" : "h-9 px-3"}`}
            >
              <ExternalLink size={15} />
              {compact ? null : <span>YouTube</span>}
            </a>
          ) : null}
        </span>
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

  /** `inFlow` = the tray sits INSIDE the scroller (the video player's library
   *  half), so it scrolls away with the page itself — the slide-away collapse
   *  is only for the library page, where the tray rides above the scroller. */
  const tray = ({ inFlow = false }: { inFlow?: boolean } = {}) => {
    const trayAway = !inFlow && trayScrolledAway;
    return (
    <div
      className={`shrink-0 overflow-hidden bg-white transition-[max-height,opacity,transform,padding] duration-300 ease-out ${inFlow ? "" : "px-2 sm:px-4"} ${
        trayAway ? "max-h-0 -translate-y-2 py-0 opacity-0" : "max-h-24 translate-y-0 py-2 opacity-100"
      }`}
      data-music-tray
      data-music-tray-theme="white"
      data-music-tray-away={trayAway ? "true" : "false"}
      aria-hidden={trayAway ? "true" : undefined}
    >
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
        {/* ONE button, and it converts itself: the glyph you see is the format
            the next tap gives you. Nothing else is ever shown (owner brief). */}
        {showCardsToggle ? (
          <button
            type="button"
            onClick={flipDensity}
            data-music-search-view
            data-music-search-format-toggle
            data-music-search-format-next={densityMode === "list" ? "grid" : "list"}
            aria-pressed={densityMode === "grid"}
            aria-label={densityMode === "list" ? "Thumbnail view" : "List view"}
            title={densityMode === "list" ? "Thumbnail view" : "List view"}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition ${
              densityMode === "grid"
                ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {densityMode === "list" ? <LayoutGrid size={15} /> : <Rows3 size={15} />}
          </button>
        ) : null}
      </div>
    </div>
    );
  };

  /* Recent searches, exactly the shape YouTube's own search page uses —
     * shown while the box has the caret and is still empty. */
  const historyPanel = showHistory ? (
    <SearchHistoryList
      entries={search.history}
      onPick={(entry) => { setQuery(entry); void search.search(entry); }}
      onRemove={search.forget}
      onClear={search.clearHistory}
    />
  ) : null;

  /**
   * The search page's BOARD: the whole recent-searches list, whether or not
   * the box still holds a query. It is where the back stack lands when the
   * learner walks back from the results — so it always has to be there.
   */
  const searchPageHistory = search.history.length ? (
    <SearchHistoryList
      entries={search.history}
      onPick={(entry) => { setQuery(entry); void search.search(entry); }}
      onRemove={search.forget}
      onClear={search.clearHistory}
    />
  ) : null;

  /** Every song list in the pane comes out of here — sections, empty page, options. */
  const body = (searchPage = false) => {
    if (searchLoading && !urlMode) {
      // The flash scan: a full second even on the fastest network, and for as
      // long as it really takes when the search is slow.
      return <SearchFlashScan rows={5} label="YouTube par search ho raha hai" />;
    }

    if (searchPage) {
      // ── The nested search page (module library's own shape) ──────────────
      // TWO steps, and the back arrow walks them:
      //   · the BOARD — the recent searches, the box ready to write;
      //   · the RESULTS — what the search answered.
      // Coming back from the results lands on the board; the board's back
      // arrow closes the page and returns to the library.
      const onResults = searchPageStage === "results";
      return (
        <div data-music-search-page-body>
          {onResults ? (
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
              {freshResults.length > 0 ? (
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
            </>
          ) : (
            <>
              {searchPageHistory}
              {searchPageHistory ? null : (
                <p className="px-3 py-6 text-center text-[11.5px] font-medium leading-5 text-slate-500" data-music-search-page-hint>
                  YouTube ke lectures aur songs — type karo aur Enter dabao.
                </p>
              )}
            </>
          )}
        </div>
      );
    }

    if (startOptions) {
      return (
        <div className="grid place-items-center px-3 py-6 text-center" data-music-start-options>
          {historyPanel}
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
          {historyPanel}
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
        {historyPanel}
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
      disabled={uploading}
      data-music-add-fab
      data-music-upload
      aria-label="Add music from this device"
      title="Add music from this device"
      className="absolute bottom-4 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.38)] transition hover:scale-105 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60"
    >
      {uploading ? <LoaderCircle size={22} className="animate-spin" /> : <Plus size={24} />}
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
  }) => {
    /**
     * The nested search page lives on EVERY surface the music library shows:
     * the page itself, the panel over the player (the one whose header says
     * "Music library"), and the half under a playing video.
     *
     * The owner asked for it "in any case": a tap in the music library's
     * search box opens the YouTube search page — the recent-searches board
     * and then the results — exactly the way the module library's own search
     * box opens its search page.
     */
    const searchPageActive = searchPageOpen && !urlMode;
    /** The search strip. On the PAGE it rides above the scroller; under a
     *  playing VIDEO it is rendered INSIDE the scroller instead, so the box
     *  and the filter tray scroll away with the list (owner, 2026-10-16). */
    const searchRow = (
      <div className={`shrink-0 bg-white ${mode === "video" ? "pb-1 pt-2" : "px-3 pt-3 sm:px-5"}`}>
        <div className={`mx-auto w-full ${mode === "video" ? "" : "max-w-3xl"}`}>
          {searchPageActive ? (
            // ── The nested search page's strip: back · the same box · format ──
            <div className="flex w-full min-w-0 items-center gap-2" data-music-search-page-bar>
              <button
                type="button"
                onClick={stepBackFromSearch}
                data-music-search-back
                data-music-search-back-step={searchPageStage === "results" ? "results" : "board"}
                aria-label={searchPageStage === "results" ? "Back to the search page" : "Back to the music library"}
                title={searchPageStage === "results" ? "Back to the search page" : "Back to the music library"}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">{searchBar({ compact: false, onSearchIntent: openSearchPage })}</div>
              <button
                type="button"
                onClick={flipDensity}
                data-music-search-view
                data-music-search-format-toggle
                data-music-search-format-next={densityMode === "list" ? "grid" : "list"}
                aria-pressed={densityMode === "grid"}
                aria-label={densityMode === "list" ? "Thumbnail view" : "List view"}
                title={densityMode === "list" ? "Thumbnail view" : "List view"}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border shadow-sm transition ${
                  densityMode === "grid"
                    ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {densityMode === "list" ? <LayoutGrid size={15} /> : <Rows3 size={15} />}
              </button>
            </div>
          ) : (
            searchBar({
              compact: mode === "video",
              onOpenFullPage,
              // Every surface: a tap in the box opens the YouTube search page.
              onSearchIntent: openSearchPage,
            })
          )}
        </div>
      </div>
    );
    return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white" data-music-library={mode} data-music-search-page={searchPageActive ? "open" : "closed"}>
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

      {mode === "video" ? null : searchRow}

      {mode === "video" || searchPageActive ? null : tray()}

      {notice ? (
        <p className="shrink-0 border-y border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" data-music-notice>
          {notice}
        </p>
      ) : null}

      {/* The KEY failed us — say exactly why. A refused key, a dead quota and
          a referrer the key does not allow all look identical from the
          outside ("no results"), so this is the one place that names the
          real cause. The key itself is configured in SETTINGS (never in the
          Course Player), so the note points there. */}
      {fallbackNote ? (
        <p
          className="shrink-0 border-y border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold leading-5 text-amber-800"
          data-music-search-fallback
        >
          {fallbackNote}
        </p>
      ) : null}

      {keyProblem ? (
        <div
          className="shrink-0 border-y border-rose-200 bg-rose-50 px-3 py-2"
          data-music-search-error
          data-music-search-error-code={keyProblem.error ?? "unknown"}
          role="alert"
        >
          <p className="text-[11.5px] font-semibold leading-5 text-rose-800">
            {keyProblem.message}{" "}
            <span className="font-black text-rose-900">Settings → YouTube search</span> me apni key
            badal do.
          </p>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          className={`h-full overflow-y-auto px-2.5 ${mode === "video" ? "pb-20 pt-0" : "pb-24 pt-2"} sm:px-4`}
          data-music-body
          ref={musicBodyRef}
        >
          {mode === "video" ? (
            // Under a playing video the controls live IN the scroll flow: the
            // search box and the filter tray slide up with the list, exactly
            // as the library page scrolls (owner, 2026-10-16).
            <div data-music-video-controls>
              {searchRow}
              {tray({ inFlow: true })}
            </div>
          ) : null}
          <div className={`mx-auto w-full ${mode === "video" ? "" : "max-w-5xl"}`}>{body(searchPageActive)}</div>
        </div>
        {searchPageActive ? null : addFab}
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
  };

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

  /* The video player carries NO overlay chrome of its own any more (owner,
   * 2026-10-16): YouTube's player already shows the title, its own controls
   * and the inbuilt full-screen button — our back button, the title text and
   * the full-screen toggle were all duplicates drawn on top of it. The way
   * out of the player is the compact search bar's arrow below the divider
   * (openFullLibrary), which also brings the library page back. */

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
