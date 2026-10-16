// src/course/blockPages.ts
//
// THE BLOCK PAGE CATALOG — every page of the Course Player, free to live in
// any block of the tablet/desktop plus deck. The owner's 2026-10-16+ brief:
//
//   "abhi uske andar content mention hai notes mind map, ityadi — abhi kuchh
//    bhi content mention nahin hoga, sirf ek blank page se start hoga aur us
//    blank page mein course player ke sabhi pages hon, user koi bhi page kisi
//    bhi block mein open kar sakta hai."
//
// So a block starts EMPTY (the white picker) and the learner opens whichever
// course player page they want in it — independently of the other blocks.
// The keys double as the navigation's DockTab keys where a nav tab exists,
// so a footer-navigation tap and a block pick name the same page.

import type { ComponentType, CSSProperties } from "react";
import {
  Brain,
  BookOpen,
  FileText,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  Music,
  Network,
  NotebookPen,
  PanelLeft,
  PenLine,
  PlayCircle,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { AiTabIcon } from "./studyTabIcons";

/**
 * Every page that can sit in a block:
 *
 *   · "lesson"    — the video / lesson viewer (the player pane);
 *   · "personal"  — My Modules (the learner's own course tree);
 *   · every other key is one of the navigation's own tabs.
 */
export type BlockPageKey =
  | "lesson"
  | "personal"
  | "modules"
  | "notes"
  | "mindmap"
  | "sketch"
  | "read"
  | "music"
  | "brain"
  | "experiment"
  | "ai"
  | "player"
  | "paid";

export interface BlockPageRecord {
  key: BlockPageKey;
  /** The picker button label — the course player's own vocabulary. */
  label: string;
  /** One quiet line under the label. */
  hint: string;
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  /** The page's own vibrant accent — the selection page's card colour. */
  accent: string;
  /** A second stop for the card tile's gradient. */
  accentTo: string;
}

/**
 * The catalog, in the order the picker lists them: the lesson first, then the
 * navigation's own order (see TABS), then the learner's own tree and the
 * settings page at the end.
 */
export const BLOCK_PAGE_ORDER: readonly BlockPageKey[] = [
  "lesson",
  "modules",
  "notes",
  "mindmap",
  "sketch",
  "read",
  "music",
  "brain",
  "experiment",
  "ai",
  "paid",
  "personal",
  "player",
] as const;

export const BLOCK_PAGES: readonly BlockPageRecord[] = [
  { key: "lesson", label: "Lesson", hint: "Video / lesson viewer", icon: PlayCircle, accent: "#6366f1", accentTo: "#8b5cf6" },
  { key: "modules", label: "Module", hint: "Lessons on a connected path", icon: BookOpen, accent: "#2563eb", accentTo: "#38bdf8" },
  { key: "notes", label: "Note", hint: "Your private writing pad", icon: NotebookPen, accent: "#f59e0b", accentTo: "#f97316" },
  { key: "mindmap", label: "Mind map", hint: "Is module ka apna diagram", icon: Network, accent: "#8b5cf6", accentTo: "#d946ef" },
  { key: "sketch", label: "Sketch", hint: "Lecture ke saath likhein", icon: PenLine, accent: "#ec4899", accentTo: "#f43f5e" },
  { key: "read", label: "Read", hint: "PDFs and reading links", icon: FileText, accent: "#10b981", accentTo: "#34d399" },
  { key: "music", label: "Music", hint: "Course music and links", icon: Music, accent: "#06b6d4", accentTo: "#3b82f6" },
  { key: "brain", label: "Brain", hint: "Practice sets — apna Brain test", icon: Brain, accent: "#f43f5e", accentTo: "#fb7185" },
  { key: "experiment", label: "Experiment", hint: "Interactive 2D experiments", icon: FlaskConical, accent: "#14b8a6", accentTo: "#22d3ee" },
  { key: "ai", label: "AI", hint: "AI study buddy", icon: AiTabIcon, accent: "#7c3aed", accentTo: "#6366f1" },
  { key: "paid", label: "Paid", hint: "Upgrades still locked", icon: ShoppingBag, accent: "#0ea5e9", accentTo: "#6366f1" },
  { key: "personal", label: "My Modules", hint: "Apna course tree", icon: GraduationCap, accent: "#a855f7", accentTo: "#ec4899" },
  { key: "player", label: "Player settings", hint: "Is course ka player page", icon: Settings, accent: "#475569", accentTo: "#64748b" },
];

export const BLOCK_PAGE_BY_KEY: Readonly<Record<BlockPageKey, BlockPageRecord>> = Object.fromEntries(
  BLOCK_PAGES.map((record) => [record.key, record]),
) as Readonly<Record<BlockPageKey, BlockPageRecord>>;

/** The picker's catalog minus the tabs this course hides. */
export function blockPagesFor(hiddenTabs: readonly string[]): BlockPageRecord[] {
  return BLOCK_PAGES.filter((record) => !hiddenTabs.includes(record.key));
}

/** The picker's own solid-color mark (white page, blue accents). */
export const BlockPickerIcon = LayoutGrid;
export const BlockPickerSparkIcon = Sparkles;
export const BlockPickerPanelIcon = PanelLeft;

/**
 * Which block owns a page right now — a page lives in at most one block, so
 * picking it elsewhere MOVES it ("user koi bhi page kisi bhi block mein open
 * kar sakta hai") instead of fighting over one shared panel.
 */
export function findBlockOwningPage(
  pages: Partial<Record<string, string | null>> | undefined,
  page: BlockPageKey,
): string | null {
  if (!pages) return null;
  for (const [pane, assigned] of Object.entries(pages)) {
    if (assigned === page) return pane;
  }
  return null;
}
