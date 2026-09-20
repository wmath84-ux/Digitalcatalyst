import * as THREE from 'three';
import { rng } from './noise.js';
import { RIVER } from './data.js';
import { terrainHeight, radialTexture } from './world.js';

function starTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d'); ctx.translate(32, 32); ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 30 : 11, a = i / 8 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(cv); return t;
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.items = [];          // {update(dt) -> false when done}
    this.star = starTexture();
    this.glowTex = radialTexture('#ffffff');
    this.r = rng(77);
    this.buildButterflies();
    this.buildSkyBirds();
    this.ringGeo = new THREE.RingGeometry(0.6, 1.0, 36);
  }

  // ---------- water rings
  ripple(pos, size = 1.5, opacity = 0.5) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, RIVER.level + 0.03, pos.z); m.renderOrder = 3;
    this.scene.add(m);
    let t = 0;
    this.items.push({ update: (dt) => { t += dt; const k = t / 1.6; m.scale.setScalar(0.4 * size + k * size * 1.6); m.material.opacity = opacity * (1 - k); if (k >= 1) { this.scene.remove(m); m.material.dispose(); return false; } return true; } });
  }
  splash(pos, size = 2) {
    this.ripple(pos, size, 0.8); setTimeout(() => this.ripple(pos, size * 0.8, 0.6), 120);
    const n = 26, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = RIVER.level; p[i * 3 + 2] = pos.z; const a = this.r() * Math.PI * 2, s = this.r() * 2 + 1; v.push([Math.cos(a) * s * 0.7 * size * 0.4, 3 + this.r() * 3, Math.sin(a) * s * 0.7 * size * 0.4]); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: this.glowTex, color: 0xdff6ff, size: 0.45, transparent: true, depthWrite: false, sizeAttenuation: true }));
    this.scene.add(pts);
    let t = 0;
    this.items.push({ update: (dt) => { t += dt; const a = g.attributes.position.array; for (let i = 0; i < n; i++) { v[i][1] -= 9.8 * dt; a[i * 3] += v[i][0] * dt; a[i * 3 + 1] += v[i][1] * dt; a[i * 3 + 2] += v[i][2] * dt; } g.attributes.position.needsUpdate = true; pts.material.opacity = 1 - t / 1.1; if (t > 1.1) { this.scene.remove(pts); g.dispose(); pts.material.dispose(); return false; } return true; } });
  }

  // ---------- click sparkles
  sparkle(pos, color = 0xffe066, n = 22, radius = 1.2) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = pos.y + 0.8; p[i * 3 + 2] = pos.z; const a = this.r() * Math.PI * 2, b = this.r() * Math.PI - Math.PI / 2, s = (1.5 + this.r() * 2.5) * radius; v.push([Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 2.5, Math.sin(a) * Math.cos(b) * s]); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: this.star, color, size: 0.55, transparent: true, depthWrite: false, alphaTest: 0.1 }));
    pts.renderOrder = 20;
    this.scene.add(pts);
    let t = 0;
    this.items.push({ update: (dt) => { t += dt; const a = g.attributes.position.array; for (let i = 0; i < n; i++) { v[i][1] -= 6 * dt; a[i * 3] += v[i][0] * dt; a[i * 3 + 1] += v[i][1] * dt; a[i * 3 + 2] += v[i][2] * dt; } g.attributes.position.needsUpdate = true; pts.material.opacity = 1 - t / 1.0; pts.material.size = 0.55 * (1 - t * 0.5); if (t > 1.0) { this.scene.remove(pts); g.dispose(); pts.material.dispose(); return false; } return true; } });
  }

  // ---------- floating hearts when found
  hearts(pos) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    c.fillStyle = '#ff6b9d'; c.beginPath(); c.moveTo(32, 56); c.bezierCurveTo(4, 36, 8, 8, 32, 20); c.bezierCurveTo(56, 8, 60, 36, 32, 56); c.fill();
    const tex = new THREE.CanvasTexture(cv);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sp.position.set(pos.x + (this.r() - 0.5) * 1.5, pos.y + 1.0 + this.r() * 0.5, pos.z + (this.r() - 0.5) * 1.5);
      sp.scale.setScalar(0.5 + this.r() * 0.4); sp.renderOrder = 999;
      this.scene.add(sp);
      let t = -i * 0.12; const ph = this.r() * 6;
      this.items.push({ update: (dt) => { t += dt; if (t < 0) return true; sp.position.y += 1.4 * dt; sp.position.x += Math.sin(t * 4 + ph) * 0.4 * dt; sp.material.opacity = 1 - t / 1.8; if (t > 1.8) { this.scene.remove(sp); sp.material.dispose(); return false; } return true; } });
    }
  }

  // ---------- confetti
  confetti(center, n = 220) {
    const cols = [0xff6b6b, 0xffd166, 0x8ee68a, 0x48dbfb, 0xc58bff, 0xff8fb1, 0xffffff];
    const geo = new THREE.PlaneGeometry(0.28, 0.18);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    const parts = [];
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const a = this.r() * Math.PI * 2, sp = 3 + this.r() * 6;
      parts.push({ p: new THREE.Vector3(center.x, center.y + 1, center.z), v: new THREE.Vector3(Math.cos(a) * sp, 6 + this.r() * 7, Math.sin(a) * sp), rot: new THREE.Vector3(this.r() * 6, this.r() * 6, this.r() * 6), rv: new THREE.Vector3(this.r() * 8, this.r() * 8, this.r() * 8) });
      mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    let t = 0;
    this.items.push({ update: (dt) => {
      t += dt;
      for (let i = 0; i < n; i++) { const c = parts[i]; c.v.y -= 9 * dt; c.v.multiplyScalar(1 - 1.4 * dt); c.p.addScaledVector(c.v, dt); c.rot.addScaledVector(c.rv, dt); e.set(c.rot.x, c.rot.y, c.rot.z); q.setFromEuler(e); M.compose(c.p, q, s); mesh.setMatrixAt(i, M); }
      mesh.instanceMatrix.needsUpdate = true;
      if (t > 5) { this.scene.remove(mesh); geo.dispose(); mesh.material.dispose(); return false; } return true;
    } });
  }

  // ---------- camera flash (screen white)
  flash() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:30;pointer-events:none;opacity:.9;transition:opacity .45s';
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 500);
  }

  // ---------- butterflies wandering between flowers
  buildButterflies() {
    const cols = [0xf48fb1, 0xffb74d, 0x81d4fa, 0xb39ddb, 0xfff176, 0xff8a65];
    this.butterflies = [];
    const wingGeo = new THREE.CircleGeometry(0.22, 12); wingGeo.translate(0.2, 0, 0); wingGeo.scale(1, 0.75, 1);
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.7 });
      const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat);
      wl.rotation.y = Math.PI; wl.rotation.x = -Math.PI / 2; wr.rotation.x = -Math.PI / 2;
      g.add(wl, wr);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 6), new THREE.MeshStandardMaterial({ color: 0x4a2e1f })); body.rotation.x = Math.PI / 2; g.add(body);
      const home = new THREE.Vector3(this.r() * 70 - 35, 0, this.r() * 46 - 23);
      if (Math.abs(home.x - RIVER.x(home.z)) < 5) home.x += 8;
      g.position.copy(home);
      this.scene.add(g);
      this.butterflies.push({ g, wl, wr, home, ph: this.r() * 10, f: 0.25 + this.r() * 0.25, h: 1.2 + this.r() * 1.6, rad: 3 + this.r() * 5 });
    }
  }
  // ---------- distant birds circling in the sky
  buildSkyBirds() {
    this.skyBirds = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b2f2a, side: THREE.DoubleSide });
    const wing = new THREE.PlaneGeometry(0.9, 0.22); wing.translate(0.45, 0, 0);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), rr = new THREE.Mesh(wing, mat); l.rotation.y = Math.PI; g.add(l, rr);
      this.scene.add(g);
      this.skyBirds.push({ g, l, r: rr, ph: this.r() * 10, cx: this.r() * 40 - 20, cz: -20 - this.r() * 30, rad: 12 + this.r() * 14, h: 22 + this.r() * 8, sp: 0.15 + this.r() * 0.15 });
    }
  }

  update(dt, t) {
    for (let i = this.items.length - 1; i >= 0; i--) if (!this.items[i].update(dt)) this.items.splice(i, 1);
    for (const b of this.butterflies) {
      const a = t * b.f + b.ph;
      const x = b.home.x + Math.sin(a) * b.rad, z = b.home.z + Math.sin(a * 0.7 + 1.3) * b.rad * 0.8;
      const y = terrainHeight(x, z) + b.h + Math.sin(t * 2.2 + b.ph) * 0.3;
      const prev = b.g.position.clone();
      b.g.position.set(x, y, z);
      const d = b.g.position.clone().sub(prev); if (d.lengthSq() > 1e-6) b.g.rotation.y = Math.atan2(d.x, d.z);
      const flap = Math.sin(t * 16 + b.ph) * 0.9;
      b.wl.rotation.z = -flap; b.wr.rotation.z = flap;
    }
    for (const s of this.skyBirds) {
      const a = t * s.sp + s.ph;
      s.g.position.set(s.cx + Math.cos(a) * s.rad, s.h + Math.sin(t * 0.8 + s.ph) * 0.8, s.cz + Math.sin(a) * s.rad);
      s.g.rotation.y = -a;
      const flap = Math.sin(t * 7 + s.ph) * 0.6;
      s.l.rotation.z = -flap; s.r.rotation.z = flap;
    }
  }
}
