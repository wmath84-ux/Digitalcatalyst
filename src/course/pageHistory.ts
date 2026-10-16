// src/course/pageHistory.ts
//
// STEP-BY-STEP BACK — the owner's 2026-10-16+ brief:
//
//   "course player ke sabhi pages per back to home page ka button add karo
//    lekin yah button directly home page per redirect na karen, ya button
//    back button ki tarah kare accordingly — step bye step previous pages per
//    click karne per back kare. Course player ke sabhi pages per top left
//    mein yah button hoga."
//
// So every page carries a top-left back button, and each click steps ONE page
// back through where this learner has just been — never a jump to home. The
// history is per surface ("scope"): each block of the plus deck walks its own
// pages, the phone's study pane walks its tabs, the lesson pane walks the
// files the learner opened. Pure store + listeners — `node --test` can pin it.

type Listener = () => void;

const stacks = new Map<string, string[]>();
const listeners = new Set<Listener>();
const nonEmpty = new Set<string>();

const emit = () => {
  for (const listener of listeners) listener();
};

/** Subscribe to history changes (button enable/disable). */
export function subscribePageHistory(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A snapshot of one scope's walk — oldest first, current page last. */
export function pageHistoryOf(scope: string): string[] {
  return stacks.get(scope) ?? [];
}

/** Can this surface step back at all? */
export function canPageHistoryBack(scope: string): boolean {
  return (stacks.get(scope)?.length ?? 0) > 1;
}

/**
 * Record a page visit. Coming back to the same page never stacks; a fresh
 * visit from anywhere replaces the forward path, exactly like a browser.
 */
export function pushPageHistory(scope: string, page: string): void {
  const stack = stacks.get(scope) ?? [];
  if (stack[stack.length - 1] === page) return;
  stacks.set(scope, [...stack, page]);
  nonEmpty.add(scope);
  emit();
}

/**
 * Step back: drop the current page and return the previous one, or null when
 * the walk is over (the button then sits disabled — never a jump home).
 */
export function backPageHistory(scope: string): string | null {
  const stack = stacks.get(scope) ?? [];
  if (stack.length <= 1) return null;
  const next = stack[stack.length - 2];
  stacks.set(scope, stack.slice(0, -1));
  emit();
  return next;
}

/** Drop a scope's walk (block reset, page moved away). */
export function clearPageHistory(scope: string): void {
  if (!nonEmpty.has(scope)) return;
  stacks.delete(scope);
  nonEmpty.delete(scope);
  emit();
}

/** Reset every walk — the player's session cleanup calls this. */
export function resetPageHistory(): void {
  if (stacks.size === 0) return;
  stacks.clear();
  nonEmpty.clear();
  emit();
}
