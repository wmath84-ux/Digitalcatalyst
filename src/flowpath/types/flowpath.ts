export type ActivityType =
  | "task"
  | "reminder"
  | "schedule"
  | "note"
  | "revision"
  | "mcq"
  | "other";

export type ActivityStatus = "upcoming" | "current" | "completed" | "overdue";

export type Priority = "low" | "medium" | "high";

export interface BaseActivity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  /** ISO datetime this activity is scheduled/due for */
  datetime: string;
  /** short human label e.g. "Today · 7:00 PM" */
  timeLabel: string;
  createdAt: number;
  completedAt?: number;
  order: number;
}

export interface TaskActivity extends BaseActivity {
  type: "task";
  priority: Priority;
}

export interface ReminderActivity extends BaseActivity {
  type: "reminder";
}

export interface ScheduleActivity extends BaseActivity {
  type: "schedule";
  startLabel: string;
  endLabel: string;
}

export interface NoteActivity extends BaseActivity {
  type: "note";
  preview: string;
}

export interface RevisionActivity extends BaseActivity {
  type: "revision";
  progress: number;
}

export interface McqActivity extends BaseActivity {
  type: "mcq";
  totalQuestions: number;
  completedQuestions: number;
}

export interface OtherActivity extends BaseActivity {
  type: "other";
}

export type Activity =
  | TaskActivity
  | ReminderActivity
  | ScheduleActivity
  | NoteActivity
  | RevisionActivity
  | McqActivity
  | OtherActivity;

export interface ActivityWithStatus {
  activity: Activity;
  status: ActivityStatus;
}

/* ------------------------------------------------------------------ */
/*  FlowPath activity = the master shape the dashboard reads.       */
/*  Mirrors api/_lib/flowpathControl.ts so the client and server     */
/*  always agree on the field names. Activities written by the user   */
/*  on the My Day or Revision pages are mirrored into this collection */
/*  by the server multiplexer, so the dashboard sees the full        */
/*  picture regardless of which surface created the item.             */
/* ------------------------------------------------------------------ */

export type FlowPathActivityKind = ActivityType;
export type FlowPathActivityStatus = "draft" | "active" | "completed" | "cancelled" | "overdue";
export type FlowPathRecurrence = {
  freq: "daily" | "weekly" | "monthly";
  byDay?: number[];
  until?: number;
};

export interface FlowPathActivity {
  id: string;
  uid: string;
  kind: FlowPathActivityKind;
  title: string;
  description?: string;
  /** epoch ms in UTC. null = "no scheduled time, just visible". */
  scheduledFor: number | null;
  recurrence?: FlowPathRecurrence;
  durationMinutes?: number;
  status: FlowPathActivityStatus;
  progress?: number;
  completedAt?: number;
  // My Day fields
  taskPriority?: "low" | "medium" | "high";
  taskSubject?: string;
  taskStatus?: "pending" | "in-progress" | "completed";
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleType?: "class" | "study" | "break" | "personal" | "exam";
  noteColor?: "amber" | "sky" | "rose" | "emerald" | "violet";
  reminderTime?: string;
  // Revision fields
  testConfig?: {
    classIds?: number[];
    subjectIds?: number[];
    topicIds?: number[];
    chapterIds?: number[];
    totalQuestions: number;
    difficulty: "easy" | "medium" | "hard" | "mixed";
    questionMode: "theory" | "application" | "mixed";
    estimatedMinutes: number;
  };
  testId?: number;
  // Provenance
  source: "user" | "admin" | "ai";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  batchId?: string;
  batchIndex?: number;
  // Delivery stats from the most recent dispatch (filled by the
  // server so the audit feed can show "FCM: 1 / Web: 1" alongside
  // the entry).
  lastDelivery?: {
    fcm?: number;
    web?: number;
    localAlarm?: boolean;
    immediate?: boolean;
  };
  scheduledJobId?: string | null;
}

export const ACTIVITY_TYPE_META: Record<
  ActivityType,
  { label: string; color: string; glow: string }
> = {
  task: { label: "Task", color: "#8b7bff", glow: "rgba(139,123,255,0.55)" },
  reminder: { label: "Reminder", color: "#f5b969", glow: "rgba(245,185,105,0.55)" },
  schedule: { label: "Schedule", color: "#5eead4", glow: "rgba(94,234,212,0.5)" },
  note: { label: "Note", color: "#c084fc", glow: "rgba(192,132,252,0.5)" },
  revision: { label: "Revision", color: "#60a5fa", glow: "rgba(96,165,250,0.5)" },
  mcq: { label: "MCQ", color: "#34d399", glow: "rgba(52,211,153,0.5)" },
  other: { label: "Other", color: "#fb7185", glow: "rgba(251,113,133,0.5)" },
};
