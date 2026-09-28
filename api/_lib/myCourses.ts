// api/_lib/myCourses.ts
//
// SERVER-SIDE My Study Library — the guaranteed path.
//
// Reported symptom: "My Study Library keval mere developer admin account se hi
// chal raha hai; koi dusra apni email se login karta hai to chala hi nahin
// sakta."
//
// Why an admin account is the one that always works: firestore.rules ends with
//
//     match /{document=**} { allow read, write: if isAdmin(); }
//
// a catch-all that lets the developer's account read and write EVERY path. So
// any gap between the rules file in this repo and the rules actually DEPLOYED
// to the project (or a rule that rejects a payload the client builds) is
// invisible to the admin and fatal for every other learner: their
// `onSnapshot(users/{uid}/myCourses)` comes back `permission-denied`, the shelf
// shows "Your library couldn't load", and "Try again" retries the same wall.
//
// This handler removes that single point of failure. It authenticates the
// caller from their VERIFIED Firebase ID token, derives the uid from the token
// (never from the body), and writes the learner's own
// `users/{uid}/myCourses/{courseId}` document with the Admin SDK — which does
// not consult security rules at all. Ownership is still absolute: the path is
// built from the token's uid, so one learner can never touch another's course.
//
// The client (`src/lib/myCourseClient.ts`) still tries Firestore FIRST — that
// path is faster and works offline through Firestore's write queue — and falls
// back to these actions only when Firestore refuses or is unreachable.
//
// Shares the deployed `api/referral-leaderboard.ts` function (Hobby plan caps
// the project at 12 serverless entries), reached through the `/api/my-courses`
// rewrite in vercel.json.

import { FieldValue } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "./firebaseAdmin.js";
import {
  MY_COURSES_COLLECTION,
  countMyCourseModules,
  countMyCourseResources,
  sanitizeMyCourseDoc,
} from "../../utils/myCourseDoc.js";

type Body = Record<string, unknown>;

/** Actions that only read — the client may retry these freely. */
export const MY_COURSES_READ_ACTIONS = ["myCourses.list"] as const;

const text = (value: unknown) => String(value ?? "").trim();

const readCourse = (data: Record<string, unknown>, id: string) => {
  const modules = Array.isArray(data.modules) ? data.modules : [];
  return {
    id: text(data.id) || id,
    uid: text(data.uid),
    title: text(data.title),
    description: text(data.description),
    coverImage: text(data.coverImage),
    modules,
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    schemaVersion: Number(data.schemaVersion) || 1,
    moduleCount: countMyCourseModules(modules),
    resourceCount: countMyCourseResources(modules),
  };
};

export async function handleMyCourses(req: VercelRequest, res: VercelResponse) {
  try {
    // The uid comes from the verified token: a body field can never aim this
    // handler at somebody else's library.
    const { uid } = await requireFirebaseUser(req);
    const body = (req.body || {}) as Body;
    const action = text(body.action);
    const db = adminDb();
    const courses = db.collection("users").doc(uid).collection(MY_COURSES_COLLECTION);

    if (action === "myCourses.list") {
      const snapshot = await courses.limit(200).get();
      const rows = snapshot.docs
        .map((entry) => readCourse(entry.data() || {}, entry.id))
        .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
      return res.status(200).json({
        ok: true,
        data: { courses: rows, transport: "api", uid },
      });
    }

    if (action === "myCourses.save") {
      const result = sanitizeMyCourseDoc(uid, body.course);
      if (!result.ok) {
        return res.status(400).json({ ok: false, code: result.code, error: result.message });
      }
      await courses.doc(result.doc.id).set(
        { ...result.doc, updatedAtServer: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return res.status(200).json({
        ok: true,
        data: {
          course: {
            ...readCourse(result.doc as unknown as Record<string, unknown>, result.doc.id),
            uid,
          },
          transport: "api",
        },
      });
    }

    if (action === "myCourses.delete") {
      const courseId = text(body.courseId).slice(0, 80);
      if (!courseId) {
        return res.status(400).json({ ok: false, code: "MISSING_COURSE_ID", error: "No course was named to delete." });
      }
      // Same guard `sanitizeMyCourseDoc` applies on save: Firestore reserves
      // ids wrapped in "__". Everything else is already scoped to this
      // learner's own namespace, because the collection path is built from the
      // token's uid — never from the body.
      if (courseId.startsWith("__")) {
        return res.status(400).json({ ok: false, code: "INVALID_COURSE_ID", error: "That course id is reserved by Firestore." });
      }
      await courses.doc(courseId).delete();
      return res.status(200).json({ ok: true, data: { courseId, transport: "api" } });
    }

    // Never fall through to another feature: an unknown action on this route is
    // answered as this route (the dispatch guard in the shared function relies
    // on every handler doing the same).
    return res.status(400).json({
      ok: false,
      code: action ? "UNKNOWN_ACTION" : "MISSING_ACTION",
      error: action
        ? `My Study Library rejected this request: "${action.slice(0, 60)}" is not a supported action. Reload the app and try again.`
        : "My Study Library could not read this request. Reload the page (or the app) and try again.",
    });
  } catch (error) {
    return errorResponse(
      res,
      error,
      "My Study Library could not reach the server. Your course is safe on this device — please try again.",
    );
  }
}

export default handleMyCourses;
