// src/course/readUrlImport.ts
//
// Read → "Add PDFs from a link" (Part 2 §5–§13).
//
// WHAT THIS IS
//   A learner (or an admin handing a learner a link) pastes one or more PDF
//   URLs. Each URL is fetched, its BYTES are checked to be a real PDF, and the
//   bytes are then handed to the EXISTING learner Read pipeline
//   (`useReadUploads.uploadPdfs`) as an ordinary `File`. From that moment a
//   URL-imported PDF is structurally identical to a locally uploaded one: same
//   Storage path, same `users/{uid}/readUploads/{id}` document, same owner, and
//   the same PDF.js annotation viewer. Nothing here writes to Firestore or
//   Storage directly, and no second upload/annotation/dedupe system exists.
//
// WHY A BROWSER-SIDE FETCH (and why the errors are honest about it)
//   The app's serverless routes (`api/*`) exist for first-party jobs — push,
//   billing, the AI readers, the GitHub embed proxy — and none of them may be
//   turned into an open relay for a URL a learner supplies. Admin Product
//   Customization only ever stores a LINK (`ModulesResourcesEditor.tsx` — a
//   Drive share link or a cleaned iframe embed); it never downloads bytes. So
//   there is no server-side mechanism to reuse, and inventing a public fetch
//   path or weakening Storage rules to get around CORS is explicitly out of
//   bounds. The browser fetch is therefore the only route, and it only works
//   when the host allows a cross-origin read. When it does not, we say exactly
//   that and point at the local upload — we never pretend it succeeded.
//
//   Google Drive is the one host we can rule out BEFORE fetching: Drive answers
//   its download URL with a redirect to *.googleusercontent.com that carries no
//   `Access-Control-Allow-Origin` header, so the browser blocks the request
//   every single time. That case gets its own message (`fetchPdfFromUrl`)
//   instead of a generic network error. Course-provided Drive PDFs are not
//   affected — the Read tab renders those in Drive's own viewer, see
//   `getReadResourcePresentation` in utils/readResources.js.

/** One pasted line, resolved to something fetchable. */
export interface ResolvedPdfUrl {
  /** The original text the learner typed (for error messages). */
  raw: string;
  /** The URL we will actually request. */
  url: string;
}

export interface PdfFetchFailure {
  raw: string;
  url: string | null;
  /** A short, learner-readable reason. */
  message: string;
  /** True when retrying the same URL could plausibly succeed. */
  retryable: boolean;
}

export interface FetchedPdf {
  raw: string;
  url: string;
  file: File;
  bytes: number;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Hard ceiling so a pasted link cannot pull an unbounded file into memory. */
const MAX_PDF_BYTES = 200 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 60_000;

/**
 * Trim one pasted line and pull a usable URL out of it.
 *
 * Accepts a bare URL, or a full `<iframe src="…">` embed — the admin editor
 * stores embeds, so a learner copy-pasting from there lands here with the tag
 * still around it. Anything that is not an http(s) URL is rejected rather than
 * guessed at.
 */
export function extractUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  // Pull the src out of an iframe/embed tag if that is what was pasted.
  const embed = text.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  const candidate = (embed?.[1] ?? text).trim();

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/**
 * Turn a share/embed link into the form that actually serves bytes.
 *
 * Google Drive is the common case: `/file/d/{id}/view` and
 * `open?id={id}` render an HTML preview page, not a PDF, so we rewrite both to
 * the direct-download endpoint. Anything else is passed through untouched — we
 * never invent a transformation we cannot verify.
 */
export function toDirectDownloadUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.hostname === "drive.google.com" || parsed.hostname === "www.drive.google.com") {
    const fromPath = parsed.pathname.match(/^\/file\/d\/([^/]+)\//);
    const fromQuery = parsed.searchParams.get("id");
    const id = fromPath?.[1] ?? fromQuery;
    if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }

  // docs.google.com/viewer?url=<encoded pdf> → the inner document.
  if (parsed.hostname.endsWith("docs.google.com") && parsed.pathname.startsWith("/viewer")) {
    const inner = parsed.searchParams.get("url");
    if (inner) {
      const resolved = extractUrl(inner);
      if (resolved) return toDirectDownloadUrl(resolved);
    }
  }

  return parsed.toString();
}

/** Split a pasted block into unique URLs, preserving the learner's order. */
export function parseUrlList(input: string): ResolvedPdfUrl[] {
  const seen = new Set<string>();
  const out: ResolvedPdfUrl[] = [];

  for (const line of input.split(/[\n,]+/)) {
    const raw = line.trim();
    if (!raw) continue;
    const extracted = extractUrl(raw);
    if (!extracted) continue;
    const url = toDirectDownloadUrl(extracted);
    // Dedupe on the resolved URL so the same document pasted twice (once as a
    // share link, once as an embed) is only fetched and stored once.
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ raw, url });
  }

  return out;
}

/**
 * Is this really a PDF?
 *
 * Checked on the BYTES, not the extension and not `Content-Type` — a preview
 * page served as `application/pdf`, or a `.pdf` URL that redirects to a login
 * screen, both arrive here looking plausible. The magic header may sit a few
 * bytes in on some generators, so we scan the first kilobyte.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const window = bytes.subarray(0, Math.min(bytes.length, 1024));
  for (let i = 0; i + PDF_MAGIC.length <= window.length; i++) {
    let hit = true;
    for (let j = 0; j < PDF_MAGIC.length; j++) {
      if (window[i + j] !== PDF_MAGIC[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** `attachment; filename="x.pdf"` / `filename*=UTF-8''x.pdf` → `x.pdf`. */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain?.[1]?.trim() || null;
}

/**
 * Keep a filename filesystem- and Storage-safe without emptying it.
 *
 * The name comes off the network, and it ends up inside a Storage object path,
 * so path separators are folded to dashes and any `..` run is collapsed — a
 * pasted link can never steer the write outside the learner's own prefix.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    // never let the object name open with a dot or a dash
    .replace(/^[.\-\s]+/, "");
  const bare = cleaned.replace(/\.pdf$/i, "");
  // A name that was nothing but punctuation must still produce a usable file.
  return `${bare || "document"}.pdf`;
}

/**
 * Filename priority (§11): Content-Disposition → URL pathname → fallback.
 * The page `<title>` is deliberately NOT used — it needs a second parse of an
 * HTML body we have already decided is not a PDF.
 */
export function pickFilename(response: Response, url: string): string {
  const fromHeader = filenameFromContentDisposition(response.headers.get("content-disposition"));
  if (fromHeader) return sanitizeFilename(fromHeader);

  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last) {
      const decoded = decodeURIComponent(last);
      if (decoded && decoded !== "/") return sanitizeFilename(decoded);
    }
  } catch {
    /* fall through */
  }

  return "document.pdf";
}

export interface FetchPdfResult {
  ok: true;
  pdf: FetchedPdf;
}
export interface FetchPdfError {
  ok: false;
  error: PdfFetchFailure;
}

/**
 * Every host a Drive file link can point at: the share host, the download
 * endpoint and the `usercontent` host Google redirects to.
 */
const DRIVE_HOST = /^([a-z0-9-]+\.)*drive(\.usercontent)?\.google\.com$/i;

/** True when this URL is a Google Drive file/download link. */
export function isGoogleDriveUrl(value: string): boolean {
  try {
    return DRIVE_HOST.test(new URL(String(value || "").trim()).hostname);
  } catch {
    return false;
  }
}

/**
 * Fetch one URL and prove the result is a PDF.
 *
 * Every failure comes back as a specific, retryable-or-not reason. A CORS
 * refusal and an unreachable host both surface as an opaque network error to
 * `fetch`, so the message says what the learner can actually do about it
 * instead of blaming them for a server header.
 */
export async function fetchPdfFromUrl(
  target: ResolvedPdfUrl,
  signal?: AbortSignal,
): Promise<FetchPdfResult | FetchPdfError> {
  // Drive blocks every browser-side read of its files (the download redirect
  // to *.googleusercontent.com has no CORS header), so this request can only
  // ever fail. Say what the learner can actually do instead of spending 60s
  // and then blaming their connection.
  if (isGoogleDriveUrl(target.url)) {
    return {
      ok: false,
      error: {
        raw: target.raw,
        url: target.url,
        message:
          "Google Drive cannot be read through a link — Drive blocks browser downloads. Download the file and use Upload PDF instead, or open it from your course's Read tab when the course provides it.",
        retryable: false,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // A caller-initiated abort must win over our own timeout.
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(target.url, {
        method: "GET",
        redirect: "follow",
        credentials: "omit",
        signal: controller.signal,
      });
    } catch {
      return {
        ok: false,
        error: {
          raw: target.raw,
          url: target.url,
          message:
            "Could not reach that link. The host may block cross-origin downloads (CORS) or the link may need a sign-in — download the file and use Upload PDF instead.",
          retryable: true,
        },
      };
    }

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      return {
        ok: false,
        error: {
          raw: target.raw,
          url: target.url,
          message:
            response.status === 401 || response.status === 403
              ? "That link is private — it needs a sign-in the app cannot perform. Make the file publicly readable, or download it and use Upload PDF."
              : `The server answered ${response.status} for that link.`,
          retryable,
        },
      };
    }

    const advertised = Number(response.headers.get("content-length") || 0);
    if (advertised > MAX_PDF_BYTES) {
      return {
        ok: false,
        error: {
          raw: target.raw,
          url: target.url,
          message: "That file is larger than 200 MB, which is too big to import from a link.",
          retryable: false,
        },
      };
    }

    const blob = await response.blob();
    if (blob.size > MAX_PDF_BYTES) {
      return {
        ok: false,
        error: {
          raw: target.raw,
          url: target.url,
          message: "That file is larger than 200 MB, which is too big to import from a link.",
          retryable: false,
        },
      };
    }
    if (blob.size === 0) {
      return {
        ok: false,
        error: { raw: target.raw, url: target.url, message: "That link returned an empty file.", retryable: true },
      };
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      return {
        ok: false,
        error: {
          raw: target.raw,
          url: target.url,
          message:
            "That link does not serve a PDF — it returned a web page or another file type. Open it in a browser and copy the direct file link, or download it and use Upload PDF.",
          retryable: false,
        },
      };
    }

    const name = pickFilename(response, target.url);
    return {
      ok: true,
      pdf: {
        raw: target.raw,
        url: target.url,
        // `application/pdf` keeps every downstream check (and the Storage
        // contentType) consistent with a locally chosen PDF.
        file: new File([bytes], name, { type: "application/pdf" }),
        bytes: bytes.byteLength,
      },
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
