// api/admin/email-login.ts
//
// Password-less admin sign-in. The admin was getting locked out because the
// Firebase Authentication password no longer matched (and the reset email was
// not arriving), so this endpoint issues a Firebase custom token purely from
// the approved email + the Firestore `role == "admin"` flag — no password.
//
// Security model (defence in depth, no remembered password):
//   1. The email must be exactly APPROVED_ADMIN_EMAIL (hard-coded server-side).
//   2. The account must exist in Firebase Authentication (getUserByEmail).
//   3. The user's Firestore doc must have `role == "admin"`.
//   4. (Optional) If ADMIN_LOGIN_SECRET is set in Vercel, the client must also
//      send it in `secret`. When configured, this is the strongest gate and is
//      recommended for production — it turns the flow into a lightweight
//      "admin passphrase" without the full Firebase password.
//
// The returned custom token is signed by the service account and accepted by
// signInWithCustomToken on the client, which then follows the normal
// onAuthStateChanged → session restore path.

import { getAuth } from "firebase-admin/auth";
import { adminDb, errorResponse, getFirebaseAdminApp, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";

const APPROVED_ADMIN_EMAIL = "wmath84@gmail.com";

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, code: "method_not_allowed", error: "Method not allowed." });
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const email = clean(body.email, 200).toLowerCase();
    const secret = clean(body.secret, 200);

    if (!email) {
      return res.status(400).json({ ok: false, code: "missing_email", error: "Admin email is required." });
    }
    if (email !== APPROVED_ADMIN_EMAIL) {
      return res.status(403).json({ ok: false, code: "not_approved", error: "This email is not approved for dashboard access." });
    }

    // Optional strongest gate: if the operator set ADMIN_LOGIN_SECRET, it must
    // match. Without it the flow still requires email + admin role.
    const expectedSecret = String(process.env.ADMIN_LOGIN_SECRET || "").trim();
    if (expectedSecret && secret !== expectedSecret) {
      return res.status(403).json({ ok: false, code: "bad_secret", error: "Admin access secret is incorrect." });
    }

    const auth = getAuth(getFirebaseAdminApp());

    // Resolve the uid from the email (must be a real Firebase Auth account).
    let uid: string;
    try {
      const user = await auth.getUserByEmail(APPROVED_ADMIN_EMAIL);
      uid = user.uid;
    } catch {
      return res.status(404).json({ ok: false, code: "user_not_found", error: "No Firebase Authentication account exists for this admin email." });
    }

    // Firestore must mark the user as an admin.
    const snapshot = await adminDb().collection("users").doc(uid).get();
    if (!snapshot.exists || snapshot.data()?.role !== "admin") {
      return res.status(403).json({ ok: false, code: "not_admin", error: "This account is missing the admin role. Set role = admin on the user document." });
    }

    // Mint a short-lived custom token for the exact uid.
    const token = await auth.createCustomToken(uid);
    return res.status(200).json({ ok: true, token, uid });
  } catch (error) {
    return errorResponse(res, error, "Admin sign-in could not be completed.");
  }
}
