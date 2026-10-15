// src/work/workPages.ts
//
// WORK MODE's page registry — the ONE list of destinations the environment has.
//
// Owner brief (2026-10-14):
//
//   "Work per click karne per ek naya environment open hoga jahan per apna
//    course player ka mind map, notes, sketch, AI, my day aur revision — itni
//    sari cheezen ek jagah hongi."
//   "[uiverse great-badger-21] footer navigation ka yah naya design add kiya
//    jaaye aur ismein button ko replace kiya jaaye aur sabhi button add kiye
//    jaayen."
//
// So the registry is the contract three surfaces read:
//
//   · WorkFooterNav  — the pill's cells (order, icon, colour, aria label);
//   · WorkDeck       — which page each split slot renders;
//   · WorkApp        — the `#/work/<page>` deep link + the remembered last page.
//
// Labels, colours and icons are lifted from the Course Player's own `TABS`
// (src/course/CourseOverlay.tsx) so the two environments read as one product:
// Notes is the same blue with the same pen, Mind map the same violet with the
// same network glyph, Sketch the same orange. Only the destinations the brief
// does not ask for (Modules, Paid, Experiment, Read, Music, Player) are absent —
// requirement 17: "annecessary button aur cheezein remove kar dena".

import type { ComponentType, CSSProperties } from "react";
import { CalendarDays, Network, NotebookPen, PenLine, Sparkles } from "lucide-react";
import { AiTabIcon } from "../course/studyTabIcons";

/** Every page the Work environment can show in a split slot. */
export type WorkPageId = "myday" | "notes" | "mindmap" | "sketch" | "ai" | "revision";

/** The icon shape both the pill nav and the deck accept (GlassDock's own). */
export type WorkPageIcon = ComponentType<{
  size?: number;
  className?: string;
  style?: CSSProperties;
}>;

export interface WorkPageRecord {
  id: WorkPageId;
  /** The pill's short label (aria-label + title). */
  label: string;
  /** The page's own heading, shown in its fixed header AREA. */
  heading: string;
  /** One line of copy for the page's empty state / tooltip. */
  hint: string;
  /** Plate accent — the Course Player's own colour for the same tool. */
  color: string;
  icon: WorkPageIcon;
  /**
   * A page that is a WRITING surface tells the deck that a soft keyboard
   * deserves the whole screen (the player's `keyboardExpandEnabled` rule).
   */
  writing?: boolean;
}

export const WORK_PAGES: WorkPageRecord[] = [
  {
    id: "myday",
    label: "My Day",
    heading: "My Day",
    hint: "Tasks, schedule and reminders — planned on this device",
    color: "#06D6A0",
    icon: CalendarDays,
    writing: true,
  },
  {
    id: "notes",
    label: "Notes",
    heading: "Notes",
    hint: "Your private writing pad",
    color: "#3A86FF",
    icon: NotebookPen,
    writing: true,
  },
  {
    id: "mindmap",
    label: "Mind map",
    heading: "Mind map",
    hint: "Draw the whole idea as one diagram",
    color: "#B388FF",
    icon: Network,
    writing: true,
  },
  {
    id: "sketch",
    label: "Sketch",
    heading: "Sketch",
    hint: "Freehand board — pen, colour and shapes",
    color: "#F97316",
    icon: PenLine,
    writing: true,
  },
  {
    id: "ai",
    label: "AI",
    heading: "AI",
    hint: "Ask, summarise and generate from your own work",
    color: "#22D3EE",
    icon: AiTabIcon,
    writing: true,
  },
  {
    id: "revision",
    label: "Revision",
    heading: "Revision",
    hint: "Make revision sets, study them, keep them here",
    color: "#34D399",
    icon: Sparkles,
  },
];

/** The pill's order — the same array the deck's keyboard shortcuts follow. */
export const WORK_PAGE_ORDER: WorkPageId[] = WORK_PAGES.map((page) => page.id);

const FALLBACK = WORK_PAGES[0];

/** The record for an id, falling back to the first page for anything unknown. */
export const workPageRecord = (id: WorkPageId | string | null | undefined): WorkPageRecord =>
  WORK_PAGES.find((page) => page.id === id) ?? FALLBACK;

/** True for ids this registry owns — the deep-link guard. */
export const isWorkPageId = (value: unknown): value is WorkPageId =>
  typeof value === "string" && WORK_PAGE_ORDER.includes(value as WorkPageId);

/**
 * `#/work/<page>` → the page id. Anything else (`#/work`, `#/work/`,
 * `#/work?x=1`, an unknown page) is `null`, i.e. "restore the last page".
 */
export const workPageFromHash = (hash: string): WorkPageId | null => {
  const raw = String(hash || "");
  if (!raw.startsWith("#/work")) return null;
  const rest = raw.slice("#/work".length).split("?")[0].replace(/^\/+/, "");
  const first = rest.split("/")[0];
  return isWorkPageId(first) ? (first as WorkPageId) : null;
};

/** The hash for a page — the one way Work destinations are addressed. */
export const workHashFor = (id: WorkPageId): string => `#/work/${id}`;
