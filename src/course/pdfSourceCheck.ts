// src/course/pdfSourceCheck.ts
//
// Read → PDF.js viewer: check a PDF source BEFORE the viewer is handed the URL.
//
// Why: when PDF.js fails inside its frame the learner sees a generic
// "Invalid PDF" or an empty page. This check reads only the first chunk of the
// response (and cancels the rest) so every common failure gets its own,
// honest, recoverable message:
//   · the browser refused the read  → CORS or network (the host may not allow
//     cross-site reads — the learner can still open the original link);
//   · 401/403 / 404 / 410 / 5xx     → access, expired/missing or server problems;
//   · an HTML page instead of a PDF → "this link opens a web page, not a PDF";
//   · bytes without a `%PDF-` header → "not a valid PDF file".
//
// No Range header is sent on purpose: a Range request is not a CORS-simple
// request and would force a preflight that some hosts (raw GitHub included)
// answer differently. The body is streamed and cancelled after 1 KiB.

export type PdfSourceProblemKind =
  | "network"
  | "forbidden"
  | "not_found"
  | "server"
  | "not_pdf"
  | "empty"
  | "timeout";

export type PdfSourceCheck =
  | { ok: true }
  | { ok: false; kind: PdfSourceProblemKind; message: string; retryable: boolean };

export interface PdfSourceCheckOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const HEAD_BYTES = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const PDF_MAGIC = "%PDF-";

const fail = (
  kind: PdfSourceProblemKind,
  message: string,
  retryable: boolean,
): PdfSourceCheck => ({ ok: false, kind, message, retryable });

/** True when the first bytes carry the PDF header (the spec allows junk before it, within 1 KiB). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, HEAD_BYTES);
  for (let i = 0; i + PDF_MAGIC.length <= limit; i += 1) {
    let match = true;
    for (let j = 0; j < PDF_MAGIC.length; j += 1) {
      if (bytes[i + j] !== PDF_MAGIC.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

async function readHead(response: Response): Promise<Uint8Array> {
  const body = response.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < HEAD_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Stop the download here: the viewer streams the rest on its own.
    await reader.cancel().catch(() => undefined);
  }
  const head = new Uint8Array(Math.min(total, HEAD_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, head.length - offset);
    head.set(slice, offset);
    offset += slice.length;
    if (offset >= head.length) break;
  }
  return head;
}

/**
 * Check that `url` answers with a readable PDF. Resolves; never throws.
 * Callers show the returned message and offer Retry / Open original link.
 */
export async function checkPdfSource(url: string, options: PdfSourceCheckOptions = {}): Promise<PdfSourceCheck> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onOuterAbort);

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        credentials: "omit",
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (cause) {
      if (timedOut) {
        return fail("timeout", "The PDF did not answer in time. Check your connection and press Retry.", true);
      }
      if (options.signal?.aborted) {
        return fail("network", "Loading was cancelled.", true);
      }
      // A TypeError from fetch is how the browser reports a CORS refusal and a
      // dropped connection alike; the two cannot be told apart from script.
      void cause;
      return fail(
        "network",
        "The browser could not read this PDF. The host may not allow reads from this site (CORS), or the connection failed. Press Retry, or open the original link.",
        true,
      );
    }

    if (response.status === 401 || response.status === 403) {
      return fail(
        "forbidden",
        `The PDF link refused access (HTTP ${response.status}). It may need sign-in or permission — ask the owner to make the file public, or open the original link.`,
        false,
      );
    }
    if (response.status === 404 || response.status === 410) {
      return fail(
        "not_found",
        `The PDF was not found (HTTP ${response.status}). The link may be wrong, moved or expired.`,
        false,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      return fail("server", `The PDF host is unavailable right now (HTTP ${response.status}). Press Retry in a moment.`, true);
    }
    if (!response.ok) {
      return fail("not_pdf", `The PDF link returned HTTP ${response.status}. Check the link.`, false);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const head = await readHead(response);
    if (head.length === 0) {
      return fail("empty", "The link returned an empty file, not a PDF.", false);
    }
    if (hasPdfHeader(head)) return { ok: true };
    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      return fail(
        "not_pdf",
        "This link opens a web page, not a PDF. Use the file's direct link (for GitHub, the blob link of a .pdf file) or open the original link.",
        false,
      );
    }
    return fail("not_pdf", "The file at this link is not a valid PDF.", false);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
