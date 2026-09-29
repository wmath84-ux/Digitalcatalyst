// src/course/ExperimentStage.tsx
//
// The sandboxed stage that RUNS an "interactive 2D experiment" — the learner's
// own single-file HTML (usually written by an AI from the builder's prompt).
//
// One component serves both surfaces on purpose:
//
//   · the Course Player's viewer (ResourceViewer) — full stage, bridge,
//     progress + completion reporting, error panel;
//   · the Study Library builder's live preview — the SAME framing, so what the
//     learner previews while editing is exactly what plays in the lesson.
//
// Isolation (see src/utils/experimentSpec.ts for the full reasoning):
// the document runs in an iframe whose sandbox list NEVER carries
// `allow-same-origin` for inline source. Without it the frame's origin is
// opaque, so pasted HTML cannot read the app's DOM, cookies, storage or the
// Firebase session — it can only draw inside its own box.
//
// The frame ⇄ player messages are tiny and declarative:
//   in  → { type: "theme" | "pause" | "play", theme?, tokens? }
//   out → { type: "ready" | "progress" | "complete" | "error" | "note", … }

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Pause, Play, RefreshCw } from "lucide-react";
import { GlassButton } from "../components/ui/glass-button";
import {
  EXPERIMENT_ALLOW,
  EXPERIMENT_HOST_SOURCE,
  EXPERIMENT_SANDBOX_HOSTED,
  EXPERIMENT_SANDBOX_INLINE,
  buildExperimentDocument,
  experimentHasSource,
  parseExperimentMessage,
} from "../utils/experimentSpec";

export interface ExperimentStageProps {
  /** The learner's (or the AI's) HTML. Wins over `url` when both exist. */
  html?: string;
  /** A hosted experiment page — used only when there is no inline source. */
  url?: string;
  title?: string;
  /** False while the lesson is hidden behind another module (pauses the loop). */
  active?: boolean;
  /** Hide the stage chrome (kept for the builder's thumbnail-free preview). */
  compact?: boolean;
  /** Fired when the experiment marks itself complete (`window.dcExperiment.complete()`). */
  onComplete?: () => void;
  /** Last message from inside the frame — used by the builder's status line. */
  onStatus?: (status: ExperimentStatus) => void;
}

export interface ExperimentStatus {
  ready: boolean;
  failed: boolean;
  /** 0…1 while the learner works (optional: the experiment must report it). */
  progress: number;
  /** The experiment said it is finished. */
  completed: boolean;
  note: string;
  error: string;
}

const EMPTY_STATUS: ExperimentStatus = { ready: false, failed: false, progress: 0, completed: false, note: "", error: "" };

/** How long we wait for the frame's own "ready" before showing it anyway. */
const READY_TIMEOUT_MS = 6000;

export default function ExperimentStage({
  html = "",
  url = "",
  title = "Interactive experiment",
  active = true,
  compact = false,
  onComplete,
  onStatus,
}: ExperimentStageProps) {
  const inline = Boolean(String(html || "").trim());
  const source = inline ? "" : String(url || "").trim();
  const runnable = experimentHasSource(html, url);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<ExperimentStatus>(EMPTY_STATUS);
  /** The player's own colours, read off the live CSS variables (never guessed). */
  const [theme, setTheme] = useState<{ mode: "dark" | "light"; ink: string; background: string; accent: string }>({
    mode: "dark",
    ink: "#ffffff",
    background: "transparent",
    accent: "",
  });

  // ── Match the Course Player's palette ────────────────────────────────────
  // `--course-text` / `--course-bg` inherit down from the player's theme
  // wrapper, so reading them here keeps an experiment sitting on the exact
  // surface the lesson behind it uses (including the flat/dark player chrome).
  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof window === "undefined") return;
    const read = () => {
      const styles = window.getComputedStyle(node);
      const ink = styles.getPropertyValue("--course-text").trim() || "#ffffff";
      const background = styles.getPropertyValue("--course-bg").trim();
      const accent = styles.getPropertyValue("--course-strong").trim();
      setTheme({
        mode: isLightInk(ink) ? "light" : "dark",
        ink,
        background: background && background !== "transparent" ? background : "transparent",
        accent,
      });
    };
    read();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    return () => observer?.disconnect();
  }, []);

  const experimentDocument = useMemo(
    () => (inline ? buildExperimentDocument(html, { theme: theme.mode, ink: theme.ink, background: theme.background, accent: theme.accent }) : ""),
    [inline, html, theme.mode, theme.ink, theme.background, theme.accent],
  );

  const post = useCallback((message: Record<string, unknown>) => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ source: EXPERIMENT_HOST_SOURCE, ...message }, "*");
    } catch {
      /* the frame is mid-navigation — the next message will land */
    }
  }, []);

  const announce = useCallback(() => {
    post({ type: "theme", theme: theme.mode, tokens: { ink: theme.ink, bg: theme.background, accent: theme.accent } });
    post({ type: active ? "play" : "pause" });
  }, [post, theme.mode, theme.ink, theme.background, theme.accent, active]);

  // A fresh frame starts from zero: forget the old experiment's status.
  useEffect(() => {
    setStatus(EMPTY_STATUS);
  }, [experimentDocument, source, reloadKey]);

  // The host's own "open the lesson / leave the lesson" signal.
  useEffect(() => {
    post({ type: active ? "play" : "pause" });
  }, [active, post, reloadKey]);

  // The frame never reports ready (hosted page, or the experiment's own script
  // failed before `load`): show it anyway rather than hiding a working page
  // behind a spinner forever.
  useEffect(() => {
    if (!runnable) return undefined;
    const timer = setTimeout(() => {
      setStatus((current) => (current.ready ? current : { ...current, ready: true }));
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [runnable, experimentDocument, source, reloadKey]);

  // ── Messages FROM the experiment ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const parsed = parseExperimentMessage(event.data);
      if (!parsed) return;
      if (parsed.type === "ready") {
        setStatus((current) => ({ ...current, ready: true, failed: false }));
        announce();
        return;
      }
      if (parsed.type === "progress") {
        setStatus((current) => ({ ...current, progress: Math.max(0, Math.min(1, Number(parsed.value) || 0)) }));
        return;
      }
      if (parsed.type === "complete") {
        setStatus((current) => ({ ...current, completed: true, progress: 1 }));
        onComplete?.();
        return;
      }
      if (parsed.type === "note") {
        setStatus((current) => ({ ...current, note: String(parsed.text || "").slice(0, 200) }));
        return;
      }
      if (parsed.type === "error") {
        setStatus((current) => ({
          ...current,
          ready: true,
          failed: true,
          error: String(parsed.message || "The experiment stopped unexpectedly.").slice(0, 300),
        }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [announce, onComplete]);

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  const restart = useCallback(() => {
    setStatus(EMPTY_STATUS);
    setReloadKey((value) => value + 1);
  }, []);

  if (!runnable) {
    return (
      <div className="grid h-full min-h-[220px] place-items-center p-6 text-center text-[var(--course-text)]" data-experiment-empty>
        <div className="max-w-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-3 font-black">This experiment has no source</p>
          <p className="mt-1 text-sm text-[var(--course-muted)]">
            Add the HTML in My Study Library — or pick a starter template — and it will play here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--course-bg,transparent)] text-[var(--course-text)]"
      data-experiment-stage
      data-experiment-mode={inline ? "inline" : "hosted"}
      data-experiment-ready={status.ready ? "true" : "false"}
      data-experiment-failed={status.failed ? "true" : "false"}
      data-experiment-progress={status.progress ? status.progress.toFixed(2) : undefined}
    >
      {!status.ready ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[var(--course-loading)]" data-experiment-loading>
          <div className="flex flex-col items-center gap-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-violet-400" />
            <p className="text-xs font-semibold text-[var(--course-muted)]">Starting experiment…</p>
          </div>
        </div>
      ) : null}

      <iframe
        key={reloadKey}
        ref={frameRef}
        {...(inline ? { srcDoc: experimentDocument } : { src: source })}
        title={title}
        className="block h-full max-h-full min-h-0 w-full max-w-full min-w-0 border-0 bg-transparent"
        // The inline contract (see experimentSpec.ts): scripts run, popups and
        // downloads are allowed, and same-origin is deliberately absent.
        sandbox={inline ? EXPERIMENT_SANDBOX_INLINE : EXPERIMENT_SANDBOX_HOSTED}
        allow={EXPERIMENT_ALLOW}
        allowFullScreen
        referrerPolicy="no-referrer"
        data-experiment-frame
        onLoad={() => {
          announce();
          // Hosted pages have no bridge of their own — a load IS "ready".
          if (!inline) setStatus((current) => ({ ...current, ready: true, failed: false }));
        }}
      />

      {/* The experiment crashed: say so, offer a restart, never a blank box. */}
      {status.failed ? (
        <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 bg-amber-500/95 px-3 py-2 text-[11px] font-bold text-black" data-experiment-error>
          <AlertTriangle size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={status.error}>
            {status.error || "The experiment stopped."}
          </span>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-1 text-[10px] font-black text-white"
            data-experiment-restart
          >
            <RefreshCw size={11} /> Restart
          </button>
        </div>
      ) : null}

      {/* Progress + the lesson controls live INSIDE the experiment; this strip is
          the player's own read-out, so a long simulation still shows movement. */}
      {!compact && status.progress > 0 && !status.failed ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/10" data-experiment-progress-bar>
          <div className="h-full bg-violet-400 transition-[width] duration-300" style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
      ) : null}

      {!compact ? (
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1 opacity-60 transition hover:opacity-100" data-experiment-hud>
          <GlassButton
            variant="capsule"
            onClick={restart}
            className="pointer-events-auto text-[10px] font-black [&>span>div]:h-7 [&>span>div]:px-2"
            title="Restart the experiment"
            aria-label="Restart the experiment"
            data-experiment-restart
          >
            <span className="flex items-center gap-1"><RefreshCw size={12} /> Restart</span>
          </GlassButton>
          <GlassButton
            variant="capsule"
            onClick={() => post({ type: active ? "pause" : "play" })}
            className="pointer-events-auto text-[10px] font-black [&>span>div]:h-7 [&>span>div]:px-2"
            title={active ? "Pause the experiment" : "Resume the experiment"}
            aria-label={active ? "Pause the experiment" : "Resume the experiment"}
            data-experiment-toggle
          >
            <span className="flex items-center gap-1">{active ? <Pause size={12} /> : <Play size={12} />} {active ? "Pause" : "Play"}</span>
          </GlassButton>
        </div>
      ) : null}

      {status.note && !compact ? (
        <p className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold text-white/80" data-experiment-note>
          {status.note}
        </p>
      ) : null}
    </div>
  );
}

/** `#ffffff` / `rgb(255 255 255)` / `rgba(0,0,0,.9)` → is this a light ink? */
const isLightInk = (value: string): boolean => {
  const text = String(value || "").trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  const rgb = text.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  const channels = hex
    ? hex[1].length === 3
      ? hex[1].split("").map((part) => parseInt(part + part, 16))
      : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)].map((part) => parseInt(part, 16))
    : rgb
      ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      : [255, 255, 255];
  const [r, g, b] = channels;
  // Perceived luminance — dark ink means the player is in LIGHT mode.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
};
