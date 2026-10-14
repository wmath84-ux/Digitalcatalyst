// src/course/mindMapDrag.ts
//
// Drag-time plumbing for the Course Player's mind map.
//
// The owner report was "60+ nodes par drag lag karta hai". The measured cost was
// in React, not in Firestore: on a 151-node map one pointer frame could cost
// ~216 ms, because React Flow reports the picked node's live position through
// `onNodesChange` on EVERY pointer event and each report re-ran the whole
// controlled-flow update (apply the changes, then shift the entire dragged
// subtree) — sometimes two or three times inside a single animation frame,
// where only the last position is ever visible.
//
// Two pure pieces fix that without changing what the learner sees:
//
//   1. `mergeNodeChanges` — coalesce the changes that piled up in one frame.
//      Position changes are absolute, so for one node the LAST one wins and the
//      earlier ones are pure waste. Everything else (select, dimensions,
//      remove…) is kept, in order.
//
//   2. `createFrameCoalescer` — run the merged batch once per animation frame.
//      A duplicate event, a 120 Hz pointer stream, or a stalled frame therefore
//      costs ONE React update instead of one per event, and a tap that does not
//      move anything is dropped before it can re-render the whole branch.
//
// Both are framework-free and clock-free (the frame scheduler is injected), so
// `node --test` can drive them exactly — no React, no DOM, no real timers.

export interface NodePositionLike {
  x: number;
  y: number;
}

/**
 * React Flow's change union is discriminated by `type`, and only the `position`
 * member carries an id and a position — everything else (select, dimensions,
 * remove, add, replace) has to survive untouched. These two shapes describe
 * exactly the fields this module reads, so the helpers stay usable with React
 * Flow's own `NodeChange` union.
 */
export interface ChangeLike {
  type: string;
}

export interface PositionChangeLike extends ChangeLike {
  id?: string;
  position?: NodePositionLike | null;
}

/**
 * Merge the changes of one animation frame into the batch to apply.
 *
 * React Flow's `position` changes carry an ABSOLUTE position, so the newest one
 * per node fully replaces any earlier one; their order relative to other change
 * types does not matter. Non-position changes are appended in arrival order.
 */
export function mergeNodeChanges<T extends ChangeLike>(pending: T[], incoming: T[]): T[] {
  if (!incoming.length) return pending;
  const merged = [...pending];
  for (const change of incoming) {
    const id = (change as PositionChangeLike).id;
    if (change.type === "position" && typeof id === "string") {
      const index = merged.findIndex((item) => item.type === "position" && (item as PositionChangeLike).id === id);
      if (index >= 0) merged[index] = change;
      else merged.push(change);
      continue;
    }
    merged.push(change);
  }
  return merged;
}

/**
 * Did any of these changes actually move a node?
 *
 * React Flow emits position changes for a plain tap and for duplicate pointer
 * events, with the position the node already has. Those must never reach
 * `setNodes` — a new array re-renders every node of the branch for a frame in
 * which nothing moved. A change for an unknown node counts as "moved" so it can
 * never be swallowed: only a change that is provably a no-op is dropped.
 */
export function hasRealPositionChange<C extends ChangeLike>(
  nodes: Array<{ id: string; position: NodePositionLike }>,
  changes: C[],
): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node.position]));
  for (const change of changes) {
    const position = (change as PositionChangeLike).position;
    const id = (change as PositionChangeLike).id;
    if (change.type !== "position" || typeof id !== "string") return true;
    const current = byId.get(id);
    const next = position;
    if (!current || !next) return true;
    if (current.x !== next.x || current.y !== next.y) return true;
  }
  return false;
}

export interface FrameScheduler {
  request: (run: () => void) => number;
  cancel: (handle: number) => void;
}

export interface FrameCoalescer<T> {
  /** Queue a payload; the sink runs once on the next frame with the merge. */
  push: (payload: T) => void;
  /** Apply whatever is pending right now (drag stop, unmount). */
  flush: () => void;
  /** Forget what is pending without applying it. */
  cancel: () => void;
  /** True while a payload is waiting for its frame. */
  isPending: () => boolean;
  /** How many sink calls happened — used by the tests to prove coalescing. */
  runs: () => number;
}

/** The default scheduler: one callback per animation frame, timers as fallback. */
const defaultScheduler = (): FrameScheduler => {
  if (typeof requestAnimationFrame === "function") {
    return {
      request: (run) => requestAnimationFrame(run) as unknown as number,
      cancel: (handle) => cancelAnimationFrame(handle),
    };
  }
  return {
    request: (run) => setTimeout(run, 16) as unknown as number,
    cancel: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  };
};

/**
 * Run `sink` with the merged payload at most once per animation frame.
 *
 * The merge function decides what "merged" means (see `mergeNodeChanges`); it is
 * called as `merge(pending, incoming)`. A synchronous `flush()` inside the sink
 * is safe: the frame handle is cleared before the sink runs, so the batch can
 * grow again without being applied twice.
 */
export function createFrameCoalescer<T>(
  sink: (payload: T) => void,
  merge: (pending: T, incoming: T) => T,
  scheduler: FrameScheduler = defaultScheduler(),
): FrameCoalescer<T> {
  let pending: T | null = null;
  let frame: number | null = null;
  let runs = 0;

  const applyPending = () => {
    if (frame !== null) {
      scheduler.cancel(frame);
      frame = null;
    }
    if (pending === null) return;
    const payload = pending;
    pending = null;
    runs += 1;
    sink(payload);
  };

  return {
    push(payload) {
      pending = pending === null ? payload : merge(pending, payload);
      if (frame !== null) return;
      frame = scheduler.request(() => {
        frame = null;
        applyPending();
      });
    },
    flush: applyPending,
    cancel() {
      if (frame !== null) {
        scheduler.cancel(frame);
        frame = null;
      }
      pending = null;
    },
    isPending: () => pending !== null,
    runs: () => runs,
  };
}
