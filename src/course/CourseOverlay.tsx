// src/course/CourseOverlay.tsx
//
// Course Player bottom dock + overlay. Replaces the old side panel
// with four toggles pinned to the very bottom (Modules / Resources /
// Notes / Paid). A pill indicator slides between the buttons, and
// tapping a button opens a dropdown overlay with the matching content:
//
//   - Modules   → every available module (expandable to its files).
//   - Resources → only non-paid files, grouped under modules that have them.
//   - Notes     → the notes panel, sized to half the screen.
//   - Paid      → only paid modules / updates, with a purchase CTA.
//
// Modules and their files are drawn as a left-side wire tree: a glowing
// vertical rail with nodes, so every lesson is visibly connected to its
// parent module instead of sitting in disconnected cards.
//
// If one overlay is already open and the user taps another button,
// the SAME overlay stays open and its content swaps in place (with a
// short slide-in animation) rather than closing and reopening.
//
// Layout notes (important):
//   - The dock is ALWAYS the top-most interactive layer (z-50) and is
//     rendered in normal flow so it can never scroll away.
//   - The sheet is `pointer-events-none` + `invisible` while closed so
//     the off-screen (translated) sheet cannot swallow taps meant for
//     the dock underneath it.
//   - Portrait  → dock pinned to the bottom edge, sheet slides up.
//   - Landscape → dock pinned to the right edge as a vertical rail,
//     sheet slides in from the right.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { BookOpen, ChevronDown, ChevronRight, Eye, File, FileSpreadsheet, FileText, FormInput, Link2, LockKeyhole, Network, NotebookPen, PlayCircle, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "../types/course";
import NotesPanel from "./NotesPanel";
import { GlassSurface } from "../components/ui/glass";
import { ICON_SIZE, MAG_RANGE, MAG_SCALE } from "../components/glass-dock/GlassDock";
import {
  DOCK_PANEL_BG,
  DOCK_PANEL_BLUR,
  DOCK_PANEL_BORDER,
  DOCK_PANEL_SHADOW,
} from "../components/glass-dock/GlassMaterial";
import { GlassButton } from "../components/ui/glass-button";
import { GlassTile } from "../components/ui/glass-tile";

export type DockTab = "modules" | "resources" | "notes" | "mindmap" | "paid";
export type DockOrientation = "portrait" | "landscape";

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ── Home footer dock, ported 1:1 to the course player ────────────────────
// This is the SAME dock the home page uses (src/components/glass-dock/
// GlassDock.tsx): identical geometry (ICON_SIZE 44), identical distance
// magnification (MAG_RANGE 120 / MAG_SCALE 1.55 with the spring 300/22/0.5),
// identical −12 px lift, identical staggered entrance, identical tinted
// icon plates + frosted tooltips. Only the tab set and the landscape
// (vertical rail) axis are course-specific.
const DOCK_ICON_SIZE = ICON_SIZE;
const DOCK_MAG_RANGE = MAG_RANGE;
const DOCK_MAG_SCALE = MAG_SCALE;

function DockTabButton({
  tabKey,
  label,
  icon,
  color,
  active,
  landscape,
  index,
  pointerPos,
  onSelect,
  skipSelectRef,
}: {
  tabKey: DockTab;
  label: string;
  icon: ReactNode;
  color: string;
  active: boolean;
  landscape: boolean;
  index: number;
  pointerPos: MotionValue<number>;
  onSelect: () => void;
  skipSelectRef: { current: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const distance = useTransform(pointerPos, (p: number) => {
    const el = ref.current;
    if (!el || p < -5000) return 200;
    const rect = el.getBoundingClientRect();
    const center = landscape ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    return Math.abs(p - center);
  });
  const rawSize = useTransform(distance, [0, DOCK_MAG_RANGE], [DOCK_ICON_SIZE * DOCK_MAG_SCALE, DOCK_ICON_SIZE]);
  const size = useSpring(rawSize, { stiffness: 300, damping: 22, mass: 0.5 });
  const shift = useTransform(size, [DOCK_ICON_SIZE, DOCK_ICON_SIZE * DOCK_MAG_SCALE], [0, -12]);

  return (
    <motion.div
      ref={ref}
      data-glass-dock-item={tabKey}
      data-course-dock-item={tabKey}
      className={`group relative z-10 flex cursor-pointer items-center ${landscape ? "flex-row" : "flex-col"}`}
      initial={{ opacity: 0, ...(landscape ? { x: 20 } : { y: 20 }) }}
      animate={{ opacity: 1, ...(landscape ? { x: 0 } : { y: 0 }) }}
      transition={{ type: "spring", stiffness: 200, damping: 18, delay: index * 0.04 }}
    >
      {/* Frosted tooltip — pinned open for the active tab, exactly like home. */}
      <motion.div
        className={`pointer-events-none absolute whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-white/90 ${
          landscape ? "right-[calc(100%+8px)]" : "-top-10"
        } ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          transition: "opacity 0.15s",
        }}
      >
        {label}
      </motion.div>

      <motion.button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={() => {
          // A finger-slide selection already happened on pointerup — the
          // synthetic click that follows must not re-toggle the tab.
          if (skipSelectRef.current) return;
          onSelect();
        }}
        style={{
          width: size,
          height: size,
          ...(landscape ? { x: shift } : { y: shift }),
          background: active ? `${color}30` : `${color}18`,
          border: active ? `1px solid ${color}55` : `1px solid ${color}22`,
          borderRadius: 12,
          boxShadow: active ? `0 0 16px ${color}44` : "none",
        }}
        whileTap={{ scale: 0.82 }}
        className="relative flex select-none items-center justify-center"
        data-course-dock-tab
        data-tab={tabKey}
        data-active={active ? "true" : "false"}
      >
        <span className="flex items-center justify-center" style={{ color }}>
          {icon}
        </span>
      </motion.button>
    </motion.div>
  );
}

/**
 * Magnetic easing for the dock indicator while it is being dragged. Within
 * `BAND` of any tab's centre the displayed position locks to that centre, so
 * the pill visibly "clicks" toward a tab a hair before it is fully selected.
 * Outside the band it follows the finger almost 1:1 (lightly damped) so the
 * drag still feels direct. The snap-to-nearest itself happens on release.
 */
const DOCK_MAGNETIC_BAND = 0.18;
const magneticIndex = (raw: number): number => {
  const nearest = Math.round(raw);
  const dist = raw - nearest;
  const adist = Math.abs(dist);
  if (adist <= DOCK_MAGNETIC_BAND) return nearest;
  const sign = dist < 0 ? -1 : 1;
  return nearest + sign * (DOCK_MAGNETIC_BAND + (adist - DOCK_MAGNETIC_BAND) * 0.9);
};

/**
 * The "Module" tab only lists unlocked modules. Locked / paid modules are
 * surfaced in the dedicated "Paid" tab instead, so the curriculum rail never
 * double-lists purchasable content. A locked module also hides its nested
 * children (the whole branch stays locked until the parent is unlocked), so
 * the wire tree never shows an orphaned child under a hidden parent.
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

interface CourseOverlayProps {
  orientation: DockOrientation;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
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
  // Reports upward when the landscape notes editor is open so the parent can
  // re-flow the content area into a 60/40 split (lesson on the left, notes
  // + keyboard on the right) without obscuring the lesson.
  onSplitModeChange?: (active: boolean) => void;
  // Mind map wiring. The panel itself is owned by the parent (it holds the
  // Firestore hook), so the overlay only reserves space for it — this keeps
  // the sheet presentational and lets the map survive tab switches.
  mindMapPanel?: ReactNode;
  /** Reports when the mind map sheet is claiming the landscape half-screen. */
  onMindMapSplitChange?: (active: boolean) => void;
  /**
   * Live width of the landscape split sheet as a percent of the content
   * section (notes default 40, mind map default 50). `null` when no split
   * is open. The parent sizes the lesson to the complement so dragging the
   * centre handle resizes BOTH panes together.
   */
  onSplitRatioChange?: (percent: number | null) => void;
}

const TABS: Array<{ key: DockTab; label: string; heading: string; hint: string; color: string; icon: (active: boolean) => ReactNode }> = [
  { key: "modules", label: "Module", heading: "Modules", hint: "Lessons on a connected path", color: "#FFBE0B", icon: () => <BookOpen size={22} className="h-[22px] w-[22px] shrink-0" /> },
  { key: "resources", label: "Resource", heading: "Resources", hint: "Course files (paid modules live in Paid)", color: "#06D6A0", icon: () => <FileText size={22} className="h-[22px] w-[22px] shrink-0" /> },
  { key: "notes", label: "Note", heading: "Notes", hint: "Your private writing pad", color: "#3A86FF", icon: () => <NotebookPen size={22} className="h-[22px] w-[22px] shrink-0" /> },
  // Mind Map sits immediately after Note, so the two private-study tools are
  // neighbours in the dock. It opens the same way — a sheet over the lesson —
  // but claims HALF the screen instead of the notes' 40%.
  { key: "mindmap", label: "Mind map", heading: "Mind map", hint: "Is module ka apna diagram banayein", color: "#B388FF", icon: () => <Network size={22} className="h-[22px] w-[22px] shrink-0" /> },
  { key: "paid", label: "Paid", heading: "Paid content", hint: "Upgrades still locked", color: "#C9A96E", icon: () => <ShoppingBag size={22} className="h-[22px] w-[22px] shrink-0" /> },
];

export default function CourseOverlay(props: CourseOverlayProps) {
  const { orientation, tab, open, onSplitModeChange } = props;
  const activeIndex = Math.max(0, TABS.findIndex((item) => item.key === tab));
  const landscape = orientation === "landscape";
  // NotesPanel reports when its big editor is open so the sheet can grow.
  // This is a MIRROR of the panel's live editor state — it must never be
  // force-reset while the panel is still mounted, because the panel keeps
  // its own `composing` / `editingId` state (an empty draft does not
  // auto-save) and only re-reports when that state changes. Resetting the
  // mirror here used to desync the two: close the sheet with the editor
  // still open, reopen it, and the mirror stayed false while the panel was
  // still in editor mode — so the sheet came back as a plain right-side
  // overlay instead of the swipeable 60/40 split.
  const [notesEditorOpen, setNotesEditorOpen] = useState(false);

  // Writing mode = the rich-text writing box is open (compose or edit). In
  // this mode the sheet keeps NO headers at all — nothing but the
  // formatting toolbar on top, the writing surface in the middle and the
  // Save / Cancel row on the bottom — so the box gets maximum room to write
  // and organise in both portrait and landscape.
  const notesWriting = tab === "notes" && notesEditorOpen;
  // The main header's "+" button lives here (the overlay), but the composer
  // state lives in NotesPanel. A monotonically increasing signal asks the
  // panel to open its composer without lifting the draft state up.
  const [composerSignal, setComposerSignal] = useState(0);

  // ── Draggable, magnetic dock indicator ──────────────────────────────────
  // The sliding accent pill can be GRABBED and dragged between the four tabs.
  // While dragging it follows the finger (with a magnetic lock near each tab
  // centre), the overlay content swaps LIVE as the pill crosses each tab, and
  // on release it snaps to the nearest tab. A pure tap on the indicator still
  // behaves exactly like tapping the active tab button (toggle open/close), so
  // the drag handle never steals the original button behaviour. The handle
  // only ever covers the ACTIVE slot, so the other three tab buttons stay
  // fully clickable.
  const pillRef = useRef<HTMLDivElement>(null);
  // The dock's REAL measured size (pill + its margins + safe-area inset).
  // The sheet anchors to this instead of the old hard-coded `4rem` /
  // `bottom-16` guesses, which no longer match the home-style dock — and a
  // guess is exactly what left a visible seam (or a gap of page showing
  // through) between the sheet and the dock.
  const dockShellRef = useRef<HTMLDivElement>(null);
  const [dockSize, setDockSize] = useState(72);
  useEffect(() => {
    const el = dockShellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const read = () => {
      const rect = el.getBoundingClientRect();
      const next = Math.round(landscape ? rect.width : rect.height);
      if (next > 0) setDockSize((current) => (Math.abs(current - next) < 1 ? current : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [landscape]);
  // The sheet slides UNDER the dock by this much (the dock is z-50, the sheet
  // z-40) so the two glass surfaces merge into one continuous piece — no
  // hairline, no border, no strip of page between them.
  const DOCK_MERGE = 22;
  const sheetAnchor = `${Math.max(0, dockSize - DOCK_MERGE)}px`;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragRef = useRef<{ id: number; start: number; index: number; slot: number; moved: boolean } | null>(null);
  const dragging = dragIndex != null;
  const displayedIndex = dragging ? magneticIndex(dragIndex as number) : activeIndex;

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const pill = pillRef.current;
    if (!pill) return;
    const rect = pill.getBoundingClientRect();
    const slot = (landscape ? rect.height : rect.width) / TABS.length;
    dragRef.current = { id: event.pointerId, start: landscape ? event.clientY : event.clientX, index: activeIndex, slot, moved: false };
    setDragIndex(activeIndex);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture unsupported — drag still works without it */ }
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const st = dragRef.current;
    if (!st || st.id !== event.pointerId) return;
    const coord = landscape ? event.clientY : event.clientX;
    const delta = coord - st.start;
    // A small dead-zone keeps a pure tap (or a tiny jiggle) from moving the
    // indicator at all, so a tap still behaves exactly like the button tap.
    if (!st.moved) {
      if (Math.abs(delta) > 5) st.moved = true;
      else return;
    }
    const raw = clamp(st.index + delta / st.slot, 0, TABS.length - 1);
    setDragIndex(raw);
    // Live overlay swap: the moment the pill's centre crosses into a tab, that
    // tab becomes active so the sheet content updates in real time.
    const nearest = Math.round(raw);
    const key = TABS[nearest]?.key;
    if (key && nearest !== activeIndex) props.onTabChange(key);
  };

  const onHandlePointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const st = dragRef.current;
    if (!st || st.id !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    setDragIndex((current) => {
      if (!st.moved) {
        // Pure tap → preserve the original "tap active tab" behaviour (toggle).
        const key = TABS[activeIndex]?.key;
        if (key) props.onTabChange(key);
        return null;
      }
      const snapped = current == null ? activeIndex : Math.round(current);
      const key = TABS[snapped]?.key;
      if (key && snapped !== activeIndex) props.onTabChange(key);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
      return null;
    });
  };

  // ── Whole-dock touch behaviour ──────────────────────────────────────────
  // Two things, exactly like the home footer:
  //   1. `pointerPos` drives the magnify — icons swell near the finger or
  //      mouse as it travels across the dock.
  //   2. A finger placed ANYWHERE on the dock and slid along it drags the
  //      accent indicator with it (live content swap included) and selects
  //      the tab it is released over. A plain tap still just taps the button.
  const pointerPos = useMotionValue(-10000);
  const surfRef = useRef<{ id: number; start: number; moved: boolean } | null>(null);
  const skipSelectRef = useRef(false);
  const dockCoord = (event: ReactPointerEvent) => (landscape ? event.clientY : event.clientX);

  const onDockPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerPos.set(dockCoord(event));
    if (event.pointerType === "mouse") return;
    // The dedicated grab handle has its own (magnetic) drag — don't run a
    // second drag for the same gesture.
    if ((event.target as Element | null)?.closest?.("[data-course-dock-handle]")) return;
    surfRef.current = { id: event.pointerId, start: dockCoord(event), moved: false };
  };
  const onDockPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerPos.set(dockCoord(event));
    const st = surfRef.current;
    if (!st || st.id !== event.pointerId) return;
    const coord = dockCoord(event);
    if (!st.moved) {
      if (Math.abs(coord - st.start) <= 10) return;
      st.moved = true;
      // From here the gesture is a slide, not a tap — capture the pointer so
      // the indicator keeps following even outside the pill, and swallow the
      // click that would otherwise fire on release.
      try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
      skipSelectRef.current = true;
    }
    const pill = pillRef.current;
    if (!pill) return;
    const rect = pill.getBoundingClientRect();
    const slot = (landscape ? rect.height : rect.width) / TABS.length;
    if (slot <= 0) return;
    const raw = clamp((coord - (landscape ? rect.top : rect.left)) / slot - 0.5, 0, TABS.length - 1);
    setDragIndex(raw);
    const nearest = Math.round(raw);
    const key = TABS[nearest]?.key;
    if (key && nearest !== activeIndex) props.onTabChange(key);
  };
  const onDockPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerPos.set(-10000);
    const st = surfRef.current;
    if (!st || st.id !== event.pointerId) return;
    surfRef.current = null;
    try { (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    if (!st.moved) {
      skipSelectRef.current = false;
      return;
    }
    setDragIndex((current) => {
      const snapped = current == null ? activeIndex : Math.round(current);
      const key = TABS[snapped]?.key;
      if (key && snapped !== activeIndex) props.onTabChange(key);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
      return null;
    });
    window.setTimeout(() => { skipSelectRef.current = false; }, 400);
  };

  // ── Soft-keyboard awareness (landscape notes split) ─────────────────────
  // When the rich-text editor is focused the OS keyboard rises and covers the
  // bottom of the sheet. We measure the covered height from the visual
  // viewport and reserve that much space at the sheet's bottom edge, so the
  // editor (and its Save buttons) shrink to sit ABOVE the keyboard instead of
  // being hidden behind it. The lesson on the left keeps its full 60%.
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    const update = () => setKeyboardInset(Math.max(0, Math.round((window.innerHeight ?? 0) - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);

  // Notes: the saved list only needs half the screen, but the moment the
  // editor is open it takes the full sheet so the writing surface is as
  // large as the notes area allows and long text is easy to read.
  // In LANDSCAPE the editor triggers a SPLIT mode: the content keeps the
  // left 60% of the screen while the notes (with the soft keyboard that
  // pops up on the right side) takes the right 40%. Both halves stay
  // tappable, so a learner can keep watching the lesson while taking
  // notes instead of losing the video behind a half-screen sheet.
  const notesHeight = landscape ? "52vw" : "50dvh";
  const notesEditorHeight = landscape ? "min(92vw, 620px)" : "88dvh";
  const defaultHeight = landscape ? "min(78vw, 460px)" : "72dvh";
  // In landscape the NOTES tab always opens as a side-by-side split — both
  // the "all notes" grid and the big editor — so the lesson stays visible
  // beside the sheet and the centre handle can resize either view, exactly
  // like the note editor. `notesEditorOpen` is only used for the sheet's
  // height/portrait treatment below.
  //
  // The split ONLY applies while the sheet is actually OPEN — exactly like
  // `mindMapSplit` below. Gating on `open` is what makes the split collapse
  // the moment the sheet closes (no white gap, however it was closed: dock
  // button, scrim, Escape, full-left drag) even though the tab may
  // legitimately stay selected. And on the next open the split is already
  // true, so the sheet lands straight back in the swipe-and-adjust layout
  // instead of a plain overlay.
  const splitMode = landscape && open && tab === "notes";

  // ── Mind map sheet sizing ───────────────────────────────────────────────
  // The mind map claims HALF the screen — more than the notes' 40% — because
  // a diagram needs width AND height to stay legible, and the learner is
  // reading branches outward from a centre in both directions. In landscape
  // it is always split (never a full overlay), so the lesson stays visible
  // beside the diagram. Portrait has no room for a side-by-side split, so the
  // sheet simply takes the bottom half.
  const mindMapActive = tab === "mindmap";
  // The split ONLY applies while the sheet is actually OPEN. Tapping the same
  // Mind map dock button closes the sheet (`open` → false) but keeps the tab
  // selected; if the split did not follow `open`, the lesson would stay
  // shrunk to the mind map's 50% and the other half of the screen would be
  // left blank even though the sheet is gone.
  const mindMapSplit = landscape && mindMapActive && open;
  const mindMapHeight = "50dvh";

  // ── Draggable landscape split ratio ─────────────────────────────────────
  // Defaults stay 40% (notes) / 50% (mind map). Grab the centre handle
  // (sheet's left edge) to set any ratio from fully closed (0%) to nearly
  // full-screen (SPLIT_MAX). Releasing the handle at the closed end closes
  // the sheet; the same edge can then be grabbed again and dragged back
  // toward the centre to reopen the panel.
  //
  // The ratio is a percentage of the SECTION width, but the sheet is
  // docked 4rem in from the right, so on phones the sheet reaches its
  // physical maximum (left edge flush with the section's left edge) before
  // 100%. `splitWidthCss` below caps the rendered width at that point —
  // the handle never leaves the visible box, so a full-screen sheet can
  // always be dragged back.
  const SPLIT_MIN = 0;
  const SPLIT_MAX = 95;
  /** Below this ratio a released drag counts as "close the panel". */
  const CLOSE_THRESHOLD = 10;
  const DEFAULT_NOTES_SPLIT = 40;
  const DEFAULT_MINDMAP_SPLIT = 50;
  const loadSplitPercent = (key: string, fallback: number) => {
    try {
      const raw = Number(localStorage.getItem(key));
      if (Number.isFinite(raw)) return clamp(raw, SPLIT_MIN, SPLIT_MAX);
    } catch { /* private mode */ }
    return fallback;
  };
  const [notesSplitPercent, setNotesSplitPercent] = useState(() => loadSplitPercent("dc.courseSplit.notes", DEFAULT_NOTES_SPLIT));
  const [mindMapSplitPercent, setMindMapSplitPercent] = useState(() => loadSplitPercent("dc.courseSplit.mindmap", DEFAULT_MINDMAP_SPLIT));
  const [splitDragging, setSplitDragging] = useState(false);
  // True while the user is dragging the closed sheet's edge handle inward to
  // reopen the panel. During such a drag the sheet is shown live so the user
  // sees exactly how wide it will land.
  const [edgeDragging, setEdgeDragging] = useState(false);
  const splitDragRef = useRef<{ id: number } | null>(null);
  // Live value of the most recently applied ratio — the pointer-up handler
  // needs it even though the state update may not have committed yet.
  const splitDragValueRef = useRef<number>(0);
  const splitPercent = tab === "mindmap" ? mindMapSplitPercent : notesSplitPercent;
  /**
   * The sheet's width as CSS. The sheet is anchored `4rem` (the dock's slot)
   * in from the section's RIGHT edge, so at 100% it can at most span the
   * USABLE width between the section's left edge and the dock. `min()`
   * enforces that cap. Without it, dragging the centre handle all the way to
   * full screen pushes the sheet's left edge — and the split handle riding
   * on it — past the section's left edge, out of the section's
   * `overflow-hidden` box: the panel sits "full screen" with no reachable
   * handle, so the learner can neither drag it back (restore) nor drag it
   * past the close threshold. The ratio the learner left behind is persisted,
   * so every reopen landed on the same stuck state — for the mind map (whose
   * header row is fully hidden) that read as "it can't be closed at all".
   * Capped, the sheet can genuinely reach full screen while the handle stays
   * visible at the left edge in every state.
   */
  const splitWidthCss = (percent: number) =>
    `min(${percent}%, calc(100% - ${sheetAnchor}))`;
  const splitEditorWidth = splitWidthCss(notesSplitPercent);
  const mindMapSplitWidth = splitWidthCss(mindMapSplitPercent);

  useEffect(() => {
    try { localStorage.setItem("dc.courseSplit.notes", String(notesSplitPercent)); } catch { /* ignore */ }
  }, [notesSplitPercent]);
  useEffect(() => {
    try { localStorage.setItem("dc.courseSplit.mindmap", String(mindMapSplitPercent)); } catch { /* ignore */ }
  }, [mindMapSplitPercent]);

  const applySplitPercent = (percent: number) => {
    const next = Math.round(clamp(percent, SPLIT_MIN, SPLIT_MAX) * 10) / 10;
    splitDragValueRef.current = next;
    if (tab === "mindmap") setMindMapSplitPercent(next);
    else setNotesSplitPercent(next);
  };

  const onSplitPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    splitDragRef.current = { id: event.pointerId };
    splitDragValueRef.current = splitPercent;
    setSplitDragging(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  };

  const onSplitPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const st = splitDragRef.current;
    if (!st || st.id !== event.pointerId) return;
    const section = event.currentTarget.closest("[data-course-landscape-content]") as HTMLElement | null;
    const parent = section || (event.currentTarget.offsetParent as HTMLElement | null);
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0) return;
    const dock = parent.querySelector("[data-course-dock]") as HTMLElement | null;
    const dockW = dock ? dock.getBoundingClientRect().width : 64;
    const sheetPx = rect.right - dockW - event.clientX;
    applySplitPercent((sheetPx / rect.width) * 100);
  };

  const onSplitPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const st = splitDragRef.current;
    if (!st || st.id !== event.pointerId) return;
    splitDragRef.current = null;
    setSplitDragging(false);
    setEdgeDragging(false);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    const current = splitDragValueRef.current;
    if (current <= CLOSE_THRESHOLD) {
      // Dragged fully closed: reset to the default ratio so the next open
      // lands at a sensible width. If the sheet was open, close it for real
      // (the lesson returns to full width). If it was already closed (edge
      // drag that did not cross the threshold), it simply stays closed.
      applySplitPercent(tab === "mindmap" ? DEFAULT_MINDMAP_SPLIT : DEFAULT_NOTES_SPLIT);
      if (open) props.onClose();
    } else if (!open) {
      // Edge drag crossed the threshold — reopen the panel at the dragged
      // width (the ratio was already applied while dragging).
      props.onToggle();
    }
  };

  // Edge handle on the closed sheet: a slim grabber flush against the dock.
  // Dragging it toward the centre reopens the panel at that width.
  const edgeHandleActive = landscape && !open && (tab === "notes" || tab === "mindmap");
  const onEdgePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setEdgeDragging(true);
    onSplitPointerDown(event);
  };
  // A cancelled gesture (browser takes the pointer over) must only clean up
  // the drag state — it must never close or reopen the sheet.
  const onSplitPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const st = splitDragRef.current;
    if (!st || st.id !== event.pointerId) return;
    splitDragRef.current = null;
    setSplitDragging(false);
    setEdgeDragging(false);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
  };
  // The sheet's live visibility: open, or being dragged open from its edge.
  const sheetVisible = open || edgeDragging;

  const sheetHeight = mindMapActive
    ? mindMapHeight
    : tab === "notes"
      ? (notesEditorOpen ? notesEditorHeight : notesHeight)
      : defaultHeight;
  // In portrait the notes writing box and the mind map fill the whole area
  // between the pinned header and the dock. Anchoring them to the top of the
  // section (which already starts BELOW the header) instead of using a viewport
  // percentage keeps their top edge exactly at the header's bottom — they grow
  // downward and never slide under (or get clipped by) the sticky header.
  const portraitFullHeight = !landscape && (mindMapActive || notesEditorOpen);
  // True only while the notes editor is open AND a soft keyboard is covering
  // part of the viewport. Drives the sheet's bottom inset so the editor lifts
  // above the keyboard instead of being half-hidden behind it.
  const keyboardActive = tab === "notes" && notesEditorOpen && keyboardInset > 0;

  // Bubble the split state up to the parent so the surrounding shell can
  // shrink the content area to the matching 60vw. A missing callback (older
  // call sites, e.g. tests) just means the parent keeps its default layout.
  useEffect(() => {
    onSplitModeChange?.(splitMode);
    return () => onSplitModeChange?.(false);
  }, [splitMode, onSplitModeChange]);

  // Same bubble-up for the mind map, on its own callback: the two sheets take
  // DIFFERENT widths (notes 40%, mind map 50%), so the parent has to know
  // which one is open to shrink the lesson to the matching complement.
  const { onMindMapSplitChange, onSplitRatioChange } = props;
  useEffect(() => {
    onMindMapSplitChange?.(mindMapSplit);
    return () => onMindMapSplitChange?.(false);
  }, [mindMapSplit, onMindMapSplitChange]);

  const splitActive = splitMode || mindMapSplit;
  useEffect(() => {
    onSplitRatioChange?.(splitActive ? splitPercent : null);
    return () => onSplitRatioChange?.(null);
  }, [splitActive, splitPercent, onSplitRatioChange]);

  const flatModules = useMemo(() => flattenModules(props.modules), [props.modules]);
  // Only unlocked modules are listed in the "Module" tab, so the header
  // count reflects the same set the learner actually sees.
  const visibleModuleCount = useMemo(
    () => unlockedModuleIds(props.modules, props.accessibleModuleIds, props.ownedUpdateIds).size,
    [props.modules, props.accessibleModuleIds, props.ownedUpdateIds],
  );

  // Escape closes the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  const activeTab = TABS[activeIndex];

  return (
    <>
      {/* ── Closed-sheet edge handle (landscape) ──────────────────────────
          When the notes / mind map sheet is fully closed in landscape, a
          slim grabber stays pinned against the dock. Dragging it toward the
          centre reopens the panel at exactly the width the pointer reaches,
          so a panel closed by a full-left drag can be brought straight back
          (and left "only notes / only mind map" is one full-right drag).
          The sheet itself previews live at the dragged width while the
          handle moves. */}
      {edgeHandleActive ? (
        <button
          type="button"
          aria-label="Panel kholne ke liye centre ki taraf drag karein"
          title="Drag inward to reopen the panel"
          className="absolute bottom-0 top-0 z-50 flex w-4 cursor-col-resize touch-none items-center justify-center"
          style={{ right: `calc(${sheetAnchor} + ${edgeDragging ? splitPercent : 0}%)` }}
          onPointerDown={onEdgePointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
          onPointerCancel={onSplitPointerCancel}
          data-course-split-edge-handle
          data-edge-dragging={edgeDragging ? "true" : "false"}
        >
          <span className={`block h-16 w-1.5 rounded-full ${edgeDragging ? "bg-violet-400" : "bg-violet-400/50"} shadow-[0_0_10px_rgba(167,139,250,0.7)]`} />
        </button>
      ) : null}

      {/* ── Scrim: closes the sheet when the content behind it is tapped ──
          In landscape SPLIT mode (notes editor open or mind map active) the
          left half of the screen must stay fully visible and interactive —
          the whole point of split mode is that the learner can watch the
          lesson AND take notes/draw a diagram side-by-side. Showing a dark
          blurred scrim over the left half defeats that purpose. We therefore
          suppress the scrim entirely in landscape split mode. In portrait and
          in non-split landscape (modules / resources / paid tabs) the scrim
          keeps its usual "tap outside to close" role. */}
      {!(landscape && (splitMode || mindMapSplit)) ? (
        <div
          onClick={props.onClose}
          aria-hidden={!open}
          className={`absolute z-30 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
            landscape ? "bottom-0 left-0 top-0" : "inset-x-0 top-0"
          } ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
          style={landscape ? { right: sheetAnchor } : { bottom: sheetAnchor }}
          data-course-overlay-scrim
        />
      ) : null}

      {/* ── Overlay sheet ─────────────────────────────────────────────── */}
      <GlassSurface
        contentClassName="flex min-h-0 flex-col overflow-hidden"
        className={`absolute z-40 overflow-hidden border-[var(--course-border)] transition-[transform,opacity] duration-300 ease-out ${
          landscape
            ? "bottom-0 top-0 border-l"
            : "inset-x-0 rounded-t-[1.75rem]"
        } ${sheetVisible
          ? "pointer-events-auto translate-x-0 translate-y-0 opacity-100"
          : `pointer-events-none invisible opacity-0 ${landscape ? "translate-x-full" : "translate-y-full"}`
        }`}
        style={{
          // The pack surface's own `radius` is a uniform value; the portrait
          // sheet only rounds its top edge and the landscape sheet none.
          borderRadius: landscape ? 0 : "1.75rem 1.75rem 0 0",
          // Sits flush against the dock's left edge — the dock grows by the
          // right safe-area inset in fullscreen, so the sheet must too.
          // In split mode the editor takes the right 40% of the section
          // (minus the 4rem dock) so the lesson keeps the left 60%.
          // Anchored to the dock's MEASURED size, minus a small overlap so
          // the sheet tucks under the dock and the two glass panes fuse.
          ...(landscape ? { right: sheetAnchor } : { bottom: sheetAnchor }),
          // Landscape → width (split editor / mind map / default). While the
          // closed sheet is being dragged open from its edge, the sheet
          // previews live at the dragged ratio. Portrait → normally a height,
          // but the notes writing box and the mind map instead stretch from
          // the section's top (just below the header) to the dock, so they
          // use the real available space and never slide underneath the
          // sticky header.
          //
          // Their BOTTOM edge anchors at the dock pill's TOP, not just 4rem
          // above the section's bottom: the dock's 4rem pill ALSO carries a
          // bottom margin of `max(safe-area-inset-bottom, 10px)`, and the
          // class-based `bottom-16` (4rem) cleared only the pill's height.
          // The sheet's bottom 10px+ used to slide under the pill, covering
          // the last row of the mind map's bottom toolbar ("toolbar footer
          // ke neeche dab gaya") and the notes editor's Save row on
          // gesture-nav phones. Matching the pill's exact top keeps the whole
          // toolbar strip visible in every state.
          ...(landscape
            ? { width: edgeDragging ? splitWidthCss(splitPercent) : mindMapSplit ? mindMapSplitWidth : splitMode ? splitEditorWidth : sheetHeight }
            : portraitFullHeight
              ? { top: 0, height: "auto", bottom: sheetAnchor }
              : { height: sheetHeight }),
          // When the soft keyboard is up over the notes editor, lift the sheet
          // above it so the editor + Save buttons stay visible. The lesson on
          // the left is untouched. Portrait keeps its 4rem dock clearance too.
          ...(keyboardActive
            ? { bottom: landscape ? `${keyboardInset}px` : `${Math.max(dockSize, keyboardInset)}px` }
            : null),
        }}
        data-course-overlay
        data-open={sheetVisible ? "true" : "false"}
        data-solid-panel={tab === "notes" || tab === "mindmap" ? "true" : "false"}
        data-orientation={orientation}
        data-split-mode={splitMode || mindMapSplit ? "true" : "false"}
        data-split-kind={mindMapSplit ? "mindmap" : splitMode ? "notes" : "none"}
        data-split-percent={splitActive ? String(splitPercent) : undefined}
        data-split-dragging={splitDragging ? "true" : "false"}
      >
        {landscape && splitActive && !edgeDragging ? (
          <button
            type="button"
            aria-label="Split ratio badlein — lesson aur panel ke beech drag karein"
            title="Drag karke lesson / panel ka size badlein"
            className="absolute left-0 top-0 z-50 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            onPointerCancel={onSplitPointerCancel}
            data-course-split-handle
          >
            <span className={`block h-16 w-1.5 rounded-full ${splitDragging ? "bg-violet-400" : "bg-violet-400/70"} shadow-[0_0_10px_rgba(167,139,250,0.7)]`} />
          </button>
        ) : null}
        {/* Grab handle (portrait only, hidden while the writing box is open
            so the editor gets every pixel, and hidden for the mind map
            because its portrait header now carries the title + close). */}
        {!landscape && !notesWriting && tab !== "mindmap" ? (
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Collapse panel"
            className="relative mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-[var(--course-strong)]"
          />
        ) : null}

        {/* Main header — shown for every tab. The mind map is the one
            exception in LANDSCAPE, where the sheet is a clean split canvas
            next to the lesson and any chrome above it would shrink the
            diagram. In PORTRAIT the mind map sheet keeps the standard
            header ("Mind map" title + hint + close X) like every other
            sheet, so the tab is identifiable and one-tap closeable. The
            notes writing mode omits the header for the same maximum-space
            reason in both orientations. */}
        {notesWriting || (tab === "mindmap" && landscape) ? null : (
        <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[var(--course-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-overlay-title>
              {activeTab.heading}
            </p>
            {(() => {
              // The hint below the heading is contextual: it shows the visible
              // module count for "Module" and a one-liner for every other
              // tab. When a tab intentionally has no hint, the paragraph is
              // omitted entirely instead of leaving an empty line under the
              // heading.
              const subtitle = tab === "modules"
                ? `${visibleModuleCount} connected ${visibleModuleCount === 1 ? "module" : "modules"}`
                : activeTab.hint;
              if (!subtitle) return null;
              return (
                <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--course-muted)]">
                  {subtitle}
                </p>
              );
            })()}
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
              onClick={props.onClose}
              className="shrink-0 [&_.size-12]:size-8"
              aria-label="Close overlay"
              data-course-overlay-close
            >
              <X size={15} />
            </GlassButton>
          </div>
        </div>
        )}

        {/* Content swaps in place — the sheet itself never closes. */}
        <div key={tab} className="min-h-0 flex-1 overflow-hidden animate-course-overlay-in" data-course-overlay-tab={tab}>
          {tab === "notes" ? (
            <NotesPanel
              notes={props.notes}
              onAdd={props.onAddNote}
              onEdit={props.onEditNote}
              onDelete={props.onDeleteNote}
              onEditorOpenChange={setNotesEditorOpen}
              composerOpenSignal={composerSignal}
            />
          ) : tab === "mindmap" ? (
            // The parent owns the map state + Firestore hook, so the panel is
            // handed down ready-rendered. An empty slot (older call sites)
            // degrades to a hint instead of a blank sheet.
            props.mindMapPanel ?? (
              <p className="px-4 py-6 text-center text-[11px] font-semibold text-[var(--course-muted)]">
                Mind map is course me abhi available nahi hai.
              </p>
            )
          ) : tab === "paid" ? (
            <PaidList {...props} />
          ) : (
            <ContentList {...props} flatModules={flatModules} mode={tab as "modules" | "resources"} />
          )}
        </div>
      </GlassSurface>

      {/* ── Dock: always the top-most interactive layer ─────────────────
          EXACTLY the home page footer navigation (src/components/glass-dock/
          GlassDock.tsx): the same frosted AI-Canvas panel (translucent pane,
          hairline border, deep shadow + inset top-light, separate
          non-animating blur layer), the same y:50 → 0 spring entrance
          (180/20), the same per-item staggered entrance, the same
          distance-based magnification wave with tinted icon plates and
          frosted tooltips. The course-only extras — the draggable magnetic
          indicator and the finger-slide tab select — ride on top of it.

          The dock is also the BOTTOM EDGE of the open sheet: the sheet is
          anchored to the dock (no gap) and, while open, the dock's top
          corners flatten and its top border disappears, so the sheet and the
          dock read as ONE continuous piece of glass with no seam between
          them. */}
      <div
        className="relative z-50 shrink-0"
        data-course-dock
        data-orientation={orientation}
        data-sheet-open={sheetVisible ? "true" : "false"}
      >
        <div
          className={
            landscape
              // In fullscreen the navigation-bar / cutout inset becomes
              // non-zero; growing the rail's right margin by that inset
              // (instead of padding the fixed pill) keeps the tab buttons
              // fully visible and tappable.
              ? "dc-footer-shell my-3 ml-2 mr-[max(env(safe-area-inset-right),8px)] h-full w-16"
              : "dc-footer-shell mx-3 mb-[max(env(safe-area-inset-bottom),10px)] mt-2"
          }
          ref={dockShellRef}
        >
          <div className="dc-footer-glow" aria-hidden="true" />
          <motion.div
            ref={pillRef}
            initial={landscape ? { x: 50 } : { y: 50 }}
            animate={landscape ? { x: 0 } : { y: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 20 }}
            className={`dc-course-dock-panel relative isolate flex shrink-0 items-center rounded-3xl ${
              landscape ? "h-full w-full flex-col justify-between px-3 py-4" : "w-full justify-between gap-2 px-4 pb-3 pt-3"
            }`}
            style={{
              touchAction: "none",
              background: DOCK_PANEL_BG,
              border: DOCK_PANEL_BORDER,
              boxShadow: DOCK_PANEL_SHADOW,
            }}
            onPointerDown={onDockPointerDown}
            onPointerMove={onDockPointerMove}
            onPointerUp={onDockPointerEnd}
            onPointerCancel={onDockPointerEnd}
            onPointerLeave={() => pointerPos.set(-10000)}
            data-glass-dock=""
            data-course-dock-panel
          >
            {/* Separate non-animating blur layer (home dock): the frosted
                backdrop never re-blurs while the magnification wave runs. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[-1] rounded-3xl"
              style={{ backdropFilter: DOCK_PANEL_BLUR, WebkitBackdropFilter: DOCK_PANEL_BLUR }}
            />
            {/* The accent pill and the grab handle both occupy exactly one
                dock slot. `20%` is `1 / TABS.length` for the current five
                tabs (Module · Resource · Note · Mind map · Paid) — written as
                a literal so Tailwind's scanner can see it. */}
            <span
              className={`pointer-events-none absolute ${dragging ? "" : "transition-transform duration-300 ease-out"} ${landscape ? "left-1.5 right-1.5 top-0 h-[20%]" : "bottom-1.5 left-0 top-1.5 w-[20%]"}`}
              style={{ transform: landscape ? `translateY(${displayedIndex * 100}%)` : `translateX(${displayedIndex * 100}%)` }}
              data-course-dock-indicator
              data-index={activeIndex}
              data-display-index={displayedIndex.toFixed(3)}
              data-dragging={dragging ? "true" : "false"}
            >
              <span className={`block h-full rounded-full bg-white/10 ${landscape ? "my-1.5" : "mx-1.5"}`} />
            </span>
            {TABS.map(({ key, label, icon, color }, index) => (
              <DockTabButton
                key={key}
                tabKey={key}
                label={label}
                icon={icon(key === tab)}
                color={color}
                active={key === tab}
                landscape={landscape}
                index={index}
                pointerPos={pointerPos}
                skipSelectRef={skipSelectRef}
                onSelect={() => props.onTabChange(key)}
              />
            ))}
            {/* Draggable grab handle that overlays ONLY the active slot, so the
                other tab buttons stay fully clickable. A tap (no move)
                forwards to the active-tab toggle; a drag slides the indicator
                between tabs with a magnetic snap on release. */}
            <span
              aria-hidden="true"
              tabIndex={-1}
              className={`absolute z-20 touch-none cursor-grab active:cursor-grabbing ${landscape ? "left-1.5 right-1.5 top-0 h-[20%]" : "bottom-1.5 left-0 top-1.5 w-[20%]"}`}
              style={{ transform: landscape ? `translateY(${displayedIndex * 100}%)` : `translateX(${displayedIndex * 100}%)`, transition: dragging ? "none" : "transform 0.3s ease-out" }}
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              data-course-dock-handle
              data-dragging={dragging ? "true" : "false"}
            />
          </motion.div>
        </div>
      </div>
    </>
  );
}

// ─── Modules / Resources content ───────────────────────────────────────────
function ContentList(props: CourseOverlayProps & { flatModules: FlatModule[]; mode: "modules" | "resources" }) {
  const { flatModules, mode } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modules mode: only unlocked modules are shown — locked / paid modules
  // live in the dedicated "Paid" tab. Resources mode: only NON-PAID modules
  // that actually contain non-paid files are shown, so paid content is never
  // listed twice.
  const visible = useMemo(() => {
    if (mode === "resources") {
      return flatModules.filter(({ module }) =>
        module.accessLevel !== "hidden" &&
        !isPaidContent(module) &&
        moduleFiles(module).some((file) => isVisibleFile(file) && !isPaidContent(file)),
      );
    }
    const unlocked = unlockedModuleIds(props.modules, props.accessibleModuleIds, props.ownedUpdateIds);
    return flatModules.filter(({ module }) => unlocked.has(String(module.id)));
  }, [flatModules, mode, props.modules, props.accessibleModuleIds, props.ownedUpdateIds]);

  // Keep the module holding the open file expanded by default.
  useEffect(() => {
    if (mode !== "modules" || !props.selectedFileId) return;
    const owner = visible.find(({ module }) => moduleFiles(module).some((file) => file.id === props.selectedFileId));
    if (owner) setExpanded((current) => (current.has(String(owner.module.id)) ? current : new Set(current).add(String(owner.module.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, props.selectedFileId]);

  if (visible.length === 0) {
    return <p className="grid h-full place-items-center px-6 text-center text-xs text-[var(--course-muted)]">No {mode === "resources" ? "files" : "modules"} to show yet.</p>;
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-4 pb-8" data-course-overlay-list data-mode={mode} data-course-overlay-wire="true">
      <div className="relative">
        {visible.map(({ module, depth }, index) => {
          const files = moduleFiles(module).filter((file) =>
            isVisibleFile(file) && (mode !== "resources" || !isPaidContent(file)),
          );
          const moduleId = String(module.id);
          const accessible = props.accessibleModuleIds.has(moduleId);
          const preview = props.previewModuleIds.has(moduleId);
          const paidNotOwned = isPaidLocked(module, props.ownedUpdateIds);
          const locked = !accessible || paidNotOwned;
          const open = mode === "modules" && expanded.has(moduleId);
          const holdsSelected = files.some((file) => file.id === props.selectedFileId);
          const last = index === visible.length - 1;
          const showFiles = mode === "resources" ? files : open ? files : [];

          return (
            <div key={moduleId} className="relative flex gap-3" style={{ marginLeft: depth ? depth * 12 : 0 }} data-course-wire-node>
              <WireRail last={last && showFiles.length === 0} tone={paidNotOwned ? "paid" : holdsSelected ? "active" : "default"} />
              <div className="min-w-0 flex-1 pb-3">
                <GlassTile
                  onClick={() => {
                    if (mode === "modules") setExpanded((current) => { const next = new Set(current); if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId); return next; });
                  }}
                  disabled={mode === "resources"}
                  selected={holdsSelected}
                  className={`aspect-auto w-full px-3 py-3 text-left text-white [&>span]:w-full [&>span]:justify-start [&>span]:gap-2.5 ${mode === "resources" ? "cursor-default" : ""} ${
                    locked ? "border-amber-400/30" : ""
                  }`}
                  data-course-overlay-module
                  data-module-id={moduleId}
                  data-locked={locked ? "true" : "false"}
                  data-preview={preview ? "true" : "false"}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[10px] font-black ${
                    paidNotOwned ? "bg-amber-400/20 text-amber-200" : holdsSelected ? "bg-violet-500/30 text-white" : "bg-white/10 text-white/70"
                  }`}>{depth + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black">{module.title}</span>
                    <span className="mt-0.5 block text-[10px] font-bold text-[var(--course-muted)]">
                      {files.length} {files.length === 1 ? "file" : "files"}
                    </span>
                  </span>
                  {preview ? <Eye size={13} className="shrink-0 text-sky-300" /> : null}
                  {locked && !preview ? <LockKeyhole size={13} className="shrink-0 text-amber-400" /> : null}
                  {mode === "modules" && files.length > 0 ? (
                    open ? <ChevronDown size={15} className="shrink-0 text-[var(--course-muted)]" /> : <ChevronRight size={15} className="shrink-0 text-[var(--course-muted)]" />
                  ) : null}
                </GlassTile>

                {/* Locked paid module buy CTA */}
                {locked && paidNotOwned ? (
                  <GlassSurface radius={16} className="mt-1.5 border border-amber-400/30 text-white" contentClassName="flex items-center justify-between gap-2 p-2">
                    <p className="text-[10px] font-bold text-amber-200">Paid module</p>
                    <GlassButton
                      variant="capsule"
                      onClick={() => props.onBuyModule({ id: moduleId, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice })}
                      className="shrink-0 text-[10px] font-black [&>span>div]:h-8 [&>span>div]:px-2.5 [&>span>div]:text-amber-200"
                      data-course-overlay-buy-module={moduleId}
                    >
                      <span className="flex items-center gap-1"><ShoppingBag size={11} /> {module.paidUpdateTitle || "Buy"}</span>
                    </GlassButton>
                  </GlassSurface>
                ) : null}

                {showFiles.length > 0 && (
                  <div className="relative mt-1.5 space-y-1 pl-1">
                    {showFiles.map((file, fileIndex) => {
                      const Icon = fileIcon(file);
                      const fileLocked = locked || (file.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateKey(file)));
                      const selected = props.selectedFileId === file.id;
                      const lastFile = fileIndex === showFiles.length - 1;
                      return (
                        <div key={file.id} className="relative flex gap-2.5">
                          <div className="relative flex w-4 shrink-0 flex-col items-center">
                            <span className={`w-px flex-1 ${fileIndex === 0 ? "bg-transparent" : "bg-[var(--course-border)]"}`} />
                            <span className={`relative z-10 h-1.5 w-1.5 rounded-full ${selected ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" : fileLocked ? "bg-amber-400/70" : "bg-[var(--course-strong)]"}`} />
                            <span className={`w-px flex-1 ${lastFile ? "bg-transparent" : "bg-[var(--course-border)]"}`} />
                          </div>
                          <GlassTile
                            disabled={fileLocked}
                            onClick={() => props.onSelectFile(file)}
                            selected={selected}
                            className={`mb-0.5 aspect-auto min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold [&>span]:w-full [&>span]:justify-start [&>span]:gap-2.5 ${
                              selected ? "text-white" : fileLocked ? "cursor-not-allowed border-amber-400/20 text-white/45" : "text-white/75 hover:text-white"
                            }`}
                            data-course-overlay-file
                            data-file-id={file.id}
                            data-locked={fileLocked ? "true" : "false"}
                          >
                            <Icon size={15} className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{file.name}</span>
                            <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider opacity-70">{file.type}</span>
                            {fileLocked ? <LockKeyhole size={12} className="shrink-0 text-amber-400" /> : null}
                          </GlassTile>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WireRail({ last, tone }: { last: boolean; tone: "default" | "active" | "paid" }) {
  const node = tone === "paid"
    ? "border-amber-400 bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.65)]"
    : tone === "active"
      ? "border-violet-300 bg-violet-400 shadow-[0_0_14px_rgba(167,139,250,0.8)]"
      : "border-violet-400/80 bg-white/15 shadow-[0_0_10px_rgba(139,92,246,0.35)]";
  const line = tone === "paid" ? "bg-amber-400/40" : "bg-violet-400/40";
  return (
    <div className="relative flex w-5 shrink-0 flex-col items-center" data-course-wire-rail data-tone={tone}>
      <span className={`absolute top-4 bottom-0 w-px ${line} ${last ? "opacity-0" : ""}`} />
      <span className={`relative z-10 mt-[18px] h-3 w-3 rounded-full border-2 ${node}`} />
    </div>
  );
}

// ─── Paid content ───────────────────────────────────────────────────────────
function PaidList(props: CourseOverlayProps) {
  // Paid content is presented as a single, consistent list of the purchasable
  // paid updates. Each update groups its modules/files (a module's paidUpdateId
  // points at the update that includes it), so listing the same modules again
  // as separate rows would render the same paid content twice in two styles.
  const lockedModules = useMemo(
    () => flattenModules(props.modules).filter(({ module }) => module.accessLevel !== "hidden" && isPaidLocked(module, props.ownedUpdateIds)),
    [props.modules, props.ownedUpdateIds],
  );

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-4 pb-8" data-course-overlay-paid data-course-overlay-wire="true">
      {props.updates.length === 0 && lockedModules.length === 0 ? (
        <p className="grid h-40 place-items-center px-6 text-center text-xs text-[var(--course-muted)]">No paid content for this course.</p>
      ) : (
        <div className="relative">
          {props.updates.map((update, index) => (
            <div key={update.id} className="relative flex gap-3">
              <WireRail last={index === props.updates.length - 1 && lockedModules.length === 0} tone="paid" />
              <div className="min-w-0 flex-1 pb-3">
                <GlassSurface radius={20} className="border border-amber-400/25 text-white" contentClassName="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-black">
                        <Sparkles size={12} className="text-amber-300" /> {update.title}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-[var(--course-muted)]">{update.contentNames.slice(0, 3).join(" · ")}</p>
                    </div>
                    <span className="shrink-0 text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span>
                  </div>
                  <GlassButton variant="capsule" onClick={() => props.onBuyUpdate(update)} className="mt-3 w-full text-[11px] font-black [&>span>div]:h-10 [&>span>div]:w-full [&>span>div]:px-4 [&>span>div]:text-amber-200" data-course-overlay-buy-update={update.id}>
                    <span className="flex items-center justify-center gap-1.5"><ShoppingBag size={13} /> Buy this update</span>
                  </GlassButton>
                </GlassSurface>
              </div>
            </div>
          ))}
          {lockedModules.map(({ module, depth }, index) => {
            const moduleId = String(module.id);
            return (
              <div key={moduleId} className="relative flex gap-3" style={{ marginLeft: depth ? depth * 12 : 0 }}>
                <WireRail last={index === lockedModules.length - 1} tone="paid" />
                <div className="min-w-0 flex-1 pb-3">
                  <GlassSurface radius={20} className="border border-amber-400/20 text-white" contentClassName="p-3">
                    <p className="truncate text-xs font-black">{module.title}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-amber-200/80">Paid module</p>
                    <GlassButton
                      variant="capsule"
                      onClick={() => props.onBuyModule({ id: moduleId, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice })}
                      className="mt-2 text-[10px] font-black [&>span>div]:h-8 [&>span>div]:px-2.5 [&>span>div]:text-amber-200"
                      data-course-overlay-buy-module={moduleId}
                    >
                      <span className="flex items-center gap-1"><ShoppingBag size={11} /> {module.paidUpdateTitle || "Buy"}</span>
                    </GlassButton>
                  </GlassSurface>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
