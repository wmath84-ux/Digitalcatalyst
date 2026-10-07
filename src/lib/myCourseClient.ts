// src/lib/myCourseClient.ts
//
// Storage layer for learner-authored courses ("My Study Library").
//
// One Firestore document per course, under the learner's own uid:
//
//   users/{uid}/myCourses/{courseId}
//
// Ownership comes from the PATH (firestore.rules re-derives it), so a browser
// can never read or write another learner's course. Writes go straight from
// the client on purpose: the tree is the learner's own private document and
// Firestore's offline queue means a course built on a flaky connection is
// never lost.
//
// Images / media are uploaded to Cloudinary when it is configured, otherwise
// to Firebase Storage (`community/myCourses/…`, writable by any signed-in
// learner — see storage.rules), and a cover photo finally falls back to an
// in-document, downscaled data URL so the "upload a cover" flow never dead-ends.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db, getFirebaseStorage } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { isCloudinaryImageUploadConfigured, uploadImageToCloudinary } from "../../utils/cloudinaryUpload";
import {
  MY_COURSE_DESC_MAX,
  MY_COURSE_MAX_COVER_BYTES,
  MY_COURSE_MAX_EXPERIMENT_BYTES,
  MY_COURSE_TITLE_MAX,
  MY_EXPERIMENT_MAX_BYTES,
  MY_MODULE_DESC_MAX,
  MY_MODULE_TITLE_MAX,
  MY_RESOURCE_DESC_MAX,
  MY_RESOURCE_NAME_MAX,
  type MyCourse,
  type MyCourseModule,
  type MyCourseQuestion,
  type MyCourseResource,
  type MyCourseResourceType,
} from "../types/myCourse";
import { experimentByteLength, experimentBlockingIssues } from "../utils/experimentSpec";
import { randomCoverImage } from "./myCourseCovers";

export const MY_COURSES_COLLECTION = "myCourses";
export const MY_COURSE_SCHEMA_VERSION = 1;

/** Cap for a resource upload (video / pdf / audio / image). */
const MAX_RESOURCE_UPLOAD_BYTES = 80 * 1024 * 1024;
/** Cap for a cover image upload. */
const MAX_COVER_UPLOAD_BYTES = 8 * 1024 * 1024;

const now = () => Date.now();

let idCounter = 0;
/** Collision-free local id. Prefixed so course / module / resource / question
 *  ids can never be confused with each other in the player. */
export const newId = (prefix: string): string => {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${now().toString(36)}${idCounter.toString(36)}${random}`;
};

const clamp = (value: string, max: number): string => String(value ?? "").slice(0, max);

const asNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const READ_SOURCE_KINDS = ["upload", "gdrive", "pdf_url", "embed_url"];

const DIFFICULTIES: MyCourseQuestion["difficulty"][] = ["easy", "medium", "hard"];

// ── Factories ─────────────────────────────────────────────────────────────

export const createMyQuestion = (): MyCourseQuestion => ({
  id: newId("q"),
  prompt: "",
  options: ["", "", "", ""],
  correctIndex: -1,
  explanation: "",
  difficulty: "medium",
  topic: "",
});

export const createMyResource = (type: MyCourseResourceType = "youtube"): MyCourseResource => {
  const timestamp = now();
  return {
    id: newId("res"),
    name: "",
    type,
    url: "",
    description: "",
    source: "link",
    ...(type === "brain" ? { practiceTitle: "", practiceQuestions: [createMyQuestion()] } : {}),
    ...(type === "interactive" ? { interactiveHtml: "" } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createMyModule = (title = ""): MyCourseModule => {
  const timestamp = now();
  return {
    id: newId("mod"),
    title,
    description: "",
    resources: [],
    modules: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createMyCourse = (uid: string, title = ""): MyCourse => {
  const timestamp = now();
  return {
    id: newId("course"),
    uid,
    title,
    description: "",
    coverImage: "",
    modules: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    schemaVersion: MY_COURSE_SCHEMA_VERSION,
  };
};

// ── Normalisation (Firestore → typed, defensively) ─────────────────────────

const parseQuestion = (raw: unknown, index: number): MyCourseQuestion | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const options = Array.isArray(source.options)
    ? source.options.map((option) => String(option ?? "")).slice(0, 6)
    : [];
  const prompt = String(source.prompt ?? "").trim();
  if (!prompt && options.filter(Boolean).length < 2) return null;
  const correct = Number(source.correctIndex);
  const difficulty = String(source.difficulty ?? "").toLowerCase();
  return {
    id: String(source.id || `q${index + 1}`),
    prompt,
    options: options.length ? options : ["", ""],
    correctIndex: Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : -1,
    explanation: String(source.explanation ?? ""),
    difficulty: (DIFFICULTIES as string[]).includes(difficulty)
      ? (difficulty as MyCourseQuestion["difficulty"])
      : "medium",
    topic: String(source.topic ?? ""),
  };
};

const parseResource = (raw: unknown): MyCourseResource | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = String(source.id || "");
  if (!id) return null;
  const type = String(source.type || "embed") as MyCourseResourceType;
  const questions = Array.isArray(source.practiceQuestions)
    ? source.practiceQuestions.map(parseQuestion).filter((item): item is MyCourseQuestion => Boolean(item))
    : undefined;
  return {
    id,
    name: String(source.name ?? ""),
    type,
    url: typeof source.url === "string" ? source.url : "",
    description: typeof source.description === "string" ? source.description : "",
    fileName: typeof source.fileName === "string" ? source.fileName : undefined,
    size: Number.isFinite(Number(source.size)) && source.size != null ? Number(source.size) : undefined,
    source: source.source === "upload" ? "upload" : "link",
    practiceTitle: typeof source.practiceTitle === "string" ? source.practiceTitle : undefined,
    // The scope a set created from the Brain tab belongs to — without it the
    // Course Player would either lose the set or show it in every course.
    practiceSourceProductId: typeof source.practiceSourceProductId === "string" ? source.practiceSourceProductId : undefined,
    // Read resources (the learner's own annotatable PDFs): the library fields
    // travel with the resource, or the player would show an empty Read row.
    readSourceKind: READ_SOURCE_KINDS.includes(String(source.readSourceKind))
      ? (String(source.readSourceKind) as MyCourseResource["readSourceKind"])
      : undefined,
    readStoragePath: typeof source.readStoragePath === "string" ? source.readStoragePath : undefined,
    readFileName: typeof source.readFileName === "string" ? source.readFileName : undefined,
    readFileSize: Number.isFinite(Number(source.readFileSize)) && source.readFileSize != null
      ? Number(source.readFileSize)
      : undefined,
    practiceQuestions: type === "brain" ? questions : undefined,
    interactiveHtml: type === "interactive" && typeof source.interactiveHtml === "string" ? source.interactiveHtml : undefined,
    createdAt: asNumber(source.createdAt, 0),
    updatedAt: asNumber(source.updatedAt, 0),
  };
};

const parseModule = (raw: unknown): MyCourseModule | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = String(source.id || "");
  if (!id) return null;
  return {
    id,
    title: String(source.title ?? ""),
    description: typeof source.description === "string" ? source.description : "",
    resources: Array.isArray(source.resources)
      ? source.resources.map(parseResource).filter((item): item is MyCourseResource => Boolean(item))
      : [],
    modules: Array.isArray(source.modules)
      ? source.modules.map(parseModule).filter((item): item is MyCourseModule => Boolean(item))
      : [],
    createdAt: asNumber(source.createdAt, 0),
    updatedAt: asNumber(source.updatedAt, 0),
  };
};

/** Turn any stored document into a safe `MyCourse` (never throws). */
export const parseMyCourse = (raw: unknown, fallbackUid = ""): MyCourse | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = String(source.id || "");
  if (!id) return null;
  return {
    id,
    uid: String(source.uid || fallbackUid),
    title: String(source.title ?? ""),
    description: typeof source.description === "string" ? source.description : "",
    coverImage: typeof source.coverImage === "string" ? source.coverImage : "",
    modules: Array.isArray(source.modules)
      ? source.modules.map(parseModule).filter((item): item is MyCourseModule => Boolean(item))
      : [],
    createdAt: asNumber(source.createdAt, 0),
    updatedAt: asNumber(source.updatedAt, 0),
    schemaVersion: asNumber(source.schemaVersion, MY_COURSE_SCHEMA_VERSION),
  };
};

/** Strip anything a learner typed past the caps and normalise before write. */
export const sanitizeMyCourse = (course: MyCourse): MyCourse => ({
  ...course,
  title: clamp(course.title.trim(), MY_COURSE_TITLE_MAX),
  description: clamp(course.description || "", MY_COURSE_DESC_MAX),
  coverImage: typeof course.coverImage === "string" ? course.coverImage : "",
  updatedAt: now(),
  schemaVersion: MY_COURSE_SCHEMA_VERSION,
  modules: course.modules.map((module) => sanitizeModule(module)),
});

const sanitizeModule = (module: MyCourseModule): MyCourseModule => ({
  ...module,
  title: clamp(module.title.trim(), MY_MODULE_TITLE_MAX),
  description: clamp(module.description || "", MY_MODULE_DESC_MAX),
  resources: module.resources.map((resource) => ({
    ...resource,
    name: clamp(resource.name.trim(), MY_RESOURCE_NAME_MAX),
    description: clamp(resource.description || "", MY_RESOURCE_DESC_MAX),
    url: String(resource.url || "").trim(),
    updatedAt: now(),
  })),
  modules: module.modules.map(sanitizeModule),
  updatedAt: now(),
});

// ── Interactive experiments — the document budget ──────────────────────────
//
// An experiment's source lives INSIDE the course document (that is what makes
// it offline), so it shares Firestore's 1 MB limit with the cover and the whole
// module tree. Both writers must refuse the same way: the direct-Firestore path
// checks here, the server path re-checks in `utils/myCourseDoc.js`, and the
// editor shows the same message before the learner ever taps Save.

export interface ExperimentBudget {
  /** Every inline experiment in the course, in UTF-8 bytes. */
  total: number;
  /** The first experiment over the per-file cap (if any). */
  over: { id: string; name: string; bytes: number } | null;
}

export const myCourseExperimentBudget = (modules: MyCourseModule[]): ExperimentBudget => {
  let total = 0;
  let over: ExperimentBudget["over"] = null;
  const visit = (list: MyCourseModule[]) => {
    for (const module of list) {
      for (const resource of module.resources) {
        if (resource.type !== "interactive") continue;
        const bytes = experimentByteLength(resource.interactiveHtml || "");
        if (bytes <= 0) continue;
        total += bytes;
        if (!over && bytes > MY_EXPERIMENT_MAX_BYTES) {
          over = { id: resource.id, name: resource.name.trim() || "Untitled experiment", bytes };
        }
      }
      visit(module.modules);
    }
  };
  visit(modules);
  return { total, over };
};

/**
 * The message the builder shows (and `saveMyCourse` throws) when a course is
 * over budget. Returns `null` when everything fits.
 */
export const myCourseExperimentBudgetError = (course: MyCourse): string | null => {
  const { total, over } = myCourseExperimentBudget(course.modules);
  if (over) {
    return `“${over.name}” is ${(over.bytes / 1024).toFixed(0)} KB — one experiment may be at most ${(MY_EXPERIMENT_MAX_BYTES / 1024).toFixed(0)} KB. Ask your AI to shorten it, or host the file and paste its link.`;
  }
  if (total > MY_COURSE_MAX_EXPERIMENT_BYTES) {
    return `The experiments in this course add up to ${(total / 1024).toFixed(0)} KB — the limit is ${(MY_COURSE_MAX_EXPERIMENT_BYTES / 1024).toFixed(0)} KB. Host one of them and paste its link, or split the course.`;
  }
  // A lesson that cannot render is worse than no lesson: every experiment needs
  // something to show (inline source, or a hosted https link).
  const broken = findUnrunnableExperiment(course.modules);
  if (broken) return `“${broken}” has no experiment yet — paste the HTML from your AI, upload the .html file, or pick a starter template.`;
  return null;
};

const findUnrunnableExperiment = (modules: MyCourseModule[]): string | null => {
  for (const module of modules) {
    for (const resource of module.resources) {
      if (resource.type !== "interactive") continue;
      const html = resource.interactiveHtml || "";
      const hosted = /^https:\/\//i.test(String(resource.url || "").trim());
      if (!html.trim() && !hosted) return resource.name.trim() || "Untitled experiment";
      if (html.trim() && experimentBlockingIssues(html).length > 0) {
        return resource.name.trim() || "Untitled experiment";
      }
    }
    const child = findUnrunnableExperiment(module.modules);
    if (child) return child;
  }
  return null;
};

// ── Counting helpers (used by the library cards + the editor's guard rails) ─

export const countModules = (modules: MyCourseModule[]): number =>
  modules.reduce((total, module) => total + 1 + countModules(module.modules), 0);

export const countResources = (modules: MyCourseModule[]): number =>
  modules.reduce(
    (total, module) => total + module.resources.length + countResources(module.modules),
    0,
  );

export const countQuestions = (modules: MyCourseModule[]): number =>
  modules.reduce(
    (total, module) =>
      total +
      module.resources.reduce((sum, resource) => sum + (resource.practiceQuestions?.length || 0), 0) +
      countQuestions(module.modules),
    0,
  );

// ── Firestore ──────────────────────────────────────────────────────────────

const courseRef = (uid: string, courseId: string) => doc(db, "users", uid, MY_COURSES_COLLECTION, courseId);

/* ── The guaranteed server path ──────────────────────────────────────────────
   Firestore is the fast route: it is live, it works offline through its write
   queue, and firestore.rules derives ownership from the path.

   But firestore.rules ends with `match /{document=**} { allow read, write: if
   isAdmin(); }`, so the developer's own account can read and write EVERY path.
   That makes any gap between the rules in this repo and the rules actually
   deployed to the project invisible to the admin and fatal for everyone else —
   which is exactly the reported "My Study Library keval admin account se chalta
   hai, dusre account se nahin".

   So every read and write below has a second door: `/api/my-courses`
   (api/_lib/myCourses.ts), which authenticates the learner from their VERIFIED
   ID token and writes the same `users/{uid}/myCourses/{courseId}` document with
   the Admin SDK. The Admin SDK does not consult security rules, so the library
   works for every signed-in account no matter what is deployed — while
   ownership stays absolute, because the server builds the path from the token's
   uid and never from the request body.
   ──────────────────────────────────────────────────────────────────────────── */

/** Firestore error codes that mean "this account may not touch that path". */
const BLOCKED_FIRESTORE_CODES = new Set([
  "permission-denied",
  "unauthenticated",
  "failed-precondition",
]);

const firestoreErrorCode = (error: unknown): string =>
  String((error as { code?: string } | null)?.code || "");

/**
 * A message the learner can act on. Firestore's own text ("Missing or
 * insufficient permissions") names nothing, which is how a rules gap became an
 * unexplainable "library chalta hi nahin" for every account but the admin's.
 */
export const describeMyCoursesError = (error: unknown): string => {
  const code = firestoreErrorCode(error);
  if (code === "permission-denied" || code === "unauthenticated") {
    return "Firebase rules ne direct access refuse kiya — library ab secure server path se load ho rahi hai. Ek baar Try again dabayein.";
  }
  if (code === "unavailable") {
    return "Network ya Firestore abhi unavailable hai. Aapka course is device par safe hai — connection aate hi sync ho jayega.";
  }
  if (code === "resource-exhausted") {
    return "Firestore quota khatam ho gaya hai. Thodi der me dobara try karein.";
  }
  const message = String((error as { message?: string } | null)?.message || "").trim();
  return message || "Your library could not be loaded.";
};

/** True when Firestore itself refused (or could not be reached), as opposed to
 *  a validation error the learner can fix by editing their course. */
export const isMyCoursesFirestoreBlocked = (error: unknown): boolean => {
  const code = firestoreErrorCode(error);
  if (BLOCKED_FIRESTORE_CODES.has(code)) return true;
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return message.includes("missing or insufficient permissions");
};

/**
 * Sticky for the session: once Firestore has refused this browser, later saves
 * go straight to the server instead of paying for another rejection first. It
 * clears itself the moment a Firestore listener answers again (i.e. the rules
 * were deployed), so the fast path always comes back — and a one-shot read
 * re-tests Firestore a minute after the last refusal even if no listener is
 * open, so the fast path returns without the learner having to reopen the shelf.
 */
let firestoreRefusedThisSession = false;
let firestoreRefusedAt = 0;
const FIRESTORE_REFUSED_RETRY_MS = 60_000;
const markFirestoreRefused = (): void => {
  firestoreRefusedThisSession = true;
  firestoreRefusedAt = Date.now();
};
/** True only while the refusal is fresh; an older one is worth re-testing. */
const firestoreRefusedRecently = (): boolean =>
  firestoreRefusedThisSession && Date.now() - firestoreRefusedAt < FIRESTORE_REFUSED_RETRY_MS;

export const myCoursesUsingServerPath = (): boolean => firestoreRefusedThisSession;

type ApiEnvelope<T> = { ok?: boolean; data?: T; error?: string; message?: string; code?: string };

async function myCoursesApi<T>(payload: Record<string, unknown>): Promise<T> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in to sync your library.");
  const token = await user.getIdToken();
  const response = await apiFetch("/api/my-courses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body || body.ok === false || !body.data) {
    const message = String(body?.error || body?.message || "").trim();
    throw new Error(
      message || `My Study Library server answered ${response.status}. Please try again.`,
    );
  }
  return body.data;
}

/** The learner's courses, read by the server (Admin SDK). */
export async function listMyCoursesViaApi(uid: string): Promise<MyCourse[]> {
  const data = await myCoursesApi<{ courses?: unknown[] }>({ action: "myCourses.list", uid });
  const rows = Array.isArray(data.courses) ? data.courses : [];
  return rows
    .map((row) => parseMyCourse(row, uid))
    .filter((course): course is MyCourse => Boolean(course))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Polling subscription over the server path. Firestore would push; here the
 * shelf refreshes on an interval and immediately whenever the device comes back
 * online, which is enough for a page the learner is actively editing.
 */
export function subscribeMyCoursesViaApi(
  uid: string,
  onData: (courses: MyCourse[]) => void,
  onError?: (error: Error) => void,
  intervalMs = 15000,
): Unsubscribe {
  if (!uid) {
    onData([]);
    return () => undefined;
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const load = async () => {
    if (stopped) return;
    try {
      const courses = await listMyCoursesViaApi(uid);
      if (!stopped) onData(courses);
    } catch (error) {
      if (!stopped) onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (!stopped) timer = setTimeout(() => { void load(); }, intervalMs);
    }
  };

  const onOnline = () => {
    if (stopped) return;
    if (timer) { clearTimeout(timer); timer = null; }
    void load();
  };
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);

  void load();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
  };
}

/**
 * Live list of the learner's courses. The listener is the only read: the
 * editor and the player both render from this snapshot, so a save is visible
 * everywhere the moment Firestore confirms it.
 */
export function subscribeMyCourses(
  uid: string,
  onData: (courses: MyCourse[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!uid) {
    onData([]);
    return () => undefined;
  }

  let stopped = false;
  let stopApi: Unsubscribe | null = null;

  /** Switch the shelf to the server path — idempotent. */
  const startApiFallback = (cause: unknown) => {
    if (stopped || stopApi) return;
    markFirestoreRefused();
    console.warn(
      "[my-courses] Firestore refused this account's library (%s) — falling back to /api/my-courses.",
      firestoreErrorCode(cause) || "unknown",
    );
    stopApi = subscribeMyCoursesViaApi(uid, onData, onError);
  };

  const unsubscribe = onSnapshot(
    collection(db, "users", uid, MY_COURSES_COLLECTION),
    (snapshot) => {
      // Firestore answered, so it is the better transport again (live pushes +
      // the offline write queue). Drop the polling fallback and forget the
      // refusal — this is how the fast path returns after the rules are
      // deployed, with no reload and no code change.
      if (stopApi) {
        stopApi();
        stopApi = null;
      }
      firestoreRefusedThisSession = false;
      const courses = snapshot.docs
        .map((entry) => parseMyCourse(entry.data(), uid))
        .filter((course): course is MyCourse => Boolean(course))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      onData(courses);
    },
    (error) => {
      if (isMyCoursesFirestoreBlocked(error)) {
        // Not an error the learner can act on: the server path takes over and
        // the shelf fills in a moment later.
        startApiFallback(error);
        return;
      }
      onError?.(error instanceof Error ? error : new Error(String(error)));
    },
  );

  // A refusal earlier in this session means the listener is about to fail
  // again: start the server path straight away so the shelf is never blank
  // while the rejection round-trips. The listener still runs, and takes back
  // over the moment it is allowed.
  if (firestoreRefusedThisSession) startApiFallback(null);

  return () => {
    stopped = true;
    unsubscribe();
    if (stopApi) stopApi();
  };
}

/** Create or overwrite one course document. Resolves after the write commits. */
export async function saveMyCourse(uid: string, course: MyCourse): Promise<void> {
  if (!uid) throw new Error("Please sign in to save your course.");
  const clean = sanitizeMyCourse(course);
  // A learner who never picks a cover still gets one: a random bundled image
  // is assigned and PERSISTED with the save, so every card on the shelf
  // always shows an image (owner brief 2026-09-29).
  if (!String(clean.coverImage || "").trim()) clean.coverImage = randomCoverImage();
  // Refuse over-budget / empty experiments BEFORE the write: the server path
  // returns the same codes, and a half-written lesson is never acceptable.
  const budgetError = myCourseExperimentBudgetError(clean);
  if (budgetError) throw new Error(budgetError);
  const payload = {
    ...clean,
    uid,
    createdAt: clean.createdAt || now(),
    updatedAt: now(),
    updatedAtServer: serverTimestamp(),
  };
  try {
    await setDoc(courseRef(uid, clean.id), payload, { merge: true });
    return;
  } catch (error) {
    if (!isMyCoursesFirestoreBlocked(error)) throw error;
    // Rules refused (or Firestore is unreachable): the SAME document is written
    // by the server with the Admin SDK, authenticated by this learner's own ID
    // token. Without this door a rules gap makes the whole library admin-only.
    markFirestoreRefused();
    await myCoursesApi<{ course?: unknown }>({ action: "myCourses.save", course: clean });
  }
}

/**
 * One-shot read of the learner's courses (no live listener). Used by the
 * Course Player's "Save for later": if the tap lands before the live
 * snapshot has resolved, the action reads Firestore directly instead of
 * guessing the shelf course is empty — a guess that would overwrite the
 * existing shelf document's modules.
 */
export async function fetchMyCourses(uid: string): Promise<MyCourse[]> {
  if (!uid) return [];
  if (firestoreRefusedRecently()) return listMyCoursesViaApi(uid);
  try {
    const snapshot = await getDocs(collection(db, "users", uid, MY_COURSES_COLLECTION));
    firestoreRefusedThisSession = false;
    return snapshot.docs
      .map((entry) => parseMyCourse(entry.data(), uid))
      .filter((course): course is MyCourse => Boolean(course))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    if (!isMyCoursesFirestoreBlocked(error)) throw error;
    markFirestoreRefused();
    return listMyCoursesViaApi(uid);
  }
}

export async function deleteMyCourse(uid: string, courseId: string): Promise<void> {
  if (!uid) throw new Error("Please sign in to delete your course.");
  try {
    await deleteDoc(courseRef(uid, courseId));
  } catch (error) {
    if (!isMyCoursesFirestoreBlocked(error)) throw error;
    markFirestoreRefused();
    await myCoursesApi<{ courseId?: string }>({ action: "myCourses.delete", courseId });
  }
}

// ── Uploads ────────────────────────────────────────────────────────────────

/** Downscale an image to a compact JPEG data URL (last-resort cover storage). */
async function imageToDataUrl(file: File, maxEdge = 640, quality = 0.72): Promise<string> {
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read. Try another file."));
    };
    image.src = url;
  });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize images.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let data = canvas.toDataURL("image/jpeg", quality);
  // Keep shrinking until the document stays comfortably under Firestore's limit.
  let nextQuality = quality;
  while (data.length > MY_COURSE_MAX_COVER_BYTES && nextQuality > 0.35) {
    nextQuality -= 0.12;
    data = canvas.toDataURL("image/jpeg", nextQuality);
  }
  if (data.length > MY_COURSE_MAX_COVER_BYTES) {
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(canvas.width * 0.7));
    smaller.height = Math.max(1, Math.round(canvas.height * 0.7));
    const smallContext = smaller.getContext("2d");
    if (smallContext) {
      smallContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      data = smaller.toDataURL("image/jpeg", 0.6);
    }
  }
  return data;
}

async function uploadToFirebaseStorage(file: File, path: string): Promise<string> {
  const storage = await getFirebaseStorage();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const target = ref(storage, path);
  await uploadBytes(target, file, { contentType: file.type || "application/octet-stream" });
  return getDownloadURL(target);
}

const safeFileName = (value: string): string =>
  String(value || "file").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);

const isImageFile = (file: File): boolean =>
  file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name || "");

/**
 * Upload a cover image. Cloudinary when configured → Firebase Storage → an
 * in-document data URL, so the flow always ends with a usable image.
 */
export async function uploadMyCourseCover(uid: string, courseId: string, file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error("Please choose an image file (JPG, PNG, WebP or GIF).");
  if (file.size > MAX_COVER_UPLOAD_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — please keep covers under 8 MB.`);
  }
  if (isCloudinaryImageUploadConfigured()) {
    try {
      return await uploadImageToCloudinary(file, { folder: "my-courses", tags: ["my-course", "cover"] });
    } catch {
      // Fall through to Firebase Storage — a configured-but-rejecting preset
      // must not take the whole editor down.
    }
  }
  try {
    const path = `community/myCourses/${uid}/${courseId}/cover-${Date.now()}-${safeFileName(file.name)}`;
    return await uploadToFirebaseStorage(file, path);
  } catch {
    if (!isImageFile(file)) throw new Error("That file could not be uploaded.");
    return imageToDataUrl(file);
  }
}

/** Upload a resource file (video / audio / pdf / image / any document). */
export async function uploadMyCourseResourceFile(
  uid: string,
  courseId: string,
  file: File,
): Promise<{ url: string; fileName: string; size: number }> {
  if (file.size > MAX_RESOURCE_UPLOAD_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 80 MB.`);
  }
  if (isImageFile(file) && isCloudinaryImageUploadConfigured()) {
    try {
      const url = await uploadImageToCloudinary(file, { folder: "my-courses", tags: ["my-course", "resource"] });
      return { url, fileName: file.name, size: file.size };
    } catch {
      /* fall through to Storage */
    }
  }
  try {
    const path = `community/myCourses/${uid}/${courseId}/res-${Date.now()}-${safeFileName(file.name)}`;
    const url = await uploadToFirebaseStorage(file, path);
    return { url, fileName: file.name, size: file.size };
  } catch (error) {
    if (isImageFile(file) && file.size <= 4 * 1024 * 1024) {
      const data = await imageToDataUrl(file, 720, 0.7);
      return { url: data, fileName: file.name, size: file.size };
    }
    throw error instanceof Error ? error : new Error("The file could not be uploaded.");
  }
}
