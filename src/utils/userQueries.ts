// src/utils/userQueries.ts
//
// Client for the Sticker Wall's user queries (api/_lib/userQueries.ts).
// A learner drops a note on the home page wall → it becomes a query; the
// owner answers it from #/queries and the reply is emailed to the sender.

import { apiFetch } from "./apiBase";

export type UserQuery = {
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

const authHeaders = async (): Promise<Record<string, string>> => {
  try {
    const { auth } = await import("../../firebase");
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const post = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const response = await apiFetch("/api/referral-leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!response.ok || data.ok === false) throw new Error(data.error || "Request failed.");
  return data;
};

export const createUserQuery = (message: string) =>
  post<{ query: UserQuery }>("queries.create", { message }).then((r) => r.query);

export const listUserQueries = () =>
  post<{ owner: boolean; queries: UserQuery[] }>("queries.list");

export const replyToUserQuery = (id: string, reply: string) =>
  post<{ emailed: boolean; emailStatus: string; query: UserQuery }>("queries.reply", { id, reply });
