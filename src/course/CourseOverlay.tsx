// src/course/CourseOverlay.tsx
//
// Course Player footer navigation + study tabs.
//
// ONE component, TWO homes (`variant`):
//
//   · "sheet" — the tabs open in the right-side Glass Sheet below and the
//     footer dock is the shell's last in-flow child (the default).
//   · "pane"  — Split Deck mode: the same chrome row, the same tab body and
//     the same footer dock render in-flow inside the study pane that
//     src/course/studyPanels.tsx lays out, so the module panel, the footer
//     navigation and the content ALL live inside the split.
//
// Everything the two homes share (the five TABS, the dock items, the row
// builders in `useStudyRows`, the tab body in `StudyContent`) is exported from
// here so there is exactly one source of truth for the study content.
//
// The footer IS the home page footer navigation (src/components/glass-dock/
// GlassDock.tsx, the same component src/components/BottomNav.tsx renders):
// identical frosted AI-Canvas panel, identical entrance spring, identical
// per-item stagger, identical distance-based magnification, identical tinted
// icon plates + frosted tooltips. A tap on a tab button opens the sheet; a
// touch release on a tab selects it — exactly like the home footer. There is
// NO sliding indicator and NO live content swap while the finger moves: the
// old "scroll on the dock and the overlay content updates live" behaviour is
// gone by the owner's direction.
//
// The sheet is the websiteglass Glass Sheet (src/components/ui/glass-sheet.tsx,
// https://websiteglass.com/docs/components/glass-sheet) pinned to the RIGHT
// edge. It slides in from the right and occupies ONLY the space between the
// player's header and the footer dock — it never overlaps either (the
// `bounds` prop insets the sheet and its scrim to that window).
//
// Inside the sheet each list tab (Modules / Resources / Paid) is a vertical
// column of dock-style buttons (same 44 px tinted plates, same magnify wave,
// same active glow). The list is scroll-snapped to the buttons: after the
// user taps open the sheet, scrolling and lifting the finger fires the
// button the finger settled on (the one closest to the list centre). A plain
// tap clicks the button under it as usual. No sliding content animations.
//
//   - Modules   → every unlocked module (expandable to its files).
//   - Resources → only non-paid files, grouped under modules that have them.
//   - Notes     → the notes panel.
//   - Mind map  → the per-module mind map panel.
//   - Paid      → purchasable updates + locked paid modules.

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { BookOpen, ChevronDown, ChevronRight, Eye, File, FileSpreadsheet, FileText, FormInput, Link2, LockKeyhole, Network, NotebookPen, PlayCircle, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "../types/course";
import NotesPanel from "./NotesPanel";
import GlassDock, { type GlassDockItem } from "../components/glass-dock/GlassDock";
import { GlassButton } from "../components/ui/glass-button";
import { GlassSheet, GlassSheetContent, type SheetBounds } from "../components/ui/glass-sheet";
import { EASE_OUT_MOTION } from "./splitMotion";

export type DockTab = "modules" | "resources" | "notes" | "mindmap" | "paid";
export type DockOrientation = "portrait" | "landscape";
/** "sheet" = the right-side Glass Sheet; "pane" = the Split Deck study pane. */
export type OverlayVariant = "sheet" | "pane";

const updateKey = (item: { id: string; paidUpdateId?: string }) => String(item.paidUpdateId || item.id);

const moduleFiles = (module: CourseModule): CourseFile[] => {
  const embedded = module.embedContentUrl ? [{
    id: `${module.id}__embedded-page`,
    name: module.embedContentTypeLabel || (module.embedContentTypeId === "github_page" ? "Interactive GitHub Page" : "Embedded resource"),
    type: module.embedContentTypeId === "google_doc" ? "doc" as const : module.embedContentTypeId === "whimsical_mindmap" ? "mindmap" as const : "embed" as const,
    url: module.embedContentUrl,
    embedUrl: module.embedContentUrl,
    provider: module.embedContentTypeId || "external",
    accessLevel: module.accessLevel,
    paidUpdateId: module.paidUpdateId,
    paidUpdateTitle: module.paidUpdateTitle,
    paidUpdatePrice: module.paidUpdatePrice,
    paidUpdateCoinPrice: module.paidUpdateCoinPrice,
  }] : [];
  return [...embedded, ...(module.files || [])];
};

type FlatModule = { module: CourseModule; depth: number };

const flattenModules = (modules: CourseModule[], depth = 0): FlatModule[] =>
  modules.flatMap((module) => [{ module, depth }, ...flattenModules(module.modules || [], depth + 1)]);

const isVisibleFile = (file: CourseFile) =>
  file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId);

/** Paid modules / paid files already live in the dedicated Paid tab. */
const isPaidContent = (item: { accessLevel?: string }) => item.accessLevel === "paidUpdate";

const fileIcon = (file: CourseFile) => {
  if (file.type === "youtube" || file.type === "video" || file.type === "audio") return PlayCircle;
  if (file.type === "pdf" || file.type === "ebook") return FileText;
  if (file.type === "sheet") return FileSpreadsheet;
  if (file.type === "google_form") return FormInput;
  if (file.type === "embed" || file.type === "mindmap") return Link2;
  return File;
};

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

type SheetRowKind = "module" | "file" | "update" | "buy";

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
  /** When set the row is a real button: tap clicks it AND lifting a scroll
   *  over it fires the same action (scroll-snap selection). */
  press?: () => void;
  dataAttrs?: Record<string, string | number | undefined>;
}

function SheetRow({
  spec,
  pointerY,
  register,
}: {
  spec: SheetRowSpec;
  pointerY: MotionValue<number>;
  register: (id: string, entry: { el: HTMLButtonElement | null; press: (() => void) | null }) => void;
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

  useEffect(() => {
    register(spec.id, { el: ref.current, press: spec.press ?? null });
    return () => register(spec.id, { el: null, press: null });
  }, [register, spec.id, spec.press]);

  const color = spec.selected ? "#B388FF" : spec.color;
  const interactive = Boolean(spec.press);

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
          <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]">{spec.subtitle}</span>
        ) : null}
      </span>
      {spec.extra ? <span className="flex shrink-0 items-center gap-1.5">{spec.extra}</span> : null}
    </motion.button>
  );
}

/**
 * The sheet's vertical button list. Scroll-snapped to the rows: after the
 * user has scrolled, the moment the scroll settles (the `scrollend` event,
 * or a 140 ms idle fallback on engines without it) the row closest to the
 * list centre is fired — lift the finger on a button and THAT button is
 * clicked. A plain tap never triggers this (no scroll happened), so it just
 * clicks the button under it. There are no sliding content animations — the
 * list is a plain scrollable column.
 */
function SnapList({
  rows,
  empty,
  dataAttrs,
}: {
  rows: SheetRowSpec[];
  empty?: ReactNode;
  dataAttrs?: Record<string, string | number | undefined>;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef(new Map<string, { id: string; el: HTMLButtonElement | null; press: (() => void) | null }>());
  const pointerY = useMotionValue(-10000);
  // True only after a REAL scroll happened for this gesture — a plain tap
  // must never trigger the release-click path.
  const scrolledRef = useRef(false);
  // After a scroll-release fires a row, the press changes the layout (a
  // module expands, the sheet closes…). The resulting reflow can emit more
  // scroll events — this lock window keeps them from firing a second row.
  // (It does NOT remember the fired row: a later, deliberate release on the
  // same button is a new click, exactly like a tap.)
  const lockedUntilRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);

  const register = useCallback((id: string, entry: { el: HTMLButtonElement | null; press: (() => void) | null }) => {
    if (entry.el === null && entry.press === null) entriesRef.current.delete(id);
    else entriesRef.current.set(id, { id, ...entry });
  }, []);

  const activate = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    if (!scrolledRef.current || Date.now() < lockedUntilRef.current) return;
    scrolledRef.current = false;
    const listRect = list.getBoundingClientRect();
    const center = listRect.top + listRect.height / 2;
    let bestId: string | null = null;
    let bestPress: (() => void) | null = null;
    let bestDist = Infinity;
    for (const entry of entriesRef.current.values()) {
      if (!entry.el || !entry.press) continue;
      const rect = entry.el.getBoundingClientRect();
      if (rect.bottom < listRect.top || rect.top > listRect.bottom) continue;
      const dist = Math.abs(rect.top + rect.height / 2 - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = entry.id;
        bestPress = entry.press;
      }
    }
    if (!bestId || !bestPress) return;
    lockedUntilRef.current = Date.now() + 800;
    bestPress();
  }, []);

  const onScroll = useCallback(() => {
    scrolledRef.current = true;
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(activate, 140);
  }, [activate]);

  // `scrollend` = the browser's own "finger lifted / fling settled" signal.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof Element === "undefined" || !("onscrollend" in Element.prototype)) return undefined;
    el.addEventListener("scrollend", activate);
    return () => el.removeEventListener("scrollend", activate);
  }, [activate]);

  useEffect(() => () => {
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
  }, []);

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
      className="h-full snap-y snap-proximity overflow-y-auto overscroll-contain px-2 py-3"
      onPointerMove={(event) => pointerY.set(event.clientY)}
      onPointerLeave={() => pointerY.set(-10000)}
      onPointerDown={() => { scrolledRef.current = false; }}
      onScroll={onScroll}
      {...dataAttrs}
    >
      <div className="relative space-y-1.5">
        {rows.map((spec) => (
          <SheetRow key={spec.id} spec={spec} pointerY={pointerY} register={register} />
        ))}
      </div>
    </div>
  );
}

interface CourseOverlayProps {
  orientation: DockOrientation;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /**
   * Where the study tabs live.
   *
   *   · "sheet" (default) — the tabs open in the right-side websiteglass Glass
   *     Sheet, strictly between the header and the footer dock, and the dock
   *     itself is the shell's last in-flow child.
   *   · "pane" — Split Deck mode (src/course/studyPanels.tsx): the SAME tabs,
   *     the SAME rows and the SAME dock render in-flow inside the split's
   *     study pane — no sheet, no scrim. The pane's chrome row then carries an
   *     X that exits split mode (`onExitSplitMode`).
   *
   * One component renders both so the two modes can never drift apart.
   */
  variant?: OverlayVariant;
  /** Split Deck only: the study pane's chrome-row X leaves split mode. */
  onExitSplitMode?: () => void;
  /**
   * Split Deck only: "Player bars" is hidden, so the pane drops its chrome row
   * AND its footer dock — the tab content stays (hiding the bars must never
   * tear the lesson pane down, that would remount every open file).
   */
  chromeHidden?: boolean;
  modules: CourseModule[];
  selectedFileId?: string;
  ownedUpdateIds: Set<string>;
  accessibleModuleIds: Set<string>;
  previewModuleIds: Set<string>;
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
  // Mind map wiring. The panel itself is owned by the parent (it holds the
  // Firestore hook), so the sheet only hosts it — this keeps the sheet
  // presentational and lets the map survive tab switches.
  mindMapPanel?: ReactNode;
}

/**
 * The five study tabs, in dock order. Exported because the Split Deck
 * (src/course/studyPanels.tsx) needs the active tab's colour for the divider
 * line and its icon for the study peek rail — the deck must never keep its own
 * copy of the list.
 */
export const TABS: Array<{ key: DockTab; label: string; heading: string; hint: string; color: string; icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }> }> = [
  { key: "modules", label: "Module", heading: "Modules", hint: "Lessons on a connected path", color: "#FFBE0B", icon: BookOpen },
  { key: "resources", label: "Resource", heading: "Resources", hint: "Course files (paid modules live in Paid)", color: "#06D6A0", icon: FileText },
  { key: "notes", label: "Note", heading: "Notes", hint: "Your private writing pad", color: "#3A86FF", icon: NotebookPen },
  // Mind Map sits immediately after Note, so the two private-study tools are
  // neighbours in the dock. It opens the same way — the right-side sheet —
  // and hosts the per-module map library + canvas.
  { key: "mindmap", label: "Mind map", heading: "Mind map", hint: "Is module ka apna diagram banayein", color: "#B388FF", icon: Network },
  { key: "paid", label: "Paid", heading: "Paid content", hint: "Upgrades still locked", color: "#C9A96E", icon: ShoppingBag },
];

/** The dock's tab order — ⌘/Ctrl+1…5 in Split Deck mode walks this list. */
export const STUDY_TAB_ORDER: DockTab[] = TABS.map(({ key }) => key);

/** The tab record for a key, falling back to the first one for unknown keys. */
export const dockTabRecord = (tab: DockTab) => TABS[Math.max(0, TABS.findIndex((item) => item.key === tab))];

/**
 * Rendered when a call site has no mind map panel to host: a hint instead of a
 * blank surface. Shared by the sheet and the Split Deck's study pane.
 */
export const MINDMAP_FALLBACK = (
  <p className="px-4 py-6 text-center text-[11px] font-semibold text-[var(--course-muted)]">
    Mind map is course me abhi available nahi hai.
  </p>
);

/**
 * The footer navigation's items — the home footer's `GlassDockItem` list, in
 * TABS order, with the course data hooks the contract tests look for. Shared
 * by both variants so the dock is identical wherever it lives.
 */
export const buildDockItems = (tab: DockTab): GlassDockItem[] =>
  TABS.map(({ key, label, color, icon }) => ({
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
>;

export interface StudyRows {
  activeTab: (typeof TABS)[number];
  listRows: SheetRowSpec[];
  listModeAttr: string | null;
  emptyMessage: string;
  headerSubtitle: string;
  visibleModuleCount: number;
}

/**
 * The five study tabs' rows — ONE builder for BOTH homes.
 *
 * The right-side Glass Sheet (variant "sheet") and the Split Deck's study pane
 * (variant "pane", laid out by src/course/studyPanels.tsx) call this same hook
 * and render its result through the same `StudyContent`, so the module list,
 * the resource list, the notes, the mind map and the paid list can never drift
 * apart between the two modes.
 */
export function useStudyRows(tab: DockTab, args: StudyRowsArgs): StudyRows {
  const activeTab = dockTabRecord(tab);
  const {
    modules,
    selectedFileId,
    ownedUpdateIds,
    accessibleModuleIds,
    previewModuleIds,
    updates,
    onSelectFile,
    onBuyModule,
    onBuyUpdate,
  } = args;

  // ── Module / Resource rows ─────────────────────────────────────────────
  const flatModules = useMemo(() => flattenModules(modules), [modules]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleModule = useCallback((moduleId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  const listMode = tab === "modules" || tab === "resources" ? (tab as "modules" | "resources") : null;

  const moduleRows = useMemo(() => {
    if (!listMode) return [];
    const mode = listMode;
    const tabColor = activeTab.color;
    const rows: SheetRowSpec[] = [];
    // Modules mode: only unlocked modules are shown — locked / paid modules
    // live in the dedicated "Paid" tab. Resources mode: only NON-PAID modules
    // that actually contain non-paid files are shown, so paid content is
    // never listed twice.
    const visible = (() => {
      if (mode === "resources") {
        return flatModules.filter(({ module }) =>
          module.accessLevel !== "hidden" &&
          !isPaidContent(module) &&
          moduleFiles(module).some((file) => isVisibleFile(file) && !isPaidContent(file)),
        );
      }
      const unlocked = unlockedModuleIds(modules, accessibleModuleIds, ownedUpdateIds);
      return flatModules.filter(({ module }) => unlocked.has(String(module.id)));
    })();

    for (const { module, depth } of visible) {
      const files = moduleFiles(module).filter((file) =>
        isVisibleFile(file) && (mode !== "resources" || !isPaidContent(file)),
      );
      const moduleId = String(module.id);
      const accessible = accessibleModuleIds.has(moduleId);
      const preview = previewModuleIds.has(moduleId);
      const paidNotOwned = isPaidLocked(module, ownedUpdateIds);
      const locked = !accessible || paidNotOwned;
      const open = mode === "modules" && expanded.has(moduleId);
      const holdsSelected = files.some((file) => file.id === selectedFileId);

      rows.push({
        id: `module-${moduleId}`,
        kind: "module",
        icon: <span className="text-[11px] font-black">{depth + 1}</span>,
        color: tabColor,
        title: module.title,
        subtitle: `${files.length} ${files.length === 1 ? "file" : "files"}`,
        selected: holdsSelected,
        extra: (
          <>
            {preview ? <Eye size={13} className="text-sky-300" /> : null}
            {locked && !preview ? <LockKeyhole size={13} className="text-amber-400" /> : null}
            {mode === "modules" && files.length > 0 ? (
              open ? <ChevronDown size={15} className="text-[var(--course-muted)]" /> : <ChevronRight size={15} className="text-[var(--course-muted)]" />
            ) : null}
          </>
        ),
        // Modules mode: the module button expands / collapses its files.
        // Resources mode: the module row is a plain (non-clickable) heading.
        press: mode === "modules" ? () => toggleModule(moduleId) : undefined,
        dataAttrs: {
          "data-course-overlay-module": "",
          "data-module-id": moduleId,
          "data-locked": locked ? "true" : "false",
          "data-preview": preview ? "true" : "false",
        },
      });

      if (open || mode === "resources") {
        for (const file of files) {
          const Icon = fileIcon(file);
          const fileLocked = locked || (file.accessLevel === "paidUpdate" && !ownedUpdateIds.has(updateKey(file)));
          rows.push({
            id: `file-${file.id}`,
            kind: "file",
            icon: <Icon size={20} />,
            color: tabColor,
            title: file.name,
            subtitle: file.type,
            selected: selectedFileId === file.id,
            extra: fileLocked ? <LockKeyhole size={12} className="text-amber-400" /> : null,
            press: fileLocked ? undefined : () => onSelectFile(file),
            dataAttrs: {
              "data-course-overlay-file": "",
              "data-file-id": file.id,
              "data-locked": fileLocked ? "true" : "false",
            },
          });
        }
      }
    }
    return rows;
  }, [listMode, activeTab.color, flatModules, expanded, toggleModule, modules, accessibleModuleIds, ownedUpdateIds, previewModuleIds, selectedFileId, onSelectFile]);

  // Keep the module holding the open file expanded by default.
  useEffect(() => {
    if (!selectedFileId) return;
    const owner = flatModules.find(({ module }) => moduleFiles(module).some((file) => file.id === selectedFileId));
    if (owner) {
      const id = String(owner.module.id);
      setExpanded((current) => (current.has(id) ? current : new Set(current).add(id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFileId, flatModules]);

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

  const listRows = tab === "paid" ? paidRows : moduleRows;
  const listModeAttr = tab === "paid" ? "paid" : listMode;
  const emptyMessage =
    tab === "paid"
      ? "No paid content for this course."
      : listMode === "resources"
        ? "No files to show yet."
        : "No modules to show yet.";

  // Only unlocked modules are listed in the "Module" tab, so the header
  // count reflects the same set the learner actually sees.
  const visibleModuleCount = useMemo(
    () => unlockedModuleIds(modules, accessibleModuleIds, ownedUpdateIds).size,
    [modules, accessibleModuleIds, ownedUpdateIds],
  );

  const headerSubtitle =
    tab === "modules"
      ? `${visibleModuleCount} connected ${visibleModuleCount === 1 ? "module" : "modules"}`
      : activeTab.hint;

  return { activeTab, listRows, listModeAttr, emptyMessage, headerSubtitle, visibleModuleCount };
}

/**
 * The tab body: notes / mind map / snap list, wrapped in the one element the
 * notes-grid and map-library tiling rules hang off (`data-course-overlay-tab`).
 * Identical in the sheet and in the Split Deck's study pane.
 */
export function StudyContent({
  tab,
  rows,
  empty,
  listModeAttr,
  notesPanel,
  mindMapPanel,
}: {
  tab: DockTab;
  rows: SheetRowSpec[];
  empty: ReactNode;
  listModeAttr: string | null;
  notesPanel: ReactNode;
  mindMapPanel: ReactNode;
}) {
  return (
    // Content swaps in place — the surface itself never closes. No slide
    // animation: the list is a plain scrollable column.
    <div key={tab} className="min-h-0 flex-1 overflow-hidden" data-course-overlay-tab={tab}>
      {tab === "notes" ? (
        notesPanel
      ) : tab === "mindmap" ? (
        // The parent owns the map state + Firestore hook, so the panel is
        // handed down ready-rendered. A missing slot (older call sites)
        // degrades to a hint instead of a blank surface.
        mindMapPanel
      ) : (
        <SnapList
          rows={rows}
          empty={empty}
          dataAttrs={{
            "data-course-overlay-list": "",
            ...(listModeAttr ? { "data-mode": listModeAttr } : null),
            ...(tab === "paid" ? { "data-course-overlay-paid": "" } : null),
          }}
        />
      )}
    </div>
  );
}

export default function CourseOverlay(props: CourseOverlayProps) {
  const { orientation, tab } = props;
  const landscape = orientation === "landscape";

  // NotesPanel reports when its big editor is open; while it is, the sheet
  // keeps NO header at all so the writing surface gets every pixel of the
  // sheet (both orientations).
  const [notesEditorOpen, setNotesEditorOpen] = useState(false);
  const notesWriting = tab === "notes" && notesEditorOpen;
  // The main header's "+" button lives here (the sheet header), but the
  // composer state lives in NotesPanel. A monotonically increasing signal
  // asks the panel to open its composer without lifting the draft state up.
  const [composerSignal, setComposerSignal] = useState(0);

  // ── Sheet bounds: the exact window between the header and the dock ─────
  // The sheet portals to <body>, so its inset is measured from the real
  // layout: the player header's bottom edge (portrait) / right edge
  // (landscape rail) and the dock's top edge. Re-measured on resize,
  // orientation change and any size change of either element (the soft
  // keyboard shrinking the shell included).
  const dockShellRef = useRef<HTMLDivElement | null>(null);
  const [sheetBounds, setSheetBounds] = useState<SheetBounds | null>(null);
  const pane = props.variant === "pane";
  /** Pane tab switches crossfade; the opt-out keeps them a plain swap. */
  const paneCrossfade = useReducedMotion() !== true;
  useEffect(() => {
    // Split Deck mode has no sheet to inset — the study pane is laid out by
    // the deck itself (src/course/studyPanels.tsx).
    if (pane) return undefined;
    const headerSelector = landscape ? "[data-course-landscape-header]" : "[data-course-header]";
    const read = () => {
      const dock = dockShellRef.current;
      if (!dock || typeof window === "undefined") return;
      const dockRect = dock.getBoundingClientRect();
      const header = document.querySelector(headerSelector);
      const headerRect = header ? header.getBoundingClientRect() : null;
      const next: SheetBounds = {
        top: landscape ? 0 : Math.round(headerRect ? headerRect.bottom : 0),
        right: 0,
        bottom: Math.max(0, Math.round(window.innerHeight - dockRect.top)),
        left: landscape ? Math.round(headerRect ? headerRect.right : 0) : 0,
      };
      setSheetBounds((prev) =>
        prev && prev.top === next.top && prev.bottom === next.bottom && prev.left === next.left && prev.right === next.right
          ? prev
          : next,
      );
    };
    read();
    const ro = new ResizeObserver(read);
    if (dockShellRef.current) ro.observe(dockShellRef.current);
    const header = document.querySelector(headerSelector);
    if (header) ro.observe(header);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [landscape, pane]);

  // ── The five tabs' rows ────────────────────────────────────────────────
  // Built by the ONE shared hook (`useStudyRows`) that the Split Deck's study
  // pane calls too, so both homes render identical content from one source.
  const { activeTab, listRows, listModeAttr, emptyMessage, headerSubtitle } = useStudyRows(tab, props);

  // ── Footer navigation: the home footer, exactly ────────────────────────
  // Same GlassDock component the home page renders (src/components/BottomNav.tsx):
  // same frosted panel, entrance spring, staggered items, magnification wave,
  // tinted plates and tooltips — plus the home footer's own touch behaviour
  // (release the finger on a tab and it is selected). No slide-drag pill, no
  // live content swap while the finger moves. In Split Deck mode this very
  // element is the LAST CHILD OF THE STUDY PANE, so the footer navigation
  // lives inside the split (owner's direction) instead of under it.
  const dockItems: GlassDockItem[] = buildDockItems(tab);

  // ── The tab body ───────────────────────────────────────────────────────
  // ONE element tree for both homes: the sheet and the Split Deck's study pane
  // render the exact same `StudyContent`, so notes / mind map / module list /
  // resources / paid can never differ between the two modes.
  const studyBody = (
    <StudyContent
      tab={tab}
      rows={listRows}
      empty={emptyMessage}
      listModeAttr={listModeAttr}
      notesPanel={
        <NotesPanel
          notes={props.notes}
          onAdd={props.onAddNote}
          onEdit={props.onEditNote}
          onDelete={props.onDeleteNote}
          onEditorOpenChange={setNotesEditorOpen}
          composerOpenSignal={composerSignal}
        />
      }
      mindMapPanel={props.mindMapPanel ?? MINDMAP_FALLBACK}
    />
  );

  // ── The one chrome row ─────────────────────────────────────────────────
  // Heading + subtitle + the notes "+" + X. Both homes render it through the
  // same `notesWriting` guard below — null ENTIRELY while the notes writing box
  // is open, so the editor gets every pixel of the surface. Only the X's job
  // differs per home: the sheet's X closes the sheet, the pane's X leaves
  // Split Deck mode (the pane itself has no "closed" state).
  const chromeRow = (
    <div
      className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[var(--course-border)] px-4 py-3"
      data-course-study-chrome={pane ? "pane" : "sheet"}
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-overlay-title>
          {activeTab.heading}
        </p>
        {headerSubtitle ? (
          <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--course-muted)]">{headerSubtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {tab === "notes" ? (
          <GlassButton
            onClick={() => setComposerSignal((signal) => signal + 1)}
            className="[&_.size-12]:size-8"
            aria-label="Add note"
            data-course-notes-add
          >
            <Plus size={16} />
          </GlassButton>
        ) : null}
        <GlassButton
          onClick={pane ? () => props.onExitSplitMode?.() : props.onClose}
          className="shrink-0 [&_.size-12]:size-8"
          aria-label={pane ? "Exit split mode" : "Close overlay"}
          title={pane ? "Exit split mode" : "Close overlay"}
          data-course-overlay-close
          {...(pane ? { "data-course-split-exit": "" } : null)}
        >
          <X size={15} />
        </GlassButton>
      </div>
    </div>
  );

  // ── Footer navigation — exactly the home page's footer ─────────────────
  // The same GlassDock (src/components/glass-dock/GlassDock.tsx) the home page
  // uses: frosted AI-Canvas panel, y:50 → 0 spring entrance, per-item stagger,
  // distance magnification, tinted icon plates + frosted tooltips. In sheet
  // mode it is the section's last in-flow child, so the sheet's bounds
  // (measured from its top edge) always land exactly above the footer and
  // below the header. In Split Deck mode it is the study pane's last child.
  const dock = (
    <div
      className="relative z-50 shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2"
      data-course-dock
      data-orientation={orientation}
      data-in-split={pane ? "true" : "false"}
      data-sheet-open={!pane && props.open ? "true" : "false"}
    >
      <div ref={dockShellRef} className="mx-auto w-max max-w-full">
        <GlassDock
          siteFooter
          items={dockItems}
          onSelect={(id) => props.onTabChange(id as DockTab)}
        />
      </div>
    </div>
  );

  // ── Split Deck study pane: in-flow, no portal, no scrim, no sheet ──────
  // The pane's glass surface + sizing belong to the deck; this component only
  // fills it: chrome row, tab body, footer dock (in that order).
  if (pane) {
    return (
      <>
        {notesWriting ? null : (
          props.chromeHidden ? null : chromeRow
        )}
        {/* A tab switch inside the pane crossfades (opacity 150 ms + a 6 px
            rise). The sheet keeps its in-place swap with no animation — "no
            sliding content animations" is sheet law, not pane law. */}
        <motion.div
          key={props.tab}
          initial={{ opacity: paneCrossfade ? 0 : 1, y: paneCrossfade ? 6 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT_MOTION }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {studyBody}
        </motion.div>
        {props.chromeHidden ? null : dock}
      </>
    );
  }

  return (
    <>
      {/* ── Sheet: websiteglass Glass Sheet, RIGHT edge, opening only in
          the window between the header and the footer dock (bounds). ── */}
      <GlassSheet
        open={props.open}
        onOpenChange={(next) => {
          // Escape / scrim / GlassSheetClose all arrive here as `false`.
          if (!next) props.onClose();
        }}
      >
        <GlassSheetContent
          side="right"
          tint={0.5}
          bounds={sheetBounds ?? undefined}
          contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
          data-course-overlay
          data-open={props.open ? "true" : "false"}
          data-orientation={orientation}
          data-solid-panel={tab === "notes" || tab === "mindmap" ? "true" : "false"}
        >
          {/* Sheet header — the one chrome row, hidden entirely while the
              notes writing box is open. */}
          {notesWriting ? null : (
            chromeRow
          )}
          {studyBody}
        </GlassSheetContent>
      </GlassSheet>

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
const unlockedModuleIds = (
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
