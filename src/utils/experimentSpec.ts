// src/utils/experimentSpec.ts
//
// "Interactive 2D experiment" — the file type a learner can author in My Study
// Library and play inside the Course Player.
//
// WHAT THE FILE IS
// ----------------
// ONE self-contained HTML document (HTML + CSS + JS in a single file, no build
// step, no external requests). That is the whole format. It is exactly what
// every AI (ChatGPT / Claude / Gemini / Copilot…) hands back when you ask for a
// "single-file HTML animation", which is why this type exists: the learner asks
// the AI for the experiment, pastes (or uploads) the file, and it plays.
//
// WHY INLINE HTML AND NOT A VIDEO
// -------------------------------
//   · interactive — the learner drags sliders, changes the mass, sees the
//     result change; a video can only be watched.
//   · tiny — a 30 KB HTML experiment replaces a 20 MB video for the same topic.
//   · instant to make — "banvao aur integrate karo" in minutes, per topic.
//   · offline — the source lives inside the course document, so the APK plays
//     it with no network at all.
//
// HOW IT IS ISOLATED
// ------------------
// The document is rendered in a sandboxed iframe:
//
//   inline (`srcDoc`) → sandbox="allow-scripts …", and DELIBERATELY NO
//                       `allow-same-origin`. Without that token the frame gets
//                       an opaque origin, so the experiment cannot read the
//                       app's DOM, cookies, storage or Firebase session. If we
//                       added `allow-same-origin` to a srcDoc frame, the frame
//                       would share OUR origin and could reach `window.parent`
//                       — i.e. it could read the learner's data.
//   hosted (`url`)    → same sandbox plus `allow-same-origin`, which there
//                       means "the hosted page keeps ITS OWN origin" (it still
//                       cannot touch this app), so hosted sketches that need
//                       their own cookies/storage keep working.
//
// The cost of that isolation: `localStorage`, `document.cookie` and `alert()`
// are not available inside the frame. `experimentIssues()` below names those
// (and every other common breakage) in the builder, before the learner saves.
//
// THE BRIDGE (zero-integration baseline, opt-in extras)
// -----------------------------------------------------
// The player posts `{source:"dc-host", type:"pause"|"play"|"theme"}` into the
// frame and expects `{source:"dc-experiment", type:"ready"|"progress"|
// "complete"|"error"}` back. `buildExperimentDocument()` injects a tiny shim so
// the BASIC contract is automatic (the frame reports itself ready and its
// runtime errors), while AI-authored code can opt into the rest:
//
//   window.dcExperiment.progress(0.4)   // 0…1, drives the player's progress bar
//   window.dcExperiment.complete()      // marks the lesson complete
//   document.addEventListener("dc:pause", () => …)   // stop your loop
//   document.addEventListener("dc:play",  () => …)   // resume it
//   document.documentElement.dataset.dcTheme          // "dark" | "light"
//
// Pure module: no React, no network, no DOM at import time, so `node --test`
// and the browser bundle both use the same rules.

/**
 * The file type id. Declared here as a bare literal (and in `src/types/course.ts`
 * as the canonical `EXPERIMENT_FILE_TYPE`) so this module stays importable by
 * `node --test`: a runtime import from a `.ts` path without an extension is not
 * something Node's type-stripping loader can resolve. A contract test pins the
 * two declarations to the same string.
 */
export const EXPERIMENT_FILE_TYPE = "interactive" as const;

/** One experiment's inline source, measured in UTF-8 bytes (Firestore counts bytes). */
export const EXPERIMENT_MAX_BYTES = 200 * 1024;

/** All inline experiments of one course together — Firestore's cap is 1 MiB. */
export const COURSE_EXPERIMENT_MAX_BYTES = 640 * 1024;

/** Marker on every message the experiment sends OUT of the frame. */
export const EXPERIMENT_MESSAGE_SOURCE = "dc-experiment";
/** Marker on every message the player sends INTO the frame. */
export const EXPERIMENT_HOST_SOURCE = "dc-host";

/**
 * Sandbox tokens. The inline list never carries `allow-same-origin` (see the
 * header) — pinned by `tests/coursePlayerInteractiveExperimentsContract.test.mjs`
 * so a well-meaning "fix" cannot silently hand the learner's session to a
 * pasted HTML file.
 */
export const EXPERIMENT_SANDBOX_INLINE =
  "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation";
export const EXPERIMENT_SANDBOX_HOSTED =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation";

/** The permissions policy both modes need (canvas/audio experiments use them). */
export const EXPERIMENT_ALLOW = "autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write";

/** UTF-8 byte length of the source, which is what Firestore actually stores. */
export const experimentByteLength = (html: string): number => {
  const value = String(html ?? "");
  if (!value) return 0;
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  return Buffer.byteLength(value, "utf8");
};

/** kebab-case file name for the download action. */
export const experimentDownloadName = (name: string): string => {
  const slug = String(name || "experiment")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "experiment"}.html`;
};

/** Is there something to render? Inline source or a hosted page. */
export const experimentHasSource = (html?: string | null, url?: string | null): boolean =>
  Boolean(String(html || "").trim() || /^https:\/\//i.test(String(url || "").trim()));

export interface ExperimentIssue {
  /** `error` blocks saving; `warn` is advice the learner can pass back to the AI. */
  level: "error" | "warn";
  message: string;
}

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

/**
 * Everything the builder should tell the learner about a pasted/uploaded
 * experiment — the same checks the AI prompt asks the model to avoid, so the
 * learner can copy the warning straight back into the chat.
 */
export const experimentIssues = (html: string, options: { tooLarge?: boolean } = {}): ExperimentIssue[] => {
  const source = String(html ?? "");
  const issues: ExperimentIssue[] = [];
  const trimmed = source.trim();

  if (!trimmed) {
    issues.push({ level: "error", message: "The experiment has no HTML yet — paste it, upload the .html file, or start from a template." });
    return issues;
  }

  const bytes = experimentByteLength(source);
  if (bytes > EXPERIMENT_MAX_BYTES) {
    issues.push({
      level: "error",
      message: `This experiment is ${kilobytes(bytes)} — the limit is ${kilobytes(EXPERIMENT_MAX_BYTES)} per experiment. Ask your AI to "remove comments, shorten names and drop libraries, keep the same behaviour", or host the file and use its link.`,
    });
  } else if (bytes > EXPERIMENT_MAX_BYTES * 0.8) {
    issues.push({ level: "warn", message: `This experiment is ${kilobytes(bytes)} — close to the ${kilobytes(EXPERIMENT_MAX_BYTES)} limit.` });
  }

  if (!/<html[\s>]/i.test(source) || !/<\/html>/i.test(source)) {
    issues.push({ level: "warn", message: "This is not a complete HTML document. The player will still run it, but ask the AI for a full file (starting with <!doctype html>)." });
  }
  if (!/<meta[^>]+name=["']?viewport/i.test(source)) {
    issues.push({ level: "warn", message: "No viewport meta tag — a phone may scale the experiment oddly. Ask for: <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">." });
  }

  // Anything that needs the network will look broken offline (and inside the APK).
  if (/<script[^>]+src\s*=/i.test(source) || /<link[^>]+href\s*=\s*["']?https?:/i.test(source) || /@import\s+url/i.test(source)) {
    issues.push({ level: "warn", message: "It loads a script, style or font from the internet — that breaks offline. Ask the AI to rewrite it with no external files (plain JavaScript, no CDN)." });
  }
  if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/i.test(source)) {
    issues.push({ level: "warn", message: "It talks to a server (fetch / XHR / WebSocket). Keep the experiment self-contained so it works offline." });
  }

  // Blocked inside the sandbox — these throw at runtime.
  if (/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(source)) {
    issues.push({ level: "warn", message: "It uses browser storage, which is blocked inside the sandboxed player. Ask the AI to keep the state in variables instead." });
  }
  if (/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/.test(source)) {
    issues.push({ level: "warn", message: "It uses alert / confirm / prompt. Show that message on the canvas instead — dialogs are unreliable inside the player." });
  }
  if (/window\.(top|parent)\.document/i.test(source)) {
    issues.push({ level: "warn", message: "It tries to reach the app around it — that is blocked on purpose. The experiment can only change its own page." });
  }

  // Is it actually an experiment?
  const animated = /requestAnimationFrame|setInterval|setTimeout/.test(source);
  const draws = /<canvas|<svg/i.test(source);
  if (!draws) issues.push({ level: "warn", message: "No <canvas> or <svg> found — is this a 2D experiment? Ask for one drawn on a canvas." });
  if (!animated) issues.push({ level: "warn", message: "No animation loop found (requestAnimationFrame) — the experiment may be a static page." });
  if (!/<input|<button|pointerdown|onclick|addEventListener/i.test(source)) {
    issues.push({ level: "warn", message: "No controls found. A good experiment has at least one slider/button so the learner can change a variable." });
  }

  void options.tooLarge;
  return issues;
};

/** Hard failures only — what the Save button must refuse. */
export const experimentBlockingIssues = (html: string): ExperimentIssue[] =>
  experimentIssues(html).filter((issue) => issue.level === "error");

const escapeForScript = (value: string) => String(value ?? "").replace(/<\/script/gi, "<\\/script");

/**
 * The shim + reset that wraps every experiment document before it is handed to
 * the iframe. Kept as a string so the builder's live preview and the player use
 * byte-identical framing (a preview that differs from the player is a bug farm).
 */
export const buildExperimentShell = (): string => `
<style id="dc-experiment-shell">
  /* Only a neutral reset — the experiment styles itself. The two custom
     properties are filled in by the host (host → frame "tokens" message), so
     an experiment can match the Course Player exactly:
       color: var(--dc-ink); background: var(--dc-bg, transparent) */
  html, body { margin: 0; padding: 0; min-height: 100%; }
  html { background: transparent; color: var(--dc-ink, #ffffff); }
  body { background: transparent; color: inherit; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-tap-highlight-color: transparent; }
  *, *::before, *::after { box-sizing: border-box; }
  [data-dc-theme="light"] { color-scheme: light; }
  [data-dc-theme="dark"] { color-scheme: dark; }
</style>
<script id="dc-experiment-bridge">
(function () {
  var SOURCE_OUT = ${JSON.stringify(EXPERIMENT_MESSAGE_SOURCE)};
  var SOURCE_IN = ${JSON.stringify(EXPERIMENT_HOST_SOURCE)};
  var post = function (message) {
    try {
      var payload = { source: SOURCE_OUT };
      for (var key in message) { if (Object.prototype.hasOwnProperty.call(message, key)) payload[key] = message[key]; }
      window.parent.postMessage(payload, "*");
    } catch (error) { /* the frame is gone — nothing to report to */ }
  };
  var clamp = function (value) {
    var number = Number(value);
    return isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  };
  var setTokens = function (tokens) {
    if (!tokens) return;
    try {
      var root = document.documentElement;
      if (tokens.ink) root.style.setProperty("--dc-ink", String(tokens.ink));
      if (tokens.bg) root.style.setProperty("--dc-bg", String(tokens.bg));
      if (tokens.accent) root.style.setProperty("--dc-accent", String(tokens.accent));
    } catch (error) { /* no tokens — the defaults stand */ }
  };

  window.dcExperiment = {
    ready: function () { post({ type: "ready" }); },
    progress: function (value) { post({ type: "progress", value: clamp(value) }); },
    complete: function () { post({ type: "complete" }); },
    note: function (text) { post({ type: "note", text: String(text == null ? "" : text).slice(0, 400) }); }
  };

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.source !== SOURCE_IN) return;
    if (data.type === "pause") document.dispatchEvent(new Event("dc:pause"));
    else if (data.type === "play") document.dispatchEvent(new Event("dc:play"));
    else if (data.type === "theme") {
      var theme = data.theme === "light" ? "light" : "dark";
      document.documentElement.setAttribute("data-dc-theme", theme);
      setTokens(data.tokens);
      document.dispatchEvent(new CustomEvent("dc:theme", { detail: { theme: theme } }));
    } else if (data.type === "tokens") setTokens(data.tokens);
  });

  window.addEventListener("error", function (event) {
    var message = event && (event.message || (event.error && event.error.message));
    post({ type: "error", message: String(message || "Something went wrong inside the experiment.").slice(0, 300) });
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    post({ type: "error", message: String((reason && (reason.message || reason)) || "The experiment's script stopped.").slice(0, 300) });
  });

  var announceReady = function () { post({ type: "ready" }); };
  if (document.readyState === "complete") announceReady();
  else window.addEventListener("load", announceReady);
})();
</script>`;

/**
 * Wrap the learner's (or the AI's) HTML into the document the iframe gets:
 * the shell CSS + bridge in `<head>` (so `window.dcExperiment` exists before
 * any author script runs), everything else untouched.
 */
export const buildExperimentDocument = (
  html: string,
  options: { theme?: "dark" | "light"; ink?: string; background?: string; accent?: string } = {},
): string => {
  const source = String(html ?? "").trim();
  const theme = options.theme === "light" ? "light" : "dark";
  const tokens = {
    ink: options.ink || (theme === "light" ? "#0b1020" : "#ffffff"),
    bg: options.background || "transparent",
    accent: options.accent || "",
  };
  const shell = `${buildExperimentShell()}
<script id="dc-experiment-boot">(function(){try{document.documentElement.setAttribute("data-dc-theme",${JSON.stringify(theme)});var r=document.documentElement.style;r.setProperty("--dc-ink",${JSON.stringify(tokens.ink)});r.setProperty("--dc-bg",${JSON.stringify(tokens.bg)});${tokens.accent ? `r.setProperty("--dc-accent",${JSON.stringify(tokens.accent)});` : ""}window.__dcExperimentHost=${JSON.stringify(EXPERIMENT_HOST_SOURCE)};}catch(e){}})();</script>`;

  if (!source) {
    return `<!doctype html><html lang="en">${shell}<body></body></html>`;
  }
  // Full document: inject the shell at the end of <head> (or right after <html>).
  const headClose = source.search(/<\/head\s*>/i);
  if (headClose >= 0) {
    return `${source.slice(0, headClose)}${shell}\n${source.slice(headClose)}`;
  }
  const htmlOpen = source.search(/<html[^>]*>/i);
  if (htmlOpen >= 0) {
    const end = htmlOpen + source.slice(htmlOpen).indexOf(">") + 1;
    return `${source.slice(0, end)}<head>${shell}</head>${source.slice(end)}`;
  }
  // Fragment (an AI that returned only a <canvas> + <script>) — wrap it.
  return `<!doctype html><html lang="en">${shell}<body>${source}</body></html>`;
};

export interface ExperimentPromptOptions {
  /** The topic the experiment should teach, e.g. "Projectile motion". */
  topic: string;
  /** Optional extra wishes from the learner ("urdu labels", "3 sliders"…). */
  details?: string;
  /** Who it is for — shapes the language and the maths. */
  level?: string;
  /** Label language: "English" | "Hinglish" | "Hindi". */
  language?: string;
}

/**
 * The prompt the learner copies into ANY AI tool to get an experiment this
 * player can run as-is. Every line here exists because of a real constraint in
 * `experimentIssues()` / the sandbox — this string is the contract.
 */
export const buildExperimentAiPrompt = ({ topic, details, level, language }: ExperimentPromptOptions): string => {
  const subject = String(topic || "").trim() || "the topic I name next";
  const learner = String(level || "Class 11–12 / early college").trim();
  const labels = String(language || "English").trim();
  const extra = String(details || "").trim();
  return `You are an expert teacher + creative coder. Build ONE interactive 2D animated experiment that teaches: ${subject}.

OUTPUT FORMAT (strict)
- Reply with ONE complete HTML file and nothing else: start with <!doctype html>, end with </html>. No explanation, no markdown fences, no separate .css or .js files.
- Everything inline: HTML, CSS and JavaScript in that single file.

WHAT IT MUST DO
- Teach ${subject} visually: a real simulation/animation, not a slide of text.
- The learner must be able to change at least TWO variables with sliders or buttons (e.g. speed, angle, mass, frequency, temperature) and see the effect immediately.
- Show a live readout of the key values, with units, plus the governing formula on screen.
- Include a Reset button that returns everything to the starting state.
- Label the important parts (axes, vectors, forces, stages) so it teaches by itself.

HOW TO DRAW (2D)
- Use a single <canvas> with 2D context (or SVG if the topic suits it). Animate with requestAnimationFrame. No 3D, no WebGL, no external libraries (no p5.js, no three.js, no Chart.js — plain JavaScript only).
- Full-screen stage: html, body { margin: 0; height: 100% } and a canvas that fits the window (handle window resize and devicePixelRatio so it stays sharp).
- It must work on a phone: portrait and landscape, 320px wide and up; controls at least 40px tall; support both touch and mouse using pointer events (pointerdown/pointermove/pointerup) and set touch-action: none on the canvas so dragging does not scroll the page.
- Do not rely on hover-only interactions.

SANDBOX RULES (the file runs inside a sandboxed iframe)
- No localStorage / sessionStorage / cookies / IndexedDB: keep state in JavaScript variables.
- No alert / confirm / prompt: print messages on the canvas.
- No fetch / XMLHttpRequest / WebSocket / external URLs / CDN scripts / Google fonts: the experiment must work fully OFFLINE.
- Never touch window.parent / window.top; change only your own page.
- Keep the whole file under 150 KB of source; no minified libraries; no long comments.

NICE-TO-HAVE BRIDGE (optional, only if trivial)
- The page may report itself: window.dcExperiment.progress(0..1) while the learner works, and window.dcExperiment.complete() when the experiment is finished.
- It may adapt to the player's theme: document.documentElement.dataset.dcTheme is "dark" or "light"; and it may listen for the "dc:pause" / "dc:play" events on document to stop/start its animation loop when the learner switches lessons.

STYLE
- Clean, modern, high contrast: work on a dark background first, and read data-dcTheme for a light variant.
- On-screen labels in ${labels}. Keep the maths at the level of ${learner}.
${extra ? `- Extra wishes from me: ${extra}\n` : ""}
Also add a short <h1> title (or on-canvas title) naming the experiment: ${subject}.

Remember: reply with the complete single HTML file only.`;
};

/** What the copy button in the builder hands to the clipboard. */
export const experimentPromptWithSourceNote = (prompt: string): string =>
  `${prompt}\n\n(Generated by the Course Player's "Interactive 2D experiment" builder.)`;

/** Kept next to the prompt so the builder can show the same do/don't list. */
export const EXPERIMENT_PROMPT_RULES: string[] = [
  "One complete .html file — nothing else",
  "Canvas 2D + requestAnimationFrame, no libraries",
  "Two or more sliders/buttons + a Reset",
  "Formula, units and labels on screen",
  "Works on a phone (touch, no hover-only)",
  "No CDN, no fetch, no localStorage, no alert",
];

/** Small helper used by tests + the editor to keep message payloads honest. */
export const parseExperimentMessage = (raw: unknown): { type: string; value?: number; text?: string; message?: string } | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.source !== EXPERIMENT_MESSAGE_SOURCE) return null;
  const type = String(data.type || "");
  if (!type) return null;
  return {
    type,
    value: typeof data.value === "number" ? data.value : undefined,
    text: typeof data.text === "string" ? data.text : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
  };
};

export { escapeForScript };
