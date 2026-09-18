// Grid A* so tap-to-move and the auto tour route around the river, trees and animals.
export class NavGrid {
  constructor({ minX, minZ, w, h, cell = 0.5 }) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.nx = Math.ceil(w / cell); this.nz = Math.ceil(h / cell);
    this.walk = new Uint8Array(this.nx * this.nz);
  }
  build(fn) {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = this.minX + (i + 0.5) * this.cell, z = this.minZ + (j + 0.5) * this.cell;
      this.walk[j * this.nx + i] = fn(x, z) ? 1 : 0;
    }
  }
  toCell(x, z) { return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)]; }
  toWorld(i, j) { return { x: this.minX + (i + 0.5) * this.cell, z: this.minZ + (j + 0.5) * this.cell }; }
  ok(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.walk[j * this.nx + i] === 1; }
  isWalkable(x, z) { const [i, j] = this.toCell(x, z); return this.ok(i, j); }
  nearest(x, z, maxR = 12) {
    const [ci, cj] = this.toCell(x, z);
    if (this.ok(ci, cj)) return { x, z };
    for (let r = 1; r < maxR / this.cell; r++) {
      let best = null, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !this.ok(i, j)) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bd) { bd = d; best = this.toWorld(i, j); }
      }
      if (best) return best;
    }
    return null;
  }
  lineOfSight(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), n = Math.ceil(L / (this.cell * 0.5));
    for (let k = 0; k <= n; k++) { const t = k / n; if (!this.isWalkable(a.x + dx * t, a.z + dz * t)) return false; }
    return true;
  }
  findPath(from, to) {
    const s = this.nearest(from.x, from.z), g = this.nearest(to.x, to.z);
    if (!s || !g) return null;
    const [si, sj] = this.toCell(s.x, s.z), [gi, gj] = this.toCell(g.x, g.z);
    const nx = this.nx, N = nx * this.nz;
    const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (f, idx) => { heap.push([f, idx]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    const start = sj * nx + si, goal = gj * nx + gi;
    gScore[start] = 0; push(h(si, sj), start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false, iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, cur] = pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue; closed[cur] = 1;
      const ci = cur % nx, cj = (cur / nx) | 0;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di, nj = cj + dj;
        if (!this.ok(ni, nj)) continue;
        if (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj))) continue; // no corner cutting
        const nidx = nj * nx + ni;
        if (closed[nidx]) continue;
        const ng = gScore[cur] + cost;
        if (ng < gScore[nidx]) { gScore[nidx] = ng; came[nidx] = cur; push(ng + h(ni, nj), nidx); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(this.toWorld(c % nx, (c / nx) | 0));
    cells.reverse();
    cells[0] = { x: from.x, z: from.z };
    cells[cells.length - 1] = { x: g.x, z: g.z };
    // string-pull smoothing
    const out = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !this.lineOfSight(cells[i], cells[j])) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  }
}
