// src/course/MindMapPanel.tsx
//
// The learner-facing mind map editor, opened from the Course Player dock next
// to the Note tab.
//
// The panel's HOME screen is the map library — the grid of every map this
// module holds — so opening the tab always lands on a choice ("konsi map
// kholni hai / nayi banani hai") instead of dropping straight onto whatever
// canvas was open last. Tapping a card opens that diagram for editing; "New
// map" starts a fresh one. The library also returns every time the sheet is
// reopened after being closed, never leaving a lone stale canvas behind.
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
//                    a double-tap deletes the node and its whole branch.
//                    The mode is OFF by default and is toggled by the
//                    pointer button in the toolbar, so a stray second tap can
//                    never delete a branch by accident.
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
// ── Theme: follows the Course Player, overridable for this window only ──
// The panel starts in whatever theme the Course Player is in (dark or
// light/white). The sun/moon button next to Fit flips ONLY the mind map
// window — the lesson keeps its own theme — and the choice is remembered per
// device. While no manual choice exists the map keeps tracking the player's
// own toggle.
//
// ── The toolbar (the bottom strip) ───────────────────────────────────────
// ONE ICON PER CONTROL — the bar carries no words at all. From the left:
//   cloud-save  the save state, tinted by it, with a blinking beacon on top
//               while there is a message to read. Tapping it opens the
//               message itself plus "abhi save karein" (flush now).
//   maps pill   this module's map list (icon + name + count).
//   then, right-aligned: auto-arrange, the ALIGN menu (how the boxes are
//   laid out — tree / one line / one column — and how a long label fits,
//   wrap or clipped to one line), fit-to-screen, this window's light/dark
//   flip, delete-branch, the double-tap-delete arm switch, and close.
// There are no +/− zoom buttons any more: the canvas is pinched (and panned)
// straight with the fingers, and Fit re-frames the whole map in one tap.
//
// ── Why the strip no longer scrolls sideways ─────────────────────────────
// This is the "toolbar khisak gaya left" fix, and there were two ways the
// old bar could slide over:
//
//   1. It was a SCROLL CONTAINER (`overflow-x-auto`). A scrollable box keeps
//      the offset the browser handed it while scrolling a focused tile into
//      view — the soft keyboard opening for a node rename, an orientation
//      flip, the sheet reopening — and never gives it back, so the bar
//      painted from somewhere in the middle with its left edge cut off.
//   2. It used `justify-between` with percentage-width children. Once the
//      content was wider than the bar (a long map name was enough) the free
//      space went negative, and a negative-space `space-between` overflows
//      out of BOTH ends — the start edge is then unreachable, i.e. the left
//      half of the bar sat outside the visible area with no way to scroll to
//      it. Same symptom, different cause, and just as intermittent.
//
// The strip is clipped now, its layout is `flex-1` (shrinkable) on the LEFT
// cluster and `shrink-0` on the tools, the map-name pill is the only element
// allowed to give up width (it collapses to its icon on a narrow sheet), and
// any offset a browser still manages to set is reset on every open.
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
  Layers,
  Maximize,
  MousePointerClick,
  Moon,
  Network,
  Pencil,
  Plus,
  Rows3,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Type,
  WrapText,
  X,
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
  normalizeArrangement,
  removeNode,
  rootId,
  setNodeTopic,
  type MindMap,
  type MindMapArrangement,
} from "../../utils/mindMapTree";
import type { MindMapSaveStatus, MindMapSummary } from "./useCourseMindMap";

// ── Theme ─────────────────────────────────────────────────────────────────

export type MindMapTheme = "dark" | "light";

/**
 * The mind map renders in the Course Player's current theme until the
 * learner flips the map's own sun/moon button. The manual choice is kept per
 * device so reopening the tab (or the app) doesn't lose it, while clearing it
 * makes the map follow the player again.
 */
const mindMapThemeStorageKey = "dc.mindMapThemeOverride";
const loadMindMapThemeOverride = (): MindMapTheme | null => {
  try {
    const stored = localStorage.getItem(mindMapThemeStorageKey);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
};

/** Double-tap delete is a knife the learner chooses to pick up. Off by default. */
const dblTapDeleteStorageKey = "dc.mindMapDblTapDelete";
const loadDblTapDelete = (): boolean => {
  try {
    return localStorage.getItem(dblTapDeleteStorageKey) === "on";
  } catch {
    return false;
  }
};

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
  /** Palette for this window — "light" is the white mode. */
  theme: MindMapTheme;
  /**
   * How a long label is fitted inside the box — `wrap` folds it onto further
   * lines, `clip` keeps it to ONE line and cuts the tail with an ellipsis.
   * Picked from the toolbar's align menu; the layout measures the box with
   * the same rule, so the reserved space always matches what is painted.
   */
  textFit: MindMapTextFit;
  /** True while the toolbar's double-tap delete mode is armed. */
  deleteOnDoubleTap: boolean;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onCloseEditor: (id: string) => void;
  onCommitTopic: (id: string, topic: string) => void;
}

/** A pointer that travelled further than this many px was a drag, not a tap. */
const TAP_SLOP_PX = 4;
/** Two taps on the same node within this window count as a double-tap. */
const DOUBLE_TAP_MS = 350;
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
function MindNode({ id, data }: NodeProps<Node<MindNodeData>>) {
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
    deleteOnDoubleTap,
    onAddChild,
    onDelete,
    onOpenEditor,
    onCloseEditor,
    onCommitTopic,
  } = data;

  const [draft, setDraft] = useState(topic);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Pointer bookkeeping for tap-vs-drag + double-tap detection (see the
  // header comment for why this cannot rely on click events).
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
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
  const tone = isRoot
    ? theme === "light"
      ? "border-violet-500/70 bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/25"
      : "border-violet-400/60 bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/40"
    : theme === "light"
      ? depth === 1
        ? "border-violet-400/70 bg-violet-500/15 text-violet-950"
        : depth === 2
          ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-900"
          : "border-slate-400/50 bg-white text-slate-800 shadow-sm shadow-slate-900/5"
      : depth === 1
        ? "border-violet-400/40 bg-violet-500/15 text-violet-50"
        : depth === 2
          ? "border-indigo-400/25 bg-indigo-500/10 text-indigo-50"
          : "border-white/12 bg-white/6 text-slate-100";

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
      lastTapRef.current = 0;
      return;
    }
    if (deleteOnDoubleTap && !isRoot) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        onDelete(id);
        return;
      }
      lastTapRef.current = now;
    }
    // A single tap opens the editor (the rename trigger — there is no
    // separate pencil). In double-tap-delete mode the first tap still opens
    // the editor; the second tap of a quick pair deletes the branch.
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

  return (
    <div
      className="group relative h-full w-full cursor-grab active:cursor-grabbing"
      data-mind-node={id}
      data-mind-node-depth={depth}
      data-mind-node-side={side ?? "center"}
      data-mind-node-facing={facing ?? "center"}
      data-mind-node-selected={selected ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pressStartRef.current = null;
        lastTapRef.current = 0;
      }}
    >
      {/* Invisible connection handles — required by React Flow to route edges */}
      <Handle type="target" position={Position.Left} id="left" isConnectable={false} style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" isConnectable={false} style={handleStyle} />
      <Handle type="source" position={Position.Left} id="src-left" isConnectable={false} style={handleStyle} />
      <Handle type="source" position={Position.Right} id="src-right" isConnectable={false} style={handleStyle} />

      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-xl border px-2.5 pt-1.5 text-[13px] font-semibold leading-[17px] transition ${tone} ${
          selected ? "ring-2 ring-violet-400/80 ring-offset-2 ring-offset-[var(--mm-bg)]" : ""
        }`}
        data-mind-node-body={id}
      >
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
              // A blank / whitespace-only rename is treated as "cancel" so
              // accidentally tapping outside the field never blanks a node.
              // `setNodeTopic` itself would silently no-op, which made the
              // rename feel broken in the old editor.
              settledRef.current = true;
              const trimmed = draftRef.current.trim();
              if (trimmed && trimmed !== topic) onCommitTopic(id, trimmed);
              onCloseEditor(id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                settledRef.current = true;
                const trimmed = draftRef.current.trim();
                if (trimmed) onCommitTopic(id, trimmed);
                onCloseEditor(id);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                // A cancel is still a settlement — the teardown safety net
                // must not "rescue" the draft the learner just discarded.
                settledRef.current = true;
                onCloseEditor(id);
              }
              // React Flow would otherwise treat typing as a canvas shortcut.
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            className={`nodrag w-full min-w-0 resize-none overflow-x-hidden whitespace-pre-wrap break-words bg-transparent p-0 text-inherit outline-none ${
              theme === "light" ? "placeholder:text-slate-400" : "placeholder:text-white/40"
            }`}
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
          className={`pointer-events-none absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full ${
            facesLeft ? "-right-[3.5px]" : "-left-[3.5px]"
          }`}
        />
      )}

      {/* ── The `+`: one tap appends a child to THIS node ──────────────── */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onAddChild(id);
        }}
        className={`nodrag absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-violet-300/40 bg-violet-500 text-white shadow-md transition hover:scale-110 hover:bg-violet-400 active:scale-95 ${
          facesLeft ? "-left-3.5" : "-right-3.5"
        }`}
        aria-label={`${isRoot ? "Central idea" : topic} ke andar nayi branch jodein`}
        title="Nayi branch jodein"
        data-mind-node-add={id}
      >
        <Plus size={14} strokeWidth={3} />
      </button>
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

const SAVE_COPY: Record<MindMapSaveStatus, { label: string; dark: string; light: string }> = {
  idle: { label: "Sign in karke save hoga", dark: "text-slate-400", light: "text-slate-500" },
  loading: { label: "Loading…", dark: "text-slate-400", light: "text-slate-500" },
  ready: { label: "Ready", dark: "text-slate-400", light: "text-slate-500" },
  saving: { label: "Saving…", dark: "text-amber-300", light: "text-amber-600" },
  saved: { label: "Cloud par saved", dark: "text-emerald-300", light: "text-emerald-600" },
  error: { label: "Save retry ho raha hai", dark: "text-rose-300", light: "text-rose-600" },
};

// ── Toolbar drop-down ─────────────────────────────────────────────────────

/**
 * Width of a tool drop-down. Deliberately small — "chhota sa drop down" —
 * so it never covers the diagram it is styling.
 */
const MENU_WIDTH_PX = 224;

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
 * would be sliced off at the strip's top edge. Fixed positioning against the
 * trigger's own rect keeps it glued to its button while the sheet animates,
 * it opens UPWARD because the bar sits at the bottom of the sheet, and it
 * clamps itself into the viewport (sideways and vertically) so it can never
 * hang off a phone screen.
 */
function ToolbarMenu({ open, anchorRef, onClose, theme, label, children }: ToolbarMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  // Re-measure on every resize / scroll: the sheet slides, the keyboard
  // lifts it, and a menu that keeps the FIRST rect floats away from its
  // button.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const box = anchorRef.current?.getBoundingClientRect();
      if (!box) return;
      setAnchor({ top: box.top, right: box.right });
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
  // The menu grows upward from 8px above its trigger, and is never allowed
  // to be taller than the space above it (so it can't run off the top).
  const spaceAbove = Math.max(120, anchor.top - 16);
  const maxHeight = Math.min(spaceAbove, Math.round(window.innerHeight * 0.6));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="mm-menu fixed"
      data-mm-menu
      data-menu-theme={theme}
      style={{ left, width, maxHeight, bottom: window.innerHeight - anchor.top + 8 }}
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

export interface MindMapPanelProps {
  mind: MindMap;
  onMindChange: (updater: MindMap | ((current: MindMap) => MindMap)) => void;
  status: MindMapSaveStatus;
  errorMessage?: string | null;
  /** Flush the debounced write now — called when the sheet closes. */
  onFlush?: () => void;
  /**
   * The Course Player's CURRENT theme. The map follows it until the learner
   * flips the mind map's own sun/moon button in the toolbar.
   */
  playerTheme?: MindMapTheme;
  /**
   * True when the panel is opened in landscape. The status strip and the
   * floating zoom controls stay mounted in both orientations, but in
   * landscape they are nudged to the bottom-left of the canvas so the
   * diagram fills the rest of the sheet — the `+` buttons and pinch-zoom
   * keep adding + zooming possible, so nothing the old portrait toolbar
   * offered is lost.
   */
  landscape?: boolean;
  /** Close the mind map sheet (toolbar X). */
  onClose?: () => void;
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
}

function MindMapCanvas(props: MindMapPanelProps) {
  const {
    mind,
    onMindChange,
    status,
    errorMessage,
    onFlush,
    onClose,
    playerTheme = "dark",
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
  } = props;
  /** The map library sheet (grid of this module's maps) is the HOME screen:
   *  it is open by default so the learner picks a map to edit — or creates a
   *  new one — before ever landing on a canvas. */
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Theme: null → track the Course Player; a value → the learner's own pick
  // for THIS window (persisted per device).
  const [themeOverride, setThemeOverride] = useState<MindMapTheme | null>(loadMindMapThemeOverride);
  const [doubleTapDelete, setDoubleTapDelete] = useState<boolean>(loadDblTapDelete);
  // ── Align-menu choices (box arrangement + how a long label fits) ───────
  // Views, not data: they are remembered per device like the theme and the
  // double-tap switch, and never written to Firestore.
  const [arrangement, setArrangement] = useState<MindMapArrangement>(loadArrangement);
  const [textFit, setTextFit] = useState<MindMapTextFit>(loadTextFit);
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

  const mindTheme: MindMapTheme = themeOverride ?? (playerTheme === "light" ? "light" : "dark");

  // Remember the manual choices per device (private mode just loses them).
  useEffect(() => {
    try {
      if (themeOverride) localStorage.setItem(mindMapThemeStorageKey, themeOverride);
      else localStorage.removeItem(mindMapThemeStorageKey);
    } catch {
      /* ignore */
    }
  }, [themeOverride]);

  useEffect(() => {
    try {
      localStorage.setItem(dblTapDeleteStorageKey, doubleTapDelete ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [doubleTapDelete]);

  useEffect(() => {
    try {
      localStorage.setItem(arrangementStorageKey, arrangement);
    } catch {
      /* ignore */
    }
  }, [arrangement]);

  useEffect(() => {
    try {
      localStorage.setItem(textFitStorageKey, textFit);
    } catch {
      /* ignore */
    }
  }, [textFit]);

  // The library is the panel's home screen. It opens on mount, and if the
  // learner closes the sheet with the same-tab dock toggle and opens it again,
  // the library comes straight back — with any in-progress node edit cleared —
  // so they can pick another map or start a new one.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setLibraryOpen(true);
      setRenamingKey(null);
      setRenameDraft("");
      setSelectedId(null);
      setEditingId(null);
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
        setSelectedId(createdId);
        setEditingId(createdId);
      }
    },
    [onMindChange],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onMindChange((current) => removeNode(current, id));
      setSelectedId((current) => (current === id ? null : current));
      setEditingId((current) => (current === id ? null : current));
    },
    [onMindChange],
  );

  const handleOpenEditor = useCallback((id: string) => {
    // Single tap on a node opens the editor directly. Selection is implied
    // (the editor input is only ever the active one), so the same call also
    // updates the selected id. Calling this on the root is a no-op for
    // delete but still lets the learner edit the central idea.
    setSelectedId(id);
    setEditingId(id);
  }, []);

  const handleCloseEditor = useCallback((id: string) => setEditingId((current) => (current === id ? null : current)), []);

  const handleCommitTopic = useCallback(
    (id: string, topic: string) => onMindChange((current) => setNodeTopic(current, id, topic)),
    [onMindChange],
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
      setRenamingKey(null);
      setLibraryOpen(false);
      setSelectedId(null);
      setEditingId(null);
    },
    [activeMapKey, onSelectMap],
  );

  const startRename = useCallback((entry: MindMapSummary) => {
    setRenamingKey(entry.mapKey);
    setRenameDraft(entry.title || entry.rootTopic || "");
  }, []);

  const commitRename = useCallback(() => {
    const key = renamingKey;
    const name = renameDraft.trim();
    setRenamingKey(null);
    setRenameDraft("");
    if (key && name) onRenameMap?.(key, name);
  }, [renamingKey, renameDraft, onRenameMap]);

  // The root can never be deleted, so the toolbar trash only arms itself for
  // a real branch selection.
  const canDeleteSelected = selectedId != null && selectedId !== rootId();

  // ── React Flow nodes + edges, derived from the layout ──────────────────
  const layoutNodes: Node<MindNodeData>[] = useMemo(() => {
    const topicById = new Map<string, string>([[rootId(), mind.rootTopic]]);
    for (const node of mind.nodes) topicById.set(String(node.id), node.topic);

    return layout.nodes.map((placed) => ({
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
        deleteOnDoubleTap: doubleTapDelete,
        onAddChild: handleAddChild,
        onDelete: handleDelete,
        onOpenEditor: handleOpenEditor,
        onCloseEditor: handleCloseEditor,
        onCommitTopic: handleCommitTopic,
      },
    }));
  }, [
    layout,
    facingOverride,
    mind.nodes,
    mind.rootTopic,
    selectedId,
    editingId,
    mindTheme,
    textFit,
    doubleTapDelete,
    handleAddChild,
    handleDelete,
    handleOpenEditor,
    handleCloseEditor,
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
        // created on. Keying these on the stored side is what made a node
        // dragged across its parent keep wiring backwards, which turned the
        // whole map into a knot of crossing ropes.
        // The stroke reads per-theme CSS variables off the shell so a theme
        // flip recolours every wire without re-deriving the edges.
        const goesLeft = (facingOverride[edge.target] ?? edge.facing ?? "right") === "left";
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
            stroke: goesLeft ? "var(--mm-edge-left)" : "var(--mm-edge-right)",
            strokeWidth: 2.4,
          },
        };
      }),
    [layout.edges, facingOverride],
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

  // Shared toolbar button chrome — soft tile that reads the shell palette.
  const toolButton =
    "grid h-7 w-7 place-items-center rounded-lg bg-[var(--mm-soft)] text-[var(--mm-text)] transition hover:bg-[var(--mm-soft-hover)]";

  return (
    <div
      className="course-mindmap-shell relative flex h-full w-full flex-col overflow-hidden bg-[var(--mm-bg)]"
      data-course-mindmap
      data-mindmap-theme={mindTheme}
    >
      {/* ── Canvas ────────────────────────────────────────────────────────
          `touch-action: none` is required, not cosmetic: without it the
          browser claims the pinch for page zoom and React Flow never sees it. */}
      <div ref={canvasRef} className="relative min-h-0 flex-1" style={{ touchAction: "none" }} data-course-mindmap-canvas>
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
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color={mindTheme === "light" ? "rgba(15,23,42,0.16)" : "rgba(255,255,255,0.07)"}
          />
        </ReactFlow>

        {/* First-run hint, shown only while the map is still just a root.
            Includes a single "Add root branch" CTA that disappears as soon
            as a child is added — the rest of the growing is done from the
            `+` on any node, so the toolbar isn't needed. */}
        {mind.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 ring-1 ${
                mindTheme === "light" ? "bg-white/90 ring-slate-900/10" : "bg-black/80 ring-white/10"
              }`}
            >
              <p className={`text-center text-[11px] font-semibold ${mindTheme === "light" ? "text-slate-600" : "text-slate-300"}`}>
                Kisi bhi node par <span className="font-black text-violet-500">+</span> dabayein — branch wahin jud jayegi
              </p>
            </div>
          </div>
        ) : doubleTapDelete ? (
          // The armed-state reminder: destructive mode is on, so the learner
          // can always see why a second quick tap removed a branch.
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 ring-1 ${
                mindTheme === "light"
                  ? "bg-rose-50/95 text-rose-700 ring-rose-400/40"
                  : "bg-rose-950/85 text-rose-200 ring-rose-400/30"
              }`}
              data-course-mindmap-dbl-delete-hint
            >
              <Trash2 size={11} />
              <p className="text-center text-[11px] font-semibold">
                Double-tap delete ON — node par double-tap karke branch hatayein
              </p>
            </div>
          </div>
        ) : null}

        {/* ── Map library ───────────────────────────────────────────────────
            The Notes panel keeps a grid of separate notes; a module keeps a
            grid of separate MIND MAPS the same way. It slides over the canvas
            (rather than living in a header) so the diagram surface stays
            completely clean when the library is closed. Each card opens its
            map on tap, and carries its own rename / delete actions. */}
        {libraryOpen ? (
          <div className="absolute inset-0 z-20 flex flex-col bg-[var(--mm-bg)]/97 backdrop-blur-sm" data-course-mindmap-library>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--mm-border)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--mm-text)]">
                  Is module ke mind maps
                </p>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--mm-muted)]">
                  {mapsLoading ? "Loading…" : `${maps.length} ${maps.length === 1 ? "map" : "maps"} · tap karke kholein`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onCreateMap?.();
                    setLibraryOpen(false);
                    setSelectedId(null);
                    setEditingId(null);
                  }}
                  disabled={atMapLimit || !onCreateMap}
                  className="flex items-center gap-1 rounded-lg bg-violet-500 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-violet-400 disabled:opacity-40"
                  aria-label="Naya mind map banayein"
                  title={atMapLimit ? "Is module me maps ki limit poori ho gayi" : "New map — naya khaali mind map"}
                  data-course-mindmap-new
                >
                  <Plus size={13} strokeWidth={3} /> New map
                </button>
                <button
                  type="button"
                  onClick={() => { setLibraryOpen(false); setRenamingKey(null); }}
                  className={toolButton}
                  aria-label="Map list band karein"
                  data-course-mindmap-library-close
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {/* While the index is still loading, show skeletons instead of a
                  fake single card — the grid is this panel's first screen, so
                  it should never look emptier than it really is. */}
              {mapsLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-course-mindmap-map-loading data-course-mindmap-map-grid="true">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="aspect-square animate-pulse rounded-2xl bg-[var(--mm-soft)] ring-1 ring-[var(--mm-border)]"
                    />
                  ))}
                </div>
              ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-course-mindmap-map-list data-course-mindmap-map-grid="true">
                {maps.map((entry) => {
                  const active = entry.mapKey === activeMapKey;
                  const renaming = renamingKey === entry.mapKey;
                  return (
                    <li
                      key={entry.mapKey}
                      className={`relative flex aspect-square min-h-[104px] flex-col overflow-hidden rounded-2xl border p-2.5 transition ${
                        active ? "border-violet-400/70" : "border-[var(--mm-border)]"
                      }`}
                      data-course-mindmap-map-card
                      data-map-key={entry.mapKey}
                      data-active={active ? "true" : "false"}
                    >
                      {renaming ? (
                        <input
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename();
                            if (event.key === "Escape") { setRenamingKey(null); setRenameDraft(""); }
                          }}
                          onBlur={commitRename}
                          autoFocus
                          maxLength={120}
                          className="w-full rounded-lg bg-[var(--mm-bg)] px-2 py-1 text-[11px] font-bold text-[var(--mm-text)] outline-none ring-1 ring-violet-400/60"
                          aria-label="Map ka naam"
                          data-course-mindmap-rename-input
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openMap(entry.mapKey)}
                          className="flex min-h-0 w-full flex-1 items-center justify-center px-1 text-center"
                          data-course-mindmap-open-map={entry.mapKey}
                        >
                          {/* The card shows ONLY the map's primary (central)
                              node text — exactly what is written on the
                              centre box — so the library reads like the maps
                              themselves, not their auto "Mind map 3" names. */}
                          <p className="line-clamp-4 text-[12px] font-black leading-snug text-[var(--mm-text)]">
                            {entry.rootTopic || entry.title || "Untitled map"}
                          </p>
                        </button>
                      )}
                      <div className="mt-1.5 flex shrink-0 items-center justify-end gap-1.5">
                        {renaming ? (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={commitRename}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white"
                            aria-label="Naam save karein"
                            data-course-mindmap-rename-save
                          >
                            <Check size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRename(entry)}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/90 text-white transition hover:brightness-110"
                            aria-label="Map rename karein"
                            data-course-mindmap-rename
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteMap?.(entry.mapKey)}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-rose-500/90 text-white transition hover:brightness-110"
                          aria-label="Map delete karein"
                          title="Yeh mind map delete karein"
                          data-course-mindmap-delete-map
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Status strip — the mind map's toolbar ──────────────────────────
          The only persistent chrome, and every control on it is a SINGLE
          ICON: the cloud-save beacon (tinted by the save state, blinking
          while there is a message to read), the map pill, then the tools —
          auto-arrange, the align menu, fit-to-screen, this window's
          light/dark flip, delete-branch, the double-tap-delete arm switch,
          and close.

          There are no +/− zoom buttons: the canvas is pinched (and panned)
          straight with the fingers, and Fit re-frames the whole map in one
          tap — the two buttons were the ones eating the bar's width.

          The strip is CLIPPED, never scrolled. A scrollable bar keeps the
          offset the browser handed it while scrolling a focused tile into
          view (soft keyboard, orientation flip, the sheet reopening) and
          never gives it back — that stale offset is exactly the "toolbar
          khisak gaya left" report. The map-name pill is the only element
          allowed to shrink, so every tool stays on the bar. */}
      <div
        ref={statusRef}
        className="flex shrink-0 items-center overflow-hidden border-t border-[var(--mm-border)] px-2 py-1.5"
        style={{ gap: "var(--mm-tool-gap)" }}
        data-course-mindmap-status
        data-compact={toolbarCompact ? "true" : "false"}
      >
        {/* ── Left cluster: cloud save + which map is open ─────────────── */}
        <div className="flex min-w-0 flex-1 items-center" style={{ gap: "var(--mm-tool-gap)" }}>
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
          <ToolbarMenu
            open={saveMenuOpen}
            anchorRef={saveAnchorRef}
            onClose={() => setSaveMenuOpen(false)}
            theme={mindTheme}
            label="Cloud save"
          >
            <p className="mm-menu-head">Cloud save</p>
            <p
              className={`mm-menu-note flex items-center gap-1.5 ${mindTheme === "light" ? save.light : save.dark}`}
              data-course-mindmap-save-label
            >
              {status === "error" ? <TriangleAlert size={11} /> : null}
              {save.label}
            </p>
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
              setLibraryOpen((open) => !open);
            }}
            aria-expanded={libraryOpen}
            className={`mm-pill ${libraryOpen ? "mm-tool-violet" : ""}`}
            aria-label="Is module ke saare mind maps"
            title="Maps — is module ke sabhi mind maps"
            data-course-mindmap-maps
            data-map-count={maps.length}
            data-active-map={activeMapKey}
          >
            <Layers />
            <span className="min-w-0 truncate normal-case" data-mm-map-name>
              {activeMapName}
            </span>
            <span className="mm-pill-count">{maps.length}</span>
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

          {/* ── Light / dark for THIS window only ───────────────────────
              The map follows the Course Player theme until this button is
              used; from then on the map keeps its own choice (the lesson
              is untouched). The icon previews what the next tap flips to. */}
          <button
            type="button"
            onClick={() => setThemeOverride(mindTheme === "dark" ? "light" : "dark")}
            className="mm-tool"
            aria-label={mindTheme === "dark" ? "Mind map ko white mode mein le jayein" : "Mind map ko dark mode mein le jayein"}
            title={mindTheme === "dark" ? "White mode — sirf yeh mind map" : "Dark mode — sirf yeh mind map"}
            data-course-mindmap-theme
            data-theme={mindTheme}
            data-next-theme={mindTheme === "dark" ? "light" : "dark"}
          >
            {mindTheme === "dark" ? <Sun /> : <Moon />}
          </button>

          {/* ── Delete the selected branch ──────────────────────────────
              Tap (or drag) a node to select it, then this removes the
              branch. Disabled for the root / no selection — the centre of
              a mind map is never deletable. */}
          <button
            type="button"
            onClick={() => {
              if (selectedId) handleDelete(selectedId);
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

          {/* ── Double-tap delete arm switch ────────────────────────────
              While ON, a quick double-tap on any node deletes it (never
              the root). OFF by default so an accidental double-tap can
              never cost a branch; the lit violet state doubles as the
              mode's "this is armed" reminder. */}
          <button
            type="button"
            onClick={() => setDoubleTapDelete((armed) => !armed)}
            aria-pressed={doubleTapDelete}
            className={`mm-tool ${doubleTapDelete ? "mm-tool-violet" : ""}`}
            aria-label={doubleTapDelete ? "Double-tap delete band karein" : "Double-tap delete chaalu karein"}
            title={doubleTapDelete ? "Double-tap delete ON — band karne ke liye dabayein" : "Double-tap delete — node par double-tap karke delete karein"}
            data-course-mindmap-dbl-delete
            data-active={doubleTapDelete ? "true" : "false"}
          >
            <MousePointerClick />
          </button>

          {onClose ? (
            <button
              type="button"
              onClick={() => {
                onFlush?.();
                onClose();
              }}
              className="mm-tool mm-tool-danger"
              aria-label="Mind map band karein"
              title="Close mind map"
              data-course-mindmap-close
            >
              <X />
            </button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p
          className={`shrink-0 bg-rose-500/10 px-3 py-1.5 text-[10px] font-semibold ${
            mindTheme === "light" ? "text-rose-700" : "text-rose-200"
          }`}
          data-course-mindmap-error
        >
          {errorMessage}
        </p>
      ) : null}
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
