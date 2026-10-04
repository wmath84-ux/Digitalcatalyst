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

const UNICODE_GREEK: Readonly<Record<string, string>> = {
  "α": String.raw`\alpha`, "β": String.raw`\beta`, "γ": String.raw`\gamma`, "δ": String.raw`\delta`,
  "ε": String.raw`\epsilon`, "θ": String.raw`\theta`, "λ": String.raw`\lambda`, "μ": String.raw`\mu`,
  "π": String.raw`\pi`, "ρ": String.raw`\rho`, "σ": String.raw`\sigma`, "τ": String.raw`\tau`,
  "φ": String.raw`\phi`, "χ": String.raw`\chi`, "ψ": String.raw`\psi`, "ω": String.raw`\omega`,
  "Γ": String.raw`\Gamma`, "Δ": String.raw`\Delta`, "Θ": String.raw`\Theta`, "Λ": String.raw`\Lambda`,
  "Ξ": String.raw`\Xi`, "Π": String.raw`\Pi`, "Σ": String.raw`\Sigma`, "Φ": String.raw`\Phi`,
  "Ψ": String.raw`\Psi`, "Ω": String.raw`\Omega`,
};

const UNICODE_OPERATORS: Readonly<Record<string, string>> = {
  "×": String.raw`\times`, "÷": String.raw`\div`, "·": String.raw`\cdot`, "±": String.raw`\pm`,
  "∓": String.raw`\mp`, "≈": String.raw`\approx`, "≤": String.raw`\leq`, "≥": String.raw`\geq`,
  "≠": String.raw`\neq`, "≡": String.raw`\equiv`, "∞": String.raw`\infty`, "→": String.raw`\to`,
  "←": String.raw`\leftarrow`, "⇒": String.raw`\Rightarrow`, "⇔": String.raw`\Leftrightarrow`,
  "∑": String.raw`\sum`, "∏": String.raw`\prod`, "∫": String.raw`\int`, "∂": String.raw`\partial`,
  "∇": String.raw`\nabla`, "∈": String.raw`\in`, "∉": String.raw`\notin`, "∪": String.raw`\cup`,
  "∩": String.raw`\cap`, "∅": String.raw`\emptyset`, "−": "-",
};

const SUPER_SCRIPT: Readonly<Record<string, string>> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")", "ⁱ": "i", "ⁿ": "n",
};
const SUB_SCRIPT: Readonly<Record<string, string>> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "₌": "=", "₍": "(", "₎": ")", "ₐ": "a", "ₑ": "e", "ₕ": "h", "ᵢ": "i",
  "ⱼ": "j", "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₒ": "o", "ₚ": "p", "ᵣ": "r", "ₛ": "s", "ₜ": "t",
};

/** Convert common Unicode math glyphs to equivalent TeX for KaTeX only. */
export function normalizeUnicodeMathSource(latex: string): string {
  const source = String(latex ?? "");
  let output = "";
  for (let index = 0; index < source.length;) {
    const char = String.fromCodePoint(source.codePointAt(index) || 0);
    const nextIndex = index + char.length;
    if (char === "√") {
      let operand = "";
      if (source[nextIndex] === "(") {
        let depth = 0;
        let cursor = nextIndex;
        for (; cursor < source.length; cursor += 1) {
          if (source[cursor] === "(") depth += 1;
          else if (source[cursor] === ")" && --depth === 0) { cursor += 1; break; }
        }
        if (depth === 0) operand = source.slice(nextIndex, cursor);
      } else {
        const match = source.slice(nextIndex).match(/^[\p{L}\p{N}]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/u);
        if (match) operand = match[0];
      }
      if (operand) {
        output += String.raw`\sqrt{${normalizeUnicodeMathSource(operand)}}`;
        index = nextIndex + operand.length;
        continue;
      }
    }
    if (char in UNICODE_GREEK) {
      output += UNICODE_GREEK[char];
      if (/[A-Za-z]/.test(source[nextIndex] || "")) output += " ";
      index = nextIndex;
      continue;
    }
    if (char in UNICODE_OPERATORS) {
      const converted = UNICODE_OPERATORS[char];
      output += converted;
      if (converted.startsWith("\\") && /[A-Za-z]/.test(source[nextIndex] || "")) output += " ";
      index = nextIndex;
      continue;
    }
    if (char in SUPER_SCRIPT || char in SUB_SCRIPT) {
      const scripts = char in SUPER_SCRIPT ? SUPER_SCRIPT : SUB_SCRIPT;
      const command = char in SUPER_SCRIPT ? "^" : "_";
      let indexEnd = nextIndex;
      let value = scripts[char];
      while (indexEnd < source.length) {
        const following = String.fromCodePoint(source.codePointAt(indexEnd) || 0);
        if (!(following in scripts)) break;
        value += scripts[following];
        indexEnd += following.length;
      }
      output += `${command}{${value}}`;
      index = indexEnd;
      continue;
    }
    output += char;
    index = nextIndex;
  }
  return output;
}

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
        html: katex.renderToString(normalizeUnicodeMathSource(source), {
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
