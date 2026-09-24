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
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db, getFirebaseStorage } from "../../firebase";
import { isCloudinaryImageUploadConfigured, uploadImageToCloudinary } from "../../utils/cloudinaryUpload";
import type { CourseFileType } from "../types/course";
import {
  MY_COURSE_DESC_MAX,
  MY_COURSE_MAX_COVER_BYTES,
  MY_COURSE_TITLE_MAX,
  MY_MODULE_DESC_MAX,
  MY_MODULE_TITLE_MAX,
  MY_RESOURCE_DESC_MAX,
  MY_RESOURCE_NAME_MAX,
  type MyCourse,
  type MyCourseModule,
  type MyCourseQuestion,
  type MyCourseResource,
} from "../types/myCourse";

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

export const createMyResource = (type: CourseFileType = "youtube"): MyCourseResource => {
  const timestamp = now();
  return {
    id: newId("res"),
    name: "",
    type,
    url: "",
    description: "",
    source: "link",
    ...(type === "brain" ? { practiceTitle: "", practiceQuestions: [createMyQuestion()] } : {}),
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
  const type = String(source.type || "embed") as CourseFileType;
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
    practiceQuestions: type === "brain" ? questions : undefined,
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
  return onSnapshot(
    collection(db, "users", uid, MY_COURSES_COLLECTION),
    (snapshot) => {
      const courses = snapshot.docs
        .map((entry) => parseMyCourse(entry.data(), uid))
        .filter((course): course is MyCourse => Boolean(course))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      onData(courses);
    },
    (error) => onError?.(error instanceof Error ? error : new Error(String(error))),
  );
}

/** Create or overwrite one course document. Resolves after the write commits. */
export async function saveMyCourse(uid: string, course: MyCourse): Promise<void> {
  if (!uid) throw new Error("Please sign in to save your course.");
  const clean = sanitizeMyCourse(course);
  const payload = {
    ...clean,
    uid,
    createdAt: clean.createdAt || now(),
    updatedAt: now(),
    updatedAtServer: serverTimestamp(),
  };
  await setDoc(courseRef(uid, clean.id), payload, { merge: true });
}

export async function deleteMyCourse(uid: string, courseId: string): Promise<void> {
  if (!uid) throw new Error("Please sign in to delete your course.");
  await deleteDoc(courseRef(uid, courseId));
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
