// Browser stub for `firebase/storage`. Resumable tasks are driven by the test
// through window.__storage: `auto` streams real-looking progress, `manual`
// leaves every byte to the test, `stall` never moves (watchdog territory).
type Observer = { next?: (s: unknown) => void; error?: (e: unknown) => void; complete?: () => void };
const control = {
  mode: "auto" as "auto" | "manual" | "stall",
  chunkMs: 120,
  chunks: 6,
  tasks: [] as unknown[],
  uploadBytesCalls: 0,
  objects: {} as Record<string, number>,
};
(window as unknown as { __storage: unknown }).__storage = control;

export function ref(_storage: unknown, path: string) {
  return { fullPath: path };
}
export async function getDownloadURL(target: { fullPath: string }) {
  if (!(target.fullPath in control.objects)) throw Object.assign(new Error("stub"), { code: "storage/object-not-found" });
  return `blob:stub/${encodeURIComponent(target.fullPath)}`;
}
export async function uploadBytes(target: { fullPath: string }, data: { byteLength?: number; size?: number }) {
  control.uploadBytesCalls += 1;
  control.objects[target.fullPath] = data.byteLength ?? data.size ?? 0;
}
export async function deleteObject(target: { fullPath: string }) {
  delete control.objects[target.fullPath];
}
export function uploadBytesResumable(target: { fullPath: string }, file: File) {
  let observer: Observer = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sent = 0;
  let state = "running";
  const total = file.size;
  const emit = () => observer.next?.({ bytesTransferred: sent, totalBytes: total, state });
  const finish = () => {
    control.objects[target.fullPath] = total;
    observer.complete?.();
  };
  const tick = () => {
    if (state !== "running") return;
    sent = Math.min(total, sent + Math.ceil(total / control.chunks));
    emit();
    if (sent >= total) finish();
    else timer = setTimeout(tick, control.chunkMs);
  };
  const task = {
    target,
    file,
    get sent() {
      return sent;
    },
    on(_event: string, next: Observer["next"], error: Observer["error"], complete: Observer["complete"]) {
      observer = { next, error, complete };
      setTimeout(() => {
        emit();
        if (control.mode === "auto") timer = setTimeout(tick, control.chunkMs);
      }, 0);
      return () => {};
    },
    cancel() {
      if (state === "canceled") return false;
      state = "canceled";
      if (timer) clearTimeout(timer);
      setTimeout(() => observer.error?.({ code: "storage/canceled" }), 0);
      return true;
    },
    pause() {
      state = "paused";
      emit();
      return true;
    },
    resume() {
      state = "running";
      emit();
      if (control.mode === "auto") timer = setTimeout(tick, control.chunkMs);
      return true;
    },
    step(bytes: number) {
      sent = Math.min(total, bytes);
      emit();
    },
    complete: finish,
  };
  control.tasks.push(task);
  return task;
}
