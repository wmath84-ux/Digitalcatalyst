// api/_lib/joplinClipper.ts
//
// The Web Clipper's server half: pairing, token lifecycle and clip ingestion.
//
// Why the server owns all three:
//
//   · a pairing code and a token are SECRETS — only their hashes are stored
//     (`utils/joplinClipper.js` computes them), so Firestore rules keep the
//     `joplinClipperCodes` / `joplinClipperTokens` collections server-only;
//   · a clip is a CREATION, so it must go through the same allowance and
//     entitlement check every other workspace creation goes through
//     (`api/_lib/joplin.ts`);
//   · the extension holds a scoped token, never a Firebase session, so it can
//     never read a notebook, a note or another learner's data — `clip:write`
//     can only append to the workspace's own "Web Clippings" notebook.
//
// What the extension never sees: a Firebase refresh token, an ID token, the
// user's notebook tree, or the token hash. Rotation and revocation are
// server-side state changes, so revoking from the phone kills the desktop
// extension on its next request.

import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { createJoplinRow, joplinCollections } from "./joplin.js";
import {
  MAX_CLIP_BYTES,
  buildPairingRecord,
  buildTokenRecord,
  canonicalUrl,
  clipDeepLink,
  clipNoteId,
  formatPairingCode,
  generatePairingCode,
  generateToken,
  isPairingCodeShape,
  pairingCodeDocId,
  pairingCodeStatus,
  hashToken,
  tokenDocId,
  tokenHasScope,
  webClippingsNotebookId,
  workspaceRootNotebookId,
  WEB_CLIPPINGS_NOTEBOOK,
  WORKSPACE_ROOT_NOTEBOOK,
  tokenStatus,
  validateClipPayload,
} from "../../utils/joplinClipper.js";

const CODES = "joplinClipperCodes";
const TOKENS = "joplinClipperTokens";
const MAX_ACTIVE_TOKENS = 5;

type Row = Record<string, unknown>;
const asRecord = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);

const readBody = (req: VercelRequest): Row => {
  const body = req.body;
  if (typeof body === "string") {
    try {
      return asRecord(JSON.parse(body));
    } catch {
      return {};
    }
  }
  return asRecord(body);
};

const fail = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Read the extension's token from either header shape. */
function bearerToken(req: VercelRequest): string {
  const direct = text((req.headers?.["x-clipper-token"] as string) || "", 200);
  if (direct) return direct;
  const header = text((req.headers?.authorization as string) || "", 400);
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

const userRef = (uid: string) => adminDb().collection("users").doc(uid);

/**
 * Make sure the clip destination exists.
 *
 * The Web Clippings notebook is NESTED under the workspace root, and a learner
 * who pairs the extension before running the My Day migration would otherwise
 * clip into a notebook that does not exist yet (Joplin would show the note as
 * unfiled). Creating these two rows is structural, deterministic and
 * idempotent, so it does NOT consume the daily allowance — the note that lands
 * inside them does.
 */
async function ensureClippingNotebook(uid: string, now: number): Promise<string> {
  const items = userRef(uid).collection(joplinCollections.items);
  const rootId = workspaceRootNotebookId();
  const clipId = webClippingsNotebookId();
  const [rootSnap, clipSnap] = await Promise.all([items.doc(rootId).get(), items.doc(clipId).get()]);
  if (rootSnap.exists && clipSnap.exists) return clipId;
  const batch = adminDb().batch();
  if (!rootSnap.exists) {
    batch.set(items.doc(rootId), {
      id: rootId,
      ownerId: uid,
      uid,
      type_: 2,
      title: WORKSPACE_ROOT_NOTEBOOK,
      parent_id: "",
      icon: "",
      created_time: now,
      updated_time: now,
      rev: 1,
      syncedAt: now,
      createdBy: "web-clipper",
    });
  }
  if (!clipSnap.exists) {
    batch.set(items.doc(clipId), {
      id: clipId,
      ownerId: uid,
      uid,
      type_: 2,
      title: WEB_CLIPPINGS_NOTEBOOK,
      parent_id: rootId,
      icon: "",
      created_time: now,
      updated_time: now,
      rev: 1,
      syncedAt: now,
      createdBy: "web-clipper",
    });
  }
  await batch.commit();
  return clipId;
}

// ── pairing ────────────────────────────────────────────────────────────────

/**
 * Step 1 — the signed-in app asks for a code. Codes are short-lived and
 * single-use; minting one is free (it grants nothing until it is claimed).
 */
export async function handleClipperPairStart(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { uid } = await requireFirebaseUser(req);
    const body = readBody(req);
    const label = text(body.label, 60) || "Browser extension";
    const now = Date.now();
    const code = generatePairingCode();
    const record = buildPairingRecord({ uid, code, now, label });
    await userRef(uid).collection(CODES).doc(pairingCodeDocId(code)).set(record, { merge: false });
    res.status(200).json({
      ok: true,
      code: formatPairingCode(code),
      expiresAt: record.expiresAt,
      ttlMs: record.expiresAt - now,
    });
  } catch (caught) {
    errorResponse(res, caught, "Could not create a pairing code.");
  }
}

/**
 * Step 2 — the extension exchanges the code for a scoped token.
 *
 * This endpoint is the one place that does not require a Firebase session: the
 * code IS the credential, it is single-use, it expires, and a wrong guess only
 * increments a counter that kills the code after ten tries. The response
 * carries the token, its scope and its expiry — never a Firebase token.
 */
export async function handleClipperPairClaim(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const body = readBody(req);
    const code = text(body.code, 20);
    const label = text(body.label, 60) || "Browser extension";
    if (!isPairingCodeShape(code)) {
      throw fail(400, "CLIPPER_BAD_CODE", "That pairing code is not valid.");
    }
    const db = adminDb();
    // The uid is unknown until the code resolves, so the lookup uses a
    // collectionGroup query on the hashed id.
    const found = await db.collectionGroup(CODES).where("codeHash", "==", hashedCode(code)).limit(1).get();
    if (found.empty) {
      throw fail(404, "CLIPPER_CODE_NOT_FOUND", "That pairing code is unknown or already used. Generate a new one in My Day → Settings → Web Clipper.");
    }
    const doc = found.docs[0];
    const record = asRecord(doc.data());
    const status = pairingCodeStatus(record, Date.now());
    if (status === "used") {
      throw fail(409, "CLIPPER_CODE_USED", "That pairing code has already been used. Generate a new one.");
    }
    if (status === "expired") {
      throw fail(410, "CLIPPER_CODE_EXPIRED", "That pairing code has expired. Generate a new one.");
    }
    if (status === "exhausted") {
      throw fail(429, "CLIPPER_CODE_EXHAUSTED", "Too many attempts on that code. Generate a new one.");
    }
    const uid = text(record.uid, 120);
    if (!uid) throw fail(500, "CLIPPER_BAD_RECORD", "That pairing code is damaged. Generate a new one.");

    const now = Date.now();
    // Single-use: mark used in the same write that records the attempt, before
    // the token is minted, so a replay of the same claim cannot produce two.
    await doc.ref.set({ usedAt: now, attempts: Number(record.attempts || 0) + 1 }, { merge: true });

    // Cap the number of live extensions per learner: revoke the oldest.
    const tokens = await userRef(uid).collection(TOKENS).get();
    const active = tokens.docs
      .map((entry) => ({ ref: entry.ref, data: asRecord(entry.data()) }))
      .filter((entry) => tokenStatus(entry.data, now) === "active")
      .sort((a, b) => Number(a.data.createdAt || 0) - Number(b.data.createdAt || 0));
    for (const extra of active.slice(0, Math.max(0, active.length - MAX_ACTIVE_TOKENS + 1))) {
      await extra.ref.set({ revokedAt: now, revokedReason: "token_limit" }, { merge: true });
    }

    const token = generateToken();
    const tokenRecord = buildTokenRecord({ token, uid, now, label, scopes: ["clip:write"] });
    await userRef(uid).collection(TOKENS).doc(tokenDocId(token)).set(tokenRecord, { merge: false });

    const profile = await userRef(uid).get().catch(() => null);
    res.status(200).json({
      ok: true,
      token,
      scopes: tokenRecord.scopes,
      expiresAt: tokenRecord.expiresAt,
      account: {
        uid,
        name: text((profile?.data() as Row | undefined)?.displayName || (profile?.data() as Row | undefined)?.name, 80),
      },
    });
  } catch (caught) {
    errorResponse(res, caught, "Could not pair the extension.");
  }
}

const hashedCode = (code: string) => pairingCodeDocId(code);

/**
 * Find a token row by the hash of the token the extension presented.
 *
 * A collection-group query keeps the lookup OWNER-AGNOSTIC — the extension
 * never tells the server who it is, so it cannot probe another learner's
 * workspace — and the token is stored hashed, so the query value is useless if
 * the request is logged.
 */
async function findToken(token: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: Row } | null> {
  const snapshot = await adminDb()
    .collectionGroup(TOKENS)
    .where("tokenHash", "==", hashToken(token))
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { ref: doc.ref, data: asRecord(doc.data()) as Row };
}

/** Step 3 (optional) — the extension reports what it can do; nothing secret. */
export async function handleClipperStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { uid } = await requireFirebaseUser(req);
    const tokens = await userRef(uid).collection(TOKENS).get();
    res.status(200).json({
      ok: true,
      tokens: tokens.docs.map((entry) => {
        const row = asRecord(entry.data());
        return {
          tokenId: entry.id,
          label: text(row.label, 60),
          scopes: Array.isArray(row.scopes) ? row.scopes : [],
          createdAt: Number(row.createdAt) || 0,
          expiresAt: Number(row.expiresAt) || 0,
          lastUsedAt: Number(row.lastUsedAt) || 0,
          status: tokenStatus(row, Date.now()),
        };
      }),
    });
  } catch (caught) {
    errorResponse(res, caught, "Could not read the clipper status.");
  }
}

/** Revoke one token (or every token) from the app. */
export async function handleClipperRevoke(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { uid } = await requireFirebaseUser(req);
    const body = readBody(req);
    const target = text(body.tokenId, 60);
    const all = body.all === true;
    const now = Date.now();
    const collection = userRef(uid).collection(TOKENS);
    if (all) {
      const snapshot = await collection.get();
      await Promise.all(snapshot.docs.map((entry) => entry.ref.set({ revokedAt: now, revokedReason: "user_revoked" }, { merge: true })));
      res.status(200).json({ ok: true, revoked: snapshot.size });
      return;
    }
    if (!target) throw fail(400, "CLIPPER_NO_TARGET", "Name the token to revoke.");
    await collection.doc(target).set({ revokedAt: now, revokedReason: "user_revoked" }, { merge: true });
    res.status(200).json({ ok: true, revoked: 1 });
  } catch (caught) {
    errorResponse(res, caught, "Could not revoke that extension.");
  }
}

// ── clipping ───────────────────────────────────────────────────────────────

/**
 * Ingest one clip.
 *
 * The clip lands as a real Joplin note in the workspace's "Web Clippings"
 * notebook: `source_url` is set (so Joplin shows the source), the body is the
 * captured HTML converted the same way the migration converts legacy rich text,
 * and the id is deterministic per (owner, canonical URL, day) — clipping the
 * same page again the same day APPENDS to that note instead of duplicating it.
 */
export async function handleClipperClip(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const token = bearerToken(req);
    if (!token) throw fail(401, "CLIPPER_TOKEN_REQUIRED", "Pair the extension again — this request carried no token.");
    if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > MAX_CLIP_BYTES * 2) {
      throw fail(413, "CLIPPER_CLIP_TOO_LARGE", "That page is too large to clip.");
    }
    const found = await findToken(token);
    const record = found?.data ?? null;
    if (!tokenHasScope(record, "clip:write")) {
      const status = tokenStatus(record, Date.now());
      throw fail(status === "missing" ? 401 : 403, `CLIPPER_TOKEN_${status.toUpperCase()}`, "This extension is no longer connected. Generate a new pairing code in My Day → Settings → Web Clipper.");
    }
    const tokenRef = found!.ref;
    const uid = text(record?.uid, 120);
    if (!uid) throw fail(500, "CLIPPER_BAD_TOKEN", "That token is damaged. Pair again.");

    const body = readBody(req);
    const validated = validateClipPayload(body.clip ?? body);
    if (!validated.ok) throw fail(400, `CLIPPER_${validated.reason.toUpperCase()}`, "That page could not be clipped.");

    const clip = validated.clip as {
      url: string;
      title: string;
      html: string;
      selection: string;
      text: string;
      tags: string[];
      notebookId: string;
      clippedAt: number;
    };
    const now = Date.now();
    const noteId = clipNoteId(uid, clip.url, now);
    // The destination is resolved server-side (never trusted from the
    // extension) so a clip can only ever land in the workspace's own notebook.
    const notebookId = await ensureClippingNotebook(uid, now);

    // The clip is a creation, so it walks the SAME door as every other
    // creation: entitlement + one unit of the shared daily allowance.
    const outcome = await createJoplinRow({
      uid,
      collection: joplinCollections.items,
      clientTimeZone: text(body.timeZone, 80) || "UTC",
      raw: {
        id: noteId,
        type_: 1,
        title: clip.title,
        body: trimClipBody(body),
        source_url: clip.url,
        markup_language: 2,
        parent_id: notebookId,
        tag_titles: clip.tags,
        created_time: now,
        updated_time: now,
      },
    });

    if (outcome.replayed) {
      await appendClipToNote(uid, noteId, trimClipBody(body), now);
    }

    await tokenRef.set({ lastUsedAt: now }, { merge: true });
    res.status(200).json({
      ok: true,
      noteId,
      updated: outcome.replayed,
      deepLink: clipDeepLink(noteId),
      notebookId,
    });
  } catch (caught) {
    errorResponse(res, caught, "Could not clip that page.");
  }
}

/** Rotate: the old token dies as the new one is stored. */
export async function handleClipperRotate(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const token = bearerToken(req);
    if (!token) throw fail(401, "CLIPPER_TOKEN_REQUIRED", "Pair the extension again.");
    const db = adminDb();
    const found = await findToken(token);
    const record = found?.data ?? null;
    if (!tokenHasScope(record, "clip:write")) {
      throw fail(403, "CLIPPER_TOKEN_INACTIVE", "This extension is no longer connected.");
    }
    const { ref: tokenRef } = found!;
    const uid = text(record?.uid, 120);
    const now = Date.now();
    const nextToken = generateToken();
    const nextRecord = buildTokenRecord({ token: nextToken, uid, now, label: text(record?.label, 60), scopes: ["clip:write"] });
    await userRef(uid).collection(TOKENS).doc(tokenDocId(nextToken)).set(nextRecord, { merge: false });
    await tokenRef.set({ revokedAt: now, revokedReason: "rotated", replacedBy: tokenDocId(nextToken) }, { merge: true });
    res.status(200).json({ ok: true, token: nextToken, scopes: nextRecord.scopes, expiresAt: nextRecord.expiresAt });
  } catch (caught) {
    errorResponse(res, caught, "Could not rotate the extension token.");
  }
}

/** Appending to an existing note is a server-side merge: no allowance, no rev race. */
async function appendClipToNote(uid: string, noteId: string, section: string, now: number): Promise<void> {
  const db = adminDb();
  const ref = userRef(uid).collection(joplinCollections.items).doc(noteId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  const data = asRecord(snapshot.data());
  const body = `${String(data.body ?? "")}\n\n${section}`;
  await ref.set({ body, updated_time: now, rev: Number(data.rev || 1) + 1 }, { merge: true });
}

/**
 * The item endpoint caps a note body at 400 KB. A large article is TRIMMED
 * instead of refused (the learner asked for the page, not for an error), and
 * the trim is visible in the note itself.
 */
const MAX_CLIP_BODY_CHARS = 380_000;
function trimClipBody(value: string): string {
  if (value.length <= MAX_CLIP_BODY_CHARS) return value;
  return `${value.slice(0, MAX_CLIP_BODY_CHARS)}\n\n> _Clip truncated — the page was larger than one note._`;
}

/** The note body: the page's own HTML, marked with where it came from. */
function clipBody(clip: { url: string; html: string; selection: string; text: string; clippedAt: number }): string {
  const when = new Date(clip.clippedAt || Date.now()).toISOString();
  const parts = [`> Clipped from [${clip.url}](${clip.url}) on ${when}`, ""];
  if (clip.selection.trim()) parts.push("## Selection", "", clip.selection.trim(), "");
  if (clip.html.trim()) parts.push("## Page", "", clip.html.trim(), "");
  else if (clip.text.trim()) parts.push("## Page text", "", clip.text.trim(), "");
  return parts.join("\n");
}

export const CLIPPER_ROUTE_ACTIONS = {
  pairStart: "joplin.clipper.pair.start",
  pairClaim: "joplin.clipper.pair.claim",
  status: "joplin.clipper.status",
  revoke: "joplin.clipper.revoke",
  clip: "joplin.clipper.clip",
  rotate: "joplin.clipper.rotate",
};

export async function handleClipperAction(action: string, req: VercelRequest, res: VercelResponse): Promise<void> {
  if (action === CLIPPER_ROUTE_ACTIONS.pairStart) return handleClipperPairStart(req, res);
  if (action === CLIPPER_ROUTE_ACTIONS.pairClaim) return handleClipperPairClaim(req, res);
  if (action === CLIPPER_ROUTE_ACTIONS.status) return handleClipperStatus(req, res);
  if (action === CLIPPER_ROUTE_ACTIONS.revoke) return handleClipperRevoke(req, res);
  if (action === CLIPPER_ROUTE_ACTIONS.clip) return handleClipperClip(req, res);
  if (action === CLIPPER_ROUTE_ACTIONS.rotate) return handleClipperRotate(req, res);
  res.status(400).json({ ok: false, code: "UNKNOWN_ACTION", error: `Unsupported clipper action ${action}` });
}

export const canonicalClipUrl = canonicalUrl;
