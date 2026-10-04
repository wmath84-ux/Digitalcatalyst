// src/joplin/joplinRichText.ts
//
// Legacy QuickNotes stored rich text as HTML (`QuickNote.html`, written by the
// old editor through `src/utils/richText.ts`) with a plain-text fallback
// (`QuickNote.text`). Joplin notes are Markdown, so the migration has to convert
// that HTML without dropping the learner's content (§69).
//
// This converter is deliberately DOM-free:
//
//   · it runs in the migration worker, in unit tests on plain node, and in the
//     Vercel function that finishes an interrupted migration — a `DOMParser`
//     would only exist in one of those three;
//   · it never executes or re-serialises untrusted markup, which is the same
//     reason the host renders note bodies through the Joplin renderer rather
//     than `dangerouslySetInnerHTML` (§66).
//
// Fidelity contract (documented for §69): headings → ATX headings, paragraphs →
// blank-line separated, `<br>` → hard line break, bold/italic/strikethrough →
// Markdown emphasis, links → `[text](href)`, images → `![alt](src)`, ordered and
// unordered lists → Markdown lists (nested by indentation), blockquotes →
// `>`, inline/fenced code → backticks/fences, `<hr>` → `---`. Tables are
// flattened to one bullet per cell value (Markdown tables are not part of the
// legacy editor's output, and a flattened row is recoverable where a dropped
// row is not). Any tag the converter does not know keeps its text.

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "hr",
  "figure",
  "figcaption",
]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  times: "×",
  deg: "°",
  rsquor: "’",
};

/** Decode the HTML entities the legacy editor could emit (plus numeric refs). */
export function decodeEntities(value: string): string {
  return String(value ?? "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const key = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match;
  });
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; tag: string; attrs: Record<string, string> }
  | { kind: "close"; tag: string };

const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\s*\/?>/g;

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[match[1].toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const source = String(html ?? "");
  let cursor = 0;
  TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(source)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "text", value: source.slice(cursor, match.index) });
    }
    const tag = match[1].toLowerCase();
    const selfClosing = /\/>$/.test(match[0]);
    const isClose = match[0][1] === "/";
    if (isClose) {
      tokens.push({ kind: "close", tag });
    } else {
      tokens.push({ kind: "open", tag, attrs: parseAttributes(match[2] ?? "") });
      if (selfClosing && !BLOCK_TAGS.has(tag)) tokens.push({ kind: "close", tag });
    }
    cursor = TAG_PATTERN.lastIndex;
  }
  if (cursor < source.length) tokens.push({ kind: "text", value: source.slice(cursor) });
  return tokens;
}

const escapeMarkdown = (value: string): string =>
  String(value ?? "").replace(/([\\`*_[\]])/g, "\\$1");

const trimInline = (value: string): string => value.replace(/[ \t\u00a0]+/g, " ").trim();

/**
 * Convert legacy note HTML to Joplin Markdown.
 *
 * `fallbackText` is used only when the HTML tokenises to nothing (an empty
 * `html` field, or markup made entirely of tags the converter strips) so a note
 * whose body exists only in the plain-text field is never migrated empty.
 */
export function legacyHtmlToMarkdown(html: string, fallbackText = ""): string {
  const source = String(html ?? "").trim();
  if (!source) return normalizeMarkdown(String(fallbackText ?? ""));

  const tokens = tokenize(source);
  const out: string[] = [];
  const openMarks = new Map<string, number>();
  const listStack: { ordered: boolean; count: number }[] = [];
  const inline: string[] = [];
  let inPre = 0;
  let preBuffer = "";
  let linkHref: string | null = null;
  let blockquoteDepth = 0;

  const flushInline = () => {
    if (!inline.length) return;
    const text = trimInline(inline.join(""));
    inline.length = 0;
    if (!text) return;
    const prefix = blockquoteDepth > 0 ? `${"> ".repeat(blockquoteDepth)}` : "";
    const list = listStack[listStack.length - 1];
    const indent = "  ".repeat(Math.max(0, listStack.length - 1));
    if (list) {
      const marker = list.ordered ? `${list.count + 1}. ` : "- ";
      list.count += 1;
      out.push(`${prefix}${indent}${marker}${text}`);
    } else {
      out.push(`${prefix}${text}`);
    }
  };

  const pushText = (raw: string) => {
    const decoded = decodeEntities(raw);
    if (inPre > 0) {
      preBuffer += decoded;
      return;
    }
    const normalized = decoded.replace(/\s*\n\s*/g, " ");
    if (normalized) inline.push(normalized);
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      pushText(token.value);
      continue;
    }

    const { tag } = token;
    if (token.kind === "open") {
      if (tag === "br") {
        flushInline();
        out.push("");
        continue;
      }
      if (tag === "hr") {
        flushInline();
        out.push("---");
        continue;
      }
      if (/^h[1-6]$/.test(tag)) {
        flushInline();
        openMarks.set(tag, inline.length);
        continue;
      }
      if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || BLOCK_TAGS.has(tag)) {
        if (tag === "ul" || tag === "ol") {
          flushInline();
          listStack.push({ ordered: tag === "ol", count: 0 });
          continue;
        }
        if (tag === "li") {
          flushInline();
          continue;
        }
        if (tag === "pre") {
          flushInline();
          inPre += 1;
          preBuffer = "";
          continue;
        }
        if (tag === "blockquote") {
          flushInline();
          blockquoteDepth += 1;
          continue;
        }
        if (tag === "tr") {
          flushInline();
          continue;
        }
        if (tag === "td" || tag === "th") {
          flushInline();
          continue;
        }
        if (BLOCK_TAGS.has(tag)) {
          flushInline();
          continue;
        }
      }
      if (tag === "strong" || tag === "b") {
        inline.push("**");
        continue;
      }
      if (tag === "em" || tag === "i") {
        inline.push("*");
        continue;
      }
      if (tag === "u") {
        inline.push("<u>");
        continue;
      }
      if (tag === "s" || tag === "strike" || tag === "del") {
        inline.push("~~");
        continue;
      }
      if (tag === "code") {
        inline.push("`");
        continue;
      }
      if (tag === "a") {
        linkHref = token.attrs.href ?? "";
        inline.push("[");
        continue;
      }
      if (tag === "img") {
        const alt = trimInline(decodeEntities(token.attrs.alt ?? ""));
        const src = token.attrs.src ?? "";
        if (src) out.push(`![${escapeMarkdown(alt)}](${src})`);
        continue;
      }
      if (tag === "span" || tag === "font" || tag === "small" || tag === "mark" || tag === "sup" || tag === "sub" || tag === "time" || tag === "label") {
        // Styling-only wrappers: the text is preserved, the decoration is not
        // representable in Markdown (documented in the migration report).
        continue;
      }
      continue;
    }

    // Closing tags.
    if (tag === "ul" || tag === "ol") {
      flushInline();
      listStack.pop();
      out.push("");
      continue;
    }
    if (tag === "li") {
      flushInline();
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      const text = trimInline(inline.join(""));
      inline.length = 0;
      out.push(`${"#".repeat(Number(tag[1]))} ${text}`.trim());
      out.push("");
      continue;
    }
    if (tag === "pre") {
      inPre = Math.max(0, inPre - 1);
      if (inPre === 0) {
        const code = preBuffer.replace(/\n+$/, "");
        if (code.trim()) out.push(`\`\`\`\n${code}\n\`\`\``);
        out.push("");
        preBuffer = "";
      }
      continue;
    }
    if (tag === "blockquote") {
      flushInline();
      blockquoteDepth = Math.max(0, blockquoteDepth - 1);
      out.push("");
      continue;
    }
    if (tag === "strong" || tag === "b") {
      inline.push("**");
      continue;
    }
    if (tag === "em" || tag === "i") {
      inline.push("*");
      continue;
    }
    if (tag === "u") {
      inline.push("</u>");
      continue;
    }
    if (tag === "s" || tag === "strike" || tag === "del") {
      inline.push("~~");
      continue;
    }
    if (tag === "code") {
      inline.push("`");
      continue;
    }
    if (tag === "a") {
      const href = linkHref ?? "";
      inline.push(href ? `](${href})` : "]");
      linkHref = null;
      continue;
    }
    if (tag === "td" || tag === "th") {
      flushInline();
      continue;
    }
    if (tag === "tr") {
      out.push("");
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      flushInline();
      out.push("");
      continue;
    }
  }

  flushInline();
  const markdown = normalizeMarkdown(out.join("\n"));
  if (markdown.trim()) return markdown;
  return normalizeMarkdown(String(fallbackText ?? ""));
}

/** Collapse runs of blank lines, trim trailing spaces, keep intentional breaks. */
export function normalizeMarkdown(value: string): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
