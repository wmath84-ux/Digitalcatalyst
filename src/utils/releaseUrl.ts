// src/utils/releaseUrl.ts
//
// The one place that decides whether a URL an admin pasted into a Branding
// field is usable, and the one place that explains the two classic mistakes:
//
//   1. the GitHub RELEASE PAGE (`…/releases/tag/<tag>`) instead of the asset
//      (`…/releases/download/<tag>/<file>`) — that URL is valid https and
//      returns HTML, so a <video>/<img> silently fails;
//   2. `http://` (or a bare path) instead of `https://`, which the app cannot
//      load at all (the WebView refuses mixed content, and the PWA is https).
//
// Pure and dependency-free so the admin field, the branding normaliser and the
// tests all share it.

export type ReleaseUrlKind = "image" | "video" | "any";

export type ReleaseUrlCheck = {
  /** `false` only for a URL that cannot work at all — the field still saves. */
  ok: boolean;
  warning: string | null;
  status: "empty" | "ok" | "insecure" | "release-page" | "missing-extension";
};

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|svg)(\?|#|$)/i;

export function classifyReleaseUrl(value: string, kind: ReleaseUrlKind = "any"): ReleaseUrlCheck {
  const text = (value || "").trim();
  if (!text) return { ok: true, warning: null, status: "empty" };

  if (!/^https:\/\//i.test(text)) {
    return {
      ok: false,
      warning:
        "Use a full https:// link. The app cannot load http:// (mixed content) or a relative path.",
      status: "insecure",
    };
  }

  if (
    /^https?:\/\/(www\.)?github\.com\//i.test(text) &&
    /\/(releases\/tag|releases\/latest|releases\/?$)/i.test(text)
  ) {
    return {
      ok: false,
      warning:
        "That is the release PAGE, not the file. Open the release, right-click the asset and “Copy link address” — it looks like …/releases/download/<tag>/<file>.",
      status: "release-page",
    };
  }

  // A release asset (or any CDN file) with no recognisable extension: allowed
  // (Cloudinary and friends serve extension-less media URLs), but worth saying,
  // because a wrong file type only shows up as a black player.
  const hasExtension = kind === "video" ? VIDEO_EXTENSIONS.test(text) : kind === "image" ? IMAGE_EXTENSIONS.test(text) : true;
  if (!hasExtension && !/github\.com\/.*\/releases\/download\//i.test(text)) {
    return {
      ok: true,
      warning: `This URL has no ${kind === "video" ? "video" : "image"} file extension — if it is a page link, the app will not be able to load it.`,
      status: "missing-extension",
    };
  }

  return { ok: true, warning: null, status: "ok" };
}
