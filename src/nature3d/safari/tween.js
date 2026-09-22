// Minimal tween engine (no deps).  tween(obj.rotation, 'x', to, dur, {ease, delay, yoyo, onDone})
const active = [];
export const Ease = {
  linear: t => t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  outBounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  arc: t => Math.sin(t * Math.PI),          // 0 → 1 → 0
};
export function tween(target, prop, to, dur, opts = {}) {
  const tw = { target, prop, from: opts.from ?? target[prop], to, dur, t: -(opts.delay || 0), ease: opts.ease || Ease.outQuad, yoyo: !!opts.yoyo, onDone: opts.onDone, id: opts.id };
  if (opts.id) { for (let i = active.length - 1; i >= 0; i--) if (active[i].id === opts.id && active[i].target === target) active.splice(i, 1); }
  active.push(tw);
  return tw;
}
export function tweenFn(fn, dur, opts = {}) {
  const tw = { fn, dur, t: -(opts.delay || 0), ease: opts.ease || Ease.linear, onDone: opts.onDone };
  active.push(tw);
  return tw;
}
export function cancelTweens(target) { for (let i = active.length - 1; i >= 0; i--) if (active[i].target === target) active.splice(i, 1); }
export function updateTweens(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];
    tw.t += dt;
    if (tw.t < 0) continue;
    let k = Math.min(1, tw.t / tw.dur);
    const e = tw.ease(k);
    if (tw.fn) tw.fn(e, k);
    else {
      const v = tw.yoyo ? tw.from + (tw.to - tw.from) * Math.sin(e * Math.PI) : tw.from + (tw.to - tw.from) * e;
      tw.target[tw.prop] = v;
    }
    if (k >= 1) { active.splice(i, 1); if (!tw.fn && tw.yoyo) tw.target[tw.prop] = tw.from; tw.onDone && tw.onDone(); }
  }
}
export const wait = (ms) => new Promise(r => setTimeout(r, ms));
