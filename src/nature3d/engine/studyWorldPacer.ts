/**
 * Only the ambient WebGL world is paced, never the DOM/video or input loop.
 * Study animations already update at 15 Hz; drawing the whole alpha canvas
 * at 60/120 Hz anyway competes with video decoding and DOM compositing.
 * Camera/projection changes always draw immediately so apertures stay aligned.
 */
export class StudyWorldPacer {
  private nextFrame = -Infinity;

  invalidate(): void { this.nextFrame = -Infinity; }

  shouldRender(nowMs: number, studying: boolean, projectionChanged: boolean): boolean {
    if (!studying || projectionChanged || nowMs + 0.01 >= this.nextFrame) {
      this.nextFrame = nowMs + 1000 / 15;
      return true;
    }
    return false;
  }
}
