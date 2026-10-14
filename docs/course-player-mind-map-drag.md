# Mind map drag: why 60+ nodes lagged, and what makes it cheap now

Owner report: **"60+ nodes par mind map drag lag karta hai."**

## Where the time actually went

Measured on the real panel earlier in this work: a drag frame cost roughly
**14 ms at 61 nodes** and **~216 ms at 151 nodes**. That number is React, not
Firestore (the diagram is written on a 30 s debounce long after the finger is
up). Three separate costs stacked up:

1. **More updates than frames.** React Flow reports the picked node's live
   position through `onNodesChange` on *every pointer event*. A 120 Hz pointer
   stream (or a browser that delivers two events between paints) therefore ran
   the whole controlled-flow pass two or three times per visible position — only
   the last one could ever be seen.
2. **The whole branch re-rendered, cards included.** React Flow re-renders a
   node whenever its position moves, because it passes `positionAbsoluteX/Y`
   into the node component and applies the transform on the wrapper *around* it.
   Our card's markup does not depend on its position at all, so dragging a
   60-node branch re-rendered 60 identical cards, and every rope in the map was
   recomputed with them.
3. **A tap cost a frame.** A tap (and a duplicated event) emits a position
   change with the position the node already has; applying it produced a new
   nodes array, which re-rendered the branch for nothing.

## The fixes

| Fix | Where | What it removes |
|---|---|---|
| One batch per animation frame | `src/course/mindMapDrag.ts` → `createFrameCoalescer`, `mergeNodeChanges` | Every duplicate/extra event in a frame. Position changes are absolute, so the newest per node wins; select/dimensions/remove changes are kept in order. |
| No-op batches never reach `setNodes` | `hasRealPositionChange` | The "tap costs a render" case: if no node provably moved, the previous state is returned and React bails out. |
| `memo` on the node and edge components | `MindMapPanel.tsx` (`MindNode`, `RopeEdge`) | Re-rendering cards whose rendered output did not change. The comparator deliberately ignores the position props — the wrapper owns the transform. |
| Only moved boxes get a new object | `applyDragBatch` | Identity churn for subtree members that are already at their computed spot. |

Drag stop flushes the pending batch **before** the drop is committed (the
position written into the map is the one under the finger), and unmounting the
map cancels it (a batch queued for one map can never move another map's nodes).

## Verify

* `node --test tests/coursePlayerMindMapDragPerf.test.mjs` — the coalescer, the
  merge rules, the no-op guard, the panel wiring, and a 151-node batch measured
  in-process (it must stay well under one frame).
* `tests/coursePlayerMindMapContract.test.mjs` — the live-drag contract (the
  primary node and its whole branch move in the SAME state update) still holds.
* On a device: open a map with 60+ nodes, drag the centre — the branch must ride
  along rigidly, and the hand-arranged shape must survive the drop.
