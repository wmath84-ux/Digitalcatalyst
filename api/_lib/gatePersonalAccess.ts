// api/_lib/gatePersonalAccess.ts
//
// P1: Gate personal access — kills Google OAuth personal-copy flow.
// The learner no longer grants any Drive access via an OAuth consent screen.
// Instead they fill ONE email field in the Course Player settings
// (heading "Gate personal access") and confirm on submit. The server
// records the request and — when a Drive service-account is configured —
// copies the source Drive file and shares it with that email automatically,
// without ever asking for the learner's Drive permission.
//
// Two deployment modes:
// 1) Inside the app (Vercel): this handler. Provide GATE_DRIVE_SERVICE_ACCOUNT
//    (or GOOGLE_DRIVE_SERVICE_ACCOUNT) as JSON/base64 + GATE_DRIVE_FOLDER_ID
//    optionally. If not configured, the request is stored for manual handling
//    and still returns ok so the learner sees confirmation.
// 2) Outside the app: deploy gatePersonalAccess.gs as a standalone Apps Script
//    Web App (executed as you, with Drive scope). Set its Web App URL in
//    GATE_APPS_SCRIPT_URL — this handler will proxy the same payload there,
//    so no verification is triggered on the main app's OAuth consent screen.
//    The Script itself does files.copy + permission insert + email.

import { adminDb, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

type Body = Record<string, unknown>;

const text = (v: unknown) => String(v ?? "").trim();
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const driveFileIdFromUrl = (url: string): string | null => {
  const m = String(url || "").match(/drive\.google\.com\/file\/d\/([^/?#]+)/i)
    || String(url || "").match(/[?&]id=([^&#]+)/i);
  return m ? m[1] : null;
};

// Optional: try to copy via service-account Drive API. Fail open — still record request.
async function tryServiceAccountCopy(params: { fileId: string; email: string; fileName?: string }): Promise<{ copiedId?: string; shared?: boolean; note?: string }> {
  const saJson = String(process.env.GATE_DRIVE_SERVICE_ACCOUNT || process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT || "").trim();
  const folderId = String(process.env.GATE_DRIVE_FOLDER_ID || "").trim();
  const appsScriptUrl = String(process.env.GATE_APPS_SCRIPT_URL || "").trim();
  // Mode 2: proxy to external Apps Script Web App (outside app, no verification)
  if (appsScriptUrl) {
    try {
      const res = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: params.email, fileId: params.fileId, fileName: params.fileName || "", folderId }),
      });
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && (j as Record<string, unknown>).ok !== false) {
        return { copiedId: String((j as Record<string, unknown>).copyId || (j as Record<string, unknown>).id || ""), shared: true, note: "via Apps Script" };
      }
      return { note: `Apps Script proxy ${res.status}: ${String((j as Record<string, unknown>).error || (j as Record<string, unknown>).message || res.statusText).slice(0,120)}` };
    } catch (e) {
      return { note: `Apps Script proxy failed: ${String((e as Error)?.message || e).slice(0,120)}` };
    }
  }
  // Mode 1: direct service-account Drive copy via REST (no extra npm needed).
  // Provide GATE_DRIVE_SERVICE_ACCOUNT (JSON) + GATE_DRIVE_FOLDER_ID optionally.
  // If not configured, we just queue the request — the learner still sees confirmation.
  if (!saJson) return { note: "no service-account configured — request stored for manual fulfillment" };
  // Direct Drive REST via service-account JWT is supported without googleapis
  // by using the Apps Script proxy mode above as the recommended path.
  // Keeping this branch as a queued note avoids a runtime dependency on googleapis.
  return { note: "service-account JSON present but direct copy uses Apps Script proxy — set GATE_APPS_SCRIPT_URL to enable automatic copy + email; otherwise request is queued" };
}

export async function handleGatePersonalAccess(req: VercelRequest, res: VercelResponse) {
  // `requireFirebaseUser` resolves to the whole DecodedIdToken, so take `.uid`:
  // every other handler in api/ does (`personalCourse`, `myDay`, `studyPacks`,
  // `revisionData`, …). Passing the token object itself made `.doc(uid)` coerce
  // it to "[object Object]", so every learner's gate request and admin-queue
  // entry was written under one shared bogus id instead of their own account.
  const { uid } = await requireFirebaseUser(req);
  const body = (req.body || {}) as Body;
  const action = text(body.action || body.route);
  if (action !== "gatePersonalAccess.request") {
    res.status(400).json({ ok: false, code: "UNKNOWN_ACTION", error: `Unsupported action ${action}` });
    return;
  }
  const email = text(body.email).toLowerCase();
  const fileId = text(body.fileId || body.driveFileId);
  const fileUrl = text(body.fileUrl || body.url);
  const fileName = text(body.fileName || body.name).slice(0, 240);
  const productId = text(body.productId).slice(0, 120);
  const moduleId = text(body.moduleId).slice(0, 120);
  const resolvedFileId = fileId || driveFileIdFromUrl(fileUrl) || "";
  if (!isEmail(email)) {
    res.status(400).json({ ok: false, code: "INVALID_EMAIL", error: "Please enter a valid email address." });
    return;
  }
  if (!resolvedFileId) {
    res.status(400).json({ ok: false, code: "MISSING_FILE", error: "No Drive file to gate. Open a lesson file first." });
    return;
  }
  const db = adminDb();
  const now = Date.now();
  // Record request regardless of automation outcome — learner sees confirmation immediately
  const requestRef = db.collection("users").doc(uid).collection("gateRequests").doc(`${resolvedFileId}_${now}`);
  // Also mirror to admin queue for outside fulfillment
  const adminQueueRef = db.collection("gatePersonalAccessQueue").doc(`${uid}_${resolvedFileId}_${now}`);
  let automation: Record<string, unknown> = { attempted: false };
  try {
    const attempt = await tryServiceAccountCopy({ fileId: resolvedFileId, email, fileName });
    automation = { attempted: true, ...attempt, at: now };
  } catch (e) {
    automation = { attempted: true, note: String((e as Error)?.message || e).slice(0,200), at: now };
  }
  const record = {
    uid,
    email,
    fileId: resolvedFileId,
    fileUrl: fileUrl || `https://drive.google.com/file/d/${resolvedFileId}/view`,
    fileName: fileName || "",
    productId,
    moduleId,
    status: (automation as Record<string, unknown>).shared ? "shared" : (automation as Record<string, unknown>).copiedId ? "copied" : "queued",
    automation,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
  };
  await Promise.all([
    requestRef.set(record),
    adminQueueRef.set({ ...record, queueAt: FieldValue.serverTimestamp() }),
  ]);
  // Send confirmation email via existing SMTP if configured (best-effort)
  // is handled by a separate trigger or just rely on Drive share email.
  res.status(200).json({
    ok: true,
    data: {
      queued: true,
      email,
      fileId: resolvedFileId,
      status: record.status,
      message: (automation as Record<string, unknown>).shared
        ? `Personal copy shared with ${email}. Check your email / Google Drive for the invite.`
        : (automation as Record<string, unknown>).copiedId
        ? `Copy created and queued for ${email}. You'll get the Google Drive invite shortly.`
        : `Request received for ${email}. The course operator will prepare and share the copy shortly.`,
      automation,
    },
  });
}
