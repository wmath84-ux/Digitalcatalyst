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
// ── The LIBRARY (the button in the header) ────────────────────────────────
// One sheet, three shelves, all of it playable:
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
  AudioLines, ExternalLink, Library, Link2, LoaderCircle, Music, Music2, Pause, Play,
  Search, Trash2, Upload, X,
} from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import { toast } from "../components/ui/glass-toast";
import {
  MUSIC_UPLOAD_MAX_BYTES, addMusicLink, filterMusicTracks, loadLastMusic, loadMusicLinks,
  musicRowBadge, removeMusicLink, saveLastMusic, saveMusicLinks, type MusicTrack,
} from "./musicLibrary";
import { listLocalSongs, removeLocalSong, songObjectUrl, storeLocalSong } from "./musicDb";
import { resolveMusicTitle, searchYouTube, youTubeSearchAvailable, youTubeSearchUrl } from "./musicSearch";

interface MusicPanelProps {
  /** The signed-in learner — the library and the local songs are keyed on it. */
  uid?: string | null;
  /** Every audio resource this course ships (`collectCourseAudio`). */
  courseAudio?: MusicTrack[];
  /** False while the pane is mounted but off screen: playback pauses. */
  active?: boolean;
}

type Shelf = "course" | "upload" | "link";

const SHELF_TITLE: Record<Shelf, string> = {
  course: "Course audio",
  upload: "My files",
  link: "Saved links",
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
  const searchKeyReady = youTubeSearchAvailable();

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
    setSheetOpen(false);
  }, [uid]);

  const courseTracks = courseAudio;
  const shelves: Array<{ shelf: Shelf; tracks: MusicTrack[] }> = useMemo(() => ([
    { shelf: "course", tracks: filterMusicTracks(courseTracks, query) },
    { shelf: "upload", tracks: filterMusicTracks(uploads, query) },
    { shelf: "link", tracks: filterMusicTracks(links, query) },
  ]), [courseTracks, uploads, links, query]);

  const total = courseTracks.length + uploads.length + links.length;

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
    setResults(await searchYouTube(text));
    setBusy(false);
  }, [query, searchKeyReady]);

  const stageVisible = Boolean(current) && active;
  const embed = current && current.provider !== "audio" ? current.embedUrl : "";

  return (
    <section className="flex h-full min-h-0 flex-col" data-course-music-panel data-music-active={active ? "true" : "false"}>
      {/* ── Header: the title, the shelf count and the LIBRARY button ───── */}
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2.5 py-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-200">
          <Music2 size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-white">Music</span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {total} song{total === 1 ? "" : "s"} · course, device & links
          </span>
        </span>
        <button type="button" data-music-library-toggle onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen} aria-label={sheetOpen ? "Close the music library" : "Open the music library"}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[11px] font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          {sheetOpen ? <X size={14} /> : <Library size={14} />}
          Library
        </button>
      </header>

      {/* ── Stage: the glass player, or the platform's own embed ─────────── */}
      <div
        className={`relative grid shrink-0 place-items-center overflow-hidden border-b border-white/10 bg-black/35 ${sheetOpen ? "h-[38%] min-h-[190px]" : "min-h-0 flex-1"}`}
        data-music-stage={current ? current.provider : "empty"}
      >
        {!current ? (
          <div className="grid gap-2 px-5 text-center" data-music-empty>
            <AudioLines size={26} className="mx-auto text-fuchsia-200/80" />
            <p className="text-[13px] font-bold text-white">Apna music library kholo</p>
            <p className="text-[11px] font-medium text-slate-400">
              Course ke audio lessons, device ke apne songs, aur YouTube / Spotify / SoundCloud links — sab ek jagah.
            </p>
            <button type="button" onClick={() => setSheetOpen(true)}
              className="mx-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-fuchsia-500/85 px-3.5 text-[11px] font-black text-white hover:bg-fuchsia-500">
              <Library size={14} /> Library kholo
            </button>
          </div>
        ) : resolving ? (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <LoaderCircle size={15} className="animate-spin" /> Song load ho raha hai…
          </span>
        ) : current.provider === "audio" || !stageVisible ? (
          // A direct file (course lesson or the learner's own upload) keeps the
          // glass player MOUNTED through a tab switch — it pauses and banks its
          // position, exactly like an audio lesson does.
          current.provider === "audio" && playUrl ? (
            <AudioPlayer url={playUrl} name={current.title} active={active} />
          ) : (
            <p data-music-paused className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-white">
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
          <p className="px-5 text-center text-[11px] font-semibold text-slate-400">Ye song abhi load nahi ho paya.</p>
        )}
      </div>

      {/* ── Library sheet ───────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="flex min-h-0 flex-1 flex-col" data-music-library-sheet>
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2.5 py-2">
            <span className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)}
                data-music-search placeholder="Library mein dhoondo…" aria-label="Search the music library"
                className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-8 pr-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-fuchsia-400/70" />
            </span>
            {searchKeyReady ? (
              <button type="button" onClick={runSearch} disabled={busy || !query.trim()} data-music-search-run
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-fuchsia-500/85 px-3 text-[11px] font-black text-white hover:bg-fuchsia-500 disabled:opacity-50">
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />} YouTube
              </button>
            ) : (
              // No API key: hand the query to YouTube itself. An ANCHOR, so it
              // opens correctly in a browser, a PWA and the native shell alike.
              <a href={youTubeSearchUrl(query)} target="_blank" rel="noopener noreferrer"
                data-music-search-external
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[11px] font-bold text-white hover:bg-white/10">
                <ExternalLink size={14} /> YouTube
              </a>
            )}
          </div>

          {/* Add rows: a link, or a file off the device. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-2.5 py-2">
            <span className="relative min-w-[180px] flex-1">
              <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void addLink(); }}
                data-music-link placeholder="YouTube / Spotify / SoundCloud / .mp3 link paste karo"
                aria-label="Paste a song link"
                className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-8 pr-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-fuchsia-400/70" />
            </span>
            <button type="button" onClick={() => void addLink()} disabled={!linkDraft.trim()} data-music-add-link
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-fuchsia-500/85 px-3 text-[11px] font-black text-white hover:bg-fuchsia-500 disabled:opacity-50">
              <Play size={14} /> Add
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} data-music-upload
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[11px] font-bold text-white hover:bg-white/10 disabled:opacity-50">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} Device se
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" data-music-file
              aria-label="Choose an audio file from this device"
              onChange={(event) => void onPickFile(event.target.files?.[0])} />
          </div>

          {notice && (
            <p className="shrink-0 border-b border-amber-300/20 bg-amber-400/10 px-2.5 py-2 text-[11px] font-semibold text-amber-100" data-music-notice>
              {notice}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
            {results.length > 0 && (
              <div className="mb-3" data-music-results>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">YouTube results</p>
                <ul className="grid gap-1.5">
                  {results.map((track) => (
                    <li key={track.id}>
                      <button type="button" data-music-result onClick={() => { setLinks(addMusicLink(uid, track.url)?.tracks ?? links); select(track); }}
                        className="flex w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.045] p-2 text-left hover:border-fuchsia-300/40 hover:bg-fuchsia-400/[0.09]">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100"><Play size={15} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold text-white">{track.title}</span>
                          <span className="block truncate text-[10px] font-semibold text-slate-400">{track.subtitle}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {shelves.map(({ shelf, tracks }) => (
              <div key={shelf} className="mb-3" data-music-section={shelf} data-music-section-count={tracks.length}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {SHELF_TITLE[shelf]} · {tracks.length}
                </p>
                {tracks.length === 0 ? (
                  <p className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-slate-400">
                    {query ? "Kuch nahin mila." : SHELF_EMPTY[shelf]}
                  </p>
                ) : (
                  <ul className="grid gap-1.5">
                    {tracks.map((track) => (
                      <li key={track.id}>
                        <div
                          data-music-track={track.id}
                          data-music-track-source={track.source}
                          data-music-playing={current?.id === track.id ? "true" : "false"}
                          className={`group flex items-center gap-2.5 rounded-2xl border p-2 ${current?.id === track.id ? "border-fuchsia-300/45 bg-fuchsia-400/[0.12]" : "border-white/10 bg-white/[0.045]"}`}>
                          <button type="button" onClick={() => select(track)} aria-label={`Play ${track.title}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-400/20">
                            {providerIcon(track)}
                          </button>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-bold text-white">{track.title}</span>
                            <span className="block truncate text-[10px] font-semibold text-slate-400">{track.subtitle}</span>
                          </span>
                          <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[9px] font-semibold text-slate-300 sm:inline-flex">
                            {musicRowBadge(track)}
                          </span>
                          {track.source !== "course" && (
                            <button type="button" onClick={() => void forget(track)} aria-label={`Remove ${track.title}`}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-rose-500/15 hover:text-rose-200">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            <p className="pt-1 text-[10px] font-medium leading-relaxed text-slate-500">
              YouTube, Spotify aur SoundCloud apne hi official player se chalte hain — DRM songs kisi doosre player mein chal hi nahi sakte.
              Device se add kiye songs sirf is device par rehte hain, max {Math.round(MUSIC_UPLOAD_MAX_BYTES / (1024 * 1024))} MB per file.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
