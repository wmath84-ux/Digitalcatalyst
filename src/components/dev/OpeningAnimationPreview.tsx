// src/components/dev/OpeningAnimationPreview.tsx
//
// Developer sandbox for the app opening animation (`#/dev/opening`).
//
// It exists because "the opening does not play" was reported three times in a
// row and every answer had to be a guess: nobody could see what the app
// decided, or why. This page shows both shipped EduOS clips side by side with
// their own controls, replays the real boot sequence, probes whether the MP4 is
// reachable from this device, and prints the resolved decision (branding flag,
// reduced motion, offline, viewport band, override) with a copyable summary.
//
// Read-only by design: it never writes Firestore and never restyles the clips.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_OPENING_VIDEO_DESKTOP_SRC,
  OPENING_CLIP_DURATION_MS,
  APP_OPENING_VIDEO_MOBILE_SRC,
  OPENING_DEBUG_ID,
  OPENING_SPLASH_ID,
  OPENING_VIDEO_ID,
  OPENING_MOBILE_MAX_WIDTH,
  attachOpeningSplash,
  openingClipForWidth,
  readPreferFullClip,
  setPreferFullClip,
  resolveOpeningDecision,
  setOpeningOverrideSticky,
  setOpeningRuntimeOverride,
  isOpeningVisible,
  type OpeningController,
} from "../../utils/openingSplash";

type Probe = { label: string; ok: boolean; detail: string };

const CARD = "rounded-2xl border border-[#d8e6ff] bg-white p-4 shadow-[0_14px_36px_rgba(11,99,255,0.08)]";
const BTN =
  "rounded-xl bg-[#0b63ff] px-4 py-2.5 text-sm font-bold text-white transition active:scale-[0.98] " +
  "disabled:opacity-50";
const BTN_GHOST =
  "rounded-xl border border-[#d8e6ff] bg-white px-4 py-2.5 text-sm font-bold text-[#081a44] transition " +
  "active:scale-[0.98]";

function Row({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" }) {
  const color = tone === "ok" ? "#047857" : tone === "warn" ? "#b45309" : "#081a44";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#e7e0ec] py-2 last:border-b-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#64708f]">{label}</span>
      <span className="text-right text-[13px] font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function Clip({ src, caption, aspect }: { src: string; caption: string; aspect: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("idle");
  return (
    <div className={CARD}>
      <p className="text-sm font-black text-[#081a44]">{caption}</p>
      <p className="mt-0.5 break-all text-[11px] text-[#64708f]">{src}</p>
      <div className={`mt-3 w-full overflow-hidden rounded-xl bg-black ${aspect}`}>
        <video
          ref={ref}
          src={src}
          controls
          playsInline
          muted
          preload="metadata"
          className="h-full w-full object-contain"
          onLoadedData={() => setStatus("frame painted — the file decodes here")}
          onError={() =>
            setStatus(
              ref.current?.error
                ? `error ${ref.current.error.code} — the browser cannot play this file from this URL`
                : "error — cannot load",
            )
          }
          onEnded={() => setStatus("played to the end")}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BTN}
          onClick={() => {
            const video = ref.current;
            if (!video) return;
            video.currentTime = 0;
            void video.play().catch(() => setStatus("play() was refused — press the clip's own ▶ control"));
          }}
        >
          Play clip
        </button>
        <span className="text-[12px] font-semibold text-[#081a44]">{status}</span>
      </div>
    </div>
  );
}

export default function OpeningAnimationPreview() {
  const [now, setNow] = useState(() => Date.now());
  const [probe, setProbe] = useState<Probe | null>(null);
  const [copied, setCopied] = useState(false);
  const controller: OpeningController | null = attachOpeningSplash();
  const width = typeof window === "undefined" ? 0 : window.innerWidth;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const preferFull = useMemo(() => readPreferFullClip(), [now]);
  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem("eduvora.branding.v2");
      const parsed = raw ? (JSON.parse(raw) as { openingAnimationEnabled?: unknown }) : {};
      return { brandingEnabled: parsed?.openingAnimationEnabled !== false, raw: raw ? "eduvora.branding.v2 present" : "no cached branding" };
    } catch {
      return { brandingEnabled: true, raw: "cached branding unreadable" };
    }
  }, [now]);

  const decision = useMemo(
    () =>
      resolveOpeningDecision({
        width,
        brandingEnabled: cached.brandingEnabled,
        reducedMotion: Boolean(reducedMotion),
        offline: typeof navigator !== "undefined" && navigator.onLine === false,
        override: (() => {
          try {
            const stored = localStorage.getItem("eduvora.opening.override.v1");
            const query = new URLSearchParams(window.location.search).get("opening");
            const tokens = `${query ?? ""},${stored ?? ""}`.toLowerCase().split(/[,\s]+/);
            if (tokens.includes("off")) return "off" as const;
            if (tokens.includes("force")) return "force" as const;
            if (tokens.includes("on")) return "on" as const;
            if (tokens.includes("static")) return "static" as const;
            if (tokens.includes("debug")) return "debug" as const;
          } catch {
            /* ignore */
          }
          return null;
        })(),
      }),
    // `now` re-reads the device state whenever the page is refreshed by hand.
    [width, reducedMotion, cached, now],
  );

  const refresh = useCallback(() => setNow(Date.now()), []);

  // Live read-out: every state change in the controller re-renders this page,
  // so a replay can be read without touching a button.
  useEffect(() => (controller ? controller.subscribe(() => refresh()) : undefined), [controller, refresh]);

  // Probe the clip this device would actually fetch: 404 / blocked / cached is
  // the difference between "the code is wrong" and "the file never arrived".
  useEffect(() => {
    let cancelled = false;
    const src = openingClipForWidth(window.innerWidth) === "mobile" ? APP_OPENING_VIDEO_MOBILE_SRC : APP_OPENING_VIDEO_DESKTOP_SRC;
    void fetch(src, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        setProbe({
          label: src,
          ok: res.ok,
          detail: `HTTP ${res.status} · ${res.headers.get("content-type") || "?"} · ${
            res.headers.get("content-length") ? `${(Number(res.headers.get("content-length")) / 1048576).toFixed(2)} MB` : "?"
          }`,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setProbe({ label: src, ok: false, detail: `fetch threw: ${String(err)}` });
      });
    return () => {
      cancelled = true;
    };
  }, [now]);

  const video = typeof document === "undefined" ? null : (document.getElementById(OPENING_VIDEO_ID) as HTMLVideoElement | null);
  const splash = typeof document === "undefined" ? null : document.getElementById(OPENING_SPLASH_ID);
  const summary = [
    `opening state: ${controller?.state ?? "no controller"}`,
    `decision: ${decision.show ? decision.mode : "hidden"} — ${decision.reason}`,
    `clip for this width (${width}px): ${decision.clip} → ${decision.src}`,
    `reduced motion: ${
      reducedMotion
        ? preferFull
          ? "ON, but this device asked for the full clip anyway (opening stays the video)"
          : "ON — the clip is replaced by the static card; use the toggle below to force the clip on this device"
        : "off"
    }`,
    `opening visible now: ${controller ? (isOpeningVisible(controller.state) ? `yes (${controller.state})` : `no (${controller.state})`) : "no controller"}`,
    `navigator.onLine: ${typeof navigator !== "undefined" ? String(navigator.onLine) : "?"}`,
    `branding openingAnimationEnabled (cached): ${cached.brandingEnabled} (${cached.raw})`,
    `splash element: ${splash ? `data-opening=${splash.dataset.opening ?? "(unset → visible)"} data-video=${splash.dataset.video ?? "(unset)"}` : "MISSING (stale index.html cache)"}`,
    `video element: ${
      video
        ? `network=${video.networkState} ready=${video.readyState} t=${video.currentTime.toFixed(2)}s${
            video.error ? ` error=${video.error.code}` : ""
          }`
        : "MISSING"
    }`,
    `controller note: ${controller?.mediaSnapshot ?? "n/a"}`,
    `first frame after: ${controller?.firstFrameMs ?? "never"}ms · note: ${controller?.lastError ?? "none"}`,
    `release rule: the app opens on "ended" (${OPENING_CLIP_DURATION_MS}ms clip); load ceiling ${decision.timings.loadCeilingMs}ms, stall ${decision.timings.stallTimeoutMs}ms, backstop ${decision.timings.hardCeilingMs}ms, hold after end ${decision.timings.holdAfterEndMs}ms + fade ${decision.timings.fadeMs}ms`,
    `clip probe: ${probe ? `${probe.label} — ${probe.detail}` : "…"}`,
  ].join("\n");

  return (
    <main data-opening-preview className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8" style={{ colorScheme: "light" }}>
      <header>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7c4dff]">Eduvora · dev sandbox</p>
        <h1 className="mt-1 text-2xl font-black text-[#081a44]">App opening animation</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[#64708f]">
          The opening plays once, at boot, over the whole screen (z-index 2147483000). Everything on this page is a
          live read-out of what <em>this</em> device decided — no rebuild needed. Below {OPENING_MOBILE_MAX_WIDTH}px the
          portrait clip is used; tablet and desktop get the wide one.
        </p>
      </header>

      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-[#081a44]">Decision on this device</p>
          <button type="button" className={BTN_GHOST} onClick={refresh}>
            Re-check
          </button>
        </div>
        <div className="mt-2">
          <Row label="state" value={controller?.state ?? "no controller"} tone={controller?.state === "skipped" ? "warn" : "ok"} />
          <Row label="will show" value={decision.show ? decision.mode : "hidden"} tone={decision.show ? "ok" : "warn"} />
          <Row label="why" value={decision.reason} tone={decision.show ? "ok" : "warn"} />
          <Row label="viewport" value={`${width}px → ${decision.clip}`} />
          <Row label="reduced motion" value={reducedMotion ? "on" : "off"} tone={reducedMotion ? "warn" : "default"} />
          <Row label="clip probe" value={probe ? probe.detail : "probing…"} tone={probe ? (probe.ok ? "ok" : "warn") : "default"} />
          <Row label="first frame" value={controller?.firstFrameMs === null || controller?.firstFrameMs === undefined ? "never" : `${controller.firstFrameMs}ms`} />
          <Row
            label="app opens when"
            value={`the clip reaches its end — ${OPENING_CLIP_DURATION_MS}ms — patience ${decision.timings.loadCeilingMs}ms, stall ${decision.timings.stallTimeoutMs}ms, backstop ${decision.timings.hardCeilingMs}ms`}
            tone={controller?.state === "playing" ? "ok" : "default"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN}
            onClick={() => {
              controller?.replay();
              refresh();
            }}
          >
            ▶ Replay the real opening (plays in full, then opens the app)
          </button>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              // One-shot by design: `static` is NOT written to localStorage, so
              // previewing the card can never strand this device in card-only
              // mode (that is exactly what a remembered override used to do).
              setOpeningRuntimeOverride("static");
              controller?.replay();
              refresh();
            }}
          >
            Preview the static card (once)
          </button>
          <button
            type="button"
            className={preferFull ? BTN : BTN_GHOST}
            onClick={() => {
              // Reduced motion is honoured by default, which is correct — but it
              // must never look like a broken 1 s opening. This remembers an
              // explicit "show me the full clip anyway" for THIS device.
              setPreferFullClip(!preferFull);
              setOpeningRuntimeOverride(null);
              controller?.replay();
              refresh();
            }}
          >
            {preferFull
              ? "✓ Full opening forced on this device (tap to follow the system setting)"
              : reducedMotion
                ? "Play the full clip here even though my system asks for less motion"
                : "Remember the full clip on this device (for reduced-motion days)"}
          </button>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              setOpeningOverrideSticky(null);
              setOpeningRuntimeOverride(null);
              controller?.setDebug(false);
              refresh();
            }}
          >
            Clear device override
          </button>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              void navigator.clipboard?.writeText(summary).then(
                () => setCopied(true),
                () => setCopied(false),
              );
              refresh();
            }}
          >
            {copied ? "Copied ✓" : "Copy report for support"}
          </button>
        </div>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f5f7ff] p-3 text-[11.5px] leading-relaxed text-[#081a44]">
          {summary}
        </pre>
        <p className="mt-2 text-[11px] leading-relaxed text-[#64708f]">
          URL overrides (only <code>debug</code> and <code>off</code> are remembered on this device, and even
          those expire after 24 h — anything that changes what plays is per-URL on purpose): <code>?opening=on</code> ·{" "}
          <code>?opening=off</code> · <code>?opening=force</code> (plays the clip even with reduced motion) ·{" "}
          <code>?opening=static</code> · <code>?opening=debug</code> (corner badge, stays after the splash). Console:{" "}
          <code>__eduosOpening.replay()</code>, <code>__eduosOpening.dismiss()</code>,{" "}
          <code>__eduosOpening.setDebug(true)</code>.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Clip src={APP_OPENING_VIDEO_MOBILE_SRC} caption="Phones — 720×1280" aspect="aspect-[9/16]" />
        <Clip src={APP_OPENING_VIDEO_DESKTOP_SRC} caption="Tablet + desktop — 1280×720" aspect="aspect-[16/9]" />
      </section>

      <section className={CARD}>
        <p className="text-sm font-black text-[#081a44]">If the opening is still not visible</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-[#081a44]">
          <li>
            Read “why” above. <em>“branding has the opening turned off”</em> → Admin → App branding → App behaviour,
            switch it on and clear this device’s cached copy with the button below.
          </li>
          <li>
            <em>“reduced motion”</em> → the OS animation setting replaces the clip with the static card (a
            1.4 s brand moment, which is the “one second frame then the app” you saw). Tap{" "}
            <em>“Play the full clip here”</em> above to keep the whole animation on this device, or use{" "}
            <code>?opening=force</code> once.
          </li>
          <li>
            <em>clip probe HTTP 404</em> → the file did not ship with this deployment (an old build, a cached
            service-worker shell, or an APK built before the MP4s were added).
          </li>
          <li>
            <em>splash element MISSING</em> → the browser is running an old <code>index.html</code>; hard-reload, or
            uninstall/reload the PWA.
          </li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              try {
                localStorage.removeItem("eduvora.branding.v2");
                localStorage.removeItem("eduvora.opening.override.v1");
              } catch {
                /* private mode */
              }
              document.getElementById(OPENING_DEBUG_ID)?.remove();
              refresh();
            }}
          >
            Clear cached branding + overrides
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => window.location.reload()}>
            Hard reload
          </button>
        </div>
      </section>
    </main>
  );
}
