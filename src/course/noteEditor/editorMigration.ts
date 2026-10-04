// src/course/noteEditor/editorMigration.ts
//
// LEGACY HTML → BLOCKS — the import half of the note data pipeline:
//
//   stored note html
//     → detect      (empty? plain text? real markup?)
//     → normalise   (the player's sanitiser, then browser-style whitespace)
//     → import      (this file: a DOM walk, one block per construct)
//     → blocks      (BlockNote's PartialBlock[])
//
// Why a purpose-built importer instead of BlockNote's own `tryParseHTMLToBlocks`:
// that parser is built for pasting and is lossy on exactly the content the old
// editor produced. It FLATTENS a table into one run of text, DROPS an <img>,
// turns a blank `<div><br></div>` line into a "\n" paragraph, loses a
// checklist's checked state and the sub / superscript in "H₂O" / "x²". For
// stored notes data safety outranks convenience, so every construct is mapped
// explicitly here, and anything the editor cannot represent faithfully is kept
// VERBATIM as a read-only `legacyHtml` block (see ./editorFactory) and written
// back unchanged by the serialiser. The `NoteImportReport` says what happened.
//
// Notes the old editor saved look like:
//   <h1>Title</h1><hr>…body…           (the title is split off BEFORE this runs)
//   <div>line</div><div><br></div>     contentEditable's line-per-<div>
//   <b>/<i>/<strike>/<font color>      execCommand's legacy tags
//   anything pasted from Docs / Notion / the web — tables, images, nested
//   lists, styled spans — already sanitised by `sanitizeRichText`.
//
// Deliberate normalisations (reported in `downgrades`, never silent loss of
// text): h4–h6 become H3 (`heading-level`); font family / size / line-height
// are not carried (`font-formatting`); a colour that would be unreadable on
// the white page is dropped (`colour-contrast`); an indented non-list block
// is not indented (see the serialiser header).

import { MAX_NOTE_MATH_SOURCE_LENGTH } from "../../utils/noteMath";
import { normalizeRichClipboardHtml } from "./clipboardNormalization";
import type { NoteImportReport, NotePartialBlock } from "./editorTypes";

// ── Internal inline model ──────────────────────────────────────────────────

type StyleFlag = "bold" | "italic" | "underline" | "strike" | "code" | "sup" | "sub";
type RunStyles = Partial<Record<StyleFlag, true>> & { textColor?: string; backgroundColor?: string };
interface TextRun { type: "text"; text: string; styles: RunStyles }
interface LinkRun { type: "link"; href: string; content: TextRun[] }
interface MathRun { type: "math"; props: { latex: string } }
type InlineRun = TextRun | LinkRun | MathRun;
type Align = "left" | "center" | "right" | "justify";

interface Context {
  report: { preserved: number; downgrades: Set<string> };
  align?: Align;
}

const NBSP = "\u00A0";

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr",
  "section", "article", "header", "footer", "aside", "main", "nav", "center",
]);
/** Structures the editor cannot hold faithfully — kept verbatim. */
const RAW_TAGS = new Set([
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "figure", "figcaption", "dl", "dt", "dd", "img", "video", "audio", "iframe", "object", "embed", "svg", "math",
]);

const STYLE_TAGS: Record<string, StyleFlag | undefined> = {
  b: "bold", strong: "bold",
  i: "italic", em: "italic", cite: "italic", dfn: "italic", var: "italic",
  u: "underline", ins: "underline",
  s: "strike", strike: "strike", del: "strike",
  code: "code", kbd: "code", samp: "code", tt: "code",
  sup: "sup", sub: "sub",
};

const SAFE_LINK = /^(https?:|mailto:|tel:)/i;

// ── Colour sanity (the page is white; imported text must stay readable) ─────

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** [r, g, b] for the colour formats the sanitiser lets through, else null. */
const parseColor = (value: string): [number, number, number] | null => {
  const color = value.trim().toLowerCase();
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((ch) => ch + ch).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (color === "white") return [255, 255, 255];
  if (color === "black") return [0, 0, 0];
  return null;
};

const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a: [number, number, number], b: [number, number, number]): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const PAGE_INK: [number, number, number] = [17, 24, 39];
const PAGE_WHITE: [number, number, number] = [255, 255, 255];

/**
 * Keep a colour pair only if it reads on the white page. A pasted dark-theme
 * snippet (light-grey text) or a legacy dark highlight would otherwise vanish.
 */
const readableColors = (
  color: string | undefined,
  background: string | undefined,
  report: Context["report"],
): { textColor?: string; backgroundColor?: string } => {
  let textColor = color;
  let backgroundColor = background;
  const fg = textColor ? parseColor(textColor) : null;
  const bg = backgroundColor ? parseColor(backgroundColor) : null;
  if (fg && bg) {
    if (contrast(fg, bg) < 3) { textColor = undefined; backgroundColor = undefined; report.downgrades.add("colour-contrast"); }
  } else if (fg && contrast(fg, PAGE_WHITE) < 2) {
    textColor = undefined; report.downgrades.add("colour-contrast");
  } else if (bg && contrast(PAGE_INK, bg) < 3) {
    backgroundColor = undefined; report.downgrades.add("colour-contrast");
  }
  return { textColor, backgroundColor };
};

// ── Inline ──────────────────────────────────────────────────────────────────

const isElement = (node: Node): node is Element => node.nodeType === 1;
const tagOf = (el: Element): string => el.tagName.toLowerCase();

const containsRaw = (el: Element): boolean => {
  if (RAW_TAGS.has(tagOf(el))) return true;
  return Boolean(el.querySelector(Array.from(RAW_TAGS).join(",")));
};

/** Text and inline elements that hold no preserved structure. */
const isInlineNode = (node: Node): boolean => {
  if (node.nodeType === 3) return true;
  if (!isElement(node)) return false;
  const tag = tagOf(node);
  if (node.getAttribute("data-note-math") === "block") return false;
  return !BLOCK_TAGS.has(tag) && !RAW_TAGS.has(tag) && !containsRaw(node);
};

const alignOf = (el: Element): Align | undefined => {
  const value = (el.getAttribute("align") || (el as HTMLElement).style?.textAlign || "").toLowerCase();
  return value === "center" || value === "right" || value === "justify" ? value : undefined;
};

/** Styles an element contributes: its tag, then its (sanitised) `style` / `color`. */
const stylesFor = (el: Element, base: RunStyles, report: Context["report"]): RunStyles => {
  const next: RunStyles = { ...base };
  const tag = tagOf(el);
  const flag = STYLE_TAGS[tag];
  if (flag) next[flag] = true;
  if (tag === "mark" && !next.backgroundColor) next.backgroundColor = "rgb(255, 245, 157)";
  const style = (el as HTMLElement).style;
  let color = tag === "font" ? el.getAttribute("color") || undefined : undefined;
  let background: string | undefined;
  if (style) {
    const weight = style.fontWeight;
    if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) next.bold = true;
    if (style.fontStyle === "italic" || style.fontStyle === "oblique") next.italic = true;
    const decoration = `${style.textDecorationLine || ""} ${style.textDecoration || ""}`;
    if (/underline/.test(decoration)) next.underline = true;
    if (/line-through/.test(decoration)) next.strike = true;
    if (style.verticalAlign === "super") next.sup = true;
    if (style.verticalAlign === "sub") next.sub = true;
    if (style.color) color = style.color;
    if (style.backgroundColor && style.backgroundColor !== "transparent") background = style.backgroundColor;
    if (style.fontFamily || style.fontSize || style.lineHeight) report.downgrades.add("font-formatting");
  }
  if (tag === "font" && (el.getAttribute("face") || el.getAttribute("size"))) report.downgrades.add("font-formatting");
  if (color || background) {
    const ok = readableColors(color, background || next.backgroundColor, report);
    if (ok.textColor) next.textColor = ok.textColor;
    else if (color) delete next.textColor;
    if (ok.backgroundColor) next.backgroundColor = ok.backgroundColor;
    else if (background) delete next.backgroundColor;
  }
  return next;
};

const sameStyles = (a: RunStyles, b: RunStyles): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof RunStyles>;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
};

/** Walk inline nodes into flat runs (collapsed whitespace, `<br>` → "\n"). */
const collectRuns = (nodes: ArrayLike<Node>, base: RunStyles, report: Context["report"], inLink = false): InlineRun[] => {
  const runs: InlineRun[] = [];
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) {
      // Browser rules: collapsible whitespace folds to one space; U+00A0 is kept
      // (it is how the old editor stored deliberate runs of spaces).
      const text = String(node.nodeValue || "").replace(/[ \t\r\n\f]+/g, " ");
      if (text) runs.push({ type: "text", text, styles: base });
      continue;
    }
    if (!isElement(node)) continue;
    const tag = tagOf(node);
    if (node.getAttribute("data-note-math") === "inline") {
      const latex = String(node.getAttribute("data-latex") ?? node.textContent ?? "").slice(0, MAX_NOTE_MATH_SOURCE_LENGTH);
      runs.push({ type: "math", props: { latex } });
      continue;
    }
    if (tag === "br") { runs.push({ type: "text", text: "\n", styles: base }); continue; }
    const styles = stylesFor(node, base, report);
    if (tag === "a" && !inLink) {
      const href = (node.getAttribute("href") || "").trim();
      const inner = collectRuns(node.childNodes, styles, report, true);
      if (SAFE_LINK.test(href)) {
        let linkedText: TextRun[] = [];
        const flushLink = () => {
          if (linkedText.length) runs.push({ type: "link", href, content: linkedText });
          linkedText = [];
        };
        for (const item of inner) {
          if (item.type === "text") linkedText.push(item);
          else if (item.type === "math") { flushLink(); runs.push(item); }
        }
        flushLink();
      } else runs.push(...inner);
      continue;
    }
    runs.push(...collectRuns(node.childNodes, styles, report, inLink));
  }
  return runs;
};

/** Merge, de-duplicate spaces across run edges, trim, turn U+00A0 into a space. */
const finishRuns = (runs: InlineRun[]): InlineRun[] => {
  // 1. Spaces collapse across run boundaries, and after a line break.
  let previousEndsWithSpace = true; // start of block: leading space is layout
  const flat: InlineRun[] = runs.map((run) => {
    const walk = (text: string): string => {
      let out = text;
      if (previousEndsWithSpace && out.startsWith(" ")) out = out.slice(1);
      if (out) previousEndsWithSpace = out.endsWith(" ") || out.endsWith("\n");
      return out;
    };
    if (run.type === "text") return { ...run, text: walk(run.text) };
    if (run.type === "link") return { ...run, content: run.content.map((inner) => ({ ...inner, text: walk(inner.text) })) };
    previousEndsWithSpace = false;
    return run;
  });
  // 2. Trailing layout space / line breaks at the end of the block.
  for (let i = flat.length - 1; i >= 0; i -= 1) {
    const run = flat[i];
    // A math atom is real inline content; spaces immediately before it belong
    // between the preceding words and the formula, not at the paragraph edge.
    if (run.type === "math") break;
    const last: TextRun | undefined = run.type === "text" ? run : run.type === "link" ? run.content[run.content.length - 1] : undefined;
    if (!last) continue;
    last.text = last.text.replace(/[ \n]+$/, "");
    if (last.text) break;
  }
  // 3. Drop empties, merge neighbours, then U+00A0 → space.
  const out: InlineRun[] = [];
  const push = (run: InlineRun) => {
    if (run.type === "text") {
      if (!run.text) return;
      const prev = out[out.length - 1];
      if (prev && prev.type === "text" && sameStyles(prev.styles, run.styles)) prev.text += run.text;
      else out.push({ ...run });
      return;
    }
    if (run.type === "math") {
      out.push({ ...run, props: { ...run.props } });
      return;
    }
    const content = run.content.filter((inner) => inner.text);
    if (content.length) out.push({ ...run, content });
  };
  flat.forEach(push);
  const unNbsp = (run: TextRun): TextRun => ({ ...run, text: run.text.split(NBSP).join(" ") });
  return out.map((run) => {
    if (run.type === "text") return unNbsp(run);
    if (run.type === "link") return { ...run, content: run.content.map(unNbsp) };
    return run;
  });
};

const inlineFrom = (nodes: ArrayLike<Node>, report: Context["report"]): InlineRun[] =>
  finishRuns(collectRuns(nodes, {}, report));

const runsAreEmpty = (runs: InlineRun[]): boolean =>
  runs.every((run) => {
    if (run.type === "text") return !run.text.trim();
    if (run.type === "math") return false;
    return run.content.every((inner) => !inner.text.trim());
  });

// ── Blocks ──────────────────────────────────────────────────────────────────

const withAlign = (ctx: Context, own?: Align) => {
  const align = own || ctx.align;
  return align && align !== "left" ? { textAlignment: align } : {};
};

const rawBlock = (el: Element, ctx: Context): NotePartialBlock => {
  ctx.report.preserved += 1;
  return { type: "legacyHtml", props: { html: el.outerHTML } };
};

const paragraphBlock = (runs: InlineRun[], ctx: Context, own?: Align): NotePartialBlock => ({
  type: "paragraph",
  props: withAlign(ctx, own),
  content: runs,
});

/** One list's items, in document order, nested lists as children. */
function importList(list: Element, ctx: Context, out: NotePartialBlock[]): void {
  const ordered = tagOf(list) === "ol";
  const startAttr = parseInt(list.getAttribute("start") || "", 10);
  let first = true;
  for (const li of Array.from(list.children)) {
    if (tagOf(li) !== "li") {
      // A stray child (malformed paste): never lose it.
      importBlockElement(li, ctx, out);
      continue;
    }
    const checked = li.getAttribute("data-checked");
    const nodes = Array.from(li.childNodes);
    // Leading inline nodes are the item's own text; the rest become children.
    let split = 0;
    while (split < nodes.length && isInlineNode(nodes[split])) split += 1;
    let content = inlineFrom(nodes.slice(0, split), ctx.report);
    let restNodes = nodes.slice(split);
    if (runsAreEmpty(content) && restNodes.length) {
      // <li><p>text</p>…</li> (Docs / Notion / Word): the first paragraph is the text.
      const head = restNodes[0];
      if (isElement(head) && /^(p|div)$/.test(tagOf(head)) && !containsRaw(head) && !Array.from(head.children).some((c) => BLOCK_TAGS.has(tagOf(c)))) {
        content = inlineFrom(head.childNodes, ctx.report);
        restNodes = restNodes.slice(1);
      }
    }
    const children: NotePartialBlock[] = [];
    const holder = li.ownerDocument.createElement("div");
    restNodes.forEach((node) => holder.appendChild(node.cloneNode(true)));
    importChildren(holder, ctx, children);
    const type = ordered ? "numberedListItem" : checked !== null ? "checkListItem" : "bulletListItem";
    const props: Record<string, unknown> = { ...withAlign(ctx, alignOf(li)) };
    if (type === "checkListItem") props.checked = checked === "true";
    if (type === "numberedListItem" && first && Number.isFinite(startAttr) && startAttr > 1) props.start = startAttr;
    first = false;
    out.push({ type, props, content, children } as NotePartialBlock);
  }
}

function importBlockElement(el: Element, ctx: Context, out: NotePartialBlock[]): void {
  const tag = tagOf(el);
  if (el.getAttribute("data-note-math") === "block") {
    const latex = String(el.getAttribute("data-latex") ?? el.textContent ?? "").slice(0, MAX_NOTE_MATH_SOURCE_LENGTH);
    out.push({ type: "mathBlock", props: { latex } } as NotePartialBlock);
    return;
  }
  if (RAW_TAGS.has(tag)) { out.push(rawBlock(el, ctx)); return; }
  const own = alignOf(el);
  const scoped: Context = own ? { ...ctx, align: own } : ctx;

  switch (tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
      if (containsRaw(el)) { out.push(rawBlock(el, ctx)); return; }
      const runs = inlineFrom(el.childNodes, ctx.report);
      if (runsAreEmpty(runs)) return;
      const raw = Number(tag.slice(1));
      if (raw > 3) ctx.report.downgrades.add("heading-level");
      out.push({ type: "heading", props: { level: Math.min(raw, 3) as 1 | 2 | 3, ...withAlign(ctx, own) }, content: runs });
      return;
    }
    case "ul": case "ol":
      importList(el, scoped, out);
      return;
    case "li":
      // An <li> outside a list (malformed paste) is just a line.
      importChildren(el, scoped, out);
      return;
    case "blockquote": {
      const inner: NotePartialBlock[] = [];
      importChildren(el, scoped, inner);
      // The editor's quote holds inline text, so a multi-paragraph quote is a
      // run of quote blocks (it reads as one quote).
      for (const block of inner) {
        if (block.type === "paragraph") out.push({ type: "quote", content: block.content as InlineRun[] } as NotePartialBlock);
        else out.push(block);
      }
      return;
    }
    case "pre": {
      const text = (el.textContent || "").replace(/\r\n?/g, "\n").replace(/^\n/, "").replace(/\n$/, "");
      if (!text.trim()) return;
      out.push({ type: "codeBlock", props: { language: "text" }, content: [{ type: "text", text, styles: {} }] });
      return;
    }
    case "hr":
      out.push({ type: "divider" });
      return;
    default: {
      // p / div / section / …: a paragraph if it holds only inline content,
      // otherwise a transparent wrapper around its blocks. A blank line the
      // old editor wrote (<div><br></div>, <p><br></p>) stays a blank line.
      const hasBlockChild = Array.from(el.childNodes).some((node) => !isInlineNode(node));
      if (!hasBlockChild) {
        const runs = inlineFrom(el.childNodes, ctx.report);
        const blankLine = runsAreEmpty(runs) && Boolean(el.querySelector("br")) && /^(p|div)$/.test(tag);
        if (!runsAreEmpty(runs) || blankLine) out.push(paragraphBlock(blankLine ? [] : runs, scoped));
        return;
      }
      importChildren(el, scoped, out);
    }
  }
}

/** A container's children → blocks (loose inline runs become paragraphs). */
function importChildren(parent: Node, ctx: Context, out: NotePartialBlock[]): void {
  let buffer: Node[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const runs = inlineFrom(buffer, ctx.report);
    buffer = [];
    if (!runsAreEmpty(runs)) out.push(paragraphBlock(runs, ctx));
  };
  for (const node of Array.from(parent.childNodes)) {
    if (isInlineNode(node)) { buffer.push(node); continue; }
    flush();
    if (isElement(node)) importBlockElement(node, ctx, out);
  }
  flush();
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Anything with no markup at all is plain text; its line breaks are real. */
const looksLikePlainText = (value: string): boolean => !/<[a-z!/]/i.test(value);

/**
 * Legacy / pasted HTML → blocks. Never throws: on any failure the text is kept
 * as paragraphs, so opening a note can not fail and can not lose its words.
 */
export function importLegacyHtml(html: string): NoteImportReport {
  const report: Context["report"] = { preserved: 0, downgrades: new Set() };
  const input = String(html || "");
  const empty: NoteImportReport = { blocks: [], preservedBlocks: 0, downgrades: [] };
  if (!input.trim()) return empty;
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") return empty;

  try {
    const source = looksLikePlainText(input) && input.includes("\n")
      ? input.split(/\r?\n/).map((line) => `<div>${line.replace(/&(?![a-z#0-9]+;)/gi, "&amp;").replace(/</g, "&lt;") || "<br>"}</div>`).join("")
      : input;
    const clean = normalizeRichClipboardHtml(source);
    if (!clean) return empty;
    const doc = new window.DOMParser().parseFromString(`<body>${clean}</body>`, "text/html");
    const blocks: NotePartialBlock[] = [];
    importChildren(doc.body, { report }, blocks);
    return { blocks, preservedBlocks: report.preserved, downgrades: Array.from(report.downgrades) };
  } catch {
    // Last resort: the visible text, line by line. Words are never lost.
    const text = new window.DOMParser().parseFromString(`<body>${input}</body>`, "text/html").body.textContent || "";
    const blocks: NotePartialBlock[] = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line, styles: {} }] }));
    return { blocks, preservedBlocks: 0, downgrades: ["import-fallback"] };
  }
}
