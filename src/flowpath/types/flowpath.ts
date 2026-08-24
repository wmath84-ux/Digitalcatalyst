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
