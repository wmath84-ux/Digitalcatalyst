// src/course/MindMapPanel.tsx
//
// The learner-facing mind map editor, opened from the Course Player dock next
// to the Note tab.
//
// The panel's HOME screen is the map library — the grid of every map this
// module holds — so a FRESH visit lands on a choice ("konsi map kholni hai /
// nayi banani hai") instead of dropping straight onto whatever canvas was
// open last. Tapping a card opens that diagram for editing; "New map" starts
// a fresh one. Within one player visit the last view (library or canvas) is
// remembered in the panel session, so switching tabs and coming back keeps
// the learner's place; leaving the player resets it to the library.
//
// ── Interaction contract ─────────────────────────────────────────────────
//   `+`            → add a child to this node (then focus its editor)
//   tap node       → opens the inline editor straight away. The editor sits
//                    inside the node so the soft keyboard lands right on it.
//   drag node      → the node (and the branch under it) can be placed
//                    ANYWHERE by hand. The drop is remembered per node, so
//                    the hand-arranged map survives save / reload. Nodes the
//                    learner never dragged keep riding the tidy-tree layout.
//                    Whichever side of its PARENT a node ends up on is also
//                    which way it FACES: the anchor dot swivels to the edge
//                    pointing at the parent, the `+` to the opposite edge, and
//                    the branch grows away from the parent — re-derived live
//                    while the finger is down, so a node can never keep its
//                    wire hooked to the face pointing into empty space.
//   Enter / blur   → save the new topic and close the editor. Long text
//                    wraps inside the editor (the box grows while typing),
//                    so nothing overflows the node sideways.
//   Escape         → cancel the rename and keep the previous topic.
//   tap outside    → any open editor saves its content (blur behaves the
//                    same way, so closing the editor and tapping the canvas
//                    is one and the same action).
//   double-tap     → with "double-tap delete" switched ON from the toolbar,
//                    a double-tap asks for confirmation before the node and
//                    its whole branch are removed. The mode is OFF by default
//                    and is toggled by the pointer button in the toolbar, so
//                    a stray second tap can never delete a branch by accident
//                    — and no tap deletes anything without the explicit
//                    confirmation step.
//   toolbar trash  → deletes the SELECTED branch (a node that was just
//                    tapped or dragged). The root can never be deleted.
//
// ── Why delete moved OUT of the node into the toolbar ───────────────────
// The trash used to live inside the selected node. That made every selected
// node grow a second row and kept the destructive control millimetres from
// the rename input — one mis-tap on a phone took a whole branch. Deleting is
// now a deliberate two-step act: tap (select) → toolbar trash. The optional
// double-tap mode is for learners who want it even faster and can be turned
// off again from the same toolbar.
//
// ── Why taps are detected with pointerup, not click ─────────────────────
// With dragging enabled, React Flow binds d3-drag to every node, and
// d3-drag calls preventDefault() on touchstart — which on many mobile
// browsers swallows the synthetic click/dblclick that would follow a tap.
// Pointer events are dispatched regardless, so the editor opens from a
// pointerup that moved less than a few pixels (a tap), while a pointerup
// that travelled further is treated as the tail of a drag and ignored.
// The double-tap delete is measured the same way (two taps on the same node
// within 350ms), which makes it work identically for mouse, touch and pen.
//
// ── Theme: independently persisted ──────────────────────────────────────
// Each learner's map theme is saved separately from Player and Read. New
// preferences start Light; a previously saved Dark choice remains intact.
//
// ── The toolbar (the top strip, like the notes editor) ────────────────────
// ONE ICON PER CONTROL — the bar carries no words at all. From the left:
//   cloud-save  the save state, tinted by it, with a blinking beacon on top
//               while there is a message to read. Tapping it opens the
//               message itself plus "abhi save karein" (flush now) — the
//               full warning text lives in that drop-down; there is no
//               persistent error bar any more.
//   maps pill   this module's map list (icon + name + count).
//   then, right-aligned: auto-arrange, the ALIGN menu (how the boxes are
//   laid out — tree / one line / one column — and how a long label fits,
//   wrap or clipped to one line), fit-to-screen, delete-branch, the
//   independently persisted sun/moon theme switch, and the optional
//   double-tap-delete arm switch.
// There are no +/− zoom buttons any more: the canvas is pinched (and panned)
// straight with the fingers, and Fit re-frames the whole map in one tap.
// The strip sits ABOVE the canvas (toolbar first, diagram below), the same
// arrangement the notes editor uses — and its drop-downs open downward.
//
// ── Why the strip scrolls sideways (one line, never wrapped) ────────────
// The bar is a single side-scrolling line: every tool sits side-by-side and
// the strip scrolls horizontally on a narrow sheet instead of wrapping to a
// second line or clipping tools off. The old "toolbar khisak gaya left"
// report came from TWO mistakes this bar avoids:
//
//   1. A scrollable bar KEEPS the offset the browser hands it while scrolling
//      a focused tile into view (soft keyboard, orientation flip, reopen) —
//      this one resets any leftover offset on every open, so it always paints
//      from its left edge.
//   2. `justify-between` with percentage-width children: once the content is
//      wider than the bar the free space goes negative and a negative-space
//      `space-between` overflows out of BOTH ends, so the start edge becomes
//      unreachable. This bar uses `justify-start`, and the map-name pill
//      still collapses to its icon on a narrow sheet so the tools need as
//      little scrolling as possible.
//
// ── Why React Flow and not jsMind ────────────────────────────────────────
// jsMind ships a purpose-built tree, but its published core
// (`jsmind/es6/jsmind.js`, v0.9.1) contains zero touch handling — no
// `touchstart`/`touchmove`, and zoom is bound to the mouse wheel only. On a
// mobile-first PWA that rules it out. React Flow brings real pinch-zoom,
// drag-pan AND node dragging, and a custom node is just a React component,
// so the `+` button is ordinary JSX rather than DOM surgery.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlignHorizontalJustifyCenter,
  Check,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  Columns3,
  LayoutTemplate,
  Layers,
  Maximize,
  Moon,
  Network,
  Palette,
  Plus,
  RotateCcw,
  Square,
  Rows3,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Type,
  WrapText,
  FileJson,
} from "lucide-react";
import {
  addChildNode,
  autoArrangeMindMap,
  collectSubtreeIds,
  countNodes,
  facingBetweenBoxes,
  hasManualPositions,
  layoutMindMap,
  maxDepth,
  moveNodeSubtree,
  BRANCH_PALETTE,
  branchIndexMap,
  normalizeArrangement,
  readableInkOn,
  removeNode,
  rootId,
  setNodeStyle,
  setNodeTopic,
  type MindMap,
  type MindMapArrangement,
  type MindNodeStyle,
} from "../../utils/mindMapTree";
import type { MindMapSaveStatus, MindMapSummary } from "./useCourseMindMap";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import MindMapJsonImportDialog from "./MindMapJsonImport";
import type { CourseModule } from "../types/course";
import type { PersonalCourseModule } from "../types/personalCourse";
import { getCoursePanelSession, setMindMapSessionView } from "./coursePanelSession";
import { useCourseTheme, useMasterSelfPreference } from "./playerPreferences";
import MasterSelfControl from "./MasterSelfControl";
import { StudyLibraryEmptyState, StudyLibraryNotice } from "./StudyLibraryStates";
import BranchedMenu, { BranchedMenuSkeleton, useBranchedOpen, type BranchedMenuItem } from "../components/branched-menu/BranchedMenu";
import { ancestorSectionValues, buildBranchTree, type BranchEntry, type BranchSegment } from "../components/branched-menu/branchedTree";
import { resolveCourseResourceContext, resolvePersonalResourceContext } from "./studyResourceContext";

// ── Theme ─────────────────────────────────────────────────────────────────

/**
 * The map's palette (Part 1 §8/§9): genuine dark AND light. New preferences
 * start Light with a WHITE canvas and zoom-participating grid; an existing
 * Dark choice retains its treatment. The feature saves separately from Player
 * and Read, using real palette tokens rather than CSS inversion.
 */
export type MindMapTheme = "dark" | "light";

// ── Box alignment + text fit ──────────────────────────────────────────────
//
// Two view-level choices the toolbar's ALIGN menu owns:
//
//   arrangement  how the boxes sit on the canvas — the classic two-sided
//                tidy tree, every box in ONE horizontal line, or every box
//                in ONE vertical column. The branches (parent → child) never
//                change, so this is a way of LOOKING at the same map, which
//                is exactly why it is a per-device preference and not map
//                data: it must never cost a Firestore write or show up as an
//                edit for anyone else.
//   textFit      what a box does with a long label — wrap it onto further
//                lines (`wrap`), or keep it to one clipped line with an
//                ellipsis (`clip`) so every box stays the same height.
//
// Both live in localStorage next to the theme + double-tap choices.

export type MindMapTextFit = "wrap" | "clip";

const arrangementStorageKey = "dc.mindMapArrangement";
const textFitStorageKey = "dc.mindMapTextFit";
const lookStorageKey = "dc.mindMapLook";

/**
 * How a box is drawn. `boxed` is the classic outlined card; `modern` is
 * text-first: no outline, a faint rectangle behind the words and a coloured
 * underline for the branch. A per-device VIEW choice — switching it never
 * touches the map's content.
 */
export type MindMapLook = "boxed" | "modern";

const loadLook = (): MindMapLook => {
  try {
    return localStorage.getItem(lookStorageKey) === "modern" ? "modern" : "boxed";
  } catch {
    return "boxed";
  }
};

/** Swatches offered by the node colour menu. */
const BOX_COLOURS = ["#ffffff", "#f8fafc", "#fef3c7", "#dcfce7", "#dbeafe", "#ede9fe", "#fce7f3", "#1e293b"];
const TEXT_COLOURS = ["#0f172a", "#ffffff", "#4f46e5", "#047857", "#b45309", "#be123c"];

const loadArrangement = (): MindMapArrangement => normalizeArrangement(
  (() => {
    try {
      return localStorage.getItem(arrangementStorageKey);
    } catch {
      return null;
    }
  })(),
);

const loadTextFit = (): MindMapTextFit => {
  try {
    return localStorage.getItem(textFitStorageKey) === "clip" ? "clip" : "wrap";
  } catch {
    return "wrap";
  }
};

// ── Custom node ───────────────────────────────────────────────────────────

interface MindNodeData extends Record<string, unknown> {
  topic: string;
  depth: number;
  /** The wing the tidy tree built this branch on (structural, from the map). */
  side: "left" | "right" | null;
  /**
   * Which side of its PARENT the box actually sits on — recomputed from the
   * live geometry, so a node dragged across the centre flips its anchor dot,
   * its `+` and its rope together instead of wiring backwards.
   */
  facing: "left" | "right" | null;
  collapsed: boolean;
  childCount: number;
  isRoot: boolean;
  selected: boolean;
  editing: boolean;
  /** Palette for this window — always the dark one. */
  theme: MindMapTheme;
  /**
   * How a long label is fitted inside the box — `wrap` folds it onto further
   * lines, `clip` keeps it to ONE line and cuts the tail with an ellipsis.
   * Picked from the toolbar's align menu; the layout measures the box with
   * the same rule, so the reserved space always matches what is painted.
   */
  textFit: MindMapTextFit;
  /** The look the box is drawn in (a view choice, not map data). */
  look: MindMapLook;
  /** Resolved box fill: the learner's colour, or the look's default. */
  fill: string;
  /** Resolved ink: the learner's text colour, or whichever reads on the fill. */
  ink: string;
  /** True when the learner set a box colour on this node. */
  customFill: boolean;
  /** The branch wire into this node, when the look or the learner sets one. */
  branch: string | null;
  onAddChild: (id: string) => void;
  /** Escape / a blank draft: back out of an edit (a brand-new node is removed). */
  onCancelEdit: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onCloseEditor: (id: string) => void;
  onCommitTopic: (id: string, topic: string) => void;
}

/**
 * The fill and ink for one box. A learner's colour always wins; otherwise the
 * look decides. The ink is judged against the SOLID colour the box sits on
 * (the custom fill, or the opaque base the translucent default paints over),
 * so text always follows the real background and the active theme.
 */
function paintFor(
  look: MindMapLook,
  theme: MindMapTheme,
  isRoot: boolean,
  style: MindNodeStyle | undefined,
): { fill: string; ink: string; customFill: boolean } {
  const light = theme === "light";
  const customFill = style?.bg ?? null;
  const inkBase =
    customFill ??
    (isRoot
      ? look === "boxed"
        ? "#4f46e5"
        : light
          ? "#e0e7ff"
          : "#312e81"
      : light
        ? "#ffffff"
        : "#0b1220");
  const defaultFill = isRoot
    ? look === "boxed"
      ? "#4f46e5"
      : light
        ? "rgba(79, 70, 229, 0.12)"
        : "rgba(129, 140, 248, 0.18)"
    : look === "boxed"
      ? light
        ? "#ffffff"
        : "rgba(255, 255, 255, 0.1)"
      : light
        ? "rgba(15, 23, 42, 0.045)"
        : "rgba(255, 255, 255, 0.06)";
  return {
    fill: customFill ?? defaultFill,
    ink: style?.text ?? readableInkOn(inkBase),
    customFill: customFill != null,
  };
}

/** A pointer that travelled further than this many px was a drag, not a tap. */
const TAP_SLOP_PX = 4;
/**
 * Below this strip width the toolbar drops to its compact tile and the map
 * name collapses to the map icon, so every tool stays on the bar even in a
 * narrow landscape split. Measured from the strip itself, not the viewport.
 *
 * 360px is the arithmetic, not a guess: seven tools at 30px + six 4px gaps
 * (234) plus the save tile, the gap and a shortened map pill (94) plus the
 * strip's own 16px padding comes to ~344, so a 390px phone keeps the map
 * name while a 360px one hands the space back to the tools.
 */
const MIN_FULL_TOOLBAR_WIDTH_PX = 360;
/** How long a finished save keeps blinking before it settles. */
const SAVED_BLINK_MS = 2400;
/** The editor's own minimum height — exactly one line of the 17px label leading. */
const EDITOR_MIN_HEIGHT_PX = 17;
/** The editor stops growing here (~7 lines) and scrolls internally instead. */
const EDITOR_MAX_HEIGHT_PX = 119;
/**
 * Shared empty "live facing" map. One frozen instance means "no override", so
 * clearing overrides at the end of a drag hands back the SAME object identity
 * React already had and the state update bails out instead of re-rendering.
 */
const EMPTY_FACING: Record<string, "left" | "right"> = Object.freeze({});

/**
 * One mind map box. The `+` sits just outside the measured box on the side
 * facing AWAY from the parent, and the anchor dot sits on the opposite face
 * (facing the parent), so neither changes the node's own width — the layout
 * measured this box in `utils/mindMapTree.js` and the two must agree pixel for
 * pixel or siblings would overlap.
 *
 * Which side that is comes from the node's FACING — the box's real position
 * relative to its parent — and not from the wing the branch was created on.
 * Drag a node from the left of the centre to the right and the dot, the rope
 * and the `+` all swing to the opposite edge, live while the finger is down.
 *
 * Single-tap on a node opens the inline editor right where the topic was
 * rendered, so the soft keyboard lands in the same place. The editor is a
 * wrapping textarea: long drafts fold onto further lines and the box grows
 * with the text (up to a cap) instead of overflowing sideways. Pressing
 * Enter, tapping outside the node, or tapping a different node all commit
 * the current draft and close the editor. A blank / whitespace-only draft is
 * treated as "cancel" so an accidental tap can never blank a node.
 *
 * The whole box is ALSO a drag handle: React Flow moves it anywhere on the
 * canvas and the drop is stored as the node's manual position. Buttons
 * inside the node carry the `nodrag` class so pressing them never starts a
 * drag, and taps that end on a button are left to the button's own click.
 */
function MindNode({ id, data, dragging }: NodeProps<Node<MindNodeData>>) {
  const {
    topic,
    depth,
    side,
    facing,
    isRoot,
    selected,
    editing,
    theme,
    textFit,
    look,
    fill,
    ink,
    customFill,
    branch,
    onAddChild,
    onOpenEditor,
    onCloseEditor,
    onCancelEdit,
    onCommitTopic,
  } = data;

  const [draft, setDraft] = useState(topic);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Pointer bookkeeping for tap-vs-drag + double-tap detection (see the
  // header comment for why this cannot rely on click events).
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  // Draft safety net: node dragging makes d3-drag preventDefault the
  // mousedown, so tapping ANOTHER node (or closing the sheet) swaps editors
  // without this input ever blurring — its draft would be lost. The refs
  // below let the editor commit itself when it is torn down mid-edit. Blur /
  // Enter / Escape mark the draft "settled" first, so nothing commits twice
  // and a cancel stays a cancel.
  const draftRef = useRef(topic);
  const settledRef = useRef(true);

  useEffect(() => {
    if (editing) {
      setDraft(topic);
      draftRef.current = topic;
      settledRef.current = false;
      // Autofocus lands the soft keyboard on the new node straight away, so
      // `+` → type → Enter (or tap outside) is a single uninterrupted flow.
      // The caret is parked at the end so the existing topic is appended to,
      // never overwritten by mistake.
      const raf = requestAnimationFrame(() => {
        const el = inputRef.current;
        el?.focus();
        if (el) {
          const end = el.value.length;
          try {
            el.setSelectionRange(end, end);
          } catch {
            /* value-length race on some mobile browsers — harmless */
          }
        }
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [editing, topic]);

  // The editor is a wrapping textarea, so long drafts fold onto further
  // lines instead of sliding sideways out of the box. Its height follows the
  // content (so the node can grow with it) but stops at EDITOR_MAX_HEIGHT_PX
  // so a wall of text can never eat the canvas — beyond the cap the field
  // scrolls vertically inside the box.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.max(EDITOR_MIN_HEIGHT_PX, Math.min(el.scrollHeight, EDITOR_MAX_HEIGHT_PX));
    el.style.height = `${height}px`;
    el.style.overflowY = el.scrollHeight > height ? "auto" : "hidden";
  }, [draft, editing]);

  // The commit-on-teardown counterpart of the safety net above. Runs when
  // editing ends (blur already committed → settled → no-op) or when the
  // input unmounts without ever blurring (editor switched / panel closed).
  useEffect(() => {
    if (!editing) return undefined;
    return () => {
      if (settledRef.current) return;
      settledRef.current = true;
      const trimmed = draftRef.current.trim();
      if (trimmed && trimmed !== topic) onCommitTopic(id, trimmed);
    };
    // `topic`/`id`/`onCommitTopic` are captured from the render that opened
    // the editor — exactly the values the pending draft must be compared
    // against. Re-running on their identity would re-arm a settled editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Depth drives the emphasis: the root is the boldest thing on screen and
  // each level steps down, so a wide map still reads as a hierarchy. The
  // light ("white mode") palette swaps the translucent white washes for
  // tinted cards with dark text so every level stays legible on white.
  // Wave 9: every box is the pack's GlassSurface (its own material in BOTH
  // map themes, white ink); the hierarchy is carried by the border colour
  // alone. The centre is the one solid box — indigo, the same meaning colour
  // every primary action on the site uses — so it stays the boldest thing
  // on screen without a painted gradient.
  // ── How the box is drawn ──────────────────────────────────────────────
  // Every colour is an INLINE style now (no class cascade to fight): the fill
  // and ink come from `paintFor`, so a learner's colour and the theme default
  // go through the same renderer. Boxed keeps the outlined card; modern drops
  // the outline and draws a coloured underline in the branch colour instead.
  const boxed = look === "boxed";
  const accent = branch ?? "#6366f1";
  const boxedBorder = isRoot
    ? "rgba(196, 181, 253, 0.6)"
    : depth === 1
      ? "rgba(167, 139, 250, 0.5)"
      : depth === 2
        ? "rgba(129, 140, 248, 0.35)"
        : theme === "light"
          ? "rgba(15, 23, 42, 0.2)"
          : "rgba(255, 255, 255, 0.15)";
  const ringShadow = editing
    ? "0 0 0 2px #8b5cf6"
    : selected
      ? "0 0 0 2px rgba(167, 139, 250, 0.85)"
      : null;
  const underlineShadow = boxed ? null : `inset 0 ${selected || editing ? -3 : -2}px 0 ${accent}`;
  const boxShadow = [underlineShadow, ringShadow].filter(Boolean).join(", ") || undefined;
  const showPlus = (selected || editing) && !dragging;

  // ── Which way the box faces ────────────────────────────────────────────
  // `facing` is the GEOMETRY — which side of its parent the box actually ended
  // up on — not the wing the branch was created on. A node sitting WEST of its
  // parent takes the rope on its EAST edge (the face pointing at the parent)
  // and grows its own children to the WEST, so the dot goes right and the `+`
  // left. Drag that same node to the EAST of its parent and the two swap: dot
  // left, `+` right. One rule, applied in both directions, so a node can never
  // keep an anchor (or a wire) hooked to the face pointing into empty space.
  const facesLeft = facing === "left";

  // ── Tap + double-tap detection (pointer events, see header) ────────────
  const handlePointerDown = (event: React.PointerEvent) => {
    pressStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const start = pressStartRef.current;
    pressStartRef.current = null;
    if (!start) return;
    // Buttons own their taps — the `+` adds a branch, the collapse chevron
    // toggles; neither should ever read as a tap on the node body.
    if (event.target instanceof Element && event.target.closest("button")) return;
    // Text-selection taps inside the open editor belong to the field, not
    // the node: they must never re-open the editor or count toward the
    // double-tap that deletes a branch.
    if (event.target instanceof Element && event.target.closest("[data-mind-node-input]")) return;
    const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (travelled > TAP_SLOP_PX) {
      // The tail of a drag — React Flow has already moved the node.
      return;
    }
    // A single tap opens the editor (the rename trigger — there is no
    // separate pencil). Part 1 §7 removed double-tap deletion: a tap can now
    // never delete; deleting a branch is only the toolbar trash.
    onOpenEditor(id);
  };

  // ── Connection Handles ─────────────────────────────────────────────────
  // React Flow needs explicit Handle elements on custom nodes to know WHERE
  // to start and end each edge path. Without them the SVG wire falls back to
  // (0,0) and renders as a tiny invisible dot. We render four handles — one
  // on each side — so the smoothstep router always picks the cleanest path
  // regardless of which direction the parent sits. All four are visually
  // invisible (opacity-0, pointer-events-none) so they never interfere with
  // the node's own tap-to-edit / drag-to-move interaction. The one dot the
  // learner DOES see (below) is a copy of whichever handle the rope is
  // currently attached to, so the socket and the wire can never disagree.
  const handleStyle: React.CSSProperties = {
    opacity: 0,
    pointerEvents: "none",
    width: 1,
    height: 1,
    border: "none",
    background: "transparent",
  };

  const body = (
    <>
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          wrap="soft"
          onChange={(event) => {
            setDraft(event.target.value);
            draftRef.current = event.target.value;
          }}
          onBlur={() => {
            // A blank / whitespace-only draft backs out instead of blanking the
            // node (a brand-new node that is still blank is removed).
            settledRef.current = true;
            const trimmed = draftRef.current.trim();
            if (!trimmed) {
              onCancelEdit(id);
              return;
            }
            if (trimmed !== topic) onCommitTopic(id, trimmed);
            onCloseEditor(id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              settledRef.current = true;
              const trimmed = draftRef.current.trim();
              if (trimmed) {
                onCommitTopic(id, trimmed);
                onCloseEditor(id);
              } else {
                onCancelEdit(id);
              }
            }
            if (event.key === "Escape") {
              event.preventDefault();
              // A cancel is still a settlement: the teardown safety net must
              // not "rescue" the draft the learner just discarded.
              settledRef.current = true;
              onCancelEdit(id);
            }
            // React Flow would otherwise treat typing as a canvas shortcut.
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          style={{ color: "inherit" }}
          className="nodrag w-full min-w-0 resize-none overflow-x-hidden whitespace-pre-wrap break-words bg-transparent p-0 text-inherit outline-none placeholder:text-white/40"
          placeholder="Idea likhein…"
          aria-label="Node ka text badlein"
          data-mind-node-input={id}
        />
      ) : textFit === "clip" ? (
        // One line, tail cut with an ellipsis — the box was measured for
        // exactly one line, so the height here matches the layout.
        <span className="min-h-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" data-mind-node-text-fit="clip">
          {topic}
        </span>
      ) : (
        <span className="line-clamp-4 min-h-0 flex-1 break-words" data-mind-node-text-fit="wrap">{topic}</span>
      )}
    </>
  );

  return (
    <div
      className={`group relative h-full w-full cursor-grab active:cursor-grabbing ${dragging ? "opacity-90" : ""}`}
      data-mind-node={id}
      data-mind-node-state={editing ? "editing" : dragging ? "dragging" : selected ? "selected" : "idle"}
      tabIndex={0}
      role="group"
      aria-label={isRoot ? `Central idea: ${topic}` : topic}
      onKeyDown={(event) => {
        // Keyboard select: Enter/Space on the node itself opens its editor.
        if (event.target !== event.currentTarget || editing) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenEditor(id);
        }
      }}
      data-mind-node-depth={depth}
      data-mind-node-side={side ?? "center"}
      data-mind-node-facing={facing ?? "center"}
      data-mind-node-selected={selected ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pressStartRef.current = null;
      }}
    >
      {/* Invisible connection handles — required by React Flow to route edges */}
      <Handle type="target" position={Position.Left} id="left" isConnectable={false} style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" isConnectable={false} style={handleStyle} />
      <Handle type="source" position={Position.Left} id="src-left" isConnectable={false} style={handleStyle} />
      <Handle type="source" position={Position.Right} id="src-right" isConnectable={false} style={handleStyle} />

      {/* One renderer for both looks: the box is a plain element whose fill,
          ink and border are inline, so a learner's colour and the theme
          default cannot be overridden by a stray class or CSS rule. */}
      <div
        className={`flex h-full w-full flex-col overflow-hidden px-2.5 pt-1.5 text-[13px] font-semibold leading-[17px] transition ${
          boxed ? "rounded-xl border" : "rounded-md"
        }`}
        style={{
          background: fill,
          color: ink,
          borderColor: boxed ? boxedBorder : "transparent",
          boxShadow,
        }}
        data-mind-node-body={id}
        data-mind-node-theme={theme}
        data-mind-node-look={look}
        data-mind-node-root={isRoot ? "true" : undefined}
        data-mind-node-custom={customFill ? "true" : "false"}
      >
        {body}
      </div>

      {/* ── The anchor dot: which face this box is wired to ───────────────
          A small mark on the edge that faces the parent, i.e. exactly where
          the rope plugs in. It is the mirror of the `+` below — one face in,
          the opposite face out — so a node dropped on the other side of its
          parent visibly turns around instead of keeping its socket (and its
          wire) hooked to the wrong edge. The centre has no parent to face, so
          it carries no dot at all. */}
      {isRoot ? null : (
        <span
          aria-hidden="true"
          data-mind-node-anchor={id}
          data-anchor-side={facesLeft ? "right" : "left"}
          style={branch ? { background: branch } : undefined}
          className={`pointer-events-none absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full ${
            facesLeft ? "-right-[3.5px]" : "-left-[3.5px]"
          }`}
        />
      )}

      {/* ── The `+`: one tap appends a child to THIS node. Hidden until the
          node is selected or a creation is in progress, so the canvas stays
          clean; a cancelled creation removes its node instead of leaving one. */}
      {showPlus ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddChild(id);
          }}
          className={`nodrag absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-violet-300/40 bg-indigo-600 text-white transition hover:scale-110 hover:bg-indigo-500 active:scale-95 ${
            facesLeft ? "-left-3.5" : "-right-3.5"
          }`}
          aria-label={`${isRoot ? "Central idea" : topic} ke andar nayi branch jodein`}
          title="Nayi branch jodein"
          data-mind-node-add={id}
        >
          <Plus size={14} strokeWidth={3} />
        </button>
      ) : null}
    </div>
  );
}

// Defined once at module scope: a fresh object each render makes React Flow
// tear down and rebuild every node, losing focus mid-typing.
const NODE_TYPES = { mindNode: MindNode };

// ── Rope edges (n8n-style flexible cables) ────────────────────────────────
//
// `smoothstep` draws rigid right-angle corridors. n8n (and Figma, tldraw)
// instead use a cubic Bézier whose control points sit OUT along each
// handle's facing, so the cable leaves the node straight, then sags toward
// the other end like a rope. The offset scales with distance — close nodes
// get a tight loop, far nodes get a long lazy curve — which is what makes
// the wiring feel "lacheela" instead of a drawn polyline.
//
// A second, thinner highlight stroke rides the same path so the cable reads
// as a round wire rather than a flat SVG line.

/** How far the Bézier control point is pushed along the handle, as a fraction of span. */
const ROPE_OFFSET_RATIO = 0.45;
const ROPE_OFFSET_MIN = 36;
const ROPE_OFFSET_MAX = 220;
/** Extra downward sag so a long span hangs like a cable, not a taut string. */
const ROPE_SAG_RATIO = 0.14;
const ROPE_SAG_MAX = 56;

const handleOut = (x: number, y: number, position: Position, offset: number, sag: number) => {
  switch (position) {
    case Position.Left:
      return { x: x - offset, y: y + sag * 0.35 };
    case Position.Right:
      return { x: x + offset, y: y + sag * 0.35 };
    case Position.Top:
      return { x: x, y: y - offset };
    case Position.Bottom:
    default:
      return { x: x, y: y + offset };
  }
};

/**
 * Mid-point of one face of a node box, in flow coordinates.
 * Wires are drawn from THESE points — the node's known width/height —
 * never from React Flow's handle DOM measurement, which collapses to a
 * 0×0 "dot" while the overlay is still animating or the map is still
 * arriving from the network.
 */
export const boxFaceAnchor = (
  node:
    | {
        position?: { x?: number; y?: number };
        width?: number;
        height?: number;
        measured?: { width?: number; height?: number };
        internals?: { positionAbsolute?: { x?: number; y?: number } };
      }
    | undefined,
  face: Position,
): { x: number; y: number } | null => {
  if (!node) return null;
  const width = Number(node.measured?.width ?? node.width ?? 0);
  const height = Number(node.measured?.height ?? node.height ?? 0);
  if (!(width > 0) || !(height > 0)) return null;
  const origin = node.internals?.positionAbsolute ?? node.position;
  const x = Number(origin?.x);
  const y = Number(origin?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const midY = y + height / 2;
  const midX = x + width / 2;
  switch (face) {
    case Position.Left:
      return { x, y: midY };
    case Position.Right:
      return { x: x + width, y: midY };
    case Position.Top:
      return { x: midX, y };
    case Position.Bottom:
    default:
      return { x: midX, y: y + height };
  }
};

/** Cubic Bézier path that leaves each handle along its facing, then sags. */
export const buildRopePath = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
): string => {
  const dx = Math.abs(targetX - sourceX);
  const dy = Math.abs(targetY - sourceY);
  const dist = Math.hypot(dx, dy);
  const offset = Math.max(ROPE_OFFSET_MIN, Math.min(ROPE_OFFSET_MAX, dist * ROPE_OFFSET_RATIO));
  const sag = Math.min(ROPE_SAG_MAX, dist * ROPE_SAG_RATIO);
  const c1 = handleOut(sourceX, sourceY, sourcePosition, offset, sag);
  const c2 = handleOut(targetX, targetY, targetPosition, offset, sag);
  return `M ${sourceX},${sourceY} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${targetX},${targetY}`;
};

function RopeEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  // Prefer the node's own box (width/height we already know) over handle
  // bounds. Handle bounds are what made wires vanish while the violet
  // anchor dots on the nodes still painted.
  const sourceNode = useStore((state) => state.nodeLookup?.get(source));
  const targetNode = useStore((state) => state.nodeLookup?.get(target));
  const fromBox = boxFaceAnchor(sourceNode, sourcePosition);
  const toBox = boxFaceAnchor(targetNode, targetPosition);
  const sx = fromBox?.x ?? sourceX;
  const sy = fromBox?.y ?? sourceY;
  const tx = toBox?.x ?? targetX;
  const ty = toBox?.y ?? targetY;
  if (![sx, sy, tx, ty].every((value) => Number.isFinite(value))) return null;
  if (Math.hypot(tx - sx, ty - sy) < 1) return null;
  const path = buildRopePath(sx, sy, tx, ty, sourcePosition, targetPosition);
  const stroke = (style && typeof style.stroke === "string" ? style.stroke : undefined) || "var(--mm-edge-right)";
  const width = typeof style?.strokeWidth === "number" ? style.strokeWidth : 2.4;
  return (
    <>
      <BaseEdge
        id={`${id}-glow`}
        path={path}
        style={{
          stroke,
          strokeWidth: width + 3,
          strokeLinecap: "round",
          fill: "none",
          opacity: 0.22,
        }}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          stroke,
          strokeWidth: width,
          strokeLinecap: "round",
          fill: "none",
        }}
      />
    </>
  );
}

const EDGE_TYPES = { rope: RopeEdge };

// ── Save-status pill ──────────────────────────────────────────────────────

const SAVE_COPY: Record<MindMapSaveStatus, { label: string; tone: string }> = {
  idle: { label: "Sign in karke save hoga", tone: "text-white/60" },
  loading: { label: "Loading…", tone: "text-white/60" },
  ready: { label: "Ready", tone: "text-white/60" },
  saving: { label: "Saving…", tone: "text-amber-300" },
  saved: { label: "Cloud par saved", tone: "text-emerald-300" },
  error: { label: "Save retry ho raha hai", tone: "text-rose-300" },
};

// ── Toolbar drop-down ─────────────────────────────────────────────────────

/**
 * Width of a tool drop-down. Deliberately small — "chhota sa drop down" —
 * so it never covers the diagram it is styling.
 */
const MENU_WIDTH_PX = 224;

/** One row of colour swatches (plus default and a native custom picker). */
function ColourSwatches({
  label,
  value,
  options,
  onPick,
  allowDefault,
}: {
  label: string;
  value: string | null | undefined;
  options: readonly string[];
  onPick: (colour: string | null) => void;
  allowDefault?: boolean;
}) {
  const chip = "grid h-6 w-6 shrink-0 place-items-center rounded-full border border-black/20 transition hover:scale-110";
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5">
      {allowDefault ? (
        <button
          type="button"
          className={`${chip} bg-white text-[10px] font-bold text-slate-500`}
          aria-label={`${label}: default`}
          aria-pressed={!value}
          title="Default"
          onClick={() => onPick(null)}
        >
          /
        </button>
      ) : null}
      {options.map((colour) => (
        <button
          key={colour}
          type="button"
          className={chip}
          style={{
            background: colour,
            boxShadow: value === colour ? "0 0 0 2px #ffffff, 0 0 0 3.5px #7c3aed" : undefined,
          }}
          aria-label={`${label} ${colour}`}
          aria-pressed={value === colour}
          title={colour}
          onClick={() => onPick(colour)}
        />
      ))}
      <input
        type="color"
        className="h-6 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        aria-label={`${label} — custom`}
        title="Custom colour"
        value={value ?? "#808080"}
        onChange={(event) => onPick(event.target.value)}
      />
    </div>
  );
}

interface ToolbarMenuProps {
  open: boolean;
  /** The toolbar button the menu hangs off. */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** The menu lives outside the shell, so it carries the theme itself. */
  theme: MindMapTheme;
  label: string;
  children: React.ReactNode;
}

/**
 * The small drop-down a toolbar icon opens.
 *
 * It is PORTALLED to the body on purpose. The status strip is clipped (that
 * clip is the "toolbar slid to the left" fix), so a menu rendered inside it
 * would be sliced off at the strip's edge. Fixed positioning against the
 * trigger's own rect keeps it glued to its button while the sheet animates,
 * it opens DOWNWARD because the bar sits at the top of the sheet, and it
 * clamps itself into the viewport (sideways and vertically) so it can never
 * hang off a phone screen.
 */
function ToolbarMenu({ open, anchorRef, onClose, theme, label, children }: ToolbarMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ bottom: number; right: number } | null>(null);

  // Re-measure on every resize / scroll: the sheet slides, the keyboard
  // lifts it, and a menu that keeps the FIRST rect floats away from its
  // button.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const box = anchorRef.current?.getBoundingClientRect();
      if (!box) return;
      setAnchor({ bottom: box.bottom, right: box.right });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture phase, so a tap ANYWHERE else — canvas, node, dock, scrim —
    // closes the menu before it can act on something behind it. The trigger
    // itself is skipped: its own onClick toggles the menu, and closing here
    // would make that toggle a no-op.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !anchor) return null;

  const viewportWidth = window.innerWidth;
  const width = Math.min(MENU_WIDTH_PX, viewportWidth - 16);
  const left = Math.max(8, Math.min(anchor.right - width, viewportWidth - width - 8));
  // The menu grows downward from 8px below its trigger, and is never allowed
  // to be taller than the space below it (so it can't run off the bottom).
  const spaceBelow = Math.max(120, window.innerHeight - anchor.bottom - 16);
  const maxHeight = Math.min(spaceBelow, Math.round(window.innerHeight * 0.6));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="mm-menu fixed"
      data-mm-menu
      data-course-theme-portal=""
      data-course-theme={theme}
      data-menu-theme={theme}
      style={{ left, width, maxHeight, top: anchor.bottom + 8 }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ── The align menu's options ──────────────────────────────────────────────
//
// `arrangement` is how the boxes sit on the canvas (all three views carry the
// SAME branches — only the geometry changes), `textFit` is what one box does
// with a label longer than the box. Both are pure view choices, so they are
// remembered per device and never written to the map.

const ARRANGEMENT_OPTIONS: {
  value: MindMapArrangement;
  label: string;
  hint: string;
  Icon: typeof Network;
}[] = [
  { value: "tree", label: "Tree", hint: "Classic mind map — dono taraf branches", Icon: Network },
  { value: "line", label: "Ek line", hint: "Saare boxes ek hi line mein", Icon: Rows3 },
  { value: "stack", label: "Ek column", hint: "Saare boxes ek ke neeche ek", Icon: Columns3 },
];

const TEXT_FIT_OPTIONS: { value: MindMapTextFit; label: string; hint: string; Icon: typeof Type }[] = [
  { value: "wrap", label: "Wrap", hint: "Lamba text agli line mein ghoom jayega", Icon: WrapText },
  { value: "clip", label: "Ek line · clip", hint: "Har box ek line ka, aage “…”", Icon: Type },
];

// ── Panel ─────────────────────────────────────────────────────────────────

const MAP_COLOR = "#a78bfa";
const SELF_MAP_TAG = "#c4b5fd";
const MASTER_MAP_TAG = "#93c5fd";

export interface MindMapPanelProps {
  mind: MindMap;
  onMindChange: (updater: MindMap | ((current: MindMap) => MindMap)) => void;
  status: MindMapSaveStatus;
  errorMessage?: string | null;
  /** Flush the debounced write now — called when the sheet closes. */
  onFlush?: () => void;
  /**
   * True when the panel is opened in landscape. The status strip and the
   * floating zoom controls stay mounted in both orientations, but in
   * landscape they are nudged to the bottom-left of the canvas so the
   * diagram fills the rest of the sheet — the `+` buttons and pinch-zoom
   * keep adding + zooming possible, so nothing the old portrait toolbar
   * offered is lost.
   */
  landscape?: boolean;
  /**
   * True while the mind map sheet itself is open. The map library (the grid
   * of this module's maps) is the panel's HOME screen: it shows first on
   * mount and comes back every time the sheet is reopened, so the learner
   * always picks which map to open / edit — or taps "New map" — before
   * landing on a canvas.
   */
  open?: boolean;

  // ── The module's list of maps (Notes-style: many maps, not one) ────────
  /** Every map the learner has in the active module. */
  maps?: MindMapSummary[];
  /** Which map the canvas is showing. */
  activeMapKey?: string;
  /** Open another map from the list. */
  onSelectMap?: (mapKey: string) => void;
  /** Start a brand-new, empty map in this module. */
  onCreateMap?: (title?: string) => void;
  /** Rename any map in the list. */
  onRenameMap?: (mapKey: string, title: string) => void;
  /** Delete a map from the list. */
  onDeleteMap?: (mapKey: string) => void;
  /** True while the module's list is still loading. */
  mapsLoading?: boolean;
  /** True when the module already holds the maximum number of maps. */
  atMapLimit?: boolean;
  /** Existing course and module trees feed the library's breadcrumb. */
  courseTitle?: string;
  modules?: CourseModule[];
  moduleId?: string | null;
  personalModules?: PersonalCourseModule[];
  /** Retry an unsuccessful library read without rebuilding its local mirror. */
  onRetryMaps?: () => void;
  /** The signed-in learner — scopes the remembered MASTER/SELF + theme prefs. */
  uid?: string | null;
  /** Course/admin-provided MASTER mind maps (Part 1 §10). Read-only here. */
  masterMaps?: MindMapSummary[];
  /** Open a MASTER map's own resource (its lesson page), by its map key. */
  onOpenMasterMap?: (mapKey: string) => void;
}

function MindMapCanvas(props: MindMapPanelProps) {
  const {
    mind,
    onMindChange,
    status,
    errorMessage,
    onFlush,
    landscape: _landscape,
    open = true,
    maps = [],
    activeMapKey = "main",
    onSelectMap,
    onCreateMap,
    onRenameMap,
    onDeleteMap,
    mapsLoading = false,
    atMapLimit = false,
    courseTitle = "",
    modules = [],
    moduleId,
    personalModules = [],
    onRetryMaps,
    uid = null,
    masterMaps = [],
  onOpenMasterMap,
  } = props;
  /** The map library sheet (grid of this module's maps) is the HOME screen:
   *  it is open by default (fresh player entry) so the learner picks a map to
   *  edit — or creates a new one — before ever landing on a canvas. Within a
   *  single player visit the last view (library vs canvas) is restored from
   *  the panel session instead, so switching tabs never yanks the learner
   *  back to the library. */
  const [libraryOpen, setLibraryOpen] = useState(
    () => getCoursePanelSession().mindMapView !== "canvas",
  );
  // AI / JSON import: the dialog is closed by default. `undoSnapshot` holds the
  // map that was on the canvas before a JSON replacement, so it can be restored.
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<MindMap | null>(null);
  const applyJsonMap = useCallback((next: MindMap) => {
    setUndoSnapshot(mind);
    onMindChange(() => next);
  }, [mind, onMindChange]);
  const undoJsonMap = useCallback(() => {
    if (!undoSnapshot) return;
    const snapshot = undoSnapshot;
    setUndoSnapshot(null);
    onMindChange(() => snapshot);
  }, [undoSnapshot, onMindChange]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Deletion is always gated behind a confirmation overlay — a branch (toolbar
  // trash / double-tap) or a whole map (library trash). Nothing is removed by
  // the first tap; the red confirm button is the only path that deletes.
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteMapKey, setDeleteMapKey] = useState<string | null>(null);

  // If the panel closes while a confirmation is open (programmatic close /
  // tab switch), drop the pending target so a stale dialog can never float
  // over the player after the sheet is gone.
  useEffect(() => {
    if (!open) {
      setDeleteTargetId(null);
      setDeleteMapKey(null);
    }
  }, [open]);
  // Part 1 §8/§11 — the map's daylight/light-dark switch and its MASTER/SELF
  // filter, both remembered per user through the shared preference layer
  // (never ephemeral React state, never a CSS inversion).
  const mindThemeCtl = useCourseTheme("mindMap", uid ?? null, "light"); // Mind Map defaults to Light
  const mindTheme: MindMapTheme = mindThemeCtl.theme;
  const masterSelfCtl = useMasterSelfPreference("mindMap", uid ?? null, "master");
  // ── Align-menu choices (box arrangement + how a long label fits) ───────
  // Views, not data: they are remembered per device and never written to
  // Firestore.
  const [arrangement, setArrangement] = useState<MindMapArrangement>(loadArrangement);
  const [textFit, setTextFit] = useState<MindMapTextFit>(loadTextFit);
  // Boxed (classic) or Modern look — a per-device view, like the alignment.
  const [look, setLook] = useState<MindMapLook>(loadLook);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const styleAnchorRef = useRef<HTMLButtonElement>(null);
  // The node a `+` just created and that is still being named. Backing out of
  // that first edit removes it, so a cancelled `+` never leaves a stray node.
  const freshIdRef = useRef<string | null>(null);
  // Which tool drop-down is open. Only one at a time, and both are portalled
  // to the body so the clipped status strip cannot cut them in half.
  const [alignMenuOpen, setAlignMenuOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  // The status strip measures ITSELF: a landscape split panel can be far
  // narrower than the screen, so media queries alone cannot know when to
  // drop to the compact tile (and hide the map name).
  const [toolbarCompact, setToolbarCompact] = useState(false);
  const { fitView, setCenter } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const canvasRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const saveAnchorRef = useRef<HTMLButtonElement>(null);
  const alignAnchorRef = useRef<HTMLButtonElement>(null);

  // Set while a real node drag is in progress, so the click that follows a
  // drop can be told apart from a genuine tap on the node.
  const dragMovedRef = useRef(false);
  // While a box is being dragged we must NOT rebuild nodes from the tidy-tree
  // layout — that would snap the box back every frame. React Flow 12 is fully
  // controlled: without applyNodeChanges the node never actually moves, and
  // the rope never follows.
  const draggingRef = useRef(false);
  const dragSessionRef = useRef<{
    id: string;
    origin: { x: number; y: number };
    starts: Map<string, { x: number; y: number }>;
    moving: Set<string>;
  } | null>(null);

  useEffect(() => {
    setMindMapSessionView(libraryOpen ? "library" : "canvas");
  }, [libraryOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(arrangementStorageKey, arrangement);
    } catch {
      /* ignore */
    }
  }, [arrangement]);

  useEffect(() => {
    try {
      localStorage.setItem(lookStorageKey, look);
    } catch {
      /* ignore */
    }
  }, [look]);

  // The colour menu is about the selected node: no selection, no menu.
  useEffect(() => {
    if (selectedId == null) setStyleMenuOpen(false);
  }, [selectedId]);

  useEffect(() => {
    try {
      localStorage.setItem(textFitStorageKey, textFit);
    } catch {
      /* ignore */
    }
  }, [textFit]);

  // The library is the panel's home screen on a FRESH visit. When the learner
  // closes the sheet with the same-tab dock toggle and opens it again (the
  // panel stays mounted), the last view is restored from the panel session:
  // library stays library, canvas stays canvas. Landing back on the library
  // also clears any half-finished node edit / rename, so the picker starts
  // clean; returning to the canvas keeps the diagram exactly as it was.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const resumeCanvas = getCoursePanelSession().mindMapView === "canvas";
      setLibraryOpen(!resumeCanvas);
      if (!resumeCanvas) {
        setSelectedId(null);
        setEditingId(null);
      }
      // Opening the sheet must never inherit a stale tool drop-down…
      setAlignMenuOpen(false);
      setSaveMenuOpen(false);
      // …nor a stale horizontal offset on the status strip. The strip no
      // longer scrolls, but a keyboard / orientation change can still hand
      // one to a `overflow: hidden` box (it scrolls programmatically), and a
      // scrolled strip is exactly the "toolbar slid to the left" report:
      // the bar paints from the middle with its left edge cut off.
      const strip = statusRef.current;
      if (strip && strip.scrollLeft !== 0) strip.scrollLeft = 0;
    }
    // A closed sheet must not leave a drop-down floating over the lesson.
    if (!open) {
      setAlignMenuOpen(false);
      setSaveMenuOpen(false);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Flush the debounced write when the panel unmounts. The overlay unmounts
  // this on a tab switch, so this is the safety net that pairs with the
  // parent's own "leaving the mind map tab" flush.
  useEffect(() => () => { onFlush?.(); }, [onFlush]);

  // ── The status strip sizes itself to the space it actually has ─────────
  // A landscape split panel is much narrower than the screen it sits on, so
  // the strip watches its OWN width and drops to the compact tile (and hides
  // the map name) when there is not enough room — that is what keeps every
  // tool reachable on a phone, a tablet and a desktop split alike.
  useEffect(() => {
    const el = statusRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (!width) return;
      setToolbarCompact(width < MIN_FULL_TOOLBAR_WIDTH_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── The save beacon ───────────────────────────────────────────────────
  // The cloud tile replaced a text label, so the message lives in a tooltip +
  // a drop-down — and while there IS a message the tile wears a blinking dot
  // on its top-right corner, so "saving…" / "saved" / "retrying" is visible
  // without reading a word. A completed save blinks for a beat and settles;
  // an in-flight or failed one blinks until the state moves on.
  const [saveBlink, setSaveBlink] = useState(false);
  useEffect(() => {
    if (status === "saving" || status === "error") {
      setSaveBlink(true);
      return undefined;
    }
    if (status === "saved") {
      setSaveBlink(true);
      const timer = window.setTimeout(() => setSaveBlink(false), SAVED_BLINK_MS);
      return () => window.clearTimeout(timer);
    }
    setSaveBlink(false);
    return undefined;
  }, [status]);

  // A different alignment (or a different text rule) moves every box, so the
  // canvas re-frames itself — otherwise the learner flips to "one line" and
  // stares at empty canvas because the row now lives off-screen.
  const firstAlignRef = useRef(true);
  useEffect(() => {
    if (firstAlignRef.current) {
      firstAlignRef.current = false;
      return undefined;
    }
    if (libraryOpen) return undefined;
    const timer = window.setTimeout(() => void fitView({ duration: 320, padding: 0.2 }), 60);
    return () => window.clearTimeout(timer);
  }, [arrangement, textFit, fitView, libraryOpen]);

  // The layout is the SAME map in the ALIGNMENT the toolbar picked, measured
  // with the text rule the toolbar picked: `clip` measures every box for one
  // line only, so the reserved height always matches what the node paints.
  const layout = useMemo(
    () => layoutMindMap(mind, { arrange: arrangement, measure: { maxLines: textFit === "clip" ? 1 : 0 } }),
    [mind, arrangement, textFit],
  );

  // ── Facing, live ───────────────────────────────────────────────────────
  // `layoutMindMap` resolves a `facing` for every box (which side of its
  // parent it really ends up on), so a map full of hand-placed nodes wires up
  // correctly on the very first paint. While a drag is RUNNING the layout is
  // deliberately frozen — React Flow is moving the boxes in its own state — so
  // the dragged node's facing is recomputed here from the live pointer spot.
  //
  // Only the node UNDER THE FINGER can change facing mid-drag: a branch
  // travels rigidly, so nothing inside the group moves relative to anything
  // else, and the parent above the group never moves at all.
  const facingOverrideRef = useRef<Record<string, "left" | "right">>(EMPTY_FACING);
  const [facingOverride, setFacingOverride] = useState<Record<string, "left" | "right">>(EMPTY_FACING);

  // Size / position lookup the drag handler needs, keyed by node id.
  const boxById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);
  const parentById = useMemo(
    () => new Map(mind.nodes.map((node) => [String(node.id), String(node.parentId)])),
    [mind.nodes],
  );

  /**
   * Flip the picked node's anchor to the face that now points at its parent.
   * Runs on every pointer move of a drag; it only ever writes state when the
   * answer actually changes, so a long drag costs zero extra renders.
   */
  const syncDragFacing = useCallback(
    (nodeId: string, x: number) => {
      const parentId = parentById.get(nodeId);
      const parent = parentId ? boxById.get(parentId) : undefined;
      const self = boxById.get(nodeId);
      if (!parent || !self) return;
      const facing = facingBetweenBoxes(
        { x: parent.x, width: parent.width },
        { x, width: self.width },
        // A near-tie keeps the answer the map already settled on (its resolved
        // facing, or the wing it was created on) instead of flicking between
        // two faces on a one-pixel horizontal wobble.
        self.facing ?? self.side ?? undefined,
      );
      const current = facingOverrideRef.current;
      if (current[nodeId] === facing) return;
      const next = { ...current, [nodeId]: facing };
      facingOverrideRef.current = next;
      setFacingOverride(next);
    },
    [boxById, parentById],
  );

  const clearDragFacing = useCallback(() => {
    if (facingOverrideRef.current === EMPTY_FACING) return;
    facingOverrideRef.current = EMPTY_FACING;
    setFacingOverride(EMPTY_FACING);
  }, []);

  // Keep the node being typed into in view. A branch added at the edge of a
  // wide map would otherwise appear off-screen, and the learner would have no
  // idea their `+` tap did anything.
  useEffect(() => {
    if (!editingId) return;
    const placed = layout.nodes.find((node) => node.id === editingId);
    if (!placed) return;
    const raf = requestAnimationFrame(() => {
      void setCenter(placed.x + placed.width / 2, placed.y + placed.height / 2, { duration: 240 });
    });
    return () => cancelAnimationFrame(raf);
  }, [editingId, layout.nodes, setCenter]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleAddChild = useCallback(
    (parentId: string) => {
      let createdId: string | null = null;
      onMindChange((current) => {
        const result = addChildNode(current, parentId, "New idea");
        createdId = result.nodeId;
        return result.mind;
      });
      // Drop the new node straight into rename mode — `+` then type is the
      // whole point of the interaction.
      if (createdId) {
        freshIdRef.current = createdId;
        setSelectedId(createdId);
        setEditingId(createdId);
      }
    },
    [onMindChange],
  );

  // FIRST step of branch deletion: open the confirmation overlay. The node is
  // only removed when the learner taps the red confirm button (`performDelete`).
  const requestDelete = useCallback((id: string) => {
    setDeleteMapKey(null);
    setDeleteTargetId(id);
  }, []);

  // SECOND step: the confirmed destructive action.
  const performDelete = useCallback(
    (id: string) => {
      onMindChange((current) => removeNode(current, id));
      setSelectedId((current) => (current === id ? null : current));
      setEditingId((current) => (current === id ? null : current));
      setDeleteTargetId(null);
    },
    [onMindChange],
  );

  // FIRST step of whole-map deletion (map library card).
  const requestMapDelete = useCallback((mapKey: string) => {
    setDeleteTargetId(null);
    setDeleteMapKey(mapKey);
  }, []);

  const handleOpenEditor = useCallback((id: string) => {
    // Single tap on a node opens the editor directly. Selection is implied
    // (the editor input is only ever the active one), so the same call also
    // updates the selected id. Calling this on the root is a no-op for
    // delete but still lets the learner edit the central idea.
    setSelectedId(id);
    setEditingId(id);
  }, []);

  const handleCloseEditor = useCallback((id: string) => {
    if (freshIdRef.current === id) freshIdRef.current = null;
    setEditingId((current) => (current === id ? null : current));
  }, []);

  /**
   * Escape, or a blank draft: the learner backed out of naming a node. A node
   * that `+` just created is removed again (it never really existed); any other
   * node simply stops being edited, keeping its text.
   */
  const handleCancelEdit = useCallback(
    (id: string) => {
      if (freshIdRef.current === id) {
        freshIdRef.current = null;
        onMindChange((current) => removeNode(current, id));
        setSelectedId((current) => (current === id ? null : current));
      }
      setEditingId((current) => (current === id ? null : current));
    },
    [onMindChange],
  );

  const handleCommitTopic = useCallback(
    (id: string, topic: string) => {
      if (freshIdRef.current === id) freshIdRef.current = null;
      onMindChange((current) => setNodeTopic(current, id, topic));
    },
    [onMindChange],
  );

  // ── Node colours ───────────────────────────────────────────────────────
  // Writes only the selected node's (or the centre's) colour keys; a reset
  // clears them so the node falls back to the look's default.
  const applyStyle = useCallback(
    (patch: Parameters<typeof setNodeStyle>[2]) => {
      if (selectedId == null) return;
      const target = selectedId;
      onMindChange((current) => setNodeStyle(current, target, patch));
    },
    [selectedId, onMindChange],
  );

  // ── One-click clean-up ─────────────────────────────────────────────────
  // Every hand-dragged node stores its own pin, and enough dragging turns a
  // map into spaghetti. "Auto arrange" drops every pin (and re-balances the
  // two wings) so the tidy-tree layout in utils/mindMapTree.js re-organises
  // the WHOLE diagram in one tap, then the view re-fits so the learner sees
  // the result straight away. The maths is pure and unit tested; this
  // handler only wires the button to it.
  const handleAutoArrange = useCallback(() => {
    onMindChange((current) => autoArrangeMindMap(current));
    // Let the layout pass land before re-framing, otherwise fitView measures
    // the OLD bounds and the freshly tidied map sits off-centre.
    window.setTimeout(() => void fitView({ duration: 320, padding: 0.2 }), 60);
  }, [onMindChange, fitView]);

  /** A tidy map has no pins left, so the button has nothing to clean up. */
  const messy = hasManualPositions(mind);

  // ── Map library helpers ────────────────────────────────────────────────
  /** Name of the map currently on the canvas, for the switcher button. */
  const activeMapName =
    maps.find((entry) => entry.mapKey === activeMapKey)?.title || mind.title || mind.rootTopic || "Mind map";

  const openMap = useCallback(
    (mapKey: string) => {
      if (mapKey !== activeMapKey) onSelectMap?.(mapKey);
      setLibraryOpen(false);
      setSelectedId(null);
      setEditingId(null);
      setDeleteTargetId(null);
      setDeleteMapKey(null);
    },
    [activeMapKey, onSelectMap],
  );

  // The root can never be deleted, so the toolbar trash only arms itself for
  // a real branch selection.
  const canDeleteSelected = selectedId != null && selectedId !== rootId();

  // ── Confirmation overlay content (branch + whole map) ───────────────────
  const deleteTargetNode = deleteTargetId
    ? mind.nodes.find((node) => String(node.id) === String(deleteTargetId)) || null
    : null;
  const deleteTargetBranchCount = deleteTargetId
    ? collectSubtreeIds(mind, deleteTargetId).length
    : 0;
  const deleteMapEntry = deleteMapKey
    ? maps.find((entry) => entry.mapKey === deleteMapKey) || null
    : null;

  // ── React Flow nodes + edges, derived from the layout ──────────────────
  // Per-node colour overrides, keyed by id (the centre included).
  const styleById = useMemo(() => {
    const map = new Map<string, MindNodeStyle | undefined>([[rootId(), mind.rootStyle]]);
    for (const node of mind.nodes) map.set(String(node.id), node.style);
    return map;
  }, [mind.nodes, mind.rootStyle]);

  // The wire INTO each node. A learner's branch colour applies to that one
  // wire only. In Modern look an unset wire takes its top-level branch colour
  // from the palette, so every branch reads as one coordinated colour.
  const branchIndex = useMemo(() => branchIndexMap(mind), [mind]);
  const wireById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const node of mind.nodes) {
      const id = String(node.id);
      if (node.style?.edge) {
        map.set(id, node.style.edge);
        continue;
      }
      const index = branchIndex.get(id);
      map.set(
        id,
        look === "modern" && index != null ? BRANCH_PALETTE[index % BRANCH_PALETTE.length] : null,
      );
    }
    return map;
  }, [mind.nodes, branchIndex, look]);

  const selectedStyle = selectedId == null ? undefined : styleById.get(String(selectedId));

  const layoutNodes: Node<MindNodeData>[] = useMemo(() => {
    const topicById = new Map<string, string>([[rootId(), mind.rootTopic]]);
    for (const node of mind.nodes) topicById.set(String(node.id), node.topic);

    return layout.nodes.map((placed) => {
      const paint = paintFor(look, mindTheme, placed.isRoot, styleById.get(placed.id));
      return {
        id: placed.id,
        type: "mindNode",
        position: { x: placed.x, y: placed.y },
        // Explicit box size lets React Flow route ropes from known geometry
        // instead of waiting on a ResizeObserver that often misses inside a
        // just-opened (or still-animating) overlay sheet.
        width: placed.width,
        height: placed.height,
        initialWidth: placed.width,
        initialHeight: placed.height,
        // Hand placement: the learner can drag any node anywhere on the
        // canvas and the drop is committed on release (see onNodeDragStop).
        draggable: true,
        selectable: true,
        // While a node's editor is open its box is allowed to grow with the
        // wrapping draft (fixed boxes would clip the extra lines — the body
        // keeps overflow-hidden for its rounded corners). The layout
        // re-measures on commit, so neighbours step out of the way the moment
        // the edit lands.
        style:
          editingId === placed.id
            ? { width: placed.width, minHeight: placed.height, height: "auto" }
            : { width: placed.width, height: placed.height },
        data: {
          topic: topicById.get(placed.id) || "Idea",
          depth: placed.depth,
          side: placed.side,
          // Live drag overrides win while the finger is down (see syncDragFacing);
          // otherwise the layout's resolved geometry decides. The centre has no
          // parent to face, so it keeps `null` and renders no anchor dot.
          facing: placed.isRoot ? null : (facingOverride[placed.id] ?? placed.facing),
          collapsed: placed.collapsed,
          childCount: placed.childCount,
          isRoot: placed.isRoot,
          selected: selectedId === placed.id,
          editing: editingId === placed.id,
          theme: mindTheme,
          textFit,
          look,
          fill: paint.fill,
          ink: paint.ink,
          customFill: paint.customFill,
          branch: wireById.get(placed.id) ?? null,
          onAddChild: handleAddChild,
          onOpenEditor: handleOpenEditor,
          onCloseEditor: handleCloseEditor,
          onCancelEdit: handleCancelEdit,
          onCommitTopic: handleCommitTopic,
        },
      };
    });
  }, [
    layout,
    facingOverride,
    mind.nodes,
    mind.rootTopic,
    selectedId,
    editingId,
    mindTheme,
    textFit,
    look,
    styleById,
    wireById,
    handleAddChild,
    requestDelete,
    handleOpenEditor,
    handleCloseEditor,
    handleCancelEdit,
    handleCommitTopic,
  ]);

  const [nodes, setNodes] = useState<Node<MindNodeData>[]>(layoutNodes);

  useEffect(() => {
    setNodes((prev) => {
      if (!draggingRef.current) return layoutNodes;
      // Mid-drag: keep the live positions (and the branch riding with them)
      // but pick up any data/style updates from the layout pass.
      const live = new Map(prev.map((node) => [node.id, node.position]));
      return layoutNodes.map((node) => {
        const position = live.get(node.id);
        return position ? { ...node, position } : node;
      });
    });
  }, [layoutNodes]);

  // React Flow reports the picked node's live position through `onNodesChange`
  // on EVERY pointer move. That callback is therefore the single place the
  // whole connected group is moved: when a drag session is active, the picked
  // node's position change is applied and EVERY node in its subtree is
  // shifted by the same delta in the SAME state update. One write per frame
  // means the primary node and its branches can never fall out of lock-step
  // (two competing setNodes calls could win a stale frame), so the movement
  // is visible live while the finger is still down.
  const onNodesChange = useCallback((changes: NodeChange<Node<MindNodeData>>[]) => {
    setNodes((current) => {
      const session = dragSessionRef.current;
      const dragChange = session
        ? changes.find((change) => change.type === "position" && change.id === session.id)
        : undefined;
      const next = applyNodeChanges(changes, current);
      if (!session || !dragChange) return next;
      const moved = next.find((item) => item.id === session.id);
      if (!moved) return next;
      const dx = moved.position.x - session.origin.x;
      const dy = moved.position.y - session.origin.y;
      return next.map((item) => {
        if (item.id === session.id || !session.moving.has(item.id)) return item;
        const start = session.starts.get(item.id);
        return start ? { ...item, position: { x: start.x + dx, y: start.y + dy } } : item;
      });
    });
  }, []);

  const edges: Edge[] = useMemo(
    () =>
      layout.edges.map((edge) => {
        // A rope plugs into the two faces that point at each other: the child
        // receives it on the edge facing its parent, the parent exports from
        // the edge facing the child. Both come from `facing` — the RESOLVED
        // geometry of the two boxes — and never from the wing the branch was
        // created on (see the layout notes in utils/mindMapTree.js).
        // An explicit or palette wire colour wins; otherwise the theme's
        // per-side variable colours the rope.
        const goesLeft = (facingOverride[edge.target] ?? edge.facing ?? "right") === "left";
        const wire = wireById.get(edge.target) ?? null;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: goesLeft ? "src-left" : "src-right",
          targetHandle: goesLeft ? "right" : "left",
          sourcePosition: goesLeft ? Position.Left : Position.Right,
          targetPosition: goesLeft ? Position.Right : Position.Left,
          type: "rope",
          animated: false,
          style: {
            stroke: wire ?? (goesLeft ? "var(--mm-edge-left)" : "var(--mm-edge-right)"),
            strokeWidth: look === "modern" ? 2.2 : 2.4,
          },
        };
      }),
    [layout.edges, facingOverride, wireById, look],
  );

  // ── Wires must remeasure whenever the canvas becomes a real box ────────
  // React Flow caches handle bounds. Those bounds are 0×0 while:
  //   • the overlay sheet is `invisible` / translated off-screen
  //   • the map library is covering the canvas on first open
  //   • Firestore has just replaced the empty seed with the real node list
  //     (slow net = this race is easy to lose; fast net often wins it)
  // Calling `updateNodeInternals` after those moments is what makes every
  // rope appear without the learner having to pan or tap anything.
  const nodeIdsKey = layout.nodes.map((node) => node.id).join(",");
  const refreshWires = useCallback(() => {
    for (const node of layout.nodes) updateNodeInternals(node.id);
  }, [layout.nodes, updateNodeInternals]);

  useLayoutEffect(() => {
    if (!open || libraryOpen) return undefined;
    refreshWires();
    const raf = requestAnimationFrame(() => {
      refreshWires();
      requestAnimationFrame(refreshWires);
    });
    // 240ms covers `animate-course-overlay-in` (0.22s); 480ms covers a
    // late Firestore paint on a slow radio.
    const timers = [50, 240, 480].map((ms) => window.setTimeout(refreshWires, ms));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [open, libraryOpen, nodeIdsKey, refreshWires]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (!open || libraryOpen) return;
      refreshWires();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, libraryOpen, refreshWires]);

  const save = SAVE_COPY[status] || SAVE_COPY.idle;
  const levels = maxDepth(mind);
  const totalNodes = countNodes(mind);
  const courseHierarchy = useMemo(
    () => resolveCourseResourceContext(modules, moduleId),
    [modules, moduleId],
  );
  const personalHierarchy = useMemo(
    () => resolvePersonalResourceContext(personalModules, moduleId),
    [personalModules, moduleId],
  );
  const isPersonalModule = courseHierarchy.modulePath.length === 0 && personalHierarchy.modulePath.length > 0;
  const libraryContextPath = [
    courseTitle,
    ...(isPersonalModule ? ["My Modules", ...personalHierarchy.modulePath] : courseHierarchy.modulePath),
  ].filter(Boolean);
  const hasCachedMapIndex = maps.some((entry) => entry.updatedAt > 0 || entry.createdAt > 0 || entry.mapKey !== "main");
  const showMapSkeleton = mapsLoading && !hasCachedMapIndex;

  // ── Map library tree (Branched Menu) ──────────────────────────────────
  // Both collections sit under the course → module chain they belong to:
  // self maps under this module, master maps under their own module. Each
  // row is one map; MASTER maps are read-only, SELF maps rename and delete.
  const selfContext: BranchSegment[] = libraryContextPath.map((label, index) => ({ key: `ctx:${index}`, label }));
  const selfTree: BranchedMenuItem[] = buildBranchTree(
    maps.map((entry): BranchEntry => {
      const title = entry.title.trim() || entry.rootTopic.trim() || `Map · ${entry.mapKey}`;
      const rootTopic = entry.rootTopic.trim();
      return {
        path: selfContext,
        item: {
          value: `map:${entry.mapKey}`,
          label: title,
          icon: <Network size={16} strokeWidth={2.1} aria-hidden="true" />,
          color: MAP_COLOR,
          tag: { label: "SELF", color: SELF_MAP_TAG },
          meta: `${entry.nodeCount} ${entry.nodeCount === 1 ? "node" : "nodes"}`,
          description: `Mind map. ${title}.${rootTopic && rootTopic !== title ? ` Root topic: ${rootTopic}.` : ""}`,
          onRename: (nextTitle) => onRenameMap?.(entry.mapKey, nextTitle),
          onDelete: () => requestMapDelete(entry.mapKey),
          deleteLabel: `Delete mind map ${title}`,
          dataAttrs: { "data-course-mindmap-open-map": entry.mapKey, "data-map-key": entry.mapKey },
        },
      };
    }),
    { sectionMeta: ({ count }) => <span>{count}</span> },
  );

  const masterTree: BranchedMenuItem[] = buildBranchTree(
    masterMaps.map((entry): BranchEntry => {
      const title = entry.title.trim() || entry.rootTopic.trim() || `Map · ${entry.mapKey}`;
      const path: BranchSegment[] = entry.segments?.length
        ? [{ key: "course", label: courseTitle || "Course" }, ...entry.segments]
        : [{ key: "course", label: courseTitle || "Course" }];
      return {
        path,
        item: {
          value: `master:${entry.mapKey}`,
          label: title,
          icon: <Network size={16} strokeWidth={2.1} aria-hidden="true" />,
          color: MAP_COLOR,
          tag: { label: "MASTER", color: MASTER_MAP_TAG },
          meta: `${entry.nodeCount} ${entry.nodeCount === 1 ? "node" : "nodes"}`,
          description: `Master mind map. ${title}. Read only.`,
          dataAttrs: { "data-course-mindmap-master-open": entry.mapKey },
        },
      };
    }),
    { sectionMeta: ({ count }) => <span>{count}</span> },
  );

  const selfOpen = useBranchedOpen(selfTree);
  const masterOpen = useBranchedOpen(masterTree);
  useEffect(() => {
    if (activeMapKey) selfOpen.reveal(ancestorSectionValues(selfTree, `map:${activeMapKey}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapKey]);

  return (
    <div
      className="course-mindmap-shell relative flex h-full w-full flex-col overflow-hidden"
      data-course-mindmap
      data-mindmap-theme={mindTheme}
    >
      <MindMapJsonImportDialog
        open={jsonImportOpen}
        currentMind={mind}
        onClose={() => setJsonImportOpen(false)}
        onGenerate={applyJsonMap}
      />
      {/* The toolbar only exists on the canvas — while the library is open
          (no specific map chosen yet) there is no strip. It rides at the TOP
          of the sheet, exactly like the notes editor: toolbar first, canvas
          below it. */}
      {/* ── Status strip — the mind map's toolbar ──────────────────────────
          The only persistent chrome, and every control on it is a SINGLE
          ICON: the cloud-save beacon (tinted by the save state, blinking
          while there is a message to read), the map pill, then the tools —
          auto-arrange, the align menu, fit-to-screen, delete-branch and the
          double-tap-delete arm switch. The sun/moon control keeps this
          feature's saved palette independent from the Player and Read themes.
          There is no close button — the dock tab is the way out.

          There are no +/− zoom buttons: the canvas is pinched (and panned)
          straight with the fingers, and Fit re-frames the whole map in one
          tap — the two buttons were the ones eating the bar's width.

          The strip is a SINGLE side-scrolling line — every tool sits
          side-by-side and the bar scrolls horizontally instead of wrapping
          or clipping. Any stale offset a browser hands it (soft keyboard,
          orientation flip, reopen) is reset when the sheet opens, so the
          bar always paints from its left edge. */}
      {undoSnapshot ? (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-900"
          data-course-mindmap-json-undo
        >
          <span className="mr-auto">Map replaced from JSON.</span>
          <button
            type="button"
            onClick={undoJsonMap}
            className="rounded-md border border-violet-300 bg-white px-2.5 py-1 font-semibold text-violet-900 hover:bg-violet-100"
          >
            Undo
          </button>
        </div>
      ) : null}
      {libraryOpen ? null : (
      <div
        ref={statusRef}
        className="flex shrink-0 items-center overflow-x-auto border-b border-[var(--mm-border)] px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: "var(--mm-tool-gap)" }}
        data-course-mindmap-status
        data-compact={toolbarCompact ? "true" : "false"}
      >
        {/* ── Left cluster: cloud save + which map is open ─────────────── */}
        <div className="flex min-w-max flex-1 items-center" style={{ gap: "var(--mm-tool-gap)" }}>
          {/* ── Cloud save ──────────────────────────────────────────────
              The old "Cloud par saved" TEXT was the widest thing on the
              bar, so it is an icon now: the cloud itself is tinted by the
              state (amber saving / emerald saved / rose retrying) and a
              blinking beacon rides its top-right corner while there is a
              message. The words moved into the tooltip and this drop-down. */}
          <button
            type="button"
            ref={saveAnchorRef}
            onClick={() => {
              setAlignMenuOpen(false);
              setStyleMenuOpen(false);
              setSaveMenuOpen((open) => !open);
            }}
            aria-expanded={saveMenuOpen}
            aria-haspopup="menu"
            aria-label={save.label}
            title={save.label}
            className={`mm-tool ${saveMenuOpen ? "mm-tool-violet" : ""}`}
            data-course-mindmap-save
            data-save-status={status}
            data-blink={saveBlink ? "true" : "false"}
          >
            {status === "saving" ? <CloudUpload /> : status === "saved" ? <CloudCheck /> : status === "error" ? <CloudAlert /> : <Cloud />}
            {saveBlink ? <span className="mm-blink" data-course-mindmap-save-blink aria-hidden="true" /> : null}
          </button>
          {/* AI / JSON import — opens the same prompt + validator the admin
              Mind Map editor uses. Nothing changes until a valid map is confirmed. */}
          <button
            type="button"
            onClick={() => setJsonImportOpen(true)}
            className="mm-tool"
            aria-label="AI / JSON import"
            title="AI / JSON import"
            data-course-mindmap-json-import
          >
            <FileJson size={16} />
          </button>
          <ToolbarMenu
            open={saveMenuOpen}
            anchorRef={saveAnchorRef}
            onClose={() => setSaveMenuOpen(false)}
            theme={mindTheme}
            label="Cloud save"
          >
            <p className="mm-menu-head">Cloud save</p>
            <p
              className={`mm-menu-note flex items-center gap-1.5 ${save.tone}`}
              data-course-mindmap-save-label
            >
              {status === "error" ? <TriangleAlert size={11} /> : null}
              {save.label}
            </p>
            {/* The full warning text lives HERE — the persistent error bar at
                the bottom is gone, so tapping the blinking beacon is the way
                to read the message. */}
            {errorMessage ? (
              <p className="mm-menu-note" data-course-mindmap-save-message>
                {errorMessage}
              </p>
            ) : null}
            <button
              type="button"
              className="mm-menu-item"
              onClick={() => {
                onFlush?.();
                setSaveMenuOpen(false);
              }}
              data-course-mindmap-save-now
            >
              <CloudUpload />
              <span>Abhi cloud par save karein</span>
            </button>
          </ToolbarMenu>

          {/* ── Map switcher ────────────────────────────────────────────
              Notes are a LIST, and so are mind maps: this opens the
              module's map library (every diagram the learner made here),
              with "New map", rename and delete inside. The name rides on
              the pill — and collapses to the bare icon on a narrow sheet
              rather than pushing a tool off the bar. */}
          <button
            type="button"
            onClick={() => {
              setAlignMenuOpen(false);
              setSaveMenuOpen(false);
              setStyleMenuOpen(false);
              setLibraryOpen((open) => !open);
            }}
            aria-expanded={libraryOpen}
            aria-label={`Maps — ${activeMapName} (${maps.length})`}
            title={`Maps — ${activeMapName}`}
            className={`mm-tool ${libraryOpen ? "mm-tool-violet" : ""}`}
            data-course-mindmap-maps
            data-map-count={maps.length}
            data-active-map={activeMapKey}
          >
            <Layers />
          </button>

          {/* The node / level readout is the one thing left as words, and
              only where there is room for it (a wide desktop sheet). */}
          <span
            className="hidden min-w-0 truncate text-[10px] font-bold text-[var(--mm-muted)] xl:inline"
            data-course-mindmap-stats
          >
            {totalNodes} {totalNodes === 1 ? "node" : "nodes"} · {levels} {levels === 1 ? "level" : "levels"}
          </span>
        </div>

        {/* ── Right cluster: the tools ─────────────────────────────────── */}
        <div className="flex shrink-0 items-center" style={{ gap: "var(--mm-tool-gap)" }}>
          {/* ── Auto arrange: the one-tap clean-up ──────────────────────
              However badly the map was dragged around, this drops every
              hand-placed pin and hands the whole diagram back to the tidy
              tree — nodes line up, branches re-balance, ropes stop
              crossing — then the view re-fits. Stays lit only while there
              is actual mess to clean, so it never looks like a no-op. */}
          <button
            type="button"
            onClick={handleAutoArrange}
            className={`mm-tool ${messy ? "mm-tool-emerald" : ""}`}
            aria-label="Ek click me poora mind map organise karein"
            title="Auto arrange — sabhi nodes ek click me saaf-suthre organise"
            data-course-mindmap-auto-arrange
            data-messy={messy ? "true" : "false"}
          >
            <Sparkles />
          </button>

          {/* ── ALIGN: how the boxes sit, and how a long label fits ─────
              One icon, one small drop-down. The learner picks the whole
              map's alignment (classic tree / every box in one line / every
              box in one column) and what a box does with a long label
              (wrap it onto more lines, or clip it to one). Both are views
              of the SAME map — no branch is ever added or removed. */}
          <button
            type="button"
            ref={alignAnchorRef}
            onClick={() => {
              setSaveMenuOpen(false);
              setStyleMenuOpen(false);
              setAlignMenuOpen((open) => !open);
            }}
            aria-expanded={alignMenuOpen}
            aria-haspopup="menu"
            aria-label="Boxes ka alignment aur text fit"
            title="Align — boxes ka layout aur text ka style"
            className={`mm-tool ${alignMenuOpen ? "mm-tool-violet" : ""}`}
            data-course-mindmap-align
            data-arrangement={arrangement}
            data-text-fit={textFit}
          >
            <AlignHorizontalJustifyCenter />
          </button>
          <ToolbarMenu
            open={styleMenuOpen && selectedId != null}
            anchorRef={styleAnchorRef}
            onClose={() => setStyleMenuOpen(false)}
            theme={mindTheme}
            label="Node colours"
          >
            <p className="mm-menu-head">Box colour</p>
            <ColourSwatches label="Box colour" value={selectedStyle?.bg} options={BOX_COLOURS} onPick={(colour) => applyStyle({ bg: colour })} allowDefault />
            <p className="mm-menu-head">Text colour</p>
            <ColourSwatches label="Text colour" value={selectedStyle?.text} options={TEXT_COLOURS} onPick={(colour) => applyStyle({ text: colour })} allowDefault />
            {selectedId !== rootId() ? (
              <>
                <p className="mm-menu-head">Branch line</p>
                <ColourSwatches label="Branch colour" value={selectedStyle?.edge} options={BRANCH_PALETTE} onPick={(colour) => applyStyle({ edge: colour })} allowDefault />
              </>
            ) : null}
            <div className="mm-menu-sep" />
            <button
              type="button"
              className="mm-menu-item"
              onClick={() => applyStyle({ bg: null, text: null, edge: null })}
              disabled={!selectedStyle}
              data-course-mindmap-style-reset
            >
              <RotateCcw />
              <span>Default colours</span>
            </button>
          </ToolbarMenu>

          <ToolbarMenu
            open={alignMenuOpen}
            anchorRef={alignAnchorRef}
            onClose={() => setAlignMenuOpen(false)}
            theme={mindTheme}
            label="Boxes ka alignment"
          >
            <p className="mm-menu-head">Boxes kahan dikhen</p>
            {ARRANGEMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={arrangement === option.value}
                className="mm-menu-item"
                onClick={() => {
                  setArrangement(option.value);
                  setAlignMenuOpen(false);
                }}
                data-course-mindmap-arrangement={option.value}
                data-active={arrangement === option.value ? "true" : "false"}
              >
                <option.Icon />
                <span>
                  <span className="block truncate">{option.label}</span>
                  <span className="block text-[9px] font-bold opacity-60">{option.hint}</span>
                </span>
                {arrangement === option.value ? <Check className="mm-menu-check" /> : null}
              </button>
            ))}
            <div className="mm-menu-sep" />
            <p className="mm-menu-head">Box ke andar text</p>
            {TEXT_FIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={textFit === option.value}
                className="mm-menu-item"
                onClick={() => {
                  setTextFit(option.value);
                  setAlignMenuOpen(false);
                }}
                data-course-mindmap-text-fit-option={option.value}
                data-active={textFit === option.value ? "true" : "false"}
              >
                <option.Icon />
                <span>
                  <span className="block truncate">{option.label}</span>
                  <span className="block text-[9px] font-bold opacity-60">{option.hint}</span>
                </span>
                {textFit === option.value ? <Check className="mm-menu-check" /> : null}
              </button>
            ))}
          </ToolbarMenu>

          {/* ── Look: boxed (classic) or modern (text-first) ───────────── */}
          <button
            type="button"
            onClick={() => setLook((current) => (current === "modern" ? "boxed" : "modern"))}
            aria-pressed={look === "modern"}
            aria-label={look === "modern" ? "Modern look on — classic boxes par jaayein" : "Modern look par jaayein"}
            title={look === "modern" ? "Modern look (on) — classic boxes" : "Modern look"}
            className={`mm-tool ${look === "modern" ? "mm-tool-violet" : ""}`}
            data-course-mindmap-look={look}
          >
            {look === "modern" ? <LayoutTemplate /> : <Square />}
          </button>

          {/* Fit-to-screen: re-frames the whole diagram in one tap, and it
              is the only zoom affordance left on the bar now that +/− are
              gone (fingers pinch, a mouse wheel still zooms). Violet-tinted
              so it reads as the "make everything visible" control — the
              maximise glyph matches the system fullscreen cue. A wider
              padding keeps every node clear of the canvas edges. */}
          <button
            type="button"
            onClick={() => void fitView({ duration: 260, padding: 0.2 })}
            className="mm-tool mm-tool-violet"
            aria-label="Poora map fit karein"
            title="Fit to screen — sab nodes ek saath dikhao"
            data-course-mindmap-fit
          >
            <Maximize />
          </button>

          {/* ── Node colours: visible only while a node is selected ───── */}
          {selectedId != null ? (
            <button
              type="button"
              ref={styleAnchorRef}
              onClick={() => {
                setAlignMenuOpen(false);
                setSaveMenuOpen(false);
                setStyleMenuOpen((open) => !open);
              }}
              aria-expanded={styleMenuOpen}
              aria-haspopup="menu"
              aria-label="Selected node ke rang"
              title="Node colours — box, text aur branch line"
              className={`mm-tool ${styleMenuOpen ? "mm-tool-violet" : ""}`}
              data-course-mindmap-style
            >
              <Palette />
            </button>
          ) : null}

          {/* ── Delete the selected branch ──────────────────────────────
              Tap (or drag) a node to select it, then this removes the
              branch. Disabled for the root / no selection — the centre of
              a mind map is never deletable. */}
          <button
            type="button"
            onClick={() => {
              if (selectedId) requestDelete(selectedId);
            }}
            disabled={!canDeleteSelected}
            className="mm-tool mm-tool-danger"
            aria-label={canDeleteSelected ? "Selected branch delete karein" : "Pehle koi node select karein"}
            title={canDeleteSelected ? "Delete — selected branch (root nahi hat sakta)" : "Node tap karke select karein, phir delete"}
            data-course-mindmap-delete
            data-delete-ready={canDeleteSelected ? "true" : "false"}
          >
            <Trash2 />
          </button>

          {/* ── Daylight / light-dark switch (Part 1 §8) ────────────────
              Compact sun/moon control: flips the map between its genuine
              dark and light palettes and remembers the choice per user.
              It replaces the removed double-tap-delete arm switch (§7). */}
          <button
            type="button"
            onClick={mindThemeCtl.toggleTheme}
            aria-pressed={mindTheme === "light"}
            className={`mm-tool ${mindTheme === "light" ? "mm-tool-violet" : ""}`}
            aria-label={mindTheme === "light" ? "Switch mind map to dark theme" : "Switch mind map to light theme"}
            title={mindTheme === "light" ? "Dark theme" : "Light (daylight) theme"}
            data-course-mindmap-theme-toggle={mindTheme}
          >
            {mindTheme === "light" ? <Moon /> : <Sun />}
          </button>

        </div>
      </div>
      )}

      {/* ── Canvas ────────────────────────────────────────────────────────
          `touch-action: none` is required, not cosmetic: without it the
          browser claims the pinch for page zoom and React Flow never sees it. */}
      <div ref={canvasRef} className="relative min-h-0 flex-1" style={{ touchAction: "none" }} data-course-mindmap-canvas data-library-open={libraryOpen ? "true" : "false"}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultEdgeOptions={{ type: "rope" }}
          onNodesChange={onNodesChange}
          onInit={() => { requestAnimationFrame(refreshWires); }}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.15}
          maxZoom={2.5}
          nodesDraggable
          // Deletion goes through the confirmation overlay only.
          deleteKeyCode={null}
          nodesConnectable={false}
          edgesFocusable={false}
          // A pointer that moves less than this many px still counts as a
          // click, so a phone tap with a pixel of jitter keeps working once
          // nodes are draggable. Same slop the node's own tap detector uses.
          nodeClickDistance={TAP_SLOP_PX}
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_event, node) => {
            // Single-tap on any node opens the inline editor (single source
            // of truth for "rename"). The action bar appears automatically
            // because the node is now selected. A click that trails a real
            // drag is skipped — that was a move, not a tap.
            if (dragMovedRef.current) return;
            setSelectedId(node.id);
            setEditingId(node.id);
          }}
          onPaneClick={() => {
            // Tapping the canvas (outside any node) closes any open editor
            // — the input's onBlur already committed the topic, so this is
            // just the visual cleanup.
            setSelectedId(null);
            setEditingId(null);
          }}
          onNodeDragStart={(_event, node) => {
            draggingRef.current = true;
            const moving = new Set(collectSubtreeIds(mind, node.id));
            const starts = new Map<string, { x: number; y: number }>();
            for (const item of nodes) {
              if (moving.has(item.id)) starts.set(item.id, { x: item.position.x, y: item.position.y });
            }
            dragSessionRef.current = {
              id: node.id,
              origin: { x: node.position.x, y: node.position.y },
              starts,
              moving,
            };
            // Arm the live facing with where the node stands right now, so the
            // first move can only ever CHANGE it (an untouched node keeps the
            // face the layout resolved for it).
            syncDragFacing(node.id, node.position.x);
          }}
          onNodeDrag={(_event, node) => {
            // The actual live movement of the node AND its whole connected
            // branch is applied in `onNodesChange` above — one position
            // change per frame, one state update. This handler only marks
            // that a real move happened, so the click that trails the drop
            // is never mistaken for a tap that should open the editor.
            dragMovedRef.current = true;
            // …and re-derives which face of the box points at the parent, so
            // the anchor dot, the rope and the `+` swing round the moment the
            // node crosses over — the learner sees the wire re-attach while
            // dragging, not only after the drop.
            syncDragFacing(node.id, node.position.x);
          }}
          onNodeDragStop={(_event, node) => {
            const session = dragSessionRef.current;
            dragSessionRef.current = null;
            draggingRef.current = false;
            // The drop below commits the new position into the map, so the
            // layout re-derives every facing from it. Hand the drag's temporary
            // answer back here: no override ever outlives the finger (and a
            // clear back to the shared empty object costs no re-render).
            clearDragFacing();
            // React Flow fires drag start/stop even for a PLAIN TAP (its
            // nodeDragThreshold is 0), so guard on real travel: a tap must
            // never pin the node — every tapped node would silently freeze
            // at its current spot and a later primary-node drag would leave
            // it behind.
            const travelled = session
              ? Math.hypot(node.position.x - session.origin.x, node.position.y - session.origin.y)
              : 0;
            if (session && travelled >= TAP_SLOP_PX) {
              // Commit the drop as one rigid group: the picked node is
              // pinned at the drop point AND every connected node — even
              // ones the learner had hand-placed earlier — moves by exactly
              // the same delta. The map never tears: dragging the primary
              // node carries its whole connected map with it.
              onMindChange((current) =>
                moveNodeSubtree(current, node.id, node.position.x, node.position.y, session.origin.x, session.origin.y),
              );
              // The dropped node becomes the selection so the toolbar trash
              // can act on it straight away.
              setSelectedId(node.id);
            }
            // A drag must never end with the rename keyboard popping up: if
            // an editor is open anywhere, blur it so its draft commits and
            // the sheet stays quiet.
            const active = document.activeElement;
            if (active instanceof HTMLElement && active.dataset.mindNodeInput) active.blur();
            // Clear the drag flag AFTER the trailing click event has had
            // its chance to run (click dispatches before timers fire).
            window.setTimeout(() => {
              dragMovedRef.current = false;
            }, 0);
          }}
        >
          {/* Part 1 §9: in LIGHT mode the canvas is WHITE with a visible grid.
              The grid is React Flow's own <Background>, so it participates in
              the viewport transform — zoom IN and the squares read smaller,
              zoom OUT and they read larger. Dark keeps the existing look. */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={mindTheme === "light" ? 1.5 : 1}
            color={mindTheme === "light" ? "rgba(15,23,42,0.16)" : "rgba(255,255,255,0.07)"}
            bgColor={mindTheme === "light" ? "#ffffff" : "transparent"}
          />
        </ReactFlow>

        {/* ── Shared study-resource library ────────────────────────────────
            The library is the home screen for the module's saved maps. A
            resource card opens the canvas anywhere on its surface; a
            double-click/double-tap title gesture enters inline rename. */}
        {libraryOpen ? (
          <div className="absolute inset-0 z-20 flex flex-col bg-[var(--dc-chrome-glass)] [backdrop-filter:var(--dc-chrome-glass-blur)]" data-course-mindmap-library>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-16" data-course-mindmap-map-list>
              <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
                {/* Part 1 §10/§11 — MASTER/SELF filter, remembered per user. */}
                <div className="flex items-center justify-between gap-3" data-course-mindmap-collections>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[var(--dc-flat-ink-sub)]">Map library</p>
                    <p className="mt-0.5 text-[11px] text-[var(--dc-flat-ink-label)]">Course maps and your own maps stay separate.</p>
                  </div>
                  <MasterSelfControl
                    feature="mindMap"
                    ariaLabel="Mind map collection"
                    mode={masterSelfCtl.mode}
                    onChange={masterSelfCtl.setMode}
                    masterCount={masterMaps.length}
                    selfCount={maps.length}
                  />
                </div>
                {masterSelfCtl.mode === "master" ? (
                  masterMaps.length > 0 ? (
                    <BranchedMenu
                      items={masterTree}
                      openValues={masterOpen.openValues}
                      onToggle={masterOpen.toggle}
                      onSelect={(value) => {
                        const key = value.startsWith("master:") ? value.slice("master:".length) : "";
                        if (key) onOpenMasterMap?.(key);
                      }}
                      ariaLabel="Master mind maps"
                      fullWidth
                      rowHeight={40}
                      className="mindmap-library-menu"
                      dataAttrs={{ "data-course-mindmap-master-grid": "", "data-listing": "mindmap-master" }}
                    />
                  ) : (
                    <StudyLibraryEmptyState
                      kind="mind-map"
                      title="No master mind maps yet"
                      description="Course-published mind maps will appear here. They are read-only and never mix with your SELF maps."
                    />
                  )
                ) : (
                <>
                {mapsLoading && hasCachedMapIndex ? (
                  <StudyLibraryNotice
                    state="loading"
                    title="Checking your map library"
                    message="Your saved maps stay available while cloud sync finishes."
                  />
                ) : null}
                {status === "error" ? (
                  <StudyLibraryNotice
                    state="error"
                    title="Mind map sync needs attention"
                    message={errorMessage || "Your local map copy stays available. Try again when your connection is ready."}
                    onRetry={onRetryMaps}
                  />
                ) : null}

                {showMapSkeleton ? (
                  <BranchedMenuSkeleton rows={4} label="Loading your mind maps" />
                ) : maps.length > 0 ? (
                  <BranchedMenu
                    items={selfTree}
                    openValues={selfOpen.openValues}
                    onToggle={selfOpen.toggle}
                    activeValue={activeMapKey ? `map:${activeMapKey}` : null}
                    onSelect={(value) => {
                      const key = value.startsWith("map:") ? value.slice("map:".length) : "";
                      if (key) openMap(key);
                    }}
                    ariaLabel="Your mind maps"
                    fullWidth
                    rowHeight={40}
                    className="mindmap-library-menu"
                    dataAttrs={{ "data-course-mindmap-map-grid": "true", "data-listing": "mindmap-self" }}
                  />
                ) : status === "error" ? (
                  <StudyLibraryEmptyState
                    kind="mind-map"
                    title="No cloud map could be confirmed"
                    description="Retry sync to load your latest mind maps. Local copies remain safe on this device."
                  />
                ) : (
                  <StudyLibraryEmptyState
                    kind="mind-map"
                    title="Choose a module to map"
                    description="Open a course module to see its mind maps, or start a map with the + button when a module is selected."
                  />
                )}
                </>
                )}
              </div>
            </div>
            {masterSelfCtl.mode === "self" ? (
            <button
              type="button"
              onClick={() => {
                onCreateMap?.();
                setLibraryOpen(false);
                setSelectedId(null);
                setEditingId(null);
              }}
              disabled={atMapLimit || !onCreateMap || !moduleId}
              className="absolute bottom-4 right-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-500 active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              aria-label="Create a mind map"
              title={atMapLimit ? "This module has reached its map limit" : "New mind map"}
              data-course-mindmap-new
            >
              <Plus size={19} strokeWidth={2.8} />
            </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Branch delete confirmation ────────────────────────────────────
          Every branch delete path lands here first (toolbar trash AND the
          double-tap mode): nothing is removed until the red confirm button is
          tapped. Portalled to <body> so the clipped canvas sheet never cuts
          it off, and it is always above the player overlay + dock. */}
      <ConfirmDeleteDialog
        theme={mindTheme}
        open={Boolean(deleteTargetId)}
        title="Delete this branch?"
        message={
          deleteTargetNode
            ? `"${deleteTargetNode.topic || "This branch"}" and its ${deleteTargetBranchCount} linked node${deleteTargetBranchCount === 1 ? "" : "s"} will be permanently removed from this mind map.`
            : "This branch and every node linked to it will be permanently removed."
        }
        detail="The root idea stays untouched. This action cannot be undone."
        confirmLabel="Delete branch"
        confirmTitle="Delete branch"
        onConfirm={() => {
          if (deleteTargetId) performDelete(deleteTargetId);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* ── Whole-map delete confirmation (map library) ─────────────────── */}
      <ConfirmDeleteDialog
        theme={mindTheme}
        open={Boolean(deleteMapKey)}
        title="Delete this mind map?"
        message={
          deleteMapEntry
            ? `"${deleteMapEntry.title || deleteMapEntry.rootTopic || "Untitled map"}" and every branch inside it will be permanently removed from this module.`
            : "This mind map and every branch inside it will be permanently removed."
        }
        detail="This action cannot be undone."
        confirmLabel="Delete map"
        confirmTitle="Delete map"
        onConfirm={() => {
          const key = deleteMapKey;
          setDeleteMapKey(null);
          if (key) onDeleteMap?.(key);
        }}
        onCancel={() => setDeleteMapKey(null)}
      />
    </div>
  );
}

/**
 * Exported wrapper. `useReactFlow()` only works under a provider, and the
 * provider has to sit ABOVE the component that calls it — hence the split.
 */
export default function MindMapPanel(props: MindMapPanelProps) {
  return (
    <ReactFlowProvider>
      <MindMapCanvas {...props} />
    </ReactFlowProvider>
  );
}
