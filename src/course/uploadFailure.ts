// src/course/uploadFailure.ts
//
// The Read page's PDF upload used to answer every failure with one of a
// handful of hand-written sentences, and to throw the technical cause away:
// a 403 from an undeployed Storage rule was reported as "only PDFs up to
// 100 MB are accepted", and a missing bucket (Firebase's `storage/unknown`
// with "The specified bucket does not exist" in `serverResponse`) became
// "could not be uploaded". So an upload that failed told the learner nothing,
// and told the owner nothing either.
//
// This module is the single place that turns ANY thrown value from the upload
// pipeline into something a human can act on:
//
//   · `headline` — the one line shown in the row (short, no jargon);
//   · `hint`     — what it means / what to do next;
//   · `code`     — Firebase's own code (`storage/unauthorized`, `dc/stalled`…);
//   · `status`   — the HTTP status from `serverResponse`, when there is one;
//   · `serverMessage` — the server's own words, verbatim;
//   · `detail`   — one copy-pasteable diagnostic line for a bug report.
//
// It is pure (no Firebase, no DOM, no clock) so `node --test` can drive every
// branch, and so the same words reach the learner's screen, the console and
// the "Copy details" button.

/** Which await of the pipeline an attempt is inside. Named for the learner. */
export type ReadUploadStep =
  | "read-file"
  | "sign-in"
  | "load-uploader"
  | "bytes"
  | "download-url"
  | "library-write";

/** What the UI shows for each step while the attempt is still running. */
export const READ_UPLOAD_STEP_LABEL: Record<ReadUploadStep, string> = {
  "read-file": "Reading the file from this device",
  "sign-in": "Refreshing your sign-in",
  "load-uploader": "Loading the uploader",
  bytes: "Uploading the bytes",
  "download-url": "Fetching the stored file's address",
  "library-write": "Adding it to your library",
};

export type UploadFailure = {
  /** Firebase's / this pipeline's own code. Never empty — "unknown" at worst. */
  code: string;
  /** HTTP status parsed out of `serverResponse`, when the server sent one. */
  status: number | null;
  /** The server's own message, verbatim ("" when it sent none). */
  serverMessage: string;
  /** The step the attempt was inside when it failed. */
  step: ReadUploadStep | null;
  /** Short sentence for the status row. */
  headline: string;
  /** What it means and what to do next. */
  hint: string;
  /** One line with everything, for a screenshot or a bug report. */
  detail: string;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/**
 * Firebase Storage puts the raw HTTP body of a failed request in
 * `serverResponse`. It is usually JSON (`{"error":{"code":403,…}}`) but a
 * proxy, a captive portal or a mis-set bucket can return plain text or an
 * HTML page, so both shapes are handled and neither is ever thrown away.
 */
export function parseServerResponse(raw: unknown): { status: number | null; message: string } {
  const body = text(raw).trim();
  if (!body) return { status: null, message: "" };

  if (body.startsWith("{")) {
    try {
      const parsed = asRecord(JSON.parse(body));
      const error = asRecord(parsed.error);
      const code = error.code ?? parsed.code ?? parsed.status;
      const status = Number(code);
      const message = text(error.message || parsed.message || parsed.error_description);
      if (message || Number.isFinite(status)) {
        return { status: Number.isFinite(status) && status >= 100 && status < 600 ? status : null, message };
      }
    } catch {
      /* not JSON after all — fall through to the text parse */
    }
  }

  // "404 Not Found: The specified bucket does not exist."
  const leading = /^(\d{3})\b\s*(.*)$/s.exec(body);
  if (leading) return { status: Number(leading[1]), message: leading[2].trim() };
  return { status: null, message: body.slice(0, 400) };
}

/** The pieces of a thrown value this pipeline cares about, read defensively. */
export function readFailureParts(thrown: unknown): {
  code: string;
  message: string;
  status: number | null;
  serverMessage: string;
} {
  const record = asRecord(thrown);
  const code = text(record.code).trim() || (thrown instanceof Error ? "error" : "unknown");
  const message = text(record.message).trim() || (thrown instanceof Error ? thrown.message : "");
  const parsed = parseServerResponse(record.serverResponse);
  const explicitStatus = Number(record.status ?? record.httpStatus ?? record.statusCode);
  const status =
    Number.isFinite(explicitStatus) && explicitStatus >= 100 && explicitStatus < 600
      ? explicitStatus
      : parsed.status;
  return { code, message, status, serverMessage: parsed.message };
}

const named = (fileName?: string) => (fileName ? `“${fileName}”` : "The upload");

/**
 * The full description of one upload failure. `step` is where the attempt was
 * when it died, which is what turns "it just says pending" into an answer.
 */
export function describeUploadFailure(input: {
  thrown: unknown;
  step?: ReadUploadStep | null;
  fileName?: string;
  /** The Storage object path, when one was chosen — the single most useful line. */
  storagePath?: string;
}): UploadFailure {
  const { thrown } = input;
  const step = input.step ?? null;
  const file = named(input.fileName);
  const parts = readFailureParts(thrown);
  const { code, status, serverMessage } = parts;

  let headline = `${file} could not be uploaded.`;
  let hint = "Press Retry, or pick the file again.";

  switch (code) {
    case "dc/not-pdf":
      headline = `${file} is not a real PDF (its contents do not start like one).`;
      hint = "Export or save the file as PDF and try again — a renamed .docx/.jpg will not open.";
      break;
    case "dc/unreadable":
      headline = `${file} could not be read from this device.`;
      hint = "Pick the file again. If it lives in Drive or another cloud app, download it to the device first.";
      break;
    case "dc/token-timeout":
      headline = "Your sign-in could not be refreshed in time.";
      hint = "Check the connection, sign out and in again, then press Retry.";
      break;
    case "dc/sdk-load":
      headline = "The uploader itself could not be loaded.";
      hint =
        "The app's upload module did not arrive (a blocked or slow network, or a stale install). Reload the app, then press Retry.";
      break;
    case "dc/stalled":
      headline = `The upload of ${file} stopped moving — no data reached the server for 60 seconds.`;
      hint = "Check the connection and press Retry. Nothing was half-saved: Retry starts from where it can.";
      break;
    case "dc/offline-ceiling":
      headline = "This device reported no internet connection, so the upload was stopped.";
      hint =
        "Turn on Wi-Fi or mobile data (or leave Airplane mode) and press Retry — the browser told the app it was offline, so nothing was sent.";
      break;
    case "dc/url-timeout":
    case "dc/doc-failed":
      headline = `${file} reached cloud storage but could not be added to your library.`;
      hint = "Press Retry to finish — the bytes are already stored, so it will not upload again.";
      break;
    case "storage/unauthenticated":
      headline = "Your sign-in has expired.";
      hint = "Sign in again, then press Retry.";
      break;
    case "storage/unauthorized":
      headline = "Cloud storage refused this upload for your account.";
      hint =
        status === 403
          ? "The server's storage rules said no (HTTP 403). This is a rules problem, not a file problem — the owner needs `firebase deploy --only storage`."
          : "Sign in again and press Retry. If it keeps happening the owner must deploy the storage rules (`firebase deploy --only storage`).";
      break;
    case "permission-denied":
      // Firestore, not Storage: this is the `users/{uid}/readUploads` write.
      headline = "Your account was not allowed to save this PDF to the library.";
      hint =
        "The server's Firestore rules said no. Sign in again and press Retry; if it keeps happening the owner needs `firebase deploy --only storage,firestore`.";
      break;
    case "storage/object-not-found":
      headline = "The stored file could not be found again.";
      hint = "Press Retry — the file will be uploaded again from the start.";
      break;
    case "storage/quota-exceeded":
    case "resource-exhausted":
      headline = "Cloud storage is full or the project quota is used up.";
      hint = "Nothing can be uploaded until the owner raises the quota. Try again later.";
      break;
    case "storage/retry-limit-exceeded":
    case "storage/unavailable":
    case "unavailable":
      headline = `The upload of ${file} did not finish — the network kept dropping it.`;
      hint = "Check the connection and press Retry.";
      break;
    case "storage/canceled":
      headline = "The upload was cancelled.";
      hint = "Pick the file again to upload it.";
      break;
    case "storage/server-file-wrong-size":
    case "storage/invalid-checksum":
      headline = `${file} was damaged on the way to the server.`;
      hint = "Press Retry — the file will be sent again.";
      break;
    default:
      // The important case: an unmapped failure must still say SOMETHING real
      // instead of a generic shrug. A missing bucket, a proxy that answers
      // HTML, a browser extension blocking the request — all land here.
      headline = `${file} could not be uploaded.`;
      hint =
        status === 404
          ? "The server answered 404 — the storage bucket or upload path is misconfigured."
          : status === 400
            ? "The server rejected the request (HTTP 400)."
            : "Open the details below and send them to the owner — that is the exact reason the server or the browser gave.";
      break;
  }

  const stepLabel = step ? READ_UPLOAD_STEP_LABEL[step] : null;
  const detailParts = [
    `code=${code}`,
    status ? `http=${status}` : null,
    stepLabel ? `step=${step} (${stepLabel.toLowerCase()})` : null,
    input.storagePath ? `path=${input.storagePath}` : null,
    serverMessage ? `server="${serverMessage.slice(0, 240)}"` : null,
    parts.message && parts.message !== serverMessage ? `message="${parts.message.slice(0, 240)}"` : null,
  ].filter(Boolean);

  return {
    code: code || "unknown",
    status,
    serverMessage,
    step,
    headline,
    hint,
    detail: detailParts.join(" · ") || "code=unknown",
  };
}
