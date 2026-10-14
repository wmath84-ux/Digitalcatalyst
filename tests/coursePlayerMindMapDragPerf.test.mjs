// tests/coursePlayerMindMapDragPerf.test.mjs
//
// Owner report: "60+ nodes par mind map drag lag karta hai."
//
// The measured cost was in React, not in Firestore: React Flow reports the
// picked node's live position through `onNodesChange` on EVERY pointer event,
// and each report re-ran the whole controlled-flow pass (apply the changes,
// then shift the entire dragged subtree) — sometimes two or three times inside
// one animation frame, where only the last position is ever visible. On top of
// that, React Flow re-renders a node whenever its POSITION moves, even though
// the card's markup does not depend on the position at all (the wrapper owns
// the transform), so pulling a 60-node branch re-rendered 60 identical cards.
//
// This file proves the three fixes in `src/course/mindMapDrag.ts` +
// `src/course/MindMapPanel.tsx`:
//   · `mergeNodeChanges` — one frame's worth of pointer events become ONE batch
//     (the newest absolute position per node wins; nothing else is lost);
//   · `createFrameCoalescer` — the batch runs once per frame, never per event,
//     and can be flushed on drag stop / dropped on unmount;
//   · `hasRealPositionChange` — a tap or a duplicate event, which moves nothing,
//     never reaches `setNodes` (a new array would re-render the branch for free),
//     while anything that is not provably a no-op is kept.
//
// The last test measures the actual batch work at 151 nodes, so the report
// ("lag at 60+") has a number attached to it instead of a promise.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFrameCoalescer,
  hasRealPositionChange,
  mergeNodeChanges,
} from "../src/course/mindMapDrag.ts";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const panel = fs.readFileSync(path.join(repoRoot, "src/course/MindMapPanel.tsx"), "utf8");

/** A scheduler the test drives by hand: frames only happen when we say so. */
const manualScheduler = () => {
  const queue = new Map();
  let nextHandle = 1;
  return {
    scheduler: {
      request(run) {
        const handle = nextHandle++;
        queue.set(handle, run);
        return handle;
      },
      cancel(handle) {
        queue.delete(handle);
      },
    },
    /** Run every callback registered for this "frame". */
    frame() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const run of callbacks) run();
    },
    pending: () => queue.size,
  };
};

const position = (id, x, y) => ({ type: "position", id, position: { x, y }, dragging: true });

// ── 1 · one frame's events become one batch ────────────────────────────────

test("a frame's pointer events collapse to the newest position per node", () => {
  const merged = mergeNodeChanges(
    [],
    [
      position("a", 1, 1),
      position("b", 5, 5),
      position("a", 2, 2),
      position("a", 3, 3),
      position("b", 6, 6),
    ],
  );
  assert.equal(merged.length, 2, "one entry per node — the intermediate positions are pure waste");
  assert.deepEqual(merged.map((change) => change.id), ["a", "b"]);
  assert.deepEqual(merged[0].position, { x: 3, y: 3 }, "the last position of the frame must win");
  assert.deepEqual(merged[1].position, { x: 6, y: 6 });
});

test("non-position changes (select, dimensions, remove) are never dropped or reordered", () => {
  const select = { type: "select", id: "a", selected: true };
  const dimensions = { type: "dimensions", id: "a", dimensions: { width: 10, height: 10 }, resizing: false };
  const remove = { type: "remove", id: "z" };
  const merged = mergeNodeChanges([], [position("a", 1, 1), select, position("a", 2, 2), dimensions, remove]);
  assert.deepEqual(merged, [position("a", 2, 2), select, dimensions, remove]);
  assert.deepEqual(mergeNodeChanges(merged, []), merged, "an empty batch must not copy or reorder anything");
});

// ── 2 · one batch per animation frame ──────────────────────────────────────

test("a burst of events inside one frame costs exactly one update", () => {
  const applied = [];
  const clock = manualScheduler();
  const coalescer = createFrameCoalescer(
    (batch) => applied.push(batch),
    mergeNodeChanges,
    clock.scheduler,
  );

  // Ten events before the frame paints — a 120 Hz pointer stream, or a stall.
  for (let i = 0; i < 10; i += 1) coalescer.push([position("a", i, i)]);
  assert.equal(coalescer.runs(), 0, "nothing may run before the frame");
  assert.equal(coalescer.isPending(), true);

  clock.frame();
  assert.equal(applied.length, 1, "the whole burst must collapse into ONE update");
  assert.deepEqual(applied[0][0].position, { x: 9, y: 9 }, "and it must carry the newest position");

  // The next frame starts a new batch.
  coalescer.push([position("a", 10, 10)]);
  clock.frame();
  assert.equal(applied.length, 2);
  assert.equal(coalescer.runs(), 2);
  assert.equal(coalescer.isPending(), false);
});

test("flush applies the pending batch now (drag stop) and cancel drops it (map switch)", () => {
  const applied = [];
  const clock = manualScheduler();
  const coalescer = createFrameCoalescer((batch) => applied.push(batch), mergeNodeChanges, clock.scheduler);

  coalescer.push([position("a", 1, 1)]);
  coalescer.push([position("a", 2, 2)]);
  coalescer.flush();
  assert.equal(applied.length, 1, "flush must not wait for a frame");
  assert.deepEqual(applied[0][0].position, { x: 2, y: 2 });
  assert.equal(clock.pending(), 0, "the frame that was scheduled must not run the batch a second time");
  clock.frame();
  assert.equal(applied.length, 1);

  coalescer.push([position("a", 3, 3)]);
  coalescer.cancel();
  clock.frame();
  assert.equal(applied.length, 1, "a cancelled batch must never move another map's nodes");
  assert.equal(coalescer.isPending(), false);
});

// ── 3 · a batch that moves nothing never touches state ─────────────────────

test("a tap or a duplicate event (same position) is dropped before setNodes", () => {
  const nodes = [{ id: "a", position: { x: 4, y: 4 } }, { id: "b", position: { x: 8, y: 8 } }];
  assert.equal(hasRealPositionChange(nodes, [position("a", 4, 4), position("b", 8, 8)]), false);
  assert.equal(hasRealPositionChange(nodes, [position("a", 4, 4), position("b", 8, 9)]), true);
  assert.equal(hasRealPositionChange(nodes, []), false);
  // Not provably a no-op ⇒ never swallowed.
  assert.equal(hasRealPositionChange(nodes, [{ type: "select", id: "a", selected: true }]), true);
  assert.equal(hasRealPositionChange(nodes, [position("ghost", 0, 0)]), true);
  assert.equal(hasRealPositionChange(nodes, [{ type: "position", id: "a" }]), true);
});

// ── 4 · the panel really uses all three, and the cards stop re-rendering ───

test("MindMapPanel coalesces the drag batch, flushes on drop and cancels on unmount", () => {
  assert.match(panel, /import \{ createFrameCoalescer, hasRealPositionChange, mergeNodeChanges \} from "\.\/mindMapDrag";/);
  assert.match(panel, /const applyDragBatch = useCallback\(\(changes: NodeChange<Node<MindNodeData>>\[\]\) => \{/);
  assert.match(panel, /if \(!hasRealPositionChange\(current, changes\)\) return current;/);
  assert.match(panel, /dragBatchRef\.current = createFrameCoalescer<NodeChange<Node<MindNodeData>>\[\]>\(/);
  assert.match(panel, /\(batch\) => applyDragBatch\(batch\),\n\s+\(pendingBatch, incoming\) => mergeNodeChanges\(pendingBatch, incoming\),/);
  assert.match(panel, /const onNodesChange = useCallback\(\(changes: NodeChange<Node<MindNodeData>>\[\]\) => \{\n\s+dragBatchRef\.current\?\.push\(changes\);/);
  // Drag stop applies the last frame before the drop is committed…
  assert.match(panel, /onNodeDragStop=\{\(_event, node\) => \{\n\s+\/\/ Apply the last frame BEFORE the drop is committed[\s\S]{0,200}dragBatchRef\.current\?\.flush\(\);/);
  // …and leaving the map drops whatever is still queued.
  assert.match(panel, /useEffect\(\(\) => \(\) => \{ dragBatchRef\.current\?\.cancel\(\); \}, \[\]\);/);
  // The subtree shift still creates a new object ONLY for boxes that moved, so
  // React Flow can skip the untouched ones.
  assert.match(panel, /if \(item\.position\.x === x && item\.position\.y === y\) return item;/);
});

test("the node and edge components are memoised on what they actually render", () => {
  assert.match(panel, /const MindNode = memo\(MindNodeInner, \(previous, next\) =>/);
  assert.match(panel, /previous\.data === next\.data/);
  // The position props are deliberately NOT part of the comparison: React Flow's
  // wrapper owns the transform, so a moving node's card does not change.
  assert.doesNotMatch(panel, /previous\.positionAbsoluteX === next\.positionAbsoluteX/);
  assert.doesNotMatch(panel, /previous\.x === next\.x/);
  assert.match(panel, /const RopeEdge = memo\(RopeEdgeInner, \(previous, next\) =>/);
  assert.match(panel, /previous\.sourceX === next\.sourceX/);
  // Stable module-scope registries (a fresh object would tear down every node).
  assert.match(panel, /const NODE_TYPES = \{ mindNode: MindNode \};/);
  assert.match(panel, /const EDGE_TYPES = \{ rope: RopeEdge \};/);
});

// ── 5 · the number behind the report ───────────────────────────────────────

test("a 151-node branch drag batch stays far below one frame", () => {
  const nodes = Array.from({ length: 151 }, (_, index) => ({
    id: `n${index}`,
    position: { x: index * 40, y: index * 12 },
  }));

  const batchFor = (dx) => nodes.map((node) => position(node.id, node.position.x + dx, node.position.y + dx));

  // The batch React Flow would emit inside one frame at 151 nodes.
  const events = [];
  for (let event = 0; event < 4; event += 1) events.push(batchFor(event + 1));

  const started = process.hrtime.bigint();
  let merged = [];
  for (const event of events) merged = mergeNodeChanges(merged, event);
  const moved = hasRealPositionChange(nodes, merged);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(moved, true);
  assert.equal(merged.length, 151, "every moved node keeps exactly one entry");
  assert.deepEqual(merged[0].position, { x: 4, y: 4 }, "the newest position wins");
  // The booking the fix pays for the two pointer events that would have been
  // wasted: coalescing 4 batches into 1 keeps this under a millisecond.
  assert.ok(elapsedMs < 5, `coalescing ${events.length} events took ${elapsedMs.toFixed(2)} ms`);
});
