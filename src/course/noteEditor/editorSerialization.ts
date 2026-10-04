// src/course/noteEditor/editorSerialization.ts
//
// THE EXPLICIT SERIALISATION ADAPTER: BlockNote blocks → the note's stored
// HTML. Persistence never sees BlockNote's own HTML export (its markup carries
// editor-internal classes and `data-*` noise, and a checklist export is built
// from <input> elements the player's sanitiser — correctly — strips). This
// file owns the stored dialect instead, so what is persisted is stable across
// BlockNote upgrades:
//
//   paragraph      <p>…</p>                      (empty → <p><br></p>)
//   heading 1–3    <h1>…</h1> … <h3>…</h3>
//   bullet         <ul><li>…</li></ul>            nested lists nest in the <li>
//   numbered       <ol [start=n]><li>…</li></ol>
//   checklist      <ul><li data-checked="true|false">…</li></ul>
//   quote          <blockquote>…</blockquote>
//   code           <pre><code>…</code></pre>
//   divider        <hr>
//   mathBlock      <div data-note-math="block" data-latex="…">$$…$$</div>
//   legacyHtml     the preserved fragment, verbatim (re-sanitised)
//
// Inline: <span data-note-math="inline" data-latex="…">$…$</span>, plus
// <strong> <em> <u> <s> <code> <sup> <sub> <a href> and one
// <span style="color; background-color"> for the legacy colours; a soft line
// break is <br>. Everything here is already inside the player's sanitiser
// allow-list, and `sanitizeRichText` runs over the final string anyway.
//
// The reverse direction (stored HTML → blocks) is ./editorMigration, and the
// two are tested as a round trip.
//
// Not representable in HTML, so flattened on purpose: a NON-list block with
// child blocks (an indented paragraph). Its children follow it as siblings —
// every character is kept, only the indent is not persisted.

import { escapeHtml, sanitizeRichText } from "../../utils/richText";
import { MAX_NOTE_MATH_SOURCE_LENGTH, mathSourceText } from "../../utils/noteMath";

/** The structural slice of a block this adapter reads (editor or importer). */
export interface SerializableInline {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
  props?: Record<string, unknown>;
  href?: string;
  content?: SerializableInline[];
}

export interface SerializableBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: SerializableInline[] | string;
  children?: SerializableBlock[];
}

type ListKind = "bullet" | "numbered" | "check";

const LIST_KINDS: Record<string, ListKind | undefined> = {
  bulletListItem: "bullet",
  numberedListItem: "numbered",
  checkListItem: "check",
};

// ── Text ────────────────────────────────────────────────────────────────────

/**
 * Text → HTML text. A run of spaces would collapse the moment the note is shown
 * as HTML (the saved-note card), so every space but the last of a run becomes
 * `&nbsp;`; the importer turns each of them back into one space.
 */
const encodeLine = (line: string): string =>
  escapeHtml(line).replace(/ {2,}/g, (run) => `${"&nbsp;".repeat(run.length - 1)} `);

const encodeText = (text: string): string => text.split("\n").map(encodeLine).join("<br>");

const isCssSafe = (value: string): boolean => !/[;{}<>"'\\]|url\(|expression\(|javascript:/i.test(value);

const styledText = (item: SerializableInline): string => {
  const styles = item.styles || {};
  let html = encodeText(String(item.text ?? ""));
  if (!html) return "";
  // Inner → outer, so the nesting order is fixed and a round trip is stable.
  if (styles.sub) html = `<sub>${html}</sub>`;
  if (styles.sup) html = `<sup>${html}</sup>`;
  if (styles.code) html = `<code>${html}</code>`;
  if (styles.strike) html = `<s>${html}</s>`;
  if (styles.underline) html = `<u>${html}</u>`;
  if (styles.italic) html = `<em>${html}</em>`;
  if (styles.bold) html = `<strong>${html}</strong>`;
  const color = typeof styles.textColor === "string" ? styles.textColor : "";
  const background = typeof styles.backgroundColor === "string" ? styles.backgroundColor : "";
  const declarations = [
    color && color !== "default" && isCssSafe(color) ? `color: ${color}` : "",
    background && background !== "default" && isCssSafe(background) ? `background-color: ${background}` : "",
  ].filter(Boolean);
  if (declarations.length) html = `<span style="${declarations.join("; ")}">${html}</span>`;
  return html;
};

/** Inline content (text + links) → HTML. */
export const inlineToHtml = (content: SerializableInline[] | string | undefined): string => {
  if (content == null) return "";
  if (typeof content === "string") return encodeText(content);
  let html = "";
  for (const item of content) {
    if (item.type === "link") {
      const inner = (item.content || []).map(styledText).join("");
      const href = String(item.href || "").trim();
      html += /^(https?:|mailto:|tel:)/i.test(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : inner;
    } else if (item.type === "math") {
      const latex = String(item.props?.latex ?? "").slice(0, MAX_NOTE_MATH_SOURCE_LENGTH);
      html += `<span data-note-math="inline" data-latex="${escapeHtml(latex)}">${escapeHtml(mathSourceText(latex, false))}</span>`;
    } else {
      html += styledText(item);
    }
  }
  // A leading / trailing space is dropped by HTML layout; keep it as nbsp.
  return html.replace(/^ /, "&nbsp;").replace(/ $/, "&nbsp;");
};

/** The plain text of inline content (used for `<pre>` and emptiness checks). */
const inlineToText = (content: SerializableInline[] | string | undefined): string => {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .map((item) => {
      if (item.type === "link") return inlineToText(item.content);
      if (item.type === "math") return mathSourceText(String(item.props?.latex ?? "").slice(0, MAX_NOTE_MATH_SOURCE_LENGTH), false);
      return String(item.text ?? "");
    })
    .join("");
};

// ── Blocks ──────────────────────────────────────────────────────────────────

const alignStyle = (block: SerializableBlock): string => {
  const align = block.props?.textAlignment;
  return typeof align === "string" && align !== "left" && /^(center|right|justify)$/.test(align)
    ? ` style="text-align: ${align}"`
    : "";
};

const headingLevel = (block: SerializableBlock): 1 | 2 | 3 => {
  const level = Number(block.props?.level);
  return level === 2 ? 2 : level === 3 ? 3 : 1;
};

const listItemHtml = (block: SerializableBlock, kind: ListKind): string => {
  const check = kind === "check" ? ` data-checked="${block.props?.checked ? "true" : "false"}"` : "";
  const children = block.children?.length ? blocksToHtml(block.children) : "";
  return `<li${check}${alignStyle(block)}>${inlineToHtml(block.content)}${children}</li>`;
};

const listHtml = (kind: ListKind, items: SerializableBlock[]): string => {
  if (kind === "numbered") {
    const start = Number(items[0]?.props?.start);
    const attr = Number.isFinite(start) && start > 1 ? ` start="${Math.floor(start)}"` : "";
    return `<ol${attr}>${items.map((item) => listItemHtml(item, kind)).join("")}</ol>`;
  }
  return `<ul>${items.map((item) => listItemHtml(item, kind)).join("")}</ul>`;
};

const blockHtml = (block: SerializableBlock): string => {
  switch (block.type) {
    case "paragraph": {
      const inner = inlineToHtml(block.content);
      return `<p${alignStyle(block)}>${inner || "<br>"}</p>`;
    }
    case "heading": {
      const level = headingLevel(block);
      return `<h${level}${alignStyle(block)}>${inlineToHtml(block.content)}</h${level}>`;
    }
    case "quote":
      return `<blockquote>${inlineToHtml(block.content)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml(inlineToText(block.content))}</code></pre>`;
    case "divider":
      return "<hr>";
    case "mathBlock": {
      const latex = String(block.props?.latex ?? "").slice(0, MAX_NOTE_MATH_SOURCE_LENGTH);
      return `<div data-note-math="block" data-latex="${escapeHtml(latex)}">${escapeHtml(mathSourceText(latex, true))}</div>`;
    }
    case "legacyHtml":
      return sanitizeRichText(String(block.props?.html ?? ""));
    default: {
      // A block type this adapter does not know (a future block, a stale
      // document): keep its text rather than lose it.
      const text = inlineToText(block.content);
      return text ? `<p>${encodeText(text)}</p>` : "";
    }
  }
};

const isBlankParagraph = (block: SerializableBlock | undefined): boolean =>
  Boolean(block) &&
  block!.type === "paragraph" &&
  !inlineToText(block!.content).trim() &&
  !(block!.children && block!.children.length);

/** Blocks → the note body's stored HTML. */
export function blocksToHtml(blocks: ReadonlyArray<SerializableBlock>): string {
  let html = "";
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    const kind = LIST_KINDS[block.type];
    if (kind) {
      // One run of consecutive items of the same kind is one <ul>/<ol>; a
      // numbered item that carries its own `start` begins a new list.
      const run: SerializableBlock[] = [block];
      let next = index + 1;
      while (next < blocks.length && LIST_KINDS[blocks[next].type] === kind) {
        if (kind === "numbered" && Number(blocks[next].props?.start) > 1) break;
        run.push(blocks[next]);
        next += 1;
      }
      html += listHtml(kind, run);
      index = next;
      continue;
    }
    html += blockHtml(block);
    // Indented non-list blocks flatten to following siblings (see header).
    if (block.children?.length) html += blocksToHtml(block.children);
    index += 1;
  }
  return html;
}

/**
 * The note body as the player stores it: serialised, trailing blank lines
 * trimmed (an untouched new note is therefore the empty string), and run
 * through the player's sanitiser one last time.
 */
export function serializeNoteBody(blocks: ReadonlyArray<SerializableBlock>): string {
  let end = blocks.length;
  while (end > 0 && isBlankParagraph(blocks[end - 1])) end -= 1;
  if (end === 0) return "";
  return sanitizeRichText(blocksToHtml(blocks.slice(0, end)));
}
