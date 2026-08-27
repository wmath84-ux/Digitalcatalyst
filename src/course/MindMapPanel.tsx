// src/course/MindMapPanel.tsx
//
// The learner-facing mind map editor, opened from the Course Player dock next
// to the Note tab.
//
// ── Interaction contract ─────────────────────────────────────────────────
// Every node carries a `+` on its outward edge. Tapping it appends a child to
// THAT node — root, branch or leaf, at any depth — and the tidy-tree layout in
// `utils/mindMapTree.js` immediately re-flows so the diagram stays readable.
// Nothing is ever positioned by hand: the learner only ever says "one more
// idea here", which is what makes this usable on a phone.
//
//   `+`            → add a child to this node (then focus its editor)
//   tap node       → opens the inline editor straight away. The editor sits
//                    inside the node so the soft keyboard lands right on it.
//   Enter / blur   → save the new topic and close the editor.
//   Escape         → cancel the rename and keep the previous topic.
//   tap outside    → any open editor saves its content (blur behaves the
//                    same way, so closing the editor and tapping the canvas
//                    is one and the same action).
//   tap while editing a different node → the current edit is saved (the
//                    input blurs, committing the topic) and the new node
//                    becomes the active editor.
//   ▸ / ▾          → collapse / expand a branch (delete-bar on the selected
//                    node, never visible by default).
//   trash          → delete the selected branch — the trash button ONLY
//                    renders while the node is selected and is never on
//                    the root. No rename pencil: tapping the node itself
//                    is the rename trigger.
//
// ── Why no separate rename button ───────────────────────────────────────
// Double-tap and pencil icons were both unreliable on phones (the React Flow
// tap-vs-drag disambiguator swallowed one or the other depending on pointer
// pressure). The single-tap-to-edit pattern removes that ambiguity entirely:
// tapping a node is the rename trigger, there is no second action to find,
// and the input lives inside the same DOM tree as the visual text so the
// soft keyboard lands in the right place every time.
//
// ── Why actions live INSIDE the node, shown only on select ──────────────
// The trash button (the only persisted action) used to sit OUTSIDE the node
// box, on the inward edge. On a phone that meant the button sat beyond the
// node's measured width and got clipped by the React Flow viewport on wide
// maps — the button was there but unreachable, so "delete" silently did
// nothing. The trash is now part of the same node DOM, anchored at the
// bottom, and only renders while the node is selected. The collapse control
// rides the same row when the node has children.
//
// ── Why React Flow and not jsMind ────────────────────────────────────────
// jsMind ships a purpose-built tree, but its published core
// (`jsmind/es6/jsmind.js`, v0.9.1) contains zero touch handling — no
// `touchstart`/`touchmove`, and zoom is bound to the mouse wheel only. On a
// mobile-first PWA that rules it out. React Flow brings real pinch-zoom and
// drag-pan, and a custom node is just a React component, so the `+` button is
// ordinary JSX rather than DOM surgery. The tree arrangement React Flow does
// NOT provide is supplied by our own layout module, which is unit tested.

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
import { Maximize, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  addChildNode,
  countNodes,
  layoutMindMap,
  maxDepth,
  removeNode,
  rootId,
  setNodeTopic,
  toggleCollapsed,
  type MindMap,
} from "../../utils/mindMapTree";
import type { MindMapSaveStatus } from "./useCourseMindMap";

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
  onAddChild: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onCloseEditor: (id: string) => void;
  onCommitTopic: (id: string, topic: string) => void;
}

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
 * The collapse control and the trash button both render INSIDE the same
 * node DOM (so they can never land outside the React Flow viewport on a
 * phone) and only mount while the node is selected. The trash is never
 * rendered on the root.
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
    onAddChild,
    onToggleCollapse,
    onDelete,
    onOpenEditor,
    onCloseEditor,
    onCommitTopic,
  } = data;

  const [draft, setDraft] = useState(topic);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(topic);
      // Autofocus lands the soft keyboard on the new node straight away, so
      // `+` → type → Enter (or tap outside) is a single uninterrupted flow.
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [editing, topic]);

  // Depth drives the emphasis: the root is the boldest thing on screen and
  // each level steps down, so a wide map still reads as a hierarchy.
  const tone = isRoot
    ? "border-violet-400/60 bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/40"
    : depth === 1
      ? "border-violet-400/40 bg-violet-500/15 text-violet-50"
      : depth === 2
        ? "border-indigo-400/25 bg-indigo-500/10 text-indigo-50"
        : "border-white/12 bg-white/6 text-slate-100";

  const facesLeft = side === "left";

  // A single tap on the node body opens the editor. React Flow's `onNodeClick`
  // also opens it; this onClick just exists so taps on the rendered text span
  // (which the input replaces while editing) still trigger the editor.
  const openEditor = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
    onOpenEditor(id);
  };

  // ── Connection Handles ─────────────────────────────────────────────────
  // React Flow needs explicit Handle elements on custom nodes to know WHERE
  // to start and end each edge path. Without them the SVG wire falls back to
  // (0,0) and renders as a tiny invisible dot. We render four handles — one
  // on each side — so the smoothstep router always picks the cleanest path
  // regardless of which direction the parent sits. All four are visually
  // invisible (opacity-0, pointer-events-none) so they never interfere with
  // the node's own tap-to-edit interaction.
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
      className="group relative h-full w-full"
      data-mind-node={id}
      data-mind-node-depth={depth}
      data-mind-node-side={side ?? "center"}
      data-mind-node-selected={selected ? "true" : "false"}
    >
      {/* Invisible connection handles — required by React Flow to route edges */}
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="src-left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="src-right" style={handleStyle} />

      <div
        onClick={(event) => {
          // A plain click on the text body opens the editor. A double-click
          // is fine too — the editor opens, the input absorbs the second
          // event, no extra state to manage.
          if (editing) return;
          openEditor(event);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!editing) onOpenEditor(id);
        }}
        className={`flex h-full w-full flex-col overflow-hidden rounded-xl border px-2.5 pt-1.5 text-[13px] font-semibold leading-[17px] transition ${tone} ${
          selected ? "ring-2 ring-violet-400/80 ring-offset-2 ring-offset-[#0b0b16]" : ""
        }`}
        data-mind-node-body={id}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              // A blank / whitespace-only rename is treated as "cancel" so
              // accidentally tapping outside the field never blanks a node.
              // `setNodeTopic` itself would silently no-op, which made the
              // rename feel broken in the old editor.
              const trimmed = draft.trim();
              if (trimmed && trimmed !== topic) onCommitTopic(id, trimmed);
              onCloseEditor(id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const trimmed = draft.trim();
                if (trimmed) onCommitTopic(id, trimmed);
                onCloseEditor(id);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCloseEditor(id);
              }
              // React Flow would otherwise treat typing as a canvas shortcut.
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-white/40"
            placeholder="Idea likhein…"
            aria-label="Node ka text badlein"
            data-mind-node-input={id}
          />
        ) : (
          <span className="line-clamp-4 min-h-0 flex-1 break-words">{topic}</span>
        )}

        {/* Action bar — rendered INSIDE the node so the buttons can never
            land outside the React Flow viewport on a phone. Only the
            selected node shows the trash + collapse. There is no separate
            rename button — single-tap on the node body is the rename
            trigger, and the editor saves itself on blur. */}
        {selected ? (
          <div
            className="mt-1 flex shrink-0 items-center gap-1 border-t border-white/10 pt-1"
            data-mind-node-actions={id}
            // Stop the React Flow canvas from re-selecting while the user
            // taps a button — without this, a tap on Delete can land on
            // the canvas instead of the button on slow devices.
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {childCount > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleCollapse(id);
                }}
                className="grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-black/60 text-[10px] font-black text-slate-200 transition hover:bg-black/80"
                aria-label={collapsed ? "Branch kholein" : "Branch chhupayein"}
                title={collapsed ? "Expand" : "Collapse"}
                data-mind-node-collapse={id}
              >
                {collapsed ? childCount : "–"}
              </button>
            ) : null}
            {!isRoot ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete(id);
                }}
                className="grid h-5 w-5 place-items-center rounded-full border border-rose-400/25 bg-black/60 text-rose-300 transition hover:bg-rose-500/30"
                aria-label="Yeh branch hatayein"
                title="Delete branch"
                data-mind-node-delete={id}
              >
                <Trash2 size={10} />
              </button>
            ) : null}
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
        className={`absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-violet-300/40 bg-violet-500 text-white shadow-md transition hover:scale-110 hover:bg-violet-400 active:scale-95 ${
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

const SAVE_COPY: Record<MindMapSaveStatus, { label: string; className: string }> = {
  idle: { label: "Sign in karke save hoga", className: "text-slate-400" },
  loading: { label: "Loading…", className: "text-slate-400" },
  ready: { label: "Ready", className: "text-slate-400" },
  saving: { label: "Saving…", className: "text-amber-300" },
  saved: { label: "Cloud par saved", className: "text-emerald-300" },
  error: { label: "Save retry ho raha hai", className: "text-rose-300" },
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
  const { mind, onMindChange, status, errorMessage, onFlush, landscape: _landscape } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { zoomIn, zoomOut, fitView, setCenter } = useReactFlow();

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

  // ── React Flow nodes + edges, derived from the layout ──────────────────
  const nodes: Node<MindNodeData>[] = useMemo(() => {
    const topicById = new Map<string, string>([[rootId(), mind.rootTopic]]);
    for (const node of mind.nodes) topicById.set(String(node.id), node.topic);

    return layout.nodes.map((placed) => ({
      id: placed.id,
      type: "mindNode",
      position: { x: placed.x, y: placed.y },
      draggable: false,
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
            stroke: goesLeft ? "rgba(167,139,250,0.55)" : "rgba(129,140,248,0.55)",
            strokeWidth: 2,
          },
        };
      }),
    [layout.edges],
  );

  const save = SAVE_COPY[status] || SAVE_COPY.idle;
  const levels = maxDepth(mind);
  const totalNodes = countNodes(mind);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0b0b16]" data-course-mindmap>
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
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_event, node) => {
            // Single-tap on any node opens the inline editor (single source
            // of truth for "rename"). The action bar appears automatically
            // because the node is now selected.
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
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.07)" />
        </ReactFlow>

        {/* First-run hint, shown only while the map is still just a root.
            Includes a single "Add root branch" CTA that disappears as soon
            as a child is added — the rest of the growing is done from the
            `+` on any node, so the toolbar isn't needed. */}
        {mind.nodes.length === 0 ? (
          <div className="pointer-events-auto absolute inset-x-0 bottom-3 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 ring-1 ring-white/10">
              <p className="text-center text-[11px] font-semibold text-slate-300">
                Kisi bhi node par <span className="font-black text-violet-300">+</span> dabayein — branch wahin jud jayegi
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Status strip ──────────────────────────────────────────────────
          The only persistent chrome. The save indicator sits on the left,
          a tiny floating cluster of zoom + fit controls on the right, and
          a small node count + levels readout in the middle so the learner
          can see how their diagram is growing without an entire toolbar
          eating the canvas. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5" data-course-mindmap-status>
        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${save.className}`} data-course-mindmap-save-label>
          {status === "error" ? <TriangleAlert size={11} /> : null}
          {save.label}
        </span>
        <span className="truncate text-[10px] font-bold text-slate-400" data-course-mindmap-stats>
          {totalNodes} {totalNodes === 1 ? "node" : "nodes"} · {levels} {levels === 1 ? "level" : "levels"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void zoomOut({ duration: 180 })}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/8 text-slate-200 transition hover:bg-white/15"
            aria-label="Zoom out"
            data-course-mindmap-zoom-out
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={() => void zoomIn({ duration: 180 })}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/8 text-slate-200 transition hover:bg-white/15"
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
        </div>
      </div>

      {errorMessage ? (
        <p className="shrink-0 bg-rose-500/10 px-3 py-1.5 text-[10px] font-semibold text-rose-200" data-course-mindmap-error>
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
