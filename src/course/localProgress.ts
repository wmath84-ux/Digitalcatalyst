/** Device-first progress with a durable, coalesced per-file outbox. */
export type ProgressData = { completedFileIds: string[]; lastOpenedFileId: string | null };
type Change = { value: boolean; revision: number };
export type ProgressBatch = { changes: Record<string, Change>; opened: { id: string; revision: number } | null };
type Stored = ProgressData & ProgressBatch;
export interface ProgressIO {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  read: () => Promise<ProgressData>;
  write: (batch: ProgressBatch) => Promise<void>;
}
export class LocalProgress {
  private value: Stored;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private started = false;
  private ready = false;
  private stopped = false;
  private listeners = new Set<() => void>();
  error: string | null = null;
  constructor(readonly key: string, private io: ProgressIO, private delay = 30000) {
    this.value = { completedFileIds: [], lastOpenedFileId: null, changes: {}, opened: null };
    try {
      const raw = JSON.parse(io.storage.getItem(key) || 'null');
      if (raw && Array.isArray(raw.completedFileIds)) {
        this.value.completedFileIds = raw.completedFileIds.filter((id: unknown) => typeof id === 'string');
        this.value.lastOpenedFileId = typeof raw.lastOpenedFileId === 'string' ? raw.lastOpenedFileId : null;
        for (const [id, change] of Object.entries(raw.changes || {})) {
          const c = change as Change;
          if (typeof c?.value === 'boolean' && Number.isFinite(c.revision)) this.value.changes[id] = c;
        }
        if (typeof raw.opened?.id === 'string' && Number.isFinite(raw.opened.revision)) this.value.opened = raw.opened;
        this.revision = Math.max(0, ...Object.values(this.value.changes).map(c => c.revision), this.value.opened?.revision || 0);
      }
    } catch { /* Corrupt/unavailable cache does not prevent a cloud recovery. */ }
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() { for (const listener of this.listeners) listener(); }
  private save() {
    try { this.io.storage.setItem(this.key, JSON.stringify(this.value)); this.error = null; }
    catch { this.error = 'Device storage is unavailable or full. Keep this page open until cloud backup succeeds.'; }
    this.publish();
  }
  complete(id: string, value: boolean) {
    if (!id) return;
    const ids = new Set(this.value.completedFileIds);
    if (value) ids.add(id); else ids.delete(id);
    this.value = { ...this.value, completedFileIds: [...ids], changes: { ...this.value.changes, [id]: { value, revision: ++this.revision } } };
    this.save(); this.schedule();
  }
  open(id: string) {
    if (!id || this.value.lastOpenedFileId === id) return;
    this.value = { ...this.value, lastOpenedFileId: id, opened: { id, revision: ++this.revision } };
    this.save(); this.schedule();
  }
  async start() {
    this.stopped = false;
    if (this.started) { this.schedule(); return; }
    if (this.inFlight) return;
    this.started = true;
    this.ready = false;
    try {
      const cloud = await this.io.read();
      const ids = new Set(cloud.completedFileIds);
      for (const [id, c] of Object.entries(this.value.changes)) { if (c.value) ids.add(id); else ids.delete(id); }
      this.value = { ...this.value, completedFileIds: [...ids], lastOpenedFileId: this.value.opened?.id || cloud.lastOpenedFileId || this.value.lastOpenedFileId };
      this.save();
    } catch { this.started = false; /* Retry the initial read when auth/network is ready. */ }
    finally { this.ready = true; this.schedule(); }
  }
  private schedule() {
    if (this.stopped || !this.ready || this.timer) return;
    if (!Object.keys(this.value.changes).length && !this.value.opened) return;
    // A bounded interval, not a timer postponed indefinitely by every click.
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.delay);
  }
  async flush() {
    if (!this.ready || this.inFlight) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const batch = { changes: { ...this.value.changes }, opened: this.value.opened };
    if (!Object.keys(batch.changes).length && !batch.opened) return;
    this.inFlight = true;
    try {
      await this.io.write(batch);
      const changes = { ...this.value.changes };
      for (const [id, c] of Object.entries(batch.changes)) if (changes[id]?.revision === c.revision) delete changes[id];
      this.value = { ...this.value, changes, opened: this.value.opened?.revision === batch.opened?.revision ? null : this.value.opened };
      this.save();
    } catch { /* Durable outbox survives offline/sign-out; retry later. */ }
    finally { this.inFlight = false; this.schedule(); }
  }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
