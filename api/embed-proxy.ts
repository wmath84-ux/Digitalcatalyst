// api/embed-proxy.ts
//
// Serverless proxy for course-player embeds whose hosts refuse to render
// inside an iframe. github.com (and gist.github.com) send
// `Content-Security-Policy: frame-ancestors 'none'` and
// `X-Frame-Options: deny`, so a direct iframe shows nothing but a blank
// white surface after the loading state clears.
//
// The proxy fetches the page SERVER-side, strips the frame-blocking
// headers, and rewrites the page's own subresource links (href/src/srcset/
// poster/action) so relative and same-GitHub assets keep flowing through
// the proxy. Everything else (CDN-hosted scripts, styles, images) loads
// directly — those hosts allow framing.
//
// Bonus for the admin's most common URL: a
// `github.com/<owner>/<repo>/blob/<ref>/<file>` viewer link is transparently
// served from raw.githubusercontent.com so the actual HTML page renders
// interactively instead of GitHub's file-viewer UI (falls back to the
// viewer page when the raw file 404s, e.g. private repos).
//
// Safety rails: HTTPS + host allowlist only (GitHub hosts — this is never
// an open relay), a size cap, a fetch timeout, and a same-site guard
// (browsers sending `Sec-Fetch-Site: cross-site` are refused).

/** Hosts the proxy will ever fetch. github.io subdomains are GitHub Pages. */
const ALLOWED_HOST = /^([a-z0-9-]+\.)*(github\.com|github\.io|raw\.githubusercontent\.com|gist\.githubusercontent\.com)$/i;

const BLOB_PATH = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;
const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

type EmbedProxyRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type EmbedProxyResponse = {
  status(code: number): EmbedProxyResponse;
  setHeader(name: string, value: string): EmbedProxyResponse;
  end(body?: string | Buffer): void;
  json(data: unknown): void;
};

export interface EmbedProxyDeps {
  fetchImpl?: typeof fetch;
}

const firstHeader = (headers: EmbedProxyRequest["headers"] | undefined, name: string): string => {
  const value = headers?.[name];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
};

const safeTarget = (rawUrl: string): URL | null => {
  try {
    const url = new URL(String(rawUrl || "").trim());
    if (url.protocol !== "https:") return null;
    if (!ALLOWED_HOST.test(url.hostname)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
};

/** github.com/blob → raw.githubusercontent.com so real HTML can render. */
const blobViewerToRaw = (url: URL): URL | null => {
  const match = url.pathname.match(BLOB_PATH);
  if (!match) return null;
  const raw = new URL("https://raw.githubusercontent.com");
  raw.pathname = `/${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
  raw.search = url.search;
  return raw;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const errorPage = (title: string, message: string, originalUrl: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#090912; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; text-align:center; padding:32px; }
  .card { max-width:340px; }
  h1 { font-size:20px; font-weight:800; margin:0 0 8px; }
  p { color:#94a3b8; font-size:13px; line-height:1.6; margin:0 0 20px; }
  a { display:inline-block; background:linear-gradient(90deg,#7c3aed,#8b5cf6); color:#fff; text-decoration:none; font-weight:700; font-size:12px; padding:10px 18px; border-radius:12px; }
</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
<a href="${escapeHtml(originalUrl)}" target="_blank" rel="noopener noreferrer">Open the original page ↗</a></div></body></html>`;

/** Resolve one attribute value against the fetched page and re-route
 * relative / same-GitHub URLs through the proxy. The proxy URL is RELATIVE
 * (`/api/embed-proxy?…`): the iframe document lives on the app's own origin,
 * so relative links resolve back to that same origin on any deployment. */
const rewriteUrl = (value: string, baseUrl: string): string => {
  const trimmed = value.trim();
  if (!trimmed || /^(?:#|javascript:|data:|mailto:|tel:|blob:)/i.test(trimmed)) return value;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (ALLOWED_HOST.test(resolved.hostname)) {
      return `/api/embed-proxy?url=${encodeURIComponent(resolved.toString())}`;
    }
    return resolved.toString();
  } catch {
    return value;
  }
};

const REWRITE_ATTR = /(\b(?:href|src|poster|action)\s*=\s*)(["'])(.*?)\2/gi;
const SRCSET_ATTR = /(\bsrcset\s*=\s*)(["'])(.*?)\2/gi;

const rewriteSrcset = (value: string, baseUrl: string): string => {
  return value
    .split(",")
    .map((part) => {
      const [urlPart, ...descriptor] = part.trim().split(/\s+/);
      if (!urlPart) return part;
      return [rewriteUrl(urlPart, baseUrl), ...descriptor].join(" ");
    })
    .join(", ");
};

const rewriteHtml = (html: string, baseUrl: string): string => {
  // A <base> element would hijack the rewritten relative URLs — drop it.
  return html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(REWRITE_ATTR, (_whole, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteUrl(value, baseUrl)}${quote}`)
    .replace(SRCSET_ATTR, (_whole, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteSrcset(value, baseUrl)}${quote}`);
};

export default async function handler(
  req: EmbedProxyRequest,
  res: EmbedProxyResponse,
  deps: EmbedProxyDeps = {},
): Promise<void> {
  if (req.method && req.method !== "GET") {
    return res.status(405).json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });
  }

  const secFetchSite = firstHeader(req.headers, "sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return res.status(403).json({ ok: false, code: "cross_site_refused", error: "Embeds must be requested from the app itself." });
  }

  const rawQuery = req.query?.url;
  const rawUrl = Array.isArray(rawQuery) ? String(rawQuery[0] || "") : String(rawQuery || "");
  const target = safeTarget(rawUrl);
  if (!target) {
    return res.status(400).json({ ok: false, code: "invalid_url", error: "Only https GitHub page URLs can be proxied." });
  }

  const fetchImpl = deps.fetchImpl || fetch;
  const wantsHtml = /text\/html/i.test(firstHeader(req.headers, "accept"));

  // A blob viewer URL becomes the raw file first; if that 404s (private
  // repo / LFS / large file) we fall back to the viewer page itself.
  const rawCandidate = blobViewerToRaw(target);
  const candidates = rawCandidate ? [rawCandidate, target] : [target];

  let upstream: Response | null = null;
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(candidate.toString(), {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": "EduvoraCourseEmbed/1.0 (+https://github.com/wmath84-ux/Digitalcatalyst)",
        },
      });
      if (response.ok) {
        upstream = response;
        break;
      }
    } catch (error) {
      // Timeout / network failure — try the next candidate before giving up.
      console.error("[embed-proxy] fetch failed", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!upstream) {
    if (wantsHtml) {
      return res.status(502).setHeader("content-type", "text/html; charset=utf-8").setHeader("cache-control", "no-store").end(errorPage(
        "This page could not be loaded",
        "The GitHub page is unavailable right now (private repository, moved, or temporarily down).",
        target.toString(),
      ));
    }
    return res.status(502).json({ ok: false, code: "upstream_failed", error: "The GitHub page could not be fetched." });
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return res.status(413).json({ ok: false, code: "too_large", error: "The page exceeds the 10 MB embed limit." });
  }

  const upstreamType = String(upstream.headers.get("content-type") || "application/octet-stream");
  const finalUrl = upstream.url || target.toString();
  const looksHtml = /\.(?:html?|xhtml)(?:[?#]|$)/i.test(finalUrl);
  const isHtml = /text\/html/i.test(upstreamType) || (/text\/plain/i.test(upstreamType) && looksHtml);

  if (isHtml) {
    let html = bytes.toString("utf8");
    html = rewriteHtml(html, finalUrl);
    return res
      .status(200)
      .setHeader("content-type", "text/html; charset=utf-8")
      .setHeader("cache-control", CACHE_CONTROL)
      .setHeader("x-embed-proxy", "1")
      .end(html);
  }

  return res
    .status(200)
    .setHeader("content-type", upstreamType)
    .setHeader("cache-control", CACHE_CONTROL)
    .setHeader("x-embed-proxy", "1")
    .end(bytes);
}
