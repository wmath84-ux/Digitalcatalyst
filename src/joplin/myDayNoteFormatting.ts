// src/joplin/myDayNoteFormatting.ts
//
// My Day stores note bodies as Markdown (Joplin `markup_language: 1`). This
// module keeps that existing representation canonical: the textarea edits
// Markdown, paste from rich HTML is converted to Markdown, and preview always
// renders from Markdown through the Course Player's already-installed Marked,
// sanitizer and KaTeX pipeline. No Markdown → HTML → Markdown save loop exists.
//
// The shared Course Player boundary is intentional: math markers, Markdown
// parsing, clipboard normalization and HTML allow-list rules stay compatible,
// while My Day continues to persist its own Markdown data without migration.

import "katex/dist/katex.min.css";
import { normalizePlainClipboardText, normalizeRichClipboardHtml } from "../course/noteEditor/clipboardNormalization";
import { renderNoteHtmlWithMath } from "../course/noteEditor/mathRendering";

const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
const SAFE_LANGUAGE = /^[A-Za-z0-9_+.-]{1,32}$/;

const escapeMarkdown = (value: string): string =>
  String(value ?? "").replace(/([\\`*_{}\[\]<>!])/g, "\\$1");

const textContent = (node: Node): string => String(node.textContent ?? "");
const isElement = (node: Node): node is Element => node.nodeType === 1;
const tagOf = (node: Element): string => node.tagName.toLowerCase();

const safeHref = (value: string): string => {
  const href = String(value ?? "").trim();
  return SAFE_LINK.test(href) ? href.replace(/[\s<>]/g, (char) => encodeURIComponent(char)) : "";
};

const codeFenceFor = (text: string): string => {
  const runs = text.match(/`+/g) ?? [];
  return "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
};

const unicodeSuper: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", i: "ⁱ", n: "ⁿ",
};
const unicodeSub: Readonly<Record<string, string>> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ",
  k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ",
};

const plainInlineText = (node: Node): string => {
  if (node.nodeType === 3) return textContent(node);
  if (!isElement(node)) return "";
  return Array.from(node.childNodes).map(plainInlineText).join("");
};

/** Inline rich HTML → Markdown fragments, retaining safe semantic formatting. */
const inlineMarkdown = (nodes: ArrayLike<Node>): string => {
  let output = "";
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) {
      output += escapeMarkdown(textContent(node));
      continue;
    }
    if (!isElement(node)) continue;
    const tag = tagOf(node);
    const mathMode = node.getAttribute("data-note-math");
    if (mathMode === "inline") {
      const latex = String(node.getAttribute("data-latex") ?? textContent(node)).slice(0, 4096);
      output += `$${latex.replace(/(?<!\\)\$/g, "\\$")}$`;
      continue;
    }
    if (mathMode === "block") continue;
    if (tag === "br") { output += "  \n"; continue; }
    if (tag === "code" || tag === "kbd" || tag === "samp") {
      const value = textContent(node);
      const fence = codeFenceFor(value);
      output += `${fence}${value.startsWith("`") || value.endsWith("`") ? " " : ""}${value}${value.startsWith("`") || value.endsWith("`") ? " " : ""}${fence}`;
      continue;
    }
    const inner = inlineMarkdown(node.childNodes);
    switch (tag) {
      case "strong": case "b": output += `**${inner}**`; break;
      case "em": case "i": case "cite": output += `*${inner}*`; break;
      case "del": case "s": case "strike": output += `~~${inner}~~`; break;
      case "u": case "ins": output += `<u>${inner}</u>`; break;
      case "sup": {
        const plain = plainInlineText(node);
        const encoded = Array.from(plain).map((char) => unicodeSuper[char]);
        output += encoded.every(Boolean) ? encoded.join("") : `<sup>${escapeMarkdown(plain)}</sup>`;
        break;
      }
      case "sub": {
        const plain = plainInlineText(node);
        const encoded = Array.from(plain).map((char) => unicodeSub[char]);
        output += encoded.every(Boolean) ? encoded.join("") : `<sub>${escapeMarkdown(plain)}</sub>`;
        break;
      }
      case "a": {
        const href = safeHref(node.getAttribute("href") ?? "");
        output += href ? `[${inner}](${href.replace(/[()]/g, "\\$&")})` : inner;
        break;
      }
      case "img": {
        const src = safeHref(node.getAttribute("src") ?? "");
        output += src ? `![${escapeMarkdown(node.getAttribute("alt") ?? "image")}](${src})` : "";
        break;
      }
      case "span": case "mark": case "small": case "q": output += inner; break;
      default: output += inner;
    }
  }
  return output;
};

const markdownBlocks = (nodes: ArrayLike<Node>): string[] => {
  const output: string[] = [];
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) {
      const text = escapeMarkdown(textContent(node).trim());
      if (text) output.push(text);
      continue;
    }
    if (!isElement(node)) continue;
    const tag = tagOf(node);
    const mathMode = node.getAttribute("data-note-math");
    if (mathMode === "block") {
      const latex = String(node.getAttribute("data-latex") ?? textContent(node)).slice(0, 4096);
      output.push(`$$\n${latex}\n$$`);
      continue;
    }
    if (mathMode === "inline") {
      const latex = String(node.getAttribute("data-latex") ?? textContent(node)).slice(0, 4096);
      output.push(`$${latex}$`);
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      output.push(`${"#".repeat(level)} ${inlineMarkdown(node.childNodes).trim()}`);
      continue;
    }
    if (tag === "p") {
      const text = inlineMarkdown(node.childNodes).trim();
      if (text) output.push(text);
      continue;
    }
    if (tag === "div" || tag === "section" || tag === "article") {
      const hasBlockChildren = Array.from(node.children).some((child) => /^(p|div|section|article|h[1-6]|ul|ol|blockquote|pre|table|hr)$/.test(tagOf(child)));
      if (hasBlockChildren) output.push(...markdownBlocks(node.childNodes));
      else {
        const text = inlineMarkdown(node.childNodes).trim();
        if (text) output.push(text);
      }
      continue;
    }
    if (tag === "blockquote") {
      const quoted = markdownBlocks(node.childNodes).join("\n\n");
      if (quoted) output.push(quoted.split("\n").map((line) => `> ${line}`).join("\n"));
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      output.push(listMarkdown(node));
      continue;
    }
    if (tag === "pre") {
      const code = node.querySelector("code") ?? node;
      const content = textContent(code).replace(/\r\n?/g, "\n").replace(/^\n|\n$/g, "");
      const language = String(code.getAttribute("data-note-code-language") ?? "").trim();
      const info = SAFE_LANGUAGE.test(language) ? language : "";
      const fence = codeFenceFor(content);
      output.push(`${fence}${info}\n${content}\n${fence}`);
      continue;
    }
    if (tag === "hr") { output.push("---"); continue; }
    if (tag === "table") {
      const table = tableMarkdown(node);
      if (table) output.push(table);
      continue;
    }
    if (tag === "img") {
      const image = inlineMarkdown([node]);
      if (image) output.push(image);
      continue;
    }
    const children = Array.from(node.children);
    const blocks = children.some((child) => /^(p|div|h[1-6]|ul|ol|blockquote|pre|table|hr)$/.test(tagOf(child)));
    if (blocks) output.push(...markdownBlocks(node.childNodes));
    else {
      const text = inlineMarkdown([node]).trim();
      if (text) output.push(text);
    }
  }
  return output.filter(Boolean);
};

const listMarkdown = (list: Element, depth = 0): string => {
  const ordered = tagOf(list) === "ol";
  const startValue = Number.parseInt(list.getAttribute("start") ?? "1", 10);
  let number = Number.isFinite(startValue) && startValue > 0 ? startValue : 1;
  const lines: string[] = [];
  for (const item of Array.from(list.children).filter((child) => tagOf(child) === "li")) {
    const prefix = ordered ? `${number++}. ` : item.hasAttribute("data-checked")
      ? `- [${item.getAttribute("data-checked") === "true" ? "x" : " "}] `
      : "- ";
    let own = "";
    const nested: string[] = [];
    for (const child of Array.from(item.childNodes)) {
      if (isElement(child) && (tagOf(child) === "ul" || tagOf(child) === "ol")) {
        nested.push(listMarkdown(child, depth + 1));
      } else if (isElement(child) && /^(p|div)$/.test(tagOf(child))) {
        const text = inlineMarkdown(child.childNodes).trim();
        if (text) own += `${own ? " " : ""}${text}`;
      } else if (isElement(child) && /^(blockquote|pre|table)$/.test(tagOf(child))) {
        nested.push(markdownBlocks([child]).join("\n\n"));
      } else {
        own += inlineMarkdown([child]);
      }
    }
    const indent = "  ".repeat(depth);
    const ownLines = (own.trim() || "").split("\n");
    lines.push(`${indent}${prefix}${ownLines[0] ?? ""}`);
    for (const continuation of ownLines.slice(1)) lines.push(`${indent}  ${continuation}`);
    for (const childMarkdown of nested) {
      if (!childMarkdown) continue;
      lines.push(...childMarkdown.split("\n").map((line) => line.startsWith("  ") ? line : `${indent}  ${line}`));
    }
  }
  return lines.join("\n");
};

const tableMarkdown = (table: Element): string => {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.children).filter((cell) => /^(td|th)$/.test(tagOf(cell))).map((cell) => ({
      cell,
      text: inlineMarkdown(cell.childNodes).replace(/(?<!\\)\|/g, "\\|").replace(/[\r\n]+/g, " ").trim(),
      align: (cell.getAttribute("align") || (cell as HTMLElement).style?.textAlign || "").toLowerCase(),
      header: tagOf(cell) === "th",
    })),
  ).filter((row) => row.length);
  if (!rows.length) return "";
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.header));
  const index = headerIndex < 0 ? 0 : headerIndex;
  const header = rows[index];
  const width = Math.max(...rows.map((row) => row.length));
  const normalizeRow = (row: typeof header) => Array.from({ length: width }, (_, cellIndex) => row[cellIndex]?.text ?? "");
  const normalizedHeader = normalizeRow(header);
  const separator = Array.from({ length: width }, (_, cellIndex) => {
    const align = header[cellIndex]?.align;
    return align === "center" ? ":---:" : align === "right" ? "---:" : align === "left" ? ":---" : "---";
  });
  const renderRow = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const body = rows.filter((_, rowIndex) => rowIndex !== index).map(normalizeRow);
  return [renderRow(normalizedHeader), renderRow(separator), ...body.map(renderRow)].join("\n");
};

const captureCodeLanguages = (html: string): string[] => {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") return [];
  try {
    const document = new window.DOMParser().parseFromString(`<body>${String(html ?? "")}</body>`, "text/html");
    return Array.from(document.body.querySelectorAll("pre code")).map((code) => {
      const language = code.getAttribute("data-language") ?? Array.from(code.classList).find((name) => name.startsWith("language-"))?.slice(9) ?? "";
      return SAFE_LANGUAGE.test(language) ? language : "";
    });
  } catch {
    return [];
  }
};

/** Rich HTML clipboard → the canonical Markdown body. */
export function richHtmlToMyDayMarkdown(html: string): string {
  const languages = captureCodeLanguages(html);
  const safe = normalizeRichClipboardHtml(html);
  if (!safe || typeof window === "undefined" || typeof window.DOMParser === "undefined") return "";
  try {
    const document = new window.DOMParser().parseFromString(`<body>${safe}</body>`, "text/html");
    const codeNodes = Array.from(document.body.querySelectorAll("pre code"));
    codeNodes.forEach((code, index) => {
      const language = languages[index];
      if (language) code.setAttribute("data-note-code-language", language);
    });
    return markdownBlocks(document.body.childNodes).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}

const wrapResponsiveTables = (html: string): string => {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") return html;
  const document = new window.DOMParser().parseFromString(`<body>${String(html ?? "")}</body>`, "text/html");
  for (const table of Array.from(document.body.querySelectorAll("table"))) {
    if (table.parentElement?.classList.contains("myday-table-scroll")) continue;
    const wrapper = document.createElement("div");
    wrapper.className = "myday-table-scroll";
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Scrollable table");
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  }
  for (const item of Array.from(document.body.querySelectorAll<HTMLLIElement>('li[data-checked="true"], li[data-checked="false"]'))) {
    item.classList.add("myday-checklist-item");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = true;
    checkbox.checked = item.getAttribute("data-checked") === "true";
    if (checkbox.checked) checkbox.setAttribute("checked", "");
    checkbox.tabIndex = -1;
    checkbox.className = "myday-checklist-control";
    checkbox.setAttribute("aria-label", checkbox.checked ? "Completed" : "Not completed");
    item.insertBefore(checkbox, item.firstChild);
  }
  return document.body.innerHTML.trim();
};

/** Safe Markdown → normalized HTML → KaTeX HTML for the My Day preview. */
export function renderMyDayMarkdown(markdown: string): string {
  const source = String(markdown ?? "");
  if (!source.trim()) return '<p class="myday-empty-note">Empty note body</p>';
  const normalized = normalizePlainClipboardText(source);
  return wrapResponsiveTables(renderNoteHtmlWithMath(normalized));
}

export type MarkdownFormatAction =
  | "bold" | "italic" | "bold-italic" | "strike" | "inline-code" | "link" | "inline-math"
  | "heading" | "paragraph" | "bullet" | "numbered" | "checklist" | "check-complete"
  | "quote" | "code-block" | "horizontal-rule" | "table" | "block-math";

export interface MarkdownFormatOptions {
  headingLevel?: number;
  language?: string;
  linkUrl?: string;
}

export interface MarkdownFormatResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const linesForSelection = (value: string, start: number, end: number): { start: number; end: number; lines: string[] } => {
  const from = Math.max(0, Math.min(value.length, start));
  const to = Math.max(from, Math.min(value.length, end));
  const lineStart = value.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  let lineEnd = value.indexOf("\n", to);
  if (lineEnd < 0) lineEnd = value.length;
  // A selection ending at the start of a line does not include that line.
  if (to > from && to === lineEnd && value[to - 1] === "\n") lineEnd = to - 1;
  return { start: lineStart, end: lineEnd, lines: value.slice(lineStart, lineEnd).split("\n") };
};

const insertBlock = (value: string, start: number, end: number, block: string): { value: string; contentStart: number } => {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const leading = before && !/\n\n$/.test(before) ? before.endsWith("\n") ? "\n" : "\n\n" : "";
  const trailing = after && !/^\n\n/.test(after) ? after.startsWith("\n") ? "\n" : "\n\n" : "";
  const replacement = `${leading}${block}${trailing}`;
  return {
    value: before + replacement + after,
    contentStart: start + leading.length,
  };
};

const lineFormat = (
  value: string,
  start: number,
  end: number,
  action: MarkdownFormatAction,
  level = 1,
): MarkdownFormatResult => {
  const range = linesForSelection(value, start, end);
  const indentation = (line: string) => line.match(/^\s*/)?.[0] ?? "";
  const transformed = range.lines.map((line, index) => {
    const indent = indentation(line);
    const content = line.slice(indent.length);
    if (action === "heading" || action === "paragraph") {
      const body = content.replace(/^#{1,6}\s+/, "");
      return action === "paragraph" ? `${indent}${body}` : `${indent}${"#".repeat(Math.min(6, Math.max(1, level)))} ${body}`;
    }
    if (action === "bullet" || action === "numbered" || action === "checklist" || action === "quote") {
      const markers = action === "bullet" ? /^[-+*]\s+/ : action === "numbered" ? /^\d+[.)]\s+/ : action === "checklist" ? /^[-+*]\s+\[[ xX]\]\s+/ : /^>\s?/;
      const unmarked = content.replace(markers, "");
      if (action === "bullet") return `${indent}- ${unmarked}`;
      if (action === "numbered") return `${indent}${index + 1}. ${unmarked}`;
      if (action === "checklist") return `${indent}- [ ] ${unmarked}`;
      return `${indent}> ${unmarked}`;
    }
    if (action === "check-complete") {
      const current = content.match(/^([-+*]\s+\[)([ xX])(\]\s+)/);
      if (current) return `${indent}${current[1]}${current[2].trim() ? " " : "x"}${current[3]}${content.slice(current[0].length)}`;
      return `${indent}- [x] ${content}`;
    }
    return line;
  });
  const replacement = transformed.join("\n");
  const prefix = value.slice(0, range.start);
  const suffix = value.slice(range.end);
  return { value: prefix + replacement + suffix, selectionStart: range.start, selectionEnd: range.start + replacement.length };
};

/** Apply a toolbar action to the Markdown document without losing its selection. */
export function formatMyDayMarkdown(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownFormatAction,
  options: MarkdownFormatOptions = {},
): MarkdownFormatResult {
  const source = String(value ?? "");
  const start = Math.max(0, Math.min(source.length, selectionStart));
  const end = Math.max(start, Math.min(source.length, selectionEnd));
  const selected = source.slice(start, end);
  const wrappers: Partial<Record<MarkdownFormatAction, [string, string, string]>> = {
    bold: ["**", "**", "bold text"],
    italic: ["*", "*", "italic text"],
    "bold-italic": ["***", "***", "bold italic text"],
    strike: ["~~", "~~", "struck text"],
    "inline-code": ["`", "`", "code"],
    "inline-math": ["$", "$", "x^2"],
  };
  if (action === "link") {
    const href = safeHref(options.linkUrl ?? "https://example.com");
    if (!href) return { value: source, selectionStart: start, selectionEnd: end };
    const body = selected || "link text";
    const destination = href.replace(/[()]/g, "\\$&");
    const replacement = `[${body}](${destination})`;
    const valueAfter = source.slice(0, start) + replacement + source.slice(end);
    return { value: valueAfter, selectionStart: start + 1, selectionEnd: start + 1 + body.length };
  }
  const wrapper = wrappers[action];
  if (wrapper) {
    const [before, after, placeholder] = wrapper;
    if (selected && start >= before.length &&
      source.slice(start - before.length, start) === before &&
      source.slice(end, end + after.length) === after) {
      const wrapperStart = start - before.length;
      const valueAfter = source.slice(0, wrapperStart) + selected + source.slice(end + after.length);
      return { value: valueAfter, selectionStart: wrapperStart, selectionEnd: wrapperStart + selected.length };
    }
    const body = selected || placeholder;
    const replacement = `${before}${body}${after}`;
    const valueAfter = source.slice(0, start) + replacement + source.slice(end);
    const bodyStart = start + before.length;
    return { value: valueAfter, selectionStart: bodyStart, selectionEnd: bodyStart + body.length };
  }
  if (["heading", "paragraph", "bullet", "numbered", "checklist", "check-complete", "quote"].includes(action)) {
    return lineFormat(source, start, end, action, options.headingLevel ?? 1);
  }

  let replacement = "";
  if (action === "code-block") {
    const language = SAFE_LANGUAGE.test(String(options.language ?? "")) ? String(options.language) : "";
    const body = selected || "code";
    const fence = codeFenceFor(body);
    replacement = `${fence}${language}\n${body}\n${fence}`;
    const inserted = insertBlock(source, start, end, replacement);
    const bodyStart = inserted.contentStart + fence.length + language.length + 1;
    return { value: inserted.value, selectionStart: bodyStart, selectionEnd: bodyStart + body.length };
  }
  if (action === "horizontal-rule") {
    const inserted = insertBlock(source, start, end, "---");
    const caret = inserted.contentStart + 3;
    return { value: inserted.value, selectionStart: caret, selectionEnd: caret };
  }
  if (action === "table") {
    replacement = "| Heading 1 | Heading 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |";
    const inserted = insertBlock(source, start, end, replacement);
    const caret = inserted.contentStart + replacement.length;
    return { value: inserted.value, selectionStart: caret, selectionEnd: caret };
  }
  if (action === "block-math") {
    const body = selected || String.raw`\frac{a}{b}`;
    replacement = `$$\n${body}\n$$`;
    const inserted = insertBlock(source, start, end, replacement);
    const bodyStart = inserted.contentStart + 3;
    return { value: inserted.value, selectionStart: bodyStart, selectionEnd: bodyStart + body.length };
  }
  const valueAfter = source.slice(0, start) + replacement + source.slice(end);
  const caret = start + replacement.length;
  return { value: valueAfter, selectionStart: caret, selectionEnd: caret };
}

/** Paste plain text unchanged apart from platform line-ending normalization. */
export function normalizeMyDayPlainTextPaste(text: string): string {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}
