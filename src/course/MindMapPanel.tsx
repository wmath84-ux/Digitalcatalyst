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
//   tap node       → select
//   double-tap     → rename inline
//   ▸ / ▾          → collapse / expand a branch
//   trash          → delete the branch (never available on the root)
//   pinch / drag   → zoom + pan (React Flow, via d3-zoom)
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
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CornerDownLeft, Maximize, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
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
      // `+` → type → Enter is a single uninterrupted flow.
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

  return (
    <div
      className="group relative h-full w-full"
      data-mind-node={id}
      data-mind-node-depth={depth}
      data-mind-node-side={side ?? "center"}
      data-mind-node-selected={selected ? "true" : "false"}
    >
      <div
        onDoubleClick={() => onOpenEditor(id)}
        className={`flex h-full w-full items-center overflow-hidden rounded-xl border px-2.5 text-[13px] font-semibold leading-[17px] transition ${tone} ${
          selected ? "ring-2 ring-violet-400/80 ring-offset-2 ring-offset-[#0b0b16]" : ""
        }`}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              onCommitTopic(id, draft);
              onCloseEditor(id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitTopic(id, draft);
                onCloseEditor(id);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCloseEditor(id);
              }
              // React Flow would otherwise treat typing as a canvas shortcut.
              event.stopPropagation();
            }}
            className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-white/40"
            placeholder="Idea likhein…"
            aria-label="Node ka text badlein"
            data-mind-node-input={id}
          />
        ) : (
          <span className="line-clamp-4 break-words">{topic}</span>
        )}
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

      {/* ── Collapse + delete ride the inward edge, away from the `+` ──── */}
      <div
        className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 ${
          facesLeft ? "-right-8" : "-left-8"
        } max-md:opacity-100`}
      >
        {childCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
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
}

function MindMapCanvas(props: MindMapPanelProps) {
  const { mind, onMindChange, status, errorMessage, onFlush } = props;
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
    setSelectedId(id);
    setEditingId(id);
  }, []);

  const handleCloseEditor = useCallback((id: string) => setEditingId((current) => (current === id ? null : current)), []);

  const handleCommitTopic = useCallback(
    (id: string, topic: string) => onMindChange((current) => setNodeTopic(current, id, topic)),
    [onMindChange],
  );

  const addRootBranch = useCallback(() => handleAddChild(rootId()), [handleAddChild]);

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
      layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: false,
        style: { stroke: edge.side === "left" ? "rgba(167,139,250,0.45)" : "rgba(129,140,248,0.45)", strokeWidth: 1.75 },
      })),
    [layout.edges],
  );

  const save = SAVE_COPY[status] || SAVE_COPY.idle;
  const levels = maxDepth(mind);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0b0b16]" data-course-mindmap>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2" data-course-mindmap-toolbar>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={addRootBranch}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-500 px-2.5 py-1.5 text-[11px] font-black text-white transition hover:bg-violet-400"
            data-course-mindmap-add-root
          >
            <Plus size={13} strokeWidth={3} /> Branch
          </button>
          <span className="truncate text-[10px] font-bold text-slate-400" data-course-mindmap-stats>
            {countNodes(mind)} nodes · {levels} {levels === 1 ? "level" : "levels"}
          </span>
        </div>

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
          <button
            type="button"
            onClick={() => void fitView({ duration: 260, padding: 0.18 })}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/8 text-slate-200 transition hover:bg-white/15"
            aria-label="Poora map fit karein"
            title="Fit to screen"
            data-course-mindmap-fit
          >
            <Maximize size={13} />
          </button>
        </div>
      </div>

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
            setSelectedId(node.id);
            setEditingId(null);
          }}
          onPaneClick={() => {
            setSelectedId(null);
            setEditingId(null);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.07)" />
        </ReactFlow>

        {/* First-run hint, shown only while the map is still just a root. */}
        {mind.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <p className="rounded-full bg-black/70 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
              Kisi bhi node par <span className="font-black text-violet-300">+</span> dabayein — branch wahin jud jayegi
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Status strip ────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5" data-course-mindmap-status>
        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${save.className}`} data-course-mindmap-save-label>
          {status === "error" ? <TriangleAlert size={11} /> : null}
          {save.label}
        </span>
        {selectedId ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
            <CornerDownLeft size={11} /> rename · <Trash2 size={11} /> delete
          </span>
        ) : null}
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
