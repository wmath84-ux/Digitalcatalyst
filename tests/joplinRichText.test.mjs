// tests/joplinRichText.test.mjs
//
// §69 — the legacy QuickNotes editor stored HTML. The migration must preserve
// headings, paragraphs, line breaks, basic formatting and links; anything it
// cannot represent has to be a documented narrowing, never a silent drop.
//
// Run: node --test tests/joplinRichText.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { legacyHtmlToMarkdown, decodeEntities, normalizeMarkdown } from "../src/joplin/joplinRichText.ts";

test("headings become ATX headings at every level the editor could emit", () => {
  const html = "<h1>Chapter 1</h1><h2>Motion</h2><h3>Velocity</h3>";
  const markdown = legacyHtmlToMarkdown(html);
  assert.match(markdown, /^# Chapter 1$/m);
  assert.match(markdown, /^## Motion$/m);
  assert.match(markdown, /^### Velocity$/m);
});

test("paragraphs stay separate and <br> becomes a line break", () => {
  const markdown = legacyHtmlToMarkdown("<p>First paragraph</p><p>line one<br>line two</p>");
  assert.match(markdown, /First paragraph/);
  assert.match(markdown, /line one/);
  assert.match(markdown, /line two/);
  // Two paragraphs must not be glued into one line.
  assert.notEqual(markdown.split("\n\n").length, 1);
});

test("bold, italic, underline and strikethrough keep their emphasis", () => {
  const markdown = legacyHtmlToMarkdown("<p><strong>bold</strong> <em>italic</em> <u>under</u> <s>gone</s></p>");
  assert.match(markdown, /\*\*bold\*\*/);
  assert.match(markdown, /\*italic\*/);
  assert.match(markdown, /<u>under<\/u>/);
  assert.match(markdown, /~~gone~~/);
});

test("links keep their href (the one formatting feature that must never be dropped)", () => {
  const markdown = legacyHtmlToMarkdown('<p>See <a href="https://example.com/x?a=1&amp;b=2">the notes</a></p>');
  assert.match(markdown, /\[the notes\]\(https:\/\/example\.com\/x\?a=1&b=2\)/);
});

test("ordered and unordered lists become Markdown lists with correct numbering", () => {
  const unordered = legacyHtmlToMarkdown("<ul><li>alpha</li><li>beta</li></ul>");
  assert.match(unordered, /^- alpha$/m);
  assert.match(unordered, /^- beta$/m);

  const ordered = legacyHtmlToMarkdown("<ol><li>first</li><li>second</li><li>third</li></ol>");
  assert.match(ordered, /^1\. first$/m);
  assert.match(ordered, /^2\. second$/m);
  assert.match(ordered, /^3\. third$/m);
});

test("blockquotes, rules and code survive", () => {
  assert.match(legacyHtmlToMarkdown("<blockquote>quoted</blockquote>"), /^> quoted$/m);
  assert.match(legacyHtmlToMarkdown("<p>a</p><hr><p>b</p>"), /^---$/m);
  assert.match(legacyHtmlToMarkdown("<pre>const a = 1;\nconst b = 2;</pre>"), /```\nconst a = 1;\nconst b = 2;\n```/);
});

test("images become Markdown images and unknown tags keep their text", () => {
  assert.match(legacyHtmlToMarkdown('<img src="https://cdn/x.png" alt="diagram">'), /!\[diagram\]\(https:\/\/cdn\/x\.png\)/);
  // <mark> is a styling-only wrapper: the text must survive even though the
  // highlight cannot.
  assert.match(legacyHtmlToMarkdown("<p><mark>important</mark></p>"), /important/);
});

test("entities are decoded, including numeric references", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt; &#8377;100 &#x2713;"), "a & b <c> ₹100 ✓");
  assert.match(legacyHtmlToMarkdown("<p>5 &times; 3</p>"), /5 × 3/);
});

test("empty HTML falls back to the plain-text field instead of migrating an empty note", () => {
  assert.equal(legacyHtmlToMarkdown("", "plain body text"), "plain body text");
  assert.equal(legacyHtmlToMarkdown("<div></div>", "plain body text"), "plain body text");
  assert.equal(legacyHtmlToMarkdown("<p>   </p>", "plain body text"), "plain body text");
});

test("markdown escapes markdown-significant characters that came from the legacy text", () => {
  const markdown = legacyHtmlToMarkdown("<p>2 * 3 = 6_k</p>");
  assert.match(markdown, /2 \* 3/);
});

test("normalizeMarkdown collapses blank runs but keeps intentional breaks", () => {
  assert.equal(normalizeMarkdown("a\n\n\n\nb"), "a\n\nb");
  assert.equal(normalizeMarkdown("  spaced   \nnext  "), "spaced\nnext");
});
