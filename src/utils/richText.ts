// src/utils/richText.ts
//
// Course Player notes — rich text helpers.
//
// Notes accept content pasted from anywhere (Google Docs, Notion, a
// website, an IDE, WhatsApp, …) and must keep the *exact* formatting the
// user copied: bold / italic / underline / strike, headings, lists,
// tables, links, inline code, code blocks, colours, highlights and emoji.
//
// Because that HTML comes from an arbitrary third-party page it is
// sanitised before it is ever stored or re-rendered: scripts, event
// handlers, iframes, forms and javascript: URLs are stripped while the
// presentational markup is preserved verbatim.

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "dd", "del", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd",
  "li", "mark", "ol", "p", "pre", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "var",
]);

const GLOBAL_ATTRS = new Set(["style", "align", "dir", "title"]);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  ol: new Set(["start", "type"]),
  li: new Set(["value"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  col: new Set(["span"]),
};

// Presentational CSS only — layout / positioning properties are dropped so a
// pasted fragment can never escape the notes panel.
const ALLOWED_STYLES = new Set([
  "background-color", "color", "font-family", "font-size", "font-style", "font-weight",
  "text-align", "text-decoration", "text-decoration-line", "text-transform", "white-space",
  "vertical-align", "line-height",
]);

const SAFE_URL = /^(https?:|mailto:|tel:)/i;
const SAFE_IMAGE_URL = /^(https?:|data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);)/i;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sanitizeStyle = (value: string) =>
  value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const property = declaration.split(":")[0]?.trim().toLowerCase();
      if (!property || !ALLOWED_STYLES.has(property)) return false;
      return !/expression\(|url\(|javascript:/i.test(declaration);
    })
    .join("; ");

const scrub = (node: Element) => {
  const tag = node.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap unknown-but-harmless wrappers (font, section, article, …) and
    // delete anything that can execute or load remote behaviour.
    const parent = node.parentNode;
    if (!parent) return;
    if (["script", "style", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "svg", "math", "video", "audio"].includes(tag)) {
      parent.removeChild(node);
      return;
    }
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
    return;
  }

  for (const attribute of Array.from(node.attributes)) {
    const name = attribute.name.toLowerCase();
    const allowed = GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name);
    if (!allowed || name.startsWith("on")) {
      node.removeAttribute(attribute.name);
      continue;
    }
    if (name === "style") {
      const style = sanitizeStyle(attribute.value);
      if (style) node.setAttribute("style", style);
      else node.removeAttribute("style");
      continue;
    }
    if (name === "href" && !SAFE_URL.test(attribute.value.trim())) node.removeAttribute("href");
    if (name === "src" && !SAFE_IMAGE_URL.test(attribute.value.trim())) node.removeAttribute("src");
  }

  if (tag === "a") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }

  for (const child of Array.from(node.children)) scrub(child);
};

/**
 * Sanitise pasted / authored HTML while keeping the exact visual formatting
 * (including emoji, which are plain text characters and always survive).
 */
export const sanitizeRichText = (html: string): string => {
  const input = String(html || "");
  if (!input.trim()) return "";
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return escapeHtml(input);
  }
  const parsed = new window.DOMParser().parseFromString(`<body>${input}</body>`, "text/html");
  const body = parsed.body;
  if (!body) return "";
  body.querySelectorAll("script, style, iframe, object, embed, form, link, meta, noscript").forEach((node) => node.remove());
  for (const child of Array.from(body.children)) scrub(child);
  return body.innerHTML.trim();
};

// Block-level tags become a space in the flattened preview, otherwise a
// heading followed by a paragraph would read as "TitleBody".
const BLOCK_TAGS = "p,div,br,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre,figcaption,dd,dt,hr,table,thead,tbody,td,th";

/** Plain-text projection used for the thin saved-note strip and for search. */
export const richTextToPlain = (html: string): string => {
  const input = String(html || "");
  if (!input) return "";
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const parsed = new window.DOMParser().parseFromString(`<body>${input}</body>`, "text/html");
  parsed.body.querySelectorAll(BLOCK_TAGS).forEach((node) => {
    // A trailing marker keeps words from different blocks apart once the
    // whole tree is flattened to `textContent`.
    node.append(parsed.createTextNode(" "));
  });
  return (parsed.body.textContent || "").replace(/\s+/g, " ").trim();
};

/** Plain text → HTML, preserving line breaks and runs of spaces. */
export const plainToRichText = (text: string): string => {
  const input = String(text || "");
  if (!input.trim()) return "";
  return escapeHtml(input)
    .split(/\r?\n/)
    .map((line) => `<div>${line.replace(/ {2,}/g, (run) => "&nbsp;".repeat(run.length)) || "<br>"}</div>`)
    .join("");
};

/** True when the HTML holds nothing but whitespace / empty wrappers. */
export const isEmptyRichText = (html: string): boolean => {
  const input = String(html || "");
  if (!input.trim()) return true;
  if (/<img\b/i.test(input)) return false;
  return richTextToPlain(input).replace(/\u200b/g, "").trim().length === 0;
};
