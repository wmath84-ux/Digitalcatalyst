export type TaskStatus = "pending" | "in-progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  subject?: string;
  time?: string;
  priority: TaskPriority;
  status: TaskStatus;
}

export type EventType = "class" | "study" | "break" | "personal" | "exam";

export interface ScheduleEvent {
  id: string;
  title: string;
  detail?: string;
  startTime: string; // "HH:MM" 24h
  endTime: string;   // "HH:MM" 24h
  type: EventType;
}

export interface QuickNote {
  id: string;
  text: string;
  createdAt: number;
  color: NoteColor;
}

export type NoteColor = "amber" | "sky" | "rose" | "emerald" | "violet";

export interface Reminder {
  id: string;
  text: string;
  time: string;       // "HH:MM" 24h
  done: boolean;
  createdAt: number;
}
