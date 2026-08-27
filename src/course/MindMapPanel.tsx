// src/course/MindMapPanel.tsx
//
// The learner-facing mind map editor, opened from the Course Player dock next
// to the Note tab.
//
// ── Interaction contract ─────────────────────────────────────────────────
//   `+`            → add a child to this node (then focus its editor)
//   tap node       → opens the inline editor straight away. The editor sits
//                    inside the node so the soft keyboard lands right on it.
//   drag node      → the node (and the branch under it) can be placed
//                    ANYWHERE by hand. The drop is remembered per node, so
//                    the hand-arranged map survives save / reload. Nodes the
//                    learner never dragged keep riding the tidy-tree layout.
//   Enter / blur   → save the new topic and close the editor.
//   Escape         → cancel the rename and keep the previous topic.
//   tap outside    → any open editor saves its content (blur behaves the
//                    same way, so closing the editor and tapping the canvas
//                    is one and the same action).
//   ▸ / ▾          → collapse / expand a branch (action bar on the selected
//                    node, never visible by default).
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
// ── Why React Flow and not jsMind ────────────────────────────────────────
// jsMind ships a purpose-built tree, but its published core
// (`jsmind/es6/jsmind.js`, v0.9.1) contains zero touch handling — no
// `touchstart`/`touchmove`, and zoom is bound to the mouse wheel only. On a
// mobile-first PWA that rules it out. React Flow brings real pinch-zoom,
// drag-pan AND node dragging, and a custom node is just a React component,
// so the `+` button is ordinary JSX rather than DOM surgery.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize, Minus, MousePointerClick, Moon, Plus, Sun, Trash2, TriangleAlert } from "lucide-react";
import {
  addChildNode,
  countNodes,
  layoutMindMap,
  maxDepth,
  removeNode,
  rootId,
  setNodePosition,
  setNodeTopic,
  toggleCollapsed,
  type MindMap,
} from "../../utils/mindMapTree";
import type { MindMapSaveStatus } from "./useCourseMindMap";

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

// ── Custom node ───────────────────────────────────────────────────────────

interface MindNodeData extends Record<string, unknown> {
  topic: string;
  depth: number;
  side: "left" | "right" | null;
  collapsed: boolean;
  childCount: number;
  isRoot: boolean;
  selected: boolean;
  editing: boolean;
  /** Palette for this window — "light" is the white mode. */
  theme: MindMapTheme;
  /** True while the toolbar's double-tap delete mode is armed. */
  deleteOnDoubleTap: boolean;
  onAddChild: (id: string) => void;
  onToggleCollapse: (id: string) => void;
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
 * One mind map box. The `+` sits just outside the measured box on the side
 * facing away from the root, so it never changes the node's own width — the
 * layout measured this box in `utils/mindMapTree.js` and the two must agree
 * pixel for pixel or siblings would overlap.
 *
 * Single-tap on a node opens the inline editor right where the topic was
 * rendered, so the soft keyboard lands in the same place. Pressing Enter,
 * tapping outside the node, or tapping a different node all commit the
 * current draft and close the editor. A blank / whitespace-only draft is
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
    collapsed,
    childCount,
    isRoot,
    selected,
    editing,
    theme,
    deleteOnDoubleTap,
    onAddChild,
    onToggleCollapse,
    onDelete,
    onOpenEditor,
    onCloseEditor,
    onCommitTopic,
  } = data;

  const [draft, setDraft] = useState(topic);
  const inputRef = useRef<HTMLInputElement>(null);
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
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [editing, topic]);

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

  const facesLeft = side === "left";

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
  // the node's own tap-to-edit / drag-to-move interaction.
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
      data-mind-node-selected={selected ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pressStartRef.current = null;
        lastTapRef.current = 0;
      }}
    >
      {/* Invisible connection handles — required by React Flow to route edges */}
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="src-left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="src-right" style={handleStyle} />

      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-xl border px-2.5 pt-1.5 text-[13px] font-semibold leading-[17px] transition ${tone} ${
          selected ? "ring-2 ring-violet-400/80 ring-offset-2 ring-offset-[var(--mm-bg)]" : ""
        }`}
        data-mind-node-body={id}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
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
            className={`nodrag w-full min-w-0 bg-transparent text-inherit outline-none ${
              theme === "light" ? "placeholder:text-slate-400" : "placeholder:text-white/40"
            }`}
            placeholder="Idea likhein…"
            aria-label="Node ka text badlein"
            data-mind-node-input={id}
          />
        ) : (
          <span className="line-clamp-4 min-h-0 flex-1 break-words">{topic}</span>
        )}

        {/* Action bar — rendered INSIDE the node so the control can never
            land outside the React Flow viewport on a phone. Only the
            selected node shows it, and only while it has a branch to fold.
            The trash deliberately no longer lives here: deleting a branch is
            done from the toolbar (or the optional double-tap mode) so the
            destructive action is never one mis-tap away from the editor. */}
        {selected && childCount > 0 ? (
          <div
            className="mt-1 flex shrink-0 items-center gap-1 border-t border-[var(--mm-border)] pt-1"
            data-mind-node-actions={id}
            // Stop the React Flow canvas from re-selecting while the user
            // taps a button — without this, a tap on the chevron can land on
            // the canvas instead of the button on slow devices.
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse(id);
              }}
              className={`nodrag grid h-5 w-5 place-items-center rounded-full border text-[10px] font-black transition ${
                theme === "light"
                  ? "border-slate-900/15 bg-white/85 text-slate-700 hover:bg-white"
                  : "border-white/15 bg-black/60 text-slate-200 hover:bg-black/80"
              }`}
              aria-label={collapsed ? "Branch kholein" : "Branch chhupayein"}
              title={collapsed ? "Expand" : "Collapse"}
              data-mind-node-collapse={id}
            >
              {collapsed ? childCount : "–"}
            </button>
          </div>
        ) : null}
      </div>

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

// ── Save-status pill ──────────────────────────────────────────────────────

const SAVE_COPY: Record<MindMapSaveStatus, { label: string; dark: string; light: string }> = {
  idle: { label: "Sign in karke save hoga", dark: "text-slate-400", light: "text-slate-500" },
  loading: { label: "Loading…", dark: "text-slate-400", light: "text-slate-500" },
  ready: { label: "Ready", dark: "text-slate-400", light: "text-slate-500" },
  saving: { label: "Saving…", dark: "text-amber-300", light: "text-amber-600" },
  saved: { label: "Cloud par saved", dark: "text-emerald-300", light: "text-emerald-600" },
  error: { label: "Save retry ho raha hai", dark: "text-rose-300", light: "text-rose-600" },
};

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
}

function MindMapCanvas(props: MindMapPanelProps) {
  const { mind, onMindChange, status, errorMessage, onFlush, playerTheme = "dark", landscape: _landscape } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Theme: null → track the Course Player; a value → the learner's own pick
  // for THIS window (persisted per device).
  const [themeOverride, setThemeOverride] = useState<MindMapTheme | null>(loadMindMapThemeOverride);
  const [doubleTapDelete, setDoubleTapDelete] = useState<boolean>(loadDblTapDelete);
  const { zoomIn, zoomOut, fitView, setCenter } = useReactFlow();

  // Set while a real node drag is in progress, so the click that follows a
  // drop can be told apart from a genuine tap on the node.
  const dragMovedRef = useRef(false);

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

  // Flush the debounced write when the panel unmounts. The overlay unmounts
  // this on a tab switch, so this is the safety net that pairs with the
  // parent's own "leaving the mind map tab" flush.
  useEffect(() => () => { onFlush?.(); }, [onFlush]);

  const layout = useMemo(() => layoutMindMap(mind), [mind]);

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

  const handleToggleCollapse = useCallback(
    (id: string) => onMindChange((current) => toggleCollapsed(current, id)),
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

  // The root can never be deleted, so the toolbar trash only arms itself for
  // a real branch selection.
  const canDeleteSelected = selectedId != null && selectedId !== rootId();

  // ── React Flow nodes + edges, derived from the layout ──────────────────
  const nodes: Node<MindNodeData>[] = useMemo(() => {
    const topicById = new Map<string, string>([[rootId(), mind.rootTopic]]);
    for (const node of mind.nodes) topicById.set(String(node.id), node.topic);

    return layout.nodes.map((placed) => ({
      id: placed.id,
      type: "mindNode",
      position: { x: placed.x, y: placed.y },
      // Hand placement: the learner can drag any node anywhere on the
      // canvas and the drop is committed on release (see onNodeDragStop).
      draggable: true,
      selectable: true,
      style: { width: placed.width, height: placed.height },
      data: {
        topic: topicById.get(placed.id) || "Idea",
        depth: placed.depth,
        side: placed.side,
        collapsed: placed.collapsed,
        childCount: placed.childCount,
        isRoot: placed.isRoot,
        selected: selectedId === placed.id,
        editing: editingId === placed.id,
        theme: mindTheme,
        deleteOnDoubleTap: doubleTapDelete,
        onAddChild: handleAddChild,
        onToggleCollapse: handleToggleCollapse,
        onDelete: handleDelete,
        onOpenEditor: handleOpenEditor,
        onCloseEditor: handleCloseEditor,
        onCommitTopic: handleCommitTopic,
      },
    }));
  }, [
    layout,
    mind.nodes,
    mind.rootTopic,
    selectedId,
    editingId,
    mindTheme,
    doubleTapDelete,
    handleAddChild,
    handleToggleCollapse,
    handleDelete,
    handleOpenEditor,
    handleCloseEditor,
    handleCommitTopic,
  ]);

  const edges: Edge[] = useMemo(
    () =>
      layout.edges.map((edge) => {
        // For left-side branches: parent exports from its left handle,
        // child receives on its right handle.
        // For right-side (and root) branches: parent exports from its right
        // handle, child receives on its left handle.
        // The stroke reads per-theme CSS variables off the shell so a theme
        // flip recolours every wire without re-deriving the edges.
        const goesLeft = edge.side === "left";
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: goesLeft ? "src-left" : "src-right",
          targetHandle: goesLeft ? "right" : "left",
          type: "smoothstep",
          animated: false,
          style: {
            stroke: goesLeft ? "var(--mm-edge-left)" : "var(--mm-edge-right)",
            strokeWidth: 2,
          },
        };
      }),
    [layout.edges],
  );

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
      <div className="relative min-h-0 flex-1" style={{ touchAction: "none" }} data-course-mindmap-canvas>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
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
          onNodeDrag={() => {
            dragMovedRef.current = true;
          }}
          onNodeDragStop={(_event, node) => {
            // Commit the drop as this node's manual position — the branch
            // under it inherits the same offset in the next layout pass, so
            // a hand-moved parent keeps its children glued on.
            onMindChange((current) => setNodePosition(current, node.id, node.position.x, node.position.y));
            // The dropped node becomes the selection so the toolbar trash
            // can act on it straight away.
            setSelectedId(node.id);
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
      </div>

      {/* ── Status strip — the mind map's toolbar ──────────────────────────
          The only persistent chrome. The save indicator sits on the left,
          a small node count + levels readout in the middle, and on the right
          the working set of controls: zoom, fit-to-screen, the map's own
          light/dark toggle, delete-selected and the double-tap-delete arm
          switch. Every button is icon-sized so all six fit on a phone. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--mm-border)] px-3 py-1.5" data-course-mindmap-status>
        <span
          className={`flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${
            mindTheme === "light" ? save.light : save.dark
          }`}
          data-course-mindmap-save-label
        >
          {status === "error" ? <TriangleAlert size={11} /> : null}
          {save.label}
        </span>
        <span className="min-w-0 truncate text-[10px] font-bold text-[var(--mm-muted)]" data-course-mindmap-stats>
          {totalNodes} {totalNodes === 1 ? "node" : "nodes"} · {levels} {levels === 1 ? "level" : "levels"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void zoomOut({ duration: 180 })}
            className={toolButton}
            aria-label="Zoom out"
            data-course-mindmap-zoom-out
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={() => void zoomIn({ duration: 180 })}
            className={toolButton}
            aria-label="Zoom in"
            data-course-mindmap-zoom-in
          >
            <Plus size={13} />
          </button>
          {/* Fit-to-screen: re-fits the whole diagram to the visible canvas.
              Larger + violet-tinted than the zoom buttons so it stands out
              as the "make everything visible" affordance (the maximise
              icon matches the system "fullscreen" cue). A wider padding
              keeps every node clear of the canvas edges after the fit. */}
          <button
            type="button"
            onClick={() => void fitView({ duration: 260, padding: 0.2 })}
            className="ml-1 flex h-7 items-center gap-1 rounded-lg bg-violet-500/20 px-2 text-[10px] font-black uppercase tracking-wider text-violet-100 ring-1 ring-inset ring-violet-400/40 transition hover:bg-violet-500/30 hover:text-white"
            aria-label="Poora map fit karein"
            title="Fit to screen — sab nodes ek saath dikhao"
            data-course-mindmap-fit
          >
            <Maximize size={13} />
            <span className="hidden sm:inline">Fit</span>
          </button>
          {/* ── Light / dark for THIS window only ─────────────────────────
              The map follows the Course Player theme until this button is
              used; from then on the map keeps its own choice (the lesson is
              untouched). The icon previews what the next tap switches to. */}
          <button
            type="button"
            onClick={() => setThemeOverride(mindTheme === "dark" ? "light" : "dark")}
            className={toolButton}
            aria-label={mindTheme === "dark" ? "Mind map ko white mode mein le jayein" : "Mind map ko dark mode mein le jayein"}
            title={mindTheme === "dark" ? "White mode — sirf yeh mind map" : "Dark mode — sirf yeh mind map"}
            data-course-mindmap-theme
            data-theme={mindTheme}
            data-next-theme={mindTheme === "dark" ? "light" : "dark"}
          >
            {mindTheme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          {/* ── Delete the selected branch ─────────────────────────────────
              The trash moved here from inside the node: tap (or drag) a
              node to select it, then this button removes the branch. It
              stays disabled for the root / no selection — the centre of a
              mind map is never deletable. */}
          <button
            type="button"
            onClick={() => {
              if (selectedId) handleDelete(selectedId);
            }}
            disabled={!canDeleteSelected}
            className={`${toolButton} ${canDeleteSelected ? "hover:text-rose-400" : "cursor-not-allowed opacity-35"}`}
            aria-label={canDeleteSelected ? "Selected branch delete karein" : "Pehle koi node select karein"}
            title={canDeleteSelected ? "Delete — selected branch (root nahi hat sakta)" : "Node tap karke select karein, phir delete"}
            data-course-mindmap-delete
            data-delete-ready={canDeleteSelected ? "true" : "false"}
          >
            <Trash2 size={13} />
          </button>
          {/* ── Double-tap delete arm switch ──────────────────────────────
              While ON, a quick double-tap on any node deletes it (never the
              root). OFF by default so an accidental double-tap can never
              cost a branch; the lit violet state doubles as the mode's
              "this is armed" reminder. */}
          <button
            type="button"
            onClick={() => setDoubleTapDelete((armed) => !armed)}
            aria-pressed={doubleTapDelete}
            className={`grid h-7 w-7 place-items-center rounded-lg transition ${
              doubleTapDelete
                ? mindTheme === "light"
                  ? "bg-violet-500/20 text-violet-800 ring-1 ring-inset ring-violet-500/45"
                  : "bg-violet-500/25 text-violet-100 ring-1 ring-inset ring-violet-400/50"
                : "bg-[var(--mm-soft)] text-[var(--mm-muted)] hover:bg-[var(--mm-soft-hover)] hover:text-[var(--mm-text)]"
            }`}
            aria-label={doubleTapDelete ? "Double-tap delete band karein" : "Double-tap delete chaalu karein"}
            title={doubleTapDelete ? "Double-tap delete ON — band karne ke liye dabayein" : "Double-tap delete — node par double-tap karke delete karein"}
            data-course-mindmap-dbl-delete
            data-active={doubleTapDelete ? "true" : "false"}
          >
            <MousePointerClick size={13} />
          </button>
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
