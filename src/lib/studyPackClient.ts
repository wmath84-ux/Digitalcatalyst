import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";

export type StudyPackVisibility = "private" | "unlisted" | "public";

export interface StudyPackPreview {
  id: string;
  title: string;
  description: string;
  visibility: StudyPackVisibility;
  version: number;
  createdAt: number;
  updatedAt: number;
  creatorDisplayName: string;
  resourceCount: number;
  typeCounts: Record<string, number>;
  moduleTitle?: string;
  resources: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    sortOrder: number;
    availability?: { readable: boolean; reason: string };
  }>;
  isOwner: boolean;
  aiStudyAvailable: boolean;
}

type Envelope<T> = { ok?: boolean; data?: T; error?: string; message?: string; code?: string };

export class StudyPackApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "STUDY_PACK_ERROR", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const requestId = () => {
  try { return crypto.randomUUID(); } catch { return `web_${Date.now()}`; }
};

async function request<T>(action: string, payload: Record<string, unknown> = {}, authRequired = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  } else if (authRequired) {
    throw new StudyPackApiError("Please log in to continue.", "AUTH_REQUIRED", 401);
  }
  const response = await apiFetch("/api/personal-course", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, requestId: requestId(), ...payload }),
  });
  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok || !body.ok || body.data === undefined) {
    throw new StudyPackApiError(body.message || body.error || "Study Pack request failed.", body.code || "STUDY_PACK_ERROR", response.status);
  }
  return body.data;
}

export const fetchStudyPack = (packId: string) => request<{ pack: StudyPackPreview }>("studyPack.get", { packId }, false);
export const discoverStudyPacks = () => request<{ packs: StudyPackPreview[] }>("studyPack.discover", {}, false);
export const listMyStudyPacks = () => request<{ packs: StudyPackPreview[] }>("studyPack.mine");
export const createStudyPack = (payload: {
  moduleId: string;
  title: string;
  description?: string;
  visibility?: StudyPackVisibility;
  resourceIds?: string[];
}) => request<{ pack: StudyPackPreview; sharePath: string }>("studyPack.create", payload);
export const updateStudyPack = (payload: { packId: string; title?: string; description?: string; visibility?: StudyPackVisibility; refresh?: boolean }) =>
  request<{ pack: StudyPackPreview }>("studyPack.update", payload);
export const deleteStudyPack = (packId: string) => request<{ deleted: boolean }>("studyPack.delete", { packId });
export const importStudyPack = (payload: {
  packId: string;
  destination: "new" | "existing";
  moduleId?: string;
  title?: string;
  description?: string;
}) => request<{ imported: number; skipped: number; moduleId: string | null; alreadyExists?: boolean }>("studyPack.import", payload);
export const createStudyStack = (payload: { moduleId: string; title: string; resourceIds?: string[]; includePractice?: boolean }) =>
  request<{ stack: { id: string; title: string; moduleId: string; steps: Array<{ resourceId: string; storageModuleId: string; name: string; type: string; kind: string }> } }>("studyStack.create", payload);
export const listStudyStacks = () => request<{ stacks: Array<{ id: string; title: string; moduleId: string; steps: unknown[] }> }>("studyStack.list");

export const studyPackShareUrl = (packId: string) => {
  if (typeof window === "undefined") return `#/pack/${packId}`;
  return `${window.location.origin}${window.location.pathname}#/pack/${encodeURIComponent(packId)}`;
};
