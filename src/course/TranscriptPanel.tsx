// src/course/TranscriptPanel.tsx
//
// THE TRANSCRIPT PAGE — the Course Player's twelfth footer tab, sitting right
// beside the Resource Library.
//
// Owner brief (2026-10-17):
//   "course player ke andar resource library button ke bagal mein footer
//    navigation mein ek aur button add karo … agar koi active YouTube video
//    play ho raha hai to uska transcript automatically yahan per dekhna chahiye
//    … loading ho to loading dikhayein … agar koi active video na play kar raha
//    ho to clear design mein likhein … aur har timestamp par click karne se
//    YouTube video uss jagah se live skip ho kar chale."
//
// So the page has exactly three faces:
//
//   1. A video is open → the transcript fetches itself and paints immediately.
//      The line under the playhead is highlighted, auto-follows politely, and
//      every line is a button: tap it and the lesson's YouTube player jumps to
//      that second and keeps playing.
//   2. It is fetching → a transcript-shaped skeleton, so the page never jumps.
//   3. No video → a designed empty state that says what to do, with the course
//      library one tap away AND a real YouTube search right there (a result
//      plays in the main lesson pane, and the transcript appears by itself).
//
// The actual YouTube work happens server-side (api/_lib/youtubeTranscript.ts);
// this component never scrapes YouTube from the learner's browser.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Captions,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  Library,
  Loader2,
  PlayCircle,
  MonitorPlay,
  RefreshCw,
  Search,
} from "lucide-react";
import type { CourseFile } from "../types/course";
import { getYouTubeWatchUrl } from "../utils/courseEmbed";
import CoursePageHeader from "./CoursePageHeader";
import YouTubeKeyCard from "./YouTubeKeyCard";
import {
  searchYouTubeOutcome,
  subscribeYouTubeKey,
  youTubeSearchAvailable,
  youTubeSearchUrl,
} from "./musicSearch";
import type { MusicTrack } from "./musicLibrary";
import { requestYouTubeSeek, subscribeYouTubeProgress } from "./youtubePlayerBus";
import {
  activeTranscriptIndex,
  forgetTranscript,
  loadYouTubeTranscript,
  TRANSCRIPT_ERROR_COPY,
  TranscriptRequestError,
  transcriptTimestamp,
  youTubeVideoIdForFile,
  type TranscriptClientErrorCode,
  type TranscriptData,
} from "./youtubeTranscript";
import "./transcriptPanel.css";

export type TranscriptPanelProps = {
  /** The file open in the lesson pane right now. */
  activeFile?: CourseFile | null;
  /** The signed-in learner — their own YouTube search key is per account. */
  uid?: string | null;
  /** Switch the study pane to the Resource Library (the empty state's CTA). */
  onOpenLibrary?: () => void;
  /**
   * Play a YouTube search result in the MAIN lesson pane — the same place the
   * course's own videos play. The transcript then loads for it automatically.
   * Without it a result opens YouTube in a new tab.
   */
  onPlayYouTube?: (track: MusicTrack) => void;
};

type LoadPhase = "idle" | "loading" | "ready" | "error";

const EMPTY_COPY =
  "Play any video from the course library — or search and play one right here — and its transcript will appear automatically, line by line, with timestamps.";

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
};

function ErrorState({
  message,
  code,
  watchUrl,
  onRetry,
}: {
  message: string;
  code?: string;
  watchUrl: string;
  onRetry: () => void;
}) {
  const isRateLimited = code === "too_many_requests";
  const isNoCaptions = code === "no_captions";
  return (
    <div className="course-transcript__state" data-course-transcript-error role="alert" data-course-transcript-error-code={code || ""}>
      <span className="course-transcript__state-icon course-transcript__state-icon--warn">
        <AlertTriangle size={24} aria-hidden="true" />
      </span>
      <p className="course-transcript__state-eyebrow">Transcript unavailable</p>
      <h3 className="course-transcript__state-title">
        {isRateLimited ? "YouTube is limiting requests right now" : isNoCaptions ? "No captions for this video" : "We couldn't read this video's captions"}
      </h3>
      <p className="course-transcript__state-copy">{message}</p>
      {isRateLimited ? (
        <p className="course-transcript__state-copy course-transcript__state-copy--hint">
          This happens when many transcript requests come from the same network. Waiting a minute and retrying usually works. You can also open the video on YouTube and use its own transcript button (⋯ → Show transcript).
        </p>
      ) : null}
      <div className="course-transcript__actions">
        <button type="button" className="course-transcript__btn course-transcript__btn--primary" onClick={onRetry} data-course-transcript-retry>
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
        {watchUrl ? (
          <a className="course-transcript__btn" href={watchUrl} target="_blank" rel="noopener noreferrer">
            Open on YouTube <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState({ fileName }: { fileName?: string }) {
  return (
    <div className="course-transcript__loading" data-course-transcript-loading aria-live="polite" aria-busy="true">
      <div className="course-transcript__loading-head">
        <span className="course-transcript__spinner" aria-hidden="true" />
        <div>
          <p className="course-transcript__loading-title">Fetching the transcript…</p>
          <p className="course-transcript__loading-sub">
            {fileName ? `Reading captions for “${fileName}”` : "Reading the video's caption track"}
          </p>
        </div>
      </div>
      <div className="course-transcript__skeleton" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div className="course-transcript__skeleton-row" key={row} style={{ animationDelay: `${row * 80}ms` }}>
            <span className="course-transcript__skeleton-stamp" />
            <span className="course-transcript__skeleton-lines">
              <span className="course-transcript__skeleton-line" />
              <span className="course-transcript__skeleton-line course-transcript__skeleton-line--short" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type EmptyStateProps = {
  activeFile?: CourseFile | null;
  uid?: string | null;
  onOpenLibrary?: () => void;
  onPlayYouTube?: (track: MusicTrack) => void;
};

function EmptyState({ activeFile, uid, onOpenLibrary, onPlayYouTube }: EmptyStateProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<MusicTrack[]>([]);
  const [message, setMessage] = useState("");
  const [searchTouched, setSearchTouched] = useState(false);
  const [keyReady, setKeyReady] = useState(() => youTubeSearchAvailable(uid));
  const requestRef = useRef(0);

  useEffect(() => {
    setKeyReady(youTubeSearchAvailable(uid));
    return subscribeYouTubeKey(() => setKeyReady(youTubeSearchAvailable(uid)));
  }, [uid]);

  const openHit = (track: MusicTrack) => {
    if (onPlayYouTube) {
      onPlayYouTube(track);
      return;
    }
    window.open(track.url, "_blank", "noopener,noreferrer");
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setSearching(true);
    setSearchTouched(true);
    setMessage("");
    setHits([]);
    const outcome = await searchYouTubeOutcome(text, undefined, uid);
    if (requestRef.current !== request) return;
    setSearching(false);
    setHits(outcome.rows.slice(0, 6));
    if (outcome.error) setMessage(outcome.message);
    else if (!outcome.rows.length) setMessage(`YouTube found no videos for “${text}”. Try another search.`);
  };

  const notYouTube = Boolean(activeFile && !youTubeVideoIdForFile(activeFile));
  const eyebrow = notYouTube ? "The open lesson is not a video" : "No video playing";
  const title = notYouTube ? "Open a YouTube lesson" : "Play a video to see its transcript";
  const copy = notYouTube
    ? `“${activeFile?.name || "This resource"}” is a ${String(activeFile?.type || "resource")}, not a YouTube video. ${EMPTY_COPY}`
    : EMPTY_COPY;

  return (
    <div className="course-transcript__empty" data-course-transcript-empty>
      <section className="course-transcript__hero">
        <span className="course-transcript__hero-icon" aria-hidden="true">
          <Captions size={30} strokeWidth={1.9} />
          <span className="course-transcript__hero-play">
            <PlayCircle size={15} strokeWidth={2.4} />
          </span>
        </span>
        <p className="course-transcript__state-eyebrow">{eyebrow}</p>
        <h3 className="course-transcript__hero-title">{title}</h3>
        <p className="course-transcript__hero-copy">{copy}</p>
        <p className="course-transcript__hero-hint">
          <span className="course-transcript__tap-mark" aria-hidden="true">↳</span>
          Tap any timestamp to jump straight to that moment in the video.
        </p>

        <div className="course-transcript__steps" aria-hidden="true">
          <span className="course-transcript__step"><b>1</b> Play a video</span>
          <span className="course-transcript__step-line" />
          <span className="course-transcript__step"><b>2</b> Read along</span>
          <span className="course-transcript__step-line" />
          <span className="course-transcript__step"><b>3</b> Tap a time</span>
        </div>

        <div className="course-transcript__actions course-transcript__actions--center">
          {onOpenLibrary ? (
            <button
              type="button"
              className="course-transcript__btn course-transcript__btn--primary"
              onClick={onOpenLibrary}
              data-course-transcript-open-library
            >
              <Library size={15} aria-hidden="true" /> Open Resource Library
            </button>
          ) : null}
          <a
            className="course-transcript__btn"
            href={youTubeSearchUrl(query.trim() || "study lecture")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MonitorPlay size={15} aria-hidden="true" /> Search on YouTube
          </a>
        </div>
      </section>

      <section className="course-transcript__search" data-course-transcript-search>
        <div className="course-transcript__search-head">
          <span className="course-transcript__search-icon" aria-hidden="true"><MonitorPlay size={16} /></span>
          <div>
            <p className="course-transcript__search-title">Search and play right here</p>
            <p className="course-transcript__search-sub">A result opens in the lesson pane, and the transcript follows automatically.</p>
          </div>
        </div>
        <form className="course-transcript__search-form" onSubmit={runSearch} role="search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a lecture or a song on YouTube…"
            aria-label="Search YouTube for a video to transcribe"
            className="course-transcript__search-input"
            data-course-transcript-search-input
          />
          <button
            type="submit"
            className="course-transcript__search-submit"
            aria-label="Search YouTube"
            disabled={searching || !query.trim()}
            data-course-transcript-search-submit
          >
            {searching ? <Loader2 size={16} className="course-transcript__spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          </button>
        </form>

        {!keyReady ? (
          <div className="course-transcript__key-note" data-course-transcript-key-note>
            <p>
              <KeyRound size={13} aria-hidden="true" />
              Inline search needs a YouTube API key. Your key stays in this browser.
            </p>
            <details className="course-transcript__key-details">
              <summary>Add your YouTube key</summary>
              <YouTubeKeyCard uid={uid ?? null} onChanged={() => setKeyReady(youTubeSearchAvailable(uid))} className="course-transcript__keycard" />
            </details>
          </div>
        ) : null}

        {searching ? (
          <div className="course-transcript__search-loading" aria-live="polite">
            {[0, 1, 2].map((row) => (
              <div className="course-transcript__search-skeleton" key={row} aria-hidden="true">
                <span className="course-transcript__search-thumb-skeleton" />
                <span className="course-transcript__search-skeleton-lines">
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {!searching && hits.length ? (
          <ul className="course-transcript__hits" data-course-transcript-search-results>
            {hits.map((track) => (
              <li key={track.id || track.url}>
                <button type="button" className="course-transcript__hit" onClick={() => openHit(track)} data-course-transcript-search-hit>
                  <span className="course-transcript__hit-thumb">
                    {track.thumbnailUrl ? (
                      <img src={track.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <MonitorPlay size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span className="course-transcript__hit-text">
                    <span className="course-transcript__hit-title">{track.title}</span>
                    <span className="course-transcript__hit-sub">{track.subtitle || "YouTube"}</span>
                  </span>
                  <PlayCircle size={16} className="course-transcript__hit-play" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {!searching && searchTouched && message ? (
          <p className="course-transcript__search-message" role="status">
            {message}{" "}
            <a href={youTubeSearchUrl(query.trim())} target="_blank" rel="noopener noreferrer">
              Search on YouTube <ExternalLink size={11} aria-hidden="true" />
            </a>
          </p>
        ) : null}
      </section>
    </div>
  );
}

export default function TranscriptPanel({
  activeFile = null,
  uid = null,
  onOpenLibrary,
  onPlayYouTube,
}: TranscriptPanelProps) {
  const videoId = useMemo(() => youTubeVideoIdForFile(activeFile), [activeFile]);
  const [language, setLanguage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [phase, setPhase] = useState<LoadPhase>("idle");
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<{ code: TranscriptClientErrorCode; message: string } | null>(null);
  const [clock, setClock] = useState({ position: 0, duration: 0 });
  const [copied, setCopied] = useState(false);
  const [follow, setFollow] = useState(true);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const followTimerRef = useRef<number | null>(null);

  const watchUrl = activeFile ? getYouTubeWatchUrl(activeFile) : "";

  // A different video is a different page state; the language choice belongs
  // to the video it was made on.
  useEffect(() => {
    setLanguage("");
    setClock({ position: 0, duration: 0 });
    setCopied(false);
  }, [videoId]);

  // ── The transcript itself ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoId) {
      setPhase("idle");
      setData(null);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setPhase("loading");
    setError(null);
    setData((current) => (current && current.videoId === videoId ? current : null));
    loadYouTubeTranscript(videoId, language, controller.signal)
      .then((transcript) => {
        if (controller.signal.aborted) return;
        setData(transcript);
        setPhase("ready");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (caught instanceof TranscriptRequestError && caught.code === "aborted") return;
        const code: TranscriptClientErrorCode = caught instanceof TranscriptRequestError ? caught.code : "fetch_failed";
        setError({
          code,
          message: caught instanceof Error && caught.message && caught.message !== code
            ? caught.message
            : TRANSCRIPT_ERROR_COPY[code],
        });
        setPhase("error");
      });
    return () => controller.abort();
  }, [videoId, language, reloadNonce]);

  // ── The player's clock (once a second while it is the active file) ────
  useEffect(() => {
    if (!videoId) return undefined;
    return subscribeYouTubeProgress((detail) => {
      if (detail.videoId !== videoId) return;
      setClock({ position: detail.position, duration: detail.duration });
    });
  }, [videoId]);

  const segments = data?.segments ?? [];
  // YouTube often offers a manual and an auto-generated track for the SAME
  // language. Both would send `lang=<code>`, so the picker shows one row per
  // language, preferring the manual (human) track — no dead options.
  const languageOptions = useMemo(() => {
    const byLanguage = new Map<string, { language: string; label: string; autoGenerated: boolean }>();
    for (const track of data?.tracks ?? []) {
      const current = byLanguage.get(track.language);
      if (!current || (current.autoGenerated && !track.autoGenerated)) byLanguage.set(track.language, track);
    }
    return [...byLanguage.values()];
  }, [data]);
  const activeIndex = useMemo(
    () => (segments.length ? activeTranscriptIndex(segments, clock.position) : -1),
    [segments, clock.position],
  );

  // ── Polite auto-follow ────────────────────────────────────────────────
  // While the learner is reading at their own pace the list must not yank
  // itself; a wheel / touch gesture pauses following for a few seconds, then
  // the page rejoins the playhead by itself.
  // The language picker is a small dialog-free popover: the app's Liquid
  // Glass contract forbids native <select> controls outside the admin panel.
  useEffect(() => {
    if (!languageMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && languageMenuRef.current?.contains(event.target)) return;
      setLanguageMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [languageMenuOpen]);

  const pauseFollow = useCallback(() => {
    setFollow(false);
    if (followTimerRef.current) window.clearTimeout(followTimerRef.current);
    followTimerRef.current = window.setTimeout(() => setFollow(true), 7000);
  }, []);

  useEffect(() => () => {
    if (followTimerRef.current) window.clearTimeout(followTimerRef.current);
  }, []);

  useEffect(() => {
    if (!follow || phase !== "ready" || activeIndex < 0) return;
    const list = listRef.current;
    if (!list) return;
    const line = list.querySelector<HTMLElement>(`[data-transcript-line="${activeIndex}"]`);
    if (!line) return;
    const top = line.offsetTop;
    const bottom = top + line.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (top < viewTop + 12 || bottom > viewBottom - 12) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight * 0.32), behavior: "smooth" });
    }
  }, [activeIndex, follow, phase]);

  const retry = () => {
    if (videoId) forgetTranscript(videoId, language);
    setReloadNonce((value) => value + 1);
  };

  const seekTo = (start: number) => {
    if (!videoId) return;
    requestYouTubeSeek(videoId, start);
    // Move the highlight at once — the player's own poll confirms it a beat later.
    setClock((current) => ({ ...current, position: start }));
    setFollow(true);
  };

  const copyTranscript = async () => {
    if (!data?.segments.length) return;
    const text = data.segments
      .map((segment) => `[${transcriptTimestamp(segment.start)}] ${segment.text}`)
      .join("\n");
    if (await copyToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const hasVideo = Boolean(videoId);
  const fileName = activeFile?.name || "";
  const lineCount = segments.length;
  const showList = hasVideo && phase === "ready" && data;

  return (
    <div className="course-transcript" data-course-transcript-panel>
      <CoursePageHeader
        title="Transcript"
        icon={<Captions size={20} aria-hidden="true" />}
        dataAttrs={{ "data-course-transcript-header": "" }}
      >
        {showList ? (
          <>
            <button
              type="button"
              className="course-transcript__header-action"
              onClick={copyTranscript}
              aria-label={copied ? "Transcript copied" : "Copy the whole transcript"}
              title={copied ? "Copied" : "Copy transcript"}
              data-course-transcript-copy
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            {watchUrl ? (
              <a
                className="course-transcript__header-action course-transcript__header-action--icon"
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open this video on YouTube"
                title="Open on YouTube"
              >
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            ) : null}
          </>
        ) : null}
      </CoursePageHeader>

      <div className="course-transcript__body">
        {!hasVideo ? (
          <div className="course-transcript__center">
            <EmptyState
              activeFile={activeFile}
              uid={uid}
              onOpenLibrary={onOpenLibrary}
              onPlayYouTube={onPlayYouTube}
            />
          </div>
        ) : phase === "error" ? (
          <div className="course-transcript__center">
            <ErrorState
              message={error?.message || TRANSCRIPT_ERROR_COPY.fetch_failed}
              code={error?.code}
              watchUrl={watchUrl}
              onRetry={retry}
            />
          </div>
        ) : !data || phase === "loading" ? (
          <LoadingState fileName={fileName} />
        ) : (
          <>
            <div className="course-transcript__now" data-course-transcript-now>
              <div className="course-transcript__now-main">
                <span className="course-transcript__live" aria-hidden="true">
                  <span className="course-transcript__live-dot" /> Now playing
                </span>
                <p className="course-transcript__now-title" title={data.title || fileName}>
                  {data.title || fileName || "YouTube video"}
                </p>
              </div>
              <div className="course-transcript__now-side">
                <span className="course-transcript__badge" data-course-transcript-language>
                  {data.autoGenerated ? "Auto-generated" : "Captions"} · {data.languageLabel}
                </span>
                {languageOptions.length > 1 ? (
                  <div className="course-transcript__language" ref={languageMenuRef}>
                    <button
                      type="button"
                      className="course-transcript__language-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={languageMenuOpen}
                      onClick={() => setLanguageMenuOpen((open) => !open)}
                      data-course-transcript-language-trigger
                    >
                      <span>{data.languageLabel}</span>
                      <ChevronDown size={12} aria-hidden="true" className={languageMenuOpen ? "course-transcript__language-chevron course-transcript__language-chevron--open" : "course-transcript__language-chevron"} />
                    </button>
                    {languageMenuOpen ? (
                      <div className="course-transcript__language-menu" role="listbox" aria-label="Transcript language">
                        {languageOptions.map((track) => {
                          const optionKey = `${track.language}-${track.autoGenerated ? "asr" : "manual"}`;
                          const selected = track.language === data.language;
                          return (
                            <button
                              key={optionKey}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className="course-transcript__language-option"
                              data-course-transcript-language-option={optionKey}
                              onClick={() => {
                                setLanguage(track.language);
                                setLanguageMenuOpen(false);
                              }}
                            >
                              <span>{track.label}</span>
                              {selected ? <Check size={12} aria-hidden="true" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <span className="course-transcript__clock" data-course-transcript-clock>
                  {transcriptTimestamp(clock.position)}
                  <span>{clock.duration > 0 ? ` / ${transcriptTimestamp(clock.duration)}` : ""}</span>
                </span>
              </div>
            </div>

            <div
              className="course-transcript__list"
              ref={listRef}
              onWheel={pauseFollow}
              onTouchMove={pauseFollow}
              data-course-transcript-list
              aria-label="Transcript lines. Select a line to jump to that moment in the video."
            >
              {segments.map((segment, index) => (
                <button
                  key={`${segment.start}-${index}`}
                  type="button"
                  className="course-transcript__line"
                  data-transcript-line={index}
                  data-active={index === activeIndex ? "true" : "false"}
                  aria-current={index === activeIndex ? "true" : undefined}
                  aria-label={`Jump to ${transcriptTimestamp(segment.start)}`}
                  onClick={() => seekTo(segment.start)}
                >
                  <span className="course-transcript__stamp">{transcriptTimestamp(segment.start)}</span>
                  <span className="course-transcript__line-text">{segment.text}</span>
                  {index === activeIndex ? (
                    <span className="course-transcript__line-live" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                  ) : null}
                </button>
              ))}
              {data.truncated ? (
                <p className="course-transcript__truncated">
                  This is a very long video — the first {lineCount.toLocaleString()} lines are shown.
                </p>
              ) : null}
              <div className="course-transcript__list-end" aria-hidden="true" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
