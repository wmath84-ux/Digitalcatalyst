import type { QuickNote, Reminder, ScheduleEvent, Task } from "../types";

export const initialTasks: Task[] = [
  {
    id: "t1",
    title: "Finish Physics Ch.5 numericals",
    subject: "Physics",
    time: "09:00 AM",
    priority: "high",
    status: "in-progress",
  },
  {
    id: "t2",
    title: "Revise Organic Chemistry reactions",
    subject: "Chemistry",
    time: "11:30 AM",
    priority: "medium",
    status: "pending",
  },
  {
    id: "t3",
    title: "Submit English essay draft",
    subject: "English",
    time: "01:00 PM",
    priority: "high",
    status: "pending",
  },
  {
    id: "t4",
    title: "Practice 20 mental-math problems",
    subject: "Mathematics",
    time: "04:00 PM",
    priority: "low",
    status: "completed",
  },
  {
    id: "t5",
    title: "Watch recorded Biology lecture",
    subject: "Biology",
    time: "07:00 PM",
    priority: "medium",
    status: "completed",
  },
];

export const initialSchedule: ScheduleEvent[] = [
  {
    id: "e1",
    title: "Morning Study Block",
    detail: "Physics — Mechanics revision",
    startTime: "07:00",
    endTime: "08:00",
    type: "study",
  },
  {
    id: "e2",
    title: "Live Class: Chemistry",
    detail: "Organic Reactions with Mr. Sharma",
    startTime: "09:30",
    endTime: "10:30",
    type: "class",
  },
  {
    id: "e3",
    title: "Short Break",
    detail: "Stretch, hydrate, relax",
    startTime: "10:30",
    endTime: "10:45",
    type: "break",
  },
  {
    id: "e4",
    title: "Live Class: Mathematics",
    detail: "Trigonometric identities",
    startTime: "11:00",
    endTime: "12:00",
    type: "class",
  },
  {
    id: "e5",
    title: "Lunch & Recharge",
    startTime: "13:00",
    endTime: "14:00",
    type: "personal",
  },
  {
    id: "e6",
    title: "Mock Test: Biology",
    detail: "Chapter 4-6 timed test",
    startTime: "15:00",
    endTime: "16:00",
    type: "exam",
  },
  {
    id: "e7",
    title: "Evening Study Block",
    detail: "English essay writing",
    startTime: "18:30",
    endTime: "19:30",
    type: "study",
  },
];

export const initialNotes: QuickNote[] = [
  {
    id: "n1",
    text: "Ask Priya for Chemistry notes on aldehydes. She mentioned she has detailed diagrams for all the reaction mechanisms that will be helpful for the upcoming test.",
    createdAt: Date.now() - 1000 * 60 * 60,
    color: "amber",
  },
  {
    id: "n2",
    text: "Bring calculator for tomorrow's math test.",
    createdAt: Date.now() - 1000 * 60 * 30,
    color: "sky",
  },
  {
    id: "n3",
    text: "Idea: make flashcards for biology diagrams. I can use different colors for different organ systems - blue for circulatory, red for respiratory, green for digestive. This will help memorize the diagrams faster and connect related concepts together visually.",
    createdAt: Date.now() - 1000 * 60 * 10,
    color: "violet",
  },
  {
    id: "n4",
    text: "Physics formula to remember: F = ma (Newton's Second Law). Also review projectile motion equations before the mock test.",
    createdAt: Date.now() - 1000 * 60 * 5,
    color: "emerald",
  },
  {
    id: "n5",
    text: "Schedule call with study group on Saturday evening to discuss chapter 7 problems.",
    createdAt: Date.now() - 1000 * 60 * 2,
    color: "rose",
  },
];

export const initialReminders: Reminder[] = [
  {
    id: "r1",
    text: "Drink water – stay hydrated!",
    time: "10:00",
    done: false,
    createdAt: Date.now() - 1000 * 60 * 120,
  },
  {
    id: "r2",
    text: "Call Mom at lunch break",
    time: "13:30",
    done: false,
    createdAt: Date.now() - 1000 * 60 * 90,
  },
  {
    id: "r3",
    text: "Submit library book before 5 PM",
    time: "16:45",
    done: false,
    createdAt: Date.now() - 1000 * 60 * 60,
  },
];
