// src/course/CourseOverlay.tsx
//
// Course Player footer navigation + study tabs.
//
// The player is SPLIT-ONLY now (owner's direction): the old right-side Glass
// Sheet "sidebar" mode is gone and there is no enable/disable toggle — the
// whole player is two glass panes (lesson + study) with the footer dock
// living INSIDE the study pane. This component is exactly that study pane's
// content: the active tab's body and the footer dock. There is no header row
// anywhere in the pane — every tab starts at its very first pixel.
//
// The footer IS the home page footer navigation (src/components/glass-dock/
// GlassDock.tsx, the same component src/components/BottomNav.tsx renders):
// identical frosted AI-Canvas panel, identical entrance spring, identical
// per-item stagger, identical distance-based magnification, identical tinted
// icon plates + frosted tooltips. A tap on a different tab swaps the pane's
// content in place; a tap on the ACTIVE tab peek-collapses the pane (the
// Split Deck's own toggleStudy gesture). There is NO sliding indicator and
// NO live content swap while the finger moves.
//
// Inside the pane each list tab (Modules / Paid) is a vertical
// column of dock-style buttons (same 44 px tinted plates, same magnify wave,
// same active glow). The list is scroll-snapped to the buttons: after the
// user has scrolled, lifting the finger fires the button the finger settled
// on (the one closest to the list centre). A plain tap clicks the button
// under it as usual. No sliding content animations.
//
//   - Modules   → every unlocked module (expandable to its files).
//   - Brain     → the practice sets the admin imported for this course's
//                 modules (resource type "Brain · practice set"), rendered as
//                 the revision test-taking page (src/course/CourseBrainPanel).
//   - Notes     → the notes panel.
//   - Mind map  → the per-module mind map panel.
//   - AI        → dummy button for now (functionality lands later).
//   - Paid      → purchasable updates + locked paid modules.
//   - Player    → the course identity, progress / mark-complete, the ACTIVE
//                 file's own buttons (open / download / fullscreen / editor /
//                 personal-access gate) and every player preference — everything the
//                 old player header + ⚙ settings popover carried, in one list.

import {
  useMemo,
  useRef,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { DEFAULT_MODULE_LISTING_STYLE } from "./playerPreferences";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { BookOpen, Brain, FileText, FlaskConical, Network, NotebookPen, PenLine, ShoppingBag, Sparkles } from "lucide-react";
import { collectAccessibleReadResources } from "../../utils/readResources.js";
import ReadLibraryPanel from "./ReadLibraryPanel";
import type { ReadUpload } from "../../utils/readUploads.js";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "../types/course";
import { collectMasterCourseNotes } from "./masterNotes";
import type { PersonalCourseModule } from "../types/personalCourse";
import NotesPanel from "./NotesPanel";
import GlassDock, { type GlassDockItem } from "../components/glass-dock/GlassDock";
import { EASE_OUT_MOTION } from "./splitMotion";
import { useCourseKeyboard } from "./useCourseKeyboard";
import { AiTabIcon } from "./studyTabIcons";

export type DockTab = "modules" | "brain" | "notes" | "mindmap" | "ai" | "paid" | "player" | "experiment" | "sketch" | "read";
export type DockOrientation = "portrait" | "landscape";

type FlatModule = { module: CourseModule; depth: number };

const flattenModules = (modules: CourseModule[], depth = 0): FlatModule[] =>
  modules.flatMap((module) => [{ module, depth }, ...flattenModules(module.modules || [], depth + 1)]);

const isPaidLocked = (module: CourseModule, ownedUpdateIds: Set<string>) =>
  module.accessLevel === "paidUpdate" && Boolean(module.paidUpdateId) && !ownedUpdateIds.has(String(module.paidUpdateId));

// ── Dock-style list rows — the home footer's look, exactly ───────────────
// 44 px tinted icon plates (`${color}18` fill, `${color}22` border, radius
// 12), the same distance magnification (MAG_RANGE 120 / MAG_SCALE 1.55,
// spring 300/22/0.5, −12 px lift) and the same active treatment (deeper
// tint + soft glow) as the footer navigation's icon buttons.
const ROW_ICON_SIZE = 44;
const ROW_MAG_RANGE = 120;
const ROW_MAG_SCALE = 1.55;

type SheetRowKind = "module" | "file" | "update" | "buy" | "personal-entry";

interface SheetRowSpec {
  id: string;
  kind: SheetRowKind;
  icon: ReactNode;
  color: string;
  title: string;
  subtitle?: string;
  /** Selected file / module holding it — violet plate + glow, like the dock's active tab. */
  selected?: boolean;
  extra?: ReactNode;
  /**
   * When set the row is a real button: a TAP opens it, scrolling never does
   * (see `SnapList`).
   */
  press?: () => void;
  dataAttrs?: Record<string, string | number | undefined>;
}

function SheetRow({
  spec,
  pointerY,
}: {
  spec: SheetRowSpec;
  pointerY: MotionValue<number>;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const distance = useTransform(pointerY, (p: number) => {
    const el = ref.current;
    if (!el || p < -5000) return 200;
    const rect = el.getBoundingClientRect();
    return Math.abs(p - (rect.top + rect.height / 2));
  });
  const rawSize = useTransform(distance, [0, ROW_MAG_RANGE], [ROW_ICON_SIZE * ROW_MAG_SCALE, ROW_ICON_SIZE]);
  const size = useSpring(rawSize, { stiffness: 300, damping: 22, mass: 0.5 });
  const shift = useTransform(size, [ROW_ICON_SIZE, ROW_ICON_SIZE * ROW_MAG_SCALE], [0, -12]);

  const color = spec.selected ? "#B388FF" : spec.color;
  const interactive = Boolean(spec.press);

  // The row has ONE gesture: a plain press. (The old double-tap-to-split
  // gesture is gone — the split's two sides are swapped from the divider's
  // own switch button instead, see src/course/studyPanels.tsx.)
  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={interactive ? () => spec.press?.() : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      aria-pressed={spec.selected || undefined}
      className={`relative flex w-full snap-center items-center gap-3 rounded-2xl px-2 py-2 text-left ${
        interactive ? "cursor-pointer" : "cursor-default"
      }`}
      data-course-sheet-row
      data-row-id={spec.id}
      data-row-kind={spec.kind}
      data-selected={spec.selected ? "true" : "false"}
      {...spec.dataAttrs}
    >
      {/* Icon plate — the dock's plate in a fixed 44 px slot; it magnifies
          and lifts over the slot instead of reflowing the label. */}
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <motion.span
          className="flex items-center justify-center"
          style={{
            width: size,
            height: size,
            y: shift,
            background: spec.selected ? `${color}30` : `${color}18`,
            border: spec.selected ? `1px solid ${color}55` : `1px solid ${color}22`,
            borderRadius: 12,
            boxShadow: spec.selected ? `0 0 16px ${color}44` : "none",
          }}
        >
          <span className="flex items-center justify-center" style={{ color }}>
            {spec.icon}
          </span>
        </motion.span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black text-white/90">{spec.title}</span>
        {spec.subtitle ? (
          <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]" data-row-subtitle>{spec.subtitle}</span>
        ) : null}
      </span>
      {spec.extra ? <span className="flex shrink-0 items-center gap-1.5">{spec.extra}</span> : null}
    </motion.button>
  );
}

/**
 * The sheet's vertical button list — a PLAIN scrollable column.
 *
 * Owner brief, 2026-09-28:
 *
 *   "Course player ke andar hi module library scroll karte waqt, without
 *    clicking, scroll karte during the scrolling click ho jata hai — isko fix
 *    karo."
 *
 * What the list used to do: the moment a scroll settled (`scrollend`, a 140 ms
 * idle fallback, and the pointer-up path on top) it fired the row closest to
 * the list centre — "lift the finger on a button and that button is clicked".
 * On a phone that is a phantom tap: the learner scrolls the module library to
 * read it, and a module expands or a file opens on its own, mid-scroll scroll
 * being the ONLY thing the finger did.
 *
 * So it is gone. A row is opened by a real tap on it and by nothing else: the
 * `<button>`'s own `onClick` is the one and only press path. What stays is
 * everything that never opened anything — the rows are still dock-style
 * buttons, the icon plate still magnifies under the pointer (the wave), the
 * list still scroll-snaps (which changes where it RESTS, never what it opens),
 * and a plain tap still presses the button under the finger.
 */
function SnapList({
  rows,
  empty,
  dataAttrs,
  moduleListingStyle = DEFAULT_MODULE_LISTING_STYLE,
}: {
  rows: SheetRowSpec[];
  empty?: ReactNode;
  dataAttrs?: Record<string, string | number | undefined>;
  moduleListingStyle?: "classic" | "modern";
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const pointerY = useMotionValue(-10000);

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-xs text-[var(--course-muted)]" data-course-overlay-empty>
        {empty}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className={`h-full snap-y snap-proximity overflow-y-auto overscroll-contain px-2 py-3 ${moduleListingStyle === "classic" ? "classic-module-list" : ""}`}
      onPointerMove={(event) => pointerY.set(event.clientY)}
      onPointerLeave={() => pointerY.set(-10000)}
      {...dataAttrs}
    >
      <div className="relative space-y-1.5">
        {rows.map((spec) => (
          <SheetRow key={spec.id} spec={spec} pointerY={pointerY} />
        ))}
      </div>
    </div>
  );
}

interface CourseOverlayProps {
  orientation: DockOrientation;
  tab: DockTab;
  /** Tap a different tab: swap the pane's content in place. Tap the ACTIVE
   *  tab: the Split Deck peek-collapses the study pane (its toggleStudy). */
  onTabChange: (tab: DockTab) => void;
  modules: CourseModule[];
  courseTitle?: string;
  /** Already-loaded learner-owned hierarchy for personal-resource notes. */
  personalModules?: PersonalCourseModule[];
  /** Product document id binds Read uploads and page-position storage. */
  productId?: string;
  selectedFileId?: string;
  ownedUpdateIds: Set<string>;
  accessibleModuleIds: Set<string>;
  accessibleResourceIds: Set<string>;
  previewModuleIds: Set<string>;
  /** Master library is only sourced from the official product tree. */
  masterNotesEnabled?: boolean;
  /** Module listing style — classic (simple list) vs modern (magnifying icons). */
  moduleListingStyle?: "classic" | "modern";
  updates: PaidCourseUpdate[];
  moduleTitleById: Record<string, string>;
  onSelectFile: (file: CourseFile) => void;
  onBuyModule: (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => void;
  onBuyUpdate: (update: PaidCourseUpdate) => void;
  // Notes wiring
  notes: CoursePlayerNote[];
  onAddNote: (text: string) => void;
  onEditNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  onLinkNote: (id: string, links: string[]) => void;
  /** The notes hook's live state — drives editor sync state and library errors. */
  notesSync?: {
    status: "idle" | "loading" | "ready" | "saving" | "saved" | "error";
    synced: boolean;
    errorMessage?: string | null;
  };
  onRetryNotes?: () => void;
  // Mind map wiring. The panel itself is owned by the parent (it holds the
  // Firestore hook), so the pane only hosts it — this keeps the overlay
  // presentational and lets the map survive tab switches.
  mindMapPanel?: ReactNode;
  // The Sketch tab's Excalidraw board, owned by the parent exactly like the
  // mind map: the player holds the scene + its Firestore hook, so the board
  // survives every tab switch even though the editor itself only mounts
  // while its tab is active.
  sketchPanel?: ReactNode;
  /**
   * Read tab → "Add to my module": the panel hands back the learner's own
   * uploaded PDF and the PARENT opens the existing Add-to-My-Module dialog
   * (the same one the Player settings use). Optional — the tab works without
   * it, it just loses that action.
   */
  onAddReadUploadToModule?: (row: ReadUpload) => void;
  // The Player tab's panel (course identity, progress, the ACTIVE file's own
  // buttons and every player preference). Owned by the parent for the same
  // reason as the mind map panel.
  playerPanel?: ReactNode;
  // ── Personal Course Modules ("My Modules") wiring ─────────────────────
  // Same ownership pattern as the mind map / player panels: the Course
  // Player owns the hook + state and hands a ready-rendered panel down, so
  // this overlay stays presentational. When `personalModulesOpen` is true
  // the MODULES tab swaps its official-module list for that panel; the list
  // is restored by the panel's own back row (parent flips the flag).
  personalModulesOpen?: boolean;
  personalModulesPanel?: ReactNode;
  /** The modules-tab entry row. `null`/absent hides the entry completely. */
  personalModulesEntry?: { subtitle: string; locked?: boolean } | null;
  onOpenPersonalModules?: () => void;
  /**
   * True while the footer navigation is the bottom-centre PEEK dock (the
   * desktop pattern, rendered by the parent as <CoursePeekDock />). In that
   * mode the study pane does NOT render its own footer — the dock has moved
   * out to the bottom centre of the whole player. False keeps the original
   * always-visible in-pane dock (the Player settings' "Always-visible
   * footer dock" preference).
   */
  peekDock?: boolean;
  /**
   * Production AI chat (ZIP Lumen). Owned by the Course Player so its
   * conversation state survives tab switches; the overlay hosts it as a
   * sibling of the keyed tab body and keeps it mounted (hidden) when
   * another tab is active. Absent → the Coming Soon placeholder.
   */
  aiPanel?: ReactNode;
  /**
   * The Brain tab's practice panel. Owned by the Course Player (it reads the
   * course tree's `brain` resources — the practice sets the admin imported on
   * the Product / Course-content page) and handed down ready-rendered, same
   * ownership pattern as the mind map / AI panels. Absent → the old
   * "coming soon" placeholder, so older call sites keep working.
   */
  brainPanel?: ReactNode;
  /**
   * The Experiment tab's Live Experiment panel. Owned by the Course Player
   * (it reads the course tree's `interactive` resources AND the learner's own
   * “My experiments” shelf, and owns the “+” save) and handed down
   * ready-rendered, same ownership pattern as the Brain panel. Absent → a
   * titled placeholder instead of the empty list this tab used to fall
   * through to.
   */
  experimentPanel?: ReactNode;
  /**
   * Structured resource library for the Modules tab. Shows the full course
   * hierarchy with note, mind map, lesson and practice cards grouped by
   * module/submodule. When provided, replaces the flat SnapList module list.
   * Owned by the Course Player — it builds the hierarchy from the existing
   * course tree and wires open-resource callbacks to the viewer/editor.
   */
  resourceLibraryPanel?: ReactNode;
  /**
   * Signal from the resource library: when set, the Notes panel opens the
   * specified master note in its read-only viewer. The signal carries both
   * the target note id and a count (so re-tapping the same note re-opens).
   */
  openMasterNoteSignal?: { id: string; count: number } | null;
  /** The signed-in learner — lets Notes remember its MASTER/SELF choice. */
  uid?: string | null;
  /**
   * Tabs this player must NOT show. A learner-authored course (My Study
   * Library) passes `["paid"]`: there is nothing to purchase in a course the
   * learner built, so the premium tab is gone from the dock (and from the
   * ⌘/Ctrl+1… tab shortcuts, which the Course Player filters the same way).
   */
  hiddenTabs?: DockTab[];
}

/**
 * The nine study tabs, in dock order. Exported because the Split Deck
 * (src/course/studyPanels.tsx) needs the active tab's colour and its icon
 * for the study peek rail — the deck must never keep its own copy of the
 * list. (The divider line itself is fixed yellow.)
 */
export const TABS: Array<{ key: DockTab; label: string; heading: string; hint: string; color: string; icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }> }> = [
  { key: "modules", label: "Module", heading: "Modules", hint: "Lessons on a connected path", color: "#FFBE0B", icon: BookOpen },
  // The old Resources panel is gone — the Brain button sits in its slot: the
  // practice sets the admin imported for this course's modules (resource type
  // "Brain · practice set"), played back with the revision test-taking design.
  { key: "brain", label: "Brain", heading: "Brain", hint: "Practice sets — apna Brain test", color: "#34D399", icon: Brain },
  { key: "notes", label: "Note", heading: "Notes", hint: "Your private writing pad", color: "#3A86FF", icon: NotebookPen },
  // Mind Map sits immediately after Note, so the two private-study tools are
  // neighbours in the dock. It hosts the per-module map library + canvas.
  { key: "mindmap", label: "Mind map", heading: "Mind map", hint: "Is module ka apna diagram banayein", color: "#B388FF", icon: Network },
  // The AI buddy sits right next to the mind map, dummy for now (its
  // functionality lands later). Its glyph is a custom mark, not a stock icon.
  { key: "ai", label: "AI", heading: "AI", hint: "AI study buddy — jald aa raha hai", color: "#22D3EE", icon: AiTabIcon },
  { key: "paid", label: "Paid", heading: "Paid content", hint: "Upgrades still locked", color: "#C9A96E", icon: ShoppingBag },
  // Part 20: Live Experiment replaces Settings in footer dock. Settings is now
  // accessible via the combined Progress + Settings rail at the top (Part 19).
  // This slot shows interactive 2D experiments (MASTER/SELF).
  { key: "experiment", label: "Experiment", heading: "Live Experiment", hint: "Interactive 2D experiments — MASTER & SELF", color: "#FF6BF5", icon: FlaskConical },
  // The drawing board — the official Excalidraw editor, hosted in the study
  // pane beside the lecture (src/course/SketchPanel.tsx). It sits last so no
  // existing tab's dock position (or ⌘/Ctrl+N shortcut) moves; pulling it up
  // next to Mind map is a one-line reorder of this array, nothing else.
  { key: "sketch", label: "Sketch", heading: "Sketch", hint: "Lecture ke saath likhein aur banayein", color: "#F97316", icon: PenLine },
  // The Read library is a distinct resource tab; the existing eight tab keys
  // stay in their original order so their numeric keyboard shortcuts persist.
  { key: "read", label: "Read", heading: "Read library", hint: "Accessible PDFs and reading links", color: "#E879F9", icon: FileText },
];

/** The dock's tab order — ⌘/Ctrl+1…9 walks this list. */
export const STUDY_TAB_ORDER: DockTab[] = TABS.map(({ key }) => key);

/** The tab record for a key, falling back to the first one for unknown keys. */
export const dockTabRecord = (tab: DockTab) => TABS[Math.max(0, TABS.findIndex((item) => item.key === tab))];

/**
 * Rendered when a call site has no mind map panel to host: a hint instead of a
 * blank surface.
 */
export const MINDMAP_FALLBACK = (
  <p className="px-4 py-6 text-center text-[11px] font-semibold text-[var(--course-muted)]">
    Mind map is course me abhi available nahi hai.
  </p>
);

/**
 * Rendered when a call site has no Player panel to host: a hint instead of a
 * blank surface, mirroring the mind map fallback.
 */
export const PLAYER_FALLBACK = (
  <p className="px-4 py-6 text-center text-[11px] font-semibold text-[var(--course-muted)]">
    Player settings abhi available nahi hain.
  </p>
);

/**
 * Rendered when a call site has no sketch panel to host (older embeds of the
 * overlay), mirroring the mind map and player fallbacks.
 */
export const SKETCH_FALLBACK = (
  <p className="px-4 py-6 text-center text-[11px] font-semibold text-[var(--course-muted)]">
    Sketch is course me abhi available nahi hai.
  </p>
);

/**
 * The footer navigation's items — the home footer's `GlassDockItem` list, in
 * TABS order, with the course data hooks the contract tests look for. Shared
 * by both variants so the dock is identical wherever it lives.
 */
export const buildDockItems = (tab: DockTab, hiddenTabs: DockTab[] = []): GlassDockItem[] =>
  TABS.filter(({ key }) => !hiddenTabs.includes(key)).map(({ key, label, color, icon }) => ({
    id: key,
    label,
    color,
    icon,
    active: key === tab,
    dataAttrs: {
      "data-course-dock-tab": "",
      "data-tab": key,
      "data-active": key === tab ? "true" : "false",
    },
  }));

/** The slice of the overlay's props the row builders need. */
export type StudyRowsArgs = Pick<
  CourseOverlayProps,
  | "modules"
  | "selectedFileId"
  | "ownedUpdateIds"
  | "accessibleModuleIds"
  | "previewModuleIds"
  | "updates"
  | "onSelectFile"
  | "onBuyModule"
  | "onBuyUpdate"
  | "personalModulesEntry"
  | "onOpenPersonalModules"
>;

export interface StudyRows {
  activeTab: (typeof TABS)[number];
  listRows: SheetRowSpec[];
  listModeAttr: string | null;
  emptyMessage: string;
}

/**
 * The study tabs' rows — ONE builder for the whole pane. The module list and
 * the paid list render through the same `StudyContent` as the notes, mind
 * map, brain, AI and player tabs.
 */
export function useStudyRows(tab: DockTab, args: StudyRowsArgs): StudyRows {
  const activeTab = dockTabRecord(tab);
  const {
    modules,
    ownedUpdateIds,
    updates,
    onBuyModule,
    onBuyUpdate,
  } = args;

  // ── Paid rows ──────────────────────────────────────────────────────────
  const paidRows = useMemo(() => {
    if (tab !== "paid") return [];
    const rows: SheetRowSpec[] = [];
    // Paid content is one consistent list: every purchasable update, plus
    // any locked paid module that does not belong to a listed update.
    for (const update of updates) {
      rows.push({
        id: `update-${update.id}`,
        kind: "update",
        icon: <Sparkles size={20} />,
        color: "#C9A96E",
        title: update.title,
        subtitle: update.contentNames.slice(0, 3).join(" · "),
        extra: <span className="text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span>,
        press: () => onBuyUpdate(update),
        dataAttrs: { "data-course-overlay-buy-update": update.id },
      });
    }
    for (const { module, depth } of flattenModules(modules).filter(({ module }) => module.accessLevel !== "hidden" && isPaidLocked(module, ownedUpdateIds))) {
      const moduleId = String(module.id);
      rows.push({
        id: `buy-${moduleId}`,
        kind: "buy",
        icon: <ShoppingBag size={20} />,
        color: "#C9A96E",
        title: module.title,
        subtitle: "Paid module",
        extra: <span className="max-w-[90px] truncate text-[10px] font-black text-amber-200/80">{module.paidUpdateTitle || "Unlock"}</span>,
        press: () => onBuyModule({ id: moduleId, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice }),
        dataAttrs: { "data-course-overlay-buy-module": moduleId, "data-module-depth": depth },
      });
    }
    return rows;
  }, [tab, modules, ownedUpdateIds, updates, onBuyUpdate, onBuyModule]);

  // The Modules tab is the structured library (see `resourceLibraryPanel`);
  // this builder only supplies the Paid list.
  const listRows = paidRows;
  const listModeAttr = tab === "paid" ? "paid" : null;
  const emptyMessage = "No paid content for this course.";

  return { activeTab, listRows, listModeAttr, emptyMessage };
}

/**
 * Placeholder body for the Brain and AI tabs — dummy buttons for now, the
 * real functionality lands later. A centred icon + title so the tab never
 * renders a blank surface.
 */
function ComingSoonPanel({
  icon: Icon,
  color,
  title,
  subtitle,
  panelAttr,
}: {
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  color: string;
  title: string;
  subtitle: string;
  panelAttr: "data-course-brain-panel" | "data-course-ai-panel" | "data-course-experiment-panel";
}) {
  return (
    <div
      className="grid h-full place-items-center px-6 text-center"
      data-course-dummy-tab={title}
      {...{ [panelAttr]: "" }}
    >
      <div className="flex flex-col items-center gap-2">
        <span
          className="flex h-14 w-14 items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 18, color }}
        >
          <Icon size={26} />
        </span>
        <p className="text-sm font-black text-white">{title}</p>
        <p className="text-[11px] font-semibold text-[var(--course-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * The tab body: notes / mind map / player panel / snap list, wrapped in the
 * one element the notes-grid and map-library tiling rules hang off
 * (`data-course-overlay-tab`).
 */
export function StudyContent({
  tab,
  rows,
  empty,
  listModeAttr,
  notesPanel,
  mindMapPanel,
  playerPanel,
  personalModulesOpen = false,
  personalModulesPanel,
  aiPanel,
  brainPanel,
  experimentPanel,
  sketchPanel,
  resourceLibraryPanel,
  moduleListingStyle = DEFAULT_MODULE_LISTING_STYLE,
}: {
  tab: DockTab;
  rows: SheetRowSpec[];
  empty: ReactNode;
  listModeAttr: string | null;
  notesPanel: ReactNode;
  mindMapPanel: ReactNode;
  playerPanel: ReactNode;
  /** My Modules: the modules tab swaps to the learner's own-content panel. */
  personalModulesOpen?: boolean;
  personalModulesPanel?: ReactNode;
  aiPanel?: ReactNode;
  brainPanel?: ReactNode;
  /** Live Experiment — the course's experiments + the learner's own (SELF). */
  experimentPanel?: ReactNode;
  sketchPanel?: ReactNode;
  resourceLibraryPanel?: ReactNode;
  moduleListingStyle?: "classic" | "modern";
}) {
  return (
    // Content swaps in place — the pane itself never closes. No slide
    // animation: the list is a plain scrollable column.
    <div key={tab} className="min-h-0 flex-1 overflow-hidden" data-course-overlay-tab={tab}>
      {tab === "modules" && personalModulesOpen && personalModulesPanel ? (
        // My Modules (learner-owned study content). The parent owns the hook
        // + panel state and hands it down ready-rendered, exactly like the
        // mind map and player panels below.
        personalModulesPanel
      ) : tab === "modules" && resourceLibraryPanel ? (
        // Structured resource library: the full course hierarchy with note,
        // mind map, lesson and practice cards grouped by module/submodule.
        resourceLibraryPanel
      ) : tab === "notes" ? (
        notesPanel
      ) : tab === "mindmap" ? (
        // The parent owns the map state + Firestore hook, so the panel is
        // handed down ready-rendered. A missing slot (older call sites)
        // degrades to a hint instead of a blank surface.
        mindMapPanel
      ) : tab === "sketch" ? (
        // The drawing board. Like the mind map, the parent owns the scene +
        // its Firestore hook and hands the panel down ready-rendered.
        sketchPanel ?? SKETCH_FALLBACK
      ) : tab === "player" ? (
        // Everything the player header used to be — course details, progress,
        // the active file's own buttons and every player preference, one list.
        playerPanel
      ) : tab === "brain" ? (
        // The Brain tab hosts the practice sets the admin imported for this
        // course's modules (resource type "Brain · practice set"). The parent
        // owns the panel — it reads them off the course tree — so a missing
        // slot keeps the old placeholder instead of a blank surface.
        brainPanel ?? (
          <ComingSoonPanel
            icon={Brain}
            color="#34D399"
            title="Brain"
            subtitle="Practice sets load with the Course Player"
            panelAttr="data-course-brain-panel"
          />
        )
      ) : tab === "experiment" ? (
        // Live Experiment — the course's own 2D experiments (MASTER) and the
        // learner's own (SELF), with the “+” that builds a new one. The parent
        // owns the panel (it reads the course tree AND the Study Library
        // shelf), so a missing slot keeps a titled placeholder instead of a
        // blank surface — the tab used to fall through to an empty list.
        experimentPanel ?? (
          <ComingSoonPanel
            icon={FlaskConical}
            color="#FF6BF5"
            title="Live Experiment"
            subtitle="Interactive 2D experiments — MASTER & SELF"
            panelAttr="data-course-experiment-panel"
          />
        )
      ) : tab === "ai" ? (
        // Production chat is hosted as a sibling of the keyed tab body so
        // Lumen state survives tab switches. The Coming Soon panel stays
        // as the fallback when no aiPanel is handed down.
        aiPanel ? null : (
          <ComingSoonPanel
            icon={AiTabIcon}
            color="#22D3EE"
            title="AI"
            subtitle="AI study buddy — jald aa raha hai"
            panelAttr="data-course-ai-panel"
          />
        )
      ) : (
        <SnapList
          rows={rows}
          empty={empty}
          moduleListingStyle={moduleListingStyle}
          dataAttrs={{
            "data-course-overlay-list": "",
            ...(listModeAttr ? { "data-mode": listModeAttr } : null),
            ...(tab === "paid" ? { "data-course-overlay-paid": "" } : null),
            "data-module-listing-style": moduleListingStyle,
          }}
        />
      )}
    </div>
  );
}

export default function CourseOverlay(props: CourseOverlayProps) {
  const { orientation, tab } = props;

  /** Pane tab switches crossfade; the opt-out keeps them a plain swap. */
  const paneCrossfade = useReducedMotion() !== true;

  // The player's one keyboard state — the footer navigation hides while the
  // soft keyboard is open, whichever of its two homes is in use.
  const { keyboardVisible } = useCourseKeyboard();

  // Read entries reuse the exact module-unlock resolver already used by the
  // Modules tab, plus the current paid-update ownership set for resource-level
  // gating. No second entitlement or content hierarchy is introduced.
  const readEntries = useMemo(() => {
    const unlocked = unlockedModuleIds(props.modules, props.accessibleModuleIds, props.ownedUpdateIds);
    return collectAccessibleReadResources(props.modules, unlocked, props.ownedUpdateIds, props.productId);
  }, [props.modules, props.accessibleModuleIds, props.ownedUpdateIds, props.productId]);

  const masterNotes = useMemo(() => {
    const unlocked = unlockedModuleIds(props.modules, props.accessibleModuleIds, props.ownedUpdateIds);
    return collectMasterCourseNotes(props.modules, {
      courseId: props.productId || "",
      unlockedModuleIds: unlocked,
      ownedUpdateIds: props.ownedUpdateIds,
      accessibleResourceIds: props.accessibleResourceIds,
      enabled: props.masterNotesEnabled,
    });
  }, [props.modules, props.productId, props.accessibleModuleIds, props.accessibleResourceIds, props.ownedUpdateIds, props.masterNotesEnabled]);

  // ── The nine tabs' rows ───────────────────────────────────────────────
  const { listRows, listModeAttr, emptyMessage } = useStudyRows(tab, props);

  // ── Footer navigation: the home footer, exactly ────────────────────────
  // Same GlassDock component the home page renders (src/components/BottomNav.tsx):
  // same frosted panel, entrance spring, staggered items, magnification wave,
  // tinted plates and tooltips — plus the home footer's own touch behaviour
  // (release the finger on a tab and it is selected). No slide-drag pill, no
  // live content swap while the finger moves. This element is the LAST CHILD
  // OF THE STUDY PANE, so the footer navigation lives inside the split.
  const dockItems: GlassDockItem[] = buildDockItems(tab, props.hiddenTabs);

  // ── The tab body ───────────────────────────────────────────────────────
  // The pane is always the ACTIVE TAB's content — there is no second body.
  const studyBody = (
    <StudyContent
      tab={tab}
      rows={listRows}
      empty={emptyMessage}
      listModeAttr={listModeAttr}
      moduleListingStyle={props.moduleListingStyle ?? DEFAULT_MODULE_LISTING_STYLE}
      notesPanel={
        // The panel owns its own circular "+" (bottom-right of the grid) —
        // the pane carries no header at all, so there is nowhere else for
        // the button to live.
        <NotesPanel
          notes={props.notes}
          masterNotes={masterNotes}
          onAdd={props.onAddNote}
          onEdit={props.onEditNote}
          onDelete={props.onDeleteNote}
          courseTitle={props.courseTitle}
          modules={props.modules}
          personalModules={props.personalModules}
          onRetrySync={props.onRetryNotes}
          syncState={props.notesSync}
          openMasterNoteSignal={props.openMasterNoteSignal}
          uid={props.uid ?? null}
        />
      }
      mindMapPanel={props.mindMapPanel ?? MINDMAP_FALLBACK}
      playerPanel={props.playerPanel ?? PLAYER_FALLBACK}
      personalModulesOpen={props.personalModulesOpen}
      personalModulesPanel={props.personalModulesPanel}
      aiPanel={props.aiPanel}
      brainPanel={props.brainPanel}
      experimentPanel={props.experimentPanel}
      sketchPanel={props.sketchPanel}
      resourceLibraryPanel={props.resourceLibraryPanel}
    />
  );

  // ── Footer navigation — exactly the home page's footer ─────────────────
  // The same GlassDock (src/components/glass-dock/GlassDock.tsx) the home page
  // uses: frosted AI-Canvas panel, y:50 → 0 spring entrance, per-item stagger,
  // distance magnification, tinted icon plates + frosted tooltips. It is the
  // study pane's last child, i.e. the DOM is
  // `[data-course-study-pane] [data-course-dock]`.
  //
  // In PEEK mode the dock has moved out to the bottom centre of the whole
  // player (<CoursePeekDock />, rendered by the parent) and the study pane
  // renders no footer of its own — the parent passes `peekDock` accordingly.
  //
  // ── The ONE keyboard rule ──────────────────────────────────────────────
  // While the soft keyboard is open this footer navigation is hidden as well,
  // from the player's single keyboard state (useCourseKeyboard) — the same
  // state the notes editor, the mind map and the AI chat take the deck over
  // with. Otherwise the dock would sit in the strip of study pane the deck
  // keeps above the keyboard, i.e. exactly between the keyboard and the
  // writing surface. Hiding (not unmounting) preserves the pane's restore.
  const dock = props.peekDock ? null : (
    <div
      className={`relative z-50 shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 ${keyboardVisible ? "hidden" : ""}`}
      data-course-dock
      data-orientation={orientation}
      data-in-split="true"
    >
      <div className="mx-auto w-max max-w-full">
        <GlassDock
          siteFooter
          compact
          items={dockItems}
          onSelect={(id) => props.onTabChange(id as DockTab)}
        />
      </div>
    </div>
  );

  // ── The Split Deck study pane: in-flow, no portal, no scrim, no sheet ──
  // The pane's glass surface + sizing belong to the deck; this component only
  // fills it: tab body, footer dock (in that order). There is NO header row —
  // every tab starts at the very top of the pane so the content keeps every
  // pixel the header used to take.
  const peekPad = props.peekDock ? "pb-[calc(max(env(safe-area-inset-bottom),10px)+16px)]" : "";
  const hideKeyedBody = (Boolean(props.aiPanel) && props.tab === "ai") || props.tab === "read";

  return (
    <>
      {/* A tab switch inside the pane crossfades (opacity 150 ms + a 6 px rise). */}
      <motion.div
        key={props.tab}
        initial={{ opacity: paneCrossfade ? 0 : 1, y: paneCrossfade ? 6 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: EASE_OUT_MOTION }}
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${peekPad} ${hideKeyedBody ? "hidden" : ""}`}
      >
        {studyBody}
      </motion.div>
      {props.aiPanel ? (
        <div
          className={`h-full min-h-0 flex-1 flex-col overflow-hidden ${peekPad} ${props.tab === "ai" ? "flex" : "hidden"}`}
          data-course-ai-panel
          hidden={props.tab !== "ai"}
          aria-hidden={props.tab !== "ai"}
        >
          {props.aiPanel}
        </div>
      ) : null}
      <div
        className={`h-full min-h-0 flex-1 flex-col overflow-hidden ${peekPad} ${props.tab === "read" ? "flex" : "hidden"}`}
        data-course-read-tab
        hidden={props.tab !== "read"}
        aria-hidden={props.tab !== "read"}
      >
        <ReadLibraryPanel
          entries={readEntries}
          productId={String(props.productId || "")}
          onAddToModule={props.onAddReadUploadToModule}
        />
      </div>
      {dock}
    </>
  );
}

/**
 * The "Module" tab only lists unlocked modules. Locked / paid modules are
 * surfaced in the dedicated "Paid" tab instead, so the curriculum list never
 * double-lists purchasable content. A locked module also hides its nested
 * children (the whole branch stays locked until the parent is unlocked).
 */
export const unlockedModuleIds = (
  modules: CourseModule[],
  accessibleModuleIds: Set<string>,
  ownedUpdateIds: Set<string>,
): Set<string> => {
  const out = new Set<string>();
  const visit = (nodes: CourseModule[], ancestorLocked: boolean) => {
    for (const node of nodes) {
      if (node.accessLevel === "hidden") continue;
      const locked = ancestorLocked || !accessibleModuleIds.has(String(node.id)) || isPaidLocked(node, ownedUpdateIds);
      if (!locked) out.add(String(node.id));
      visit(node.modules || [], locked);
    }
  };
  visit(modules, false);
  return out;
};
