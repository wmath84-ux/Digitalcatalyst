/** Browser rAF pacing, NOT native Swappy. No catch-up simulation/render burst. */
export class FramePacer {
  private next = 0;
  constructor(readonly fps: number) {}
  reset(): void { this.next = 0; }
  shouldRender(now: number): boolean {
    if (!this.fps) return true;
    const interval = 1000 / this.fps;
    if (now + 0.5 < this.next) return false;
    this.next = this.next === 0 || now - this.next > interval
      ? now + interval : this.next + interval;
    return true;
  }
}
/** Frame-pressure heuristic, not a temperature sensor. Hysteresis and cooldown
 * avoid oscillating resolution / reallocating temporal render targets every frame. */
export class AdaptiveResolution {
  scale = 1;
  private pressure = 0;
  private healthy = 0;
  private lastChange = 0;
  constructor(readonly targetMs = 1000 / 30, readonly minimumScale = 0.5) {}
  reset(): void { this.pressure = 0; this.healthy = 0; }
  sample(frameMs: number, cpuMs: number, now: number): boolean {
    if (!Number.isFinite(frameMs) || !Number.isFinite(cpuMs) || frameMs <= 0) return false;
    const overloaded = frameMs > this.targetMs * 1.2 || cpuMs > this.targetMs * 0.9;
    this.pressure = overloaded ? Math.min(60, this.pressure + 1) : Math.max(0, this.pressure - 1);
    this.healthy = !overloaded && cpuMs < this.targetMs * 0.65 ? this.healthy + 1 : 0;
    if (now - this.lastChange < 8000) return false;
    const previous = this.scale;
    if (this.pressure >= 30) this.scale = Math.max(this.minimumScale, this.scale - 0.1);
    else if (this.healthy >= 240) this.scale = Math.min(1, this.scale + 0.05);
    if (this.scale === previous) return false;
    this.lastChange = now;
    this.reset();
    return true;
  }
}
/** Preallocated telemetry; sort only once per 30 submitted frames. */
export class FrameWindow {
  private values = new Float32Array(120);
  private scratch = new Float32Array(120);
  private cursor = 0;
  private count = 0;
  p95 = 0;
  push(ms: number): void {
    this.values[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
    if (this.count < 30 || this.cursor % 30 !== 0) return;
    this.scratch.fill(0);
    this.scratch.set(this.values);
    this.scratch.sort();
    const index = this.values.length - this.count + Math.min(this.count - 1, Math.floor(this.count * 0.95));
    this.p95 = this.scratch[index] ?? ms;
  }
}
