// utils/excalidrawLibraryLink.js
//
// The "Add to Excalidraw" RETURN LINK — the piece that lets a learner install
// a library from libraries.excalidraw.com straight into the Course Player's
// Sketch tab.
//
// How the flow works outside this app: Excalidraw's own library panel offers
// "Browse libraries", which opens the public library site with a `referrer`
// (our app's URL) and `useHash=true`. When the learner presses "Add to
// Excalidraw" there, the site sends the browser back to
// `<referrer>#addLibrary=<library url>&token=<editor id>`. The editor's own
// `useHandleLibrary` hook understands exactly that hash — but this app routes
// with `#/…` hashes, so an incoming `#addLibrary=…` would reach the router as
// an unknown route and take the learner off the Course Player.
//
// This module runs FIRST (main.tsx, module scope, before React renders):
//
//   1. it recognises the returned link in both shapes the editor accepts —
//      `#addLibrary=` (current) and `?addLibrary=` (legacy);
//   2. it parks the link in sessionStorage;
//   3. it rewrites the URL back to the route the learner was on (the route
//      history stack the app already keeps for its Back buttons), WITHOUT the
//      link, so the router never sees it;
//   4. the Sketch panel later consumes the parked link: it fetches the
//      library, installs it through `excalidrawAPI.updateLibrary()` and the
//      learner's own adapter persists it — so it is still there tomorrow.
//
// Deliberately dependency-free (no React, no Firebase, no DOM globals): both
// parsing and the URL rewrite take their inputs as arguments, so
// tests/excalidrawLibraryLink.test.mjs can drive every branch in Node.

/** sessionStorage key the parked link lives under. */
export const EXCALIDRAW_LIBRARY_LINK_KEY = "eduvora.excalidrawLibraryLink.v1";

/**
 * Where a library may be fetched from — mirrors the editor's own
 * ALLOWED_LIBRARY_URLS (excalidraw.com and the Excalidraw libraries repo on
 * raw.githubusercontent.com). An arbitrary URL from a link is never fetched.
 */
export const EXCALIDRAW_LIBRARY_ALLOWED_HOSTS = [
  { host: "excalidraw.com", path: "/" },
  { host: "raw.githubusercontent.com", path: "/excalidraw/excalidraw-libraries" },
];

const text = (value) => String(value == null ? "" : value).trim();

/** A library link is only accepted from the hosts the editor itself trusts. */
export const isAllowedExcalidrawLibraryUrl = (value) => {
  const raw = text(value);
  if (!raw) return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname || "/";
  return EXCALIDRAW_LIBRARY_ALLOWED_HOSTS.some(({ host: allowedHost, path: allowedPath }) => {
    const hostMatches = host === allowedHost || host.endsWith(`.${allowedHost}`);
    if (!hostMatches) return false;
    const base = allowedPath.replace(/\/+$/, "");
    if (!base) return true;
    return path === base || path.startsWith(`${base}/`);
  });
};

/**
 * Read the returned link out of a `search` / `hash` pair. The hash shape wins
 * (that is the modern one); the query shape is the legacy fallback the editor
 * still honours. Returns `null` when this URL carries no link at all.
 */
export const parseExcalidrawLibraryLink = (search, hash) => {
  const rawHash = text(hash);
  // Two windows are tried: the whole hash body (the normal shape) and, when
  // the return URL happened to carry a route hash of our own
  // (`#/course/… #addLibrary=…`), the last `#`-delimited segment. A plain
  // parse of the first window would swallow the whole thing as one key.
  const hashWindows = [rawHash.replace(/^#/, "")];
  const lastHash = rawHash.lastIndexOf("#");
  if (lastHash > 0) hashWindows.push(rawHash.slice(lastHash + 1));
  const searchParams = new URLSearchParams(text(search).replace(/^\?/, ""));

  let libraryUrl = "";
  let idToken = null;
  for (const window_ of hashWindows) {
    const params = new URLSearchParams(window_);
    libraryUrl = libraryUrl || text(params.get("addLibrary"));
    idToken = idToken || text(params.get("token")) || null;
  }
  libraryUrl = libraryUrl || text(searchParams.get("addLibrary"));
  idToken = idToken || text(searchParams.get("token")) || null;
  if (!libraryUrl) return null;
  return { libraryUrl, idToken, capturedAt: 0 };
};

/** Park a link for the Sketch panel (a small JSON record, never the blob). */
export const storeExcalidrawLibraryLink = (storage, link) => {
  if (!storage || !link || !isAllowedExcalidrawLibraryUrl(link.libraryUrl)) return false;
  try {
    storage.setItem(
      EXCALIDRAW_LIBRARY_LINK_KEY,
      JSON.stringify({ libraryUrl: link.libraryUrl, idToken: link.idToken || null, capturedAt: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
};

/** The parked link, or `null` — a corrupt record is simply ignored. */
export const readStoredExcalidrawLibraryLink = (storage) => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(EXCALIDRAW_LIBRARY_LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!isAllowedExcalidrawLibraryUrl(parsed.libraryUrl)) return null;
    return {
      libraryUrl: text(parsed.libraryUrl),
      idToken: parsed.idToken ? text(parsed.idToken) : null,
      capturedAt: Number(parsed.capturedAt) || 0,
    };
  } catch {
    return null;
  }
};

export const clearStoredExcalidrawLibraryLink = (storage) => {
  try {
    storage?.removeItem(EXCALIDRAW_LIBRARY_LINK_KEY);
  } catch {
    /* private mode — nothing to clear */
  }
};

/** The last app route the learner actually rendered (`#/…`), when known. */
export const lastRecordedRoute = (storage, routeHistoryKey) => {
  if (!storage || !routeHistoryKey) return "";
  try {
    const raw = storage.getItem(routeHistoryKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return "";
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
      const route = parsed[index];
      if (typeof route === "string" && route.startsWith("#/") && !route.startsWith("#/auth")) return route;
    }
  } catch {
    /* fall through to the caller's fallback */
  }
  return "";
};

/**
 * The boot-time interception, fully injectable so it is testable without a
 * browser:
 *
 *   captureExcalidrawLibraryReturn({ pathname, search, hash, storage, replace, fallbackRoute })
 *     → { libraryUrl, idToken, capturedAt, nextUrl } | null
 *
 * `replace(url)` performs the rewrite (main.tsx passes a `history.replaceState`
 * wrapper). When the link is not one we would accept, the URL is STILL cleaned
 * and the route restored — a bad link must never strand the learner on a
 * blank route — but nothing is parked and the return value is `null`.
 */
export const captureExcalidrawLibraryReturn = ({
  pathname = "/",
  search = "",
  hash = "",
  storage = null,
  replace = null,
  fallbackRoute = "#/",
  routeHistoryKey = "",
} = {}) => {
  const link = parseExcalidrawLibraryLink(search, hash);
  if (!link) return null;

  const nextSearch = new URLSearchParams(text(search).replace(/^\?/, ""));
  nextSearch.delete("addLibrary");
  nextSearch.delete("token");
  const query = nextSearch.toString();

  // Where the learner goes next, in order of trust: the route the return URL
  // itself carried (`?addLibrary=…#/course/x`), else the last route the app
  // recorded, else the caller's fallback.
  const routerHash = text(hash).split("addLibrary=")[0].replace(/#$/, "");
  const routeFromHash = routerHash.startsWith("#/") ? routerHash : "";
  const route = routeFromHash || lastRecordedRoute(storage, routeHistoryKey) || text(fallbackRoute) || "#/";
  const nextUrl = `${pathname}${query ? `?${query}` : ""}${route}`;
  try {
    replace?.(nextUrl);
  } catch {
    /* the caller may pass a no-op replace in tests */
  }

  if (!isAllowedExcalidrawLibraryUrl(link.libraryUrl)) return null;
  const record = { libraryUrl: link.libraryUrl, idToken: link.idToken, capturedAt: Date.now() };
  storeExcalidrawLibraryLink(storage, record);
  return { ...record, nextUrl };
};
