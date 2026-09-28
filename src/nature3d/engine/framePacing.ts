/**
 * Low-tier render pacing with a latency escape hatch for direct camera input.
 * While the learner is actively moving the camera, never discard a RAF tick;
 * restore the ordinary thermal cap as soon as the gesture ends.
 */
export class FramePacing {
  private nextFrameAt = 0;

  shouldSkip(nowMs: number, fpsCap: number, cameraGestureActive: boolean): boolean {
    if (fpsCap <= 0) return false;
    if (cameraGestureActive) {
      // Do not carry a stale deadline into the release frame.
      this.nextFrameAt = nowMs;
      return false;
    }
    if (nowMs < this.nextFrameAt) return true;
    this.nextFrameAt = Math.max(nowMs, this.nextFrameAt) + 1000 / fpsCap;
    return false;
  }

  reset(): void { this.nextFrameAt = 0; }
}
