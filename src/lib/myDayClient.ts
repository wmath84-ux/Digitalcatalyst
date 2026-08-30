import { auth } from "../../firebase";
import type { QuickNote, Reminder, ScheduleEvent, Task } from "../types";

export type MyDayCloudData = {
  tasks: Task[];
  schedule: ScheduleEvent[];
  notes: QuickNote[];
  reminders: Reminder[];
};

export type MyDayAccessSnapshot = {
  paid: boolean;
  paidExpiresAt: number;
  unlimited: boolean;
  featureConfigured: boolean;
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  canCreate: boolean;
  dayKey: string;
  resetAt: number;
  timeZone: string;
  // Phase-1: server echoes whether the feature is currently in "hide"
  // mode AND the user is not a subscriber. The hook mirrors this so the
  // rail / nav can remove the My Day entry on the client.
  hidden?: boolean;
};

type MyDayResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  access?: MyDayAccessSnapshot;
  data?: MyDayCloudData;
};

export class MyDayApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "MYDAY_ERROR", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
};

async function request(action: "myday.status" | "myday.save", data?: Partial<MyDayCloudData>, metadata?: { tzOffsetMinutes?: number }) {
  const user = auth.currentUser;
  if (!user) throw new MyDayApiError("Please log in to use My Day.", "AUTH_REQUIRED", 401);
  const token = await user.getIdToken();
  const response = await fetch("/api/myday", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, data, timeZone: browserTimeZone(), tzOffsetMinutes: metadata?.tzOffsetMinutes ?? new Date().getTimezoneOffset() }),
  });
  const payload = await response.json().catch(() => ({})) as MyDayResponse;
  if (!response.ok || !payload.ok || !payload.access || !payload.data) {
    throw new MyDayApiError(payload.error || "Could not update My Day.", payload.code || "MYDAY_ERROR", response.status);
  }
  return { access: payload.access, data: payload.data };
}

export const fetchMyDayStatus = () => request("myday.status");
export const saveMyDayData = (data: Partial<MyDayCloudData>, metadata?: { tzOffsetMinutes?: number }) => request("myday.save", data, metadata);
