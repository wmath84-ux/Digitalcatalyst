/**
 * Only the ambient WebGL world is paced, never the DOM/video or input loop.
 * The parked study world draws at 30 Hz (the low-tier frame budget), rather
 * than wasting 60/120 Hz on an unchanged camera while competing with video.
 * Camera/projection changes always draw immediately so apertures stay aligned.
 */
export class StudyWorldPacer {
  private nextFrame = -Infinity;

  invalidate(): void { this.nextFrame = -Infinity; }

  shouldRender(nowMs: number, studying: boolean, projectionChanged: boolean): boolean {
    if (!studying || projectionChanged || nowMs + 0.01 >= this.nextFrame) {
      this.nextFrame = nowMs + 1000 / 30;
      return true;
    }
    return false;
  }
}
