// Browser stub for `firebase/firestore` (tests/coursePanelsBrowser.test.mjs).
// An in-memory "server" persisted in sessionStorage, so a page RELOAD sees the
// same cloud documents a real reload would. window.__fs drives failures.
type Data = Record<string, unknown>;
const KEY = "__harness_firestore";
const load = (): Record<string, Data> => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};
const store: Record<string, Data> = load();
const persist = () => sessionStorage.setItem(KEY, JSON.stringify(store));
const control = { writes: [] as { path: string; data: Data }[], failWrites: null as null | string, writeDelayMs: 0 };
(window as unknown as { __fs: unknown }).__fs = { store, control, persist };
const listeners = new Map<string, Set<(snapshot: unknown) => void>>();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function collection(_db: unknown, ...segments: string[]) {
  return { type: "collection", path: segments.join("/") };
}
export function doc(_db: unknown, ...segments: string[]) {
  return { type: "doc", path: segments.join("/"), id: segments[segments.length - 1] };
}
export function where(field: string, op: string, value: unknown) {
  return { field, op, value };
}
export function query(ref: { path: string }, ...filters: { field: string; op: string; value: unknown }[]) {
  return { type: "query", path: ref.path, filters };
}
export function serverTimestamp() {
  return new Date();
}
const rowsOf = (path: string, filters: { field: string; value: unknown }[] = []) => {
  const prefix = `${path}/`;
  return Object.entries(store)
    .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
    .filter(([, data]) => filters.every((filter) => data[filter.field] === filter.value))
    .map(([key, data]) => ({ id: key.slice(prefix.length), data: () => data }));
};
const snapshotOf = (path: string) => {
  const rows = rowsOf(path);
  return { forEach: (fn: (row: unknown) => void) => rows.forEach(fn), docs: rows, size: rows.length };
};
const notify = (docPath: string) => {
  const parent = docPath.split("/").slice(0, -1).join("/");
  for (const fn of listeners.get(parent) || []) fn(snapshotOf(parent));
};
export async function getDoc(ref: { path: string }) {
  const data = store[ref.path];
  return { exists: () => Boolean(data), data: () => data, id: ref.path.split("/").pop() };
}
export async function getDocs(q: { path: string; filters?: { field: string; value: unknown }[] }) {
  const rows = rowsOf(q.path, q.filters || []);
  return { forEach: (fn: (row: unknown) => void) => rows.forEach(fn), docs: rows, size: rows.length };
}
export async function setDoc(ref: { path: string }, data: Data) {
  if (control.writeDelayMs) await delay(control.writeDelayMs);
  if (control.failWrites) throw Object.assign(new Error("stub"), { code: control.failWrites });
  store[ref.path] = JSON.parse(JSON.stringify(data));
  control.writes.push({ path: ref.path, data });
  persist();
  notify(ref.path);
}
export async function updateDoc(ref: { path: string }, patch: Data) {
  store[ref.path] = { ...(store[ref.path] || {}), ...patch };
  persist();
  notify(ref.path);
}
export async function deleteDoc(ref: { path: string }) {
  delete store[ref.path];
  persist();
  notify(ref.path);
}
export function onSnapshot(ref: { path: string }, next: (snapshot: unknown) => void) {
  const set = listeners.get(ref.path) || new Set();
  set.add(next);
  listeners.set(ref.path, set);
  queueMicrotask(() => next(snapshotOf(ref.path)));
  return () => set.delete(next);
}
