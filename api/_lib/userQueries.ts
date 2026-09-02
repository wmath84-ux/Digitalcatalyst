// api/_lib/userQueries.ts
//
// User queries — the notes visitors drop on the home page's Sticker Wall,
// and the owner's replies to them.
//
// Storage: Firestore collection `userQueries`, one document per query:
//   { uid, name, email, message, createdAt, status: 'open' | 'replied',
//     reply, repliedAt, replyEmailStatus }
//
// Replying does two things: it stores the reply on the document (so the
// query page can show it under the question) and it EMAILS the reply to the
// address the query came from. The mail transport is SMTP over the standard
// env vars, sent with a dependency-free implementation so the project does
// not gain a mail library:
//   SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (default SMTP_USER), SMTP_SECURE ("true" for implicit TLS)
// If SMTP is not configured the reply is still saved and the response says
// `emailed: false` with a reason, so the owner sees exactly what happened.

import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { adminDb, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { getBranding } from "./branding.js";
import { buildReplyEmail } from "./emailTemplate.js";

const COLLECTION = "userQueries";

/** Only this account may read every query and answer them. */
const ownerEmails = () =>
  String(process.env.OWNER_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const isOwner = (email: string | undefined, role?: string) => {
  const list = ownerEmails();
  const normalized = String(email || "").trim().toLowerCase();
  if (role === "admin") return true;
  if (!list.length) return false;
  return list.includes(normalized);
};

const readBody = (req: VercelRequest): Record<string, unknown> => {
  const raw = req.body;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw || {}) as Record<string, unknown>;
};

// ── Minimal SMTP client ────────────────────────────────────────────────────
// Implicit TLS (port 465) or STARTTLS-free submission on an already-TLS port.
// Enough for the transactional single-recipient reply this feature sends.

const encodeHeader = (value: string) =>
  /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.SMTP_FROM || user).trim();
  const port = Number(process.env.SMTP_PORT || 465);
  if (!host || !user || !pass || !from) {
    return { ok: false, reason: "SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM)." };
  }

  return new Promise((resolve) => {
    let socket: TLSSocket;
    try {
      socket = tlsConnect({ host, port, servername: host });
    } catch (error) {
      resolve({ ok: false, reason: `Could not connect to the mail server: ${(error as Error).message}` });
      return;
    }

    const b64 = (value: string) =>
      Buffer.from(value, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
    // A friendly display name ("Eduvora Support <noreply@…>") instead of a
    // bare address — this is what makes the mail read as professional in the
    // recipient's inbox list.
    const fromHeader = input.fromName ? `${encodeHeader(input.fromName)} <${from}>` : from;
    const boundary = `dc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    // multipart/alternative: text part first (fallback), HTML second — mail
    // clients render the LAST part they understand.
    const mimeBody = input.html
      ? [
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          'Content-Type: text/plain; charset="utf-8"',
          "Content-Transfer-Encoding: base64",
          "",
          b64(input.text),
          "",
          `--${boundary}`,
          'Content-Type: text/html; charset="utf-8"',
          "Content-Transfer-Encoding: base64",
          "",
          b64(input.html),
          "",
          `--${boundary}--`,
        ].join("\r\n")
      : [
          'Content-Type: text/plain; charset="utf-8"',
          "Content-Transfer-Encoding: base64",
          "",
          b64(input.text),
        ].join("\r\n");

    const messageId = `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@${host}>`;
    const body = [
      `From: ${fromHeader}`,
      `To: ${input.to}`,
      input.replyTo ? `Reply-To: ${input.replyTo}` : "",
      `Subject: ${encodeHeader(input.subject)}`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      mimeBody,
    ]
      .filter(Boolean)
      .join("\r\n");

    const steps = [
      `EHLO ${host}`,
      "AUTH LOGIN",
      Buffer.from(user, "utf8").toString("base64"),
      Buffer.from(pass, "utf8").toString("base64"),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${input.to}>`,
      "DATA",
      // Dot-stuffing: a line that is just "." would end DATA early.
      `${body.replace(/\r\n\./g, "\r\n..")}\r\n.`,
      "QUIT",
    ];
    let step = -1;
    let settled = false;
    const finish = (result: { ok: boolean; reason?: string }) => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already closed */ }
      resolve(result);
    };

    socket.setEncoding("utf8");
    socket.setTimeout(20000, () => finish({ ok: false, reason: "The mail server timed out." }));
    socket.on("error", (error) => finish({ ok: false, reason: error.message }));

    socket.on("data", (chunk: string) => {
      const code = Number(String(chunk).slice(0, 3));
      if (code >= 400) {
        finish({ ok: false, reason: `Mail server said: ${String(chunk).trim()}` });
        return;
      }
      step += 1;
      if (step >= steps.length) {
        finish({ ok: true });
        return;
      }
      if (steps[step] === "QUIT") {
        finish({ ok: true });
        return;
      }
      socket.write(`${steps[step]}\r\n`);
    });
  });
}

// ── Handlers ───────────────────────────────────────────────────────────────

type QueryDoc = {
  id: string;
  uid: string;
  name: string;
  email: string;
  message: string;
  createdAt: number;
  status: "open" | "replied";
  reply: string | null;
  repliedAt: number | null;
  replyEmailStatus: string | null;
};

const toQueryDoc = (id: string, data: Record<string, unknown>): QueryDoc => ({
  id,
  uid: String(data.uid || ""),
  name: String(data.name || "Learner"),
  email: String(data.email || ""),
  message: String(data.message || ""),
  createdAt: Number(data.createdAt || 0),
  status: data.status === "replied" ? "replied" : "open",
  reply: data.reply ? String(data.reply) : null,
  repliedAt: data.repliedAt ? Number(data.repliedAt) : null,
  replyEmailStatus: data.replyEmailStatus ? String(data.replyEmailStatus) : null,
});

/** POST { action: "queries.create", message } — any signed-in learner. */
export async function handleCreateQuery(req: VercelRequest, res: VercelResponse) {
  const user = await requireFirebaseUser(req);
  const body = readBody(req);
  const message = String(body.message || "").trim().slice(0, 500);
  if (!message) return res.status(400).json({ ok: false, error: "Query message is required." });

  const db = adminDb();
  const now = Date.now();
  const payload = {
    uid: user.uid,
    name: String(body.name || user.name || user.email || "Learner").slice(0, 120),
    email: String(user.email || body.email || "").trim(),
    message,
    createdAt: now,
    status: "open" as const,
    reply: null,
    repliedAt: null,
    replyEmailStatus: null,
  };
  const ref = await db.collection(COLLECTION).add(payload);
  return res.status(200).json({ ok: true, query: toQueryDoc(ref.id, payload) });
}

/** POST { action: "queries.list" } — owner sees all, a learner sees their own. */
export async function handleListQueries(req: VercelRequest, res: VercelResponse) {
  const user = await requireFirebaseUser(req);
  const db = adminDb();
  const owner = isOwner(user.email, (user as { role?: string }).role);
  const snapshot = owner
    ? await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(300).get()
    : await db.collection(COLLECTION).where("uid", "==", user.uid).limit(100).get();

  const queries = snapshot.docs
    .map((doc: { id: string; data: () => Record<string, unknown> }) => toQueryDoc(doc.id, doc.data() || {}))
    .sort((a: QueryDoc, b: QueryDoc) => b.createdAt - a.createdAt);
  return res.status(200).json({ ok: true, owner, queries });
}

/** POST { action: "queries.reply", id, reply } — owner only; emails the sender. */
export async function handleReplyQuery(req: VercelRequest, res: VercelResponse) {
  const user = await requireFirebaseUser(req);
  if (!isOwner(user.email, (user as { role?: string }).role)) {
    return res.status(403).json({ ok: false, error: "Only the owner can reply to queries." });
  }
  const body = readBody(req);
  const id = String(body.id || "").trim();
  const reply = String(body.reply || "").trim().slice(0, 4000);
  if (!id || !reply) return res.status(400).json({ ok: false, error: "Query id and reply are required." });

  const db = adminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ ok: false, error: "Query not found." });
  const existing = toQueryDoc(id, snapshot.data() || {});

  let emailed = false;
  let emailStatus = "No email address on the query.";
  if (existing.email) {
    // Branded HTML email (api/_lib/emailTemplate.ts) using the live brand
    // name + logo, with a plain-text alternative for text-only clients.
    const branding = await getBranding().catch(() => null);
    const appName = branding?.appName || "Support";
    const siteOrigin = String(process.env.PUBLIC_SITE_ORIGIN || "https://eduvora.shop").replace(/\/$/, "");
    const logoUrl = branding?.logoUrl && /^https:\/\//.test(branding.logoUrl)
      ? branding.logoUrl
      : `${siteOrigin}/icons/icon-192x192.png`;
    const mail = buildReplyEmail({
      name: existing.name,
      question: existing.message,
      reply,
      appName,
      logoUrl,
      actionUrl: `${siteOrigin}/#/queries`,
      supportEmail: String(process.env.SUPPORT_EMAIL || "") || undefined,
    });
    const result = await sendMail({
      to: existing.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      fromName: `${appName} Support`,
      replyTo: String(process.env.SUPPORT_EMAIL || user.email || "") || undefined,
    });
    emailed = result.ok;
    emailStatus = result.ok ? "Reply emailed." : String(result.reason || "Could not send the email.");
  }

  const update = {
    reply,
    repliedAt: Date.now(),
    status: "replied" as const,
    replyEmailStatus: emailStatus,
  };
  await ref.set(update, { merge: true });
  return res.status(200).json({ ok: true, emailed, emailStatus, query: { ...existing, ...update } });
}
