// src/course/noteEditor/mathRendering.ts
//
// The presentation half of the note-math pipeline. Math stays as editable TeX
// in the BlockNote document and in the stored note HTML; KaTeX is only called
// at the localized render boundary (a math node or a visible note preview).
//
// KaTeX's HTML is the only HTML passed through `innerHTML` here. `trust: false`
// disables HTML/link extensions, strict parsing and bounded expansion reject
// unsupported or abusive input, and failures are shown as escaped source text.

import katex from "katex";
import { normalizeRichClipboardHtml } from "./clipboardNormalization";
import { escapeHtml } from "../../utils/richText";
import { MAX_NOTE_MATH_SOURCE_LENGTH, mathSourceText } from "../../utils/noteMath";

export { MAX_NOTE_MATH_SOURCE_LENGTH, mathSourceText } from "../../utils/noteMath";

const CACHE_LIMIT = 256;
const NOTE_PREVIEW_CACHE_LIMIT = 64;
const notePreviewCache = new Map<string, string>();

export interface MathRenderResult {
  valid: boolean;
  html: string;
}

const renderCache = new Map<string, MathRenderResult>();

/**
 * Parse and render one formula. No caller should render pasted TeX directly:
 * this function bounds source size/expansion, disables KaTeX's trusted HTML
 * features, and catches every parser error so malformed LaTeX cannot crash a
 * note editor or viewer.
 */
export function renderMathSource(latex: string, displayMode = false): MathRenderResult {
  const source = String(latex ?? "");
  const key = `${displayMode ? "block" : "inline"}\u0000${source}`;
  const cached = renderCache.get(key);
  if (cached) {
    // Refresh insertion order for a small LRU-style cache.
    renderCache.delete(key);
    renderCache.set(key, cached);
    return cached;
  }

  let result: MathRenderResult;
  if (!source.trim() || source.length > MAX_NOTE_MATH_SOURCE_LENGTH) {
    result = { valid: false, html: escapeHtml(mathSourceText(source.slice(0, MAX_NOTE_MATH_SOURCE_LENGTH), displayMode)) };
  } else {
    try {
      result = {
        valid: true,
        html: katex.renderToString(source, {
          displayMode,
          output: "htmlAndMathml",
          throwOnError: true,
          strict: "error",
          trust: false,
          maxExpand: 500,
          maxSize: 20,
        }),
      };
    } catch {
      result = { valid: false, html: escapeHtml(mathSourceText(source, displayMode)) };
    }
  }

  renderCache.set(key, result);
  if (renderCache.size > CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return result;
}

/**
 * Convert the canonical math markers in safe note HTML into KaTeX output for
 * read-only previews. Existing legacy HTML is normalized first, so old notes,
 * AI-authored notes and newly pasted content all share the same path.
 */
export function renderNoteHtmlWithMath(html: string): string {
  const input = String(html || "");
  const cached = notePreviewCache.get(input);
  if (cached !== undefined) {
    notePreviewCache.delete(input);
    notePreviewCache.set(input, cached);
    return cached;
  }
  const normalized = normalizeRichClipboardHtml(input);
  if (!normalized || typeof window === "undefined" || typeof window.DOMParser === "undefined") return normalized;

  const document = new window.DOMParser().parseFromString(`<body>${normalized}</body>`, "text/html");
  for (const marker of Array.from(document.body.querySelectorAll<HTMLElement>("[data-note-math]"))) {
    const mode = marker.getAttribute("data-note-math");
    if (mode !== "inline" && mode !== "block") continue;
    const latex = marker.getAttribute("data-latex") ?? "";
    const displayMode = mode === "block";
    const result = renderMathSource(latex, displayMode);
    const rendered = document.createElement(displayMode ? "div" : "span");
    rendered.className = displayMode
      ? "dc-note-math-rendered dc-note-math-rendered-block"
      : "dc-note-math-rendered dc-note-math-rendered-inline";
    rendered.setAttribute("data-note-math-rendered", mode);
    rendered.setAttribute("aria-label", mathSourceText(latex, displayMode));
    if (result.valid) rendered.innerHTML = result.html;
    else rendered.textContent = mathSourceText(latex, displayMode);
    marker.replaceWith(rendered);
  }
  const renderedHtml = document.body.innerHTML.trim();
  // Keep card/preview rendering localized: normal note text may be requested on
  // every panel render, but its KaTeX output is memoized by source HTML.
  if (input.length <= 24000) {
    notePreviewCache.set(input, renderedHtml);
    if (notePreviewCache.size > NOTE_PREVIEW_CACHE_LIMIT) {
      const oldest = notePreviewCache.keys().next().value;
      if (oldest !== undefined) notePreviewCache.delete(oldest);
    }
  }
  return renderedHtml;
}

/** A small test hook; production renders are still bounded by the same cache. */
export function clearMathRenderCache(): void {
  renderCache.clear();
  notePreviewCache.clear();
}
