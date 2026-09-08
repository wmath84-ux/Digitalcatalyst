import type { FlyCamera } from './FlyCamera';

/** Pointer-captured controls for the original rig, not a second scene.
 * No React state, synthetic keyboard events, allocations or DOM writes per frame.
 */
export function installTouchControls(rig: FlyCamera, canvas: HTMLElement): () => void {
  const abort = new AbortController();
  const signal = abort.signal;
  const controls = document.createElement('div');
  controls.className = 'world-touch-controls';
  controls.innerHTML = '<span>Left: move · Right: look</span><button type="button" aria-label="Jump">Jump</button><button type="button" aria-label="Toggle walk or fly">Fly / walk</button>';
  document.body.appendChild(controls);
  let moveId = -1;
  let lookId = -1;
  let originX = 0;
  let originY = 0;
  let lastX = 0;
  let lastY = 0;
  const reset = (): void => {
    moveId = -1;
    lookId = -1;
    rig.touchX = 0;
    rig.touchY = 0;
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !rig.enabled) return;
    const left = event.clientX < window.innerWidth * 0.5;
    if ((left && moveId !== -1) || (!left && lookId !== -1)) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    if (left) {
      moveId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
    } else {
      lookId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!rig.enabled) { reset(); return; }
    if (event.pointerId === moveId) {
      const x = (event.clientX - originX) / 55;
      const y = (originY - event.clientY) / 55;
      const length = Math.max(1, Math.hypot(x, y));
      rig.touchX = Math.abs(x) < 0.08 ? 0 : x / length;
      rig.touchY = Math.abs(y) < 0.08 ? 0 : y / length;
    } else if (event.pointerId === lookId) {
      rig.yaw -= (event.clientX - lastX) * 0.004;
      rig.pitch = Math.max(-1.55, Math.min(1.55, rig.pitch - (event.clientY - lastY) * 0.004));
      lastX = event.clientX;
      lastY = event.clientY;
    }
  }, { signal });
  const release = (event: PointerEvent): void => {
    if (event.pointerId === moveId) { moveId = -1; rig.touchX = 0; rig.touchY = 0; }
    if (event.pointerId === lookId) lookId = -1;
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, release, { signal });
  }
  controls.querySelector('[aria-label="Jump"]')?.addEventListener('click', () => rig.jump(), { signal });
  controls.querySelector('[aria-label="Toggle walk or fly"]')?.addEventListener('click', () => {
    if (rig.enabled) rig.setMode(rig.mode === 'walk' ? 'fly' : 'walk');
  }, { signal });
  window.addEventListener('blur', reset, { signal });
  document.addEventListener('visibilitychange', reset, { signal });
  const dispose = (): void => { reset(); abort.abort(); controls.remove(); };
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) reset(); // BFCache restore must retain usable controls
    else dispose();
  }, { signal });
  return dispose;
}
