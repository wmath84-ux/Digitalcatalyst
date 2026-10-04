// extensions/joplin-clipper/content.js
//
// Runs IN the page, only when the user asked to clip. It returns a plain object:
// title, canonical-ish URL, the readable HTML, the selection and a text
// fallback. It never phones home, never writes to the page and never touches the
// clipboard — the clip is handed straight back to the service worker.

(() => {
  const MAX_HTML = 1_500_000;
  const MAX_TEXT = 400_000;

  const textOf = (node) => String(node?.innerText || node?.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

  /** Prefer the article, fall back to main, then the body — never the whole chrome. */
  const contentRoot = () => {
    const candidates = [
      "article",
      "main",
      "[role=main]",
      ".post-content",
      ".article-content",
      ".entry-content",
      "#content",
    ];
    for (const selector of candidates) {
      const node = document.querySelector(selector);
      if (node && textOf(node).length > 400) return node;
    }
    return document.body;
  };

  /** Strip the parts of a captured fragment that make a note unreadable. */
  const cleanHtml = (node) => {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll("script, style, noscript, iframe, svg, form, button, nav, aside, [aria-hidden='true'], .advert, .ad, .ads")
      .forEach((element) => element.remove());
    clone.querySelectorAll("[style]").forEach((element) => element.removeAttribute("style"));
    clone.querySelectorAll("[class]").forEach((element) => element.removeAttribute("class"));
    return String(clone.innerHTML || "").slice(0, MAX_HTML);
  };

  const tags = [];
  const keywords = document.querySelector("meta[name=keywords]")?.getAttribute("content");
  if (keywords) {
    for (const keyword of keywords.split(",")) {
      const value = keyword.trim().slice(0, 60);
      if (value && tags.length < 8) tags.push(value);
    }
  }
  const siteName = document.querySelector("meta[property='og:site_name']")?.getAttribute("content");
  if (siteName && tags.length < 8) tags.push(siteName.trim().slice(0, 60));

  const selection = String(window.getSelection?.()?.toString?.() || "").trim().slice(0, MAX_TEXT);
  const root = contentRoot();
  return {
    url: location.href,
    title: String(document.title || location.hostname).slice(0, 500),
    html: cleanHtml(root),
    selection,
    text: textOf(root).slice(0, MAX_TEXT),
    tags,
  };
})();
