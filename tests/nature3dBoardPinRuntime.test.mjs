// Run the real board engine in jsdom. A fit is now a STYLE change on a
// permanently connected host, not a DOM move. This protects iframe browsing
// contexts AND the previous black/giant-page regression. Browser-level media
// and native hit testing live in sanctuaryBoardPlaybackBrowser.test.mjs.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const CACHE = path.join(ROOT, "node_modules/.cache/nature3d-board-pin");
fs.mkdirSync(CACHE, { recursive: true });
buildSync({
  stdin: { resolveDir: ROOT, loader: "ts", contents: `
import * as THREE from "three";
import { createBoardScreens, studyLetterbox } from "./src/nature3d/engine/boardScreens";
import { terrainHeight } from "./src/nature3d/engine/terrain";
import { registerTreeObstacles } from "./src/nature3d/engine/flora";
export { THREE, terrainHeight, registerTreeObstacles, studyLetterbox };
export function boot(host: HTMLElement) {
 const screens=createBoardScreens(false);host.appendChild(screens.domElement);screens.setSize(1600,900);
 return {screens,camera:new THREE.PerspectiveCamera(52,1600/900,.1,4000)};
}
export function frame(screens:any,camera:any,slot:string,distance=60) {
 const p=screens.byId(slot).placement;
 camera.position.copy(p.position).addScaledVector(new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw)),distance);
 camera.lookAt(p.position);camera.updateMatrixWorld(true);
}
` },
  outfile: path.join(CACHE, "fixture.cjs"), bundle: true, format: "cjs", platform: "node", logLevel: "silent",
});
const dom = new JSDOM("<!doctype html><body><div id='page'></div></body>", { pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
}
const fixture = require(path.join(CACHE, "fixture.cjs"));
const { screens, camera } = fixture.boot(document.getElementById("page"));
const originalParents = screens.screens.map(s => [s.host.parentElement, s.element.parentElement]);
const originalObjects = [...screens.cssScene.children];
const state = () => screens.screens.map((s, i) => ({
  ...s, shellVisible: screens.shells.children[i].visible,
  painted: s.host.style.opacity === "1", fitted: s.host.style.transform.startsWith("translate("),
}));
const frame = (slot, distance = 60) => fixture.frame(screens, camera, slot, distance);
const render = () => screens.render(camera, true);
const world = () => {
  screens.setReadSlot(null); camera.position.set(0,30,60);camera.lookAt(0,12,0);camera.updateMatrixWorld(true);render();
};
function assertConnected() {
  assert.deepEqual(screens.cssScene.children, originalObjects, "camera must not remove CSS objects");
  for (const [i, s] of screens.screens.entries()) {
    assert.ok(s.host.isConnected, `${s.slot}: live host detached`);
    assert.equal(s.host.parentElement, originalParents[i][0]);
    assert.equal(s.element.parentElement, originalParents[i][1]);
    assert.equal(s.element.style.transform, "", "face must never receive a second projection");
    assert.equal(s.host.style.display, "", "display:none is not a camera/media control");
  }
}
function assertNoStrayPage() {
  for (const s of state()) {
    if (!s.painted) continue;
    assert.doesNotMatch(s.host.style.transform, /NaN|Infinity/);
    if (!s.fitted) {
      assert.match(s.host.style.transform, /^matrix3d\(/, `${s.slot}: world page needs a complete matrix`);
    } else {
      const match = /scale\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(s.host.style.transform);
      assert.ok(match, "fit needs a real screen-pixel scale");
      assert.ok(Number(match[1])*1920 <= 1600*1.6+1);
      assert.ok(Number(match[2])*1080 <= 900*1.6+1);
    }
  }
}
after(() => { dom.window.close(); fs.rmSync(CACHE, { recursive: true, force: true }); });

test("with no board framed, all three faces have a world matrix in their stable hosts", () => {
  world(); assertConnected(); assertNoStrayPage();
  for (const s of state()) { assert.equal(s.painted,true);assert.equal(s.shellVisible,true);assert.equal(s.fitted,false); }
});

test("fit changes only the host's transform: content, neighbours and object identities survive", () => {
  frame("reading");screens.setReadSlot("reading");render();assertConnected();assertNoStrayPage();
  const reading=state().find(s=>s.slot==="reading");
  assert.equal(reading.fitted,true);assert.equal(reading.painted,true);assert.equal(reading.shellVisible,true);
  for (const s of state().filter(s=>s.slot!=="reading")) {
    assert.equal(s.fitted,false);assert.equal(s.painted,true);assert.equal(s.shellVisible,true);
  }
});

test("repeated board/eye/fit switches never detach a live face or create a giant unposed page", () => {
  const observer=new window.MutationObserver(()=>{});
  observer.observe(screens.domElement,{childList:true,subtree:true});
  for (let i=0;i<10;i++) for (const slot of ["notes","reading","mindmap",null]) {
    if (slot) frame(slot);screens.setReadSlot(slot);render();render();assertConnected();assertNoStrayPage();
  }
  assert.equal(observer.takeRecords().length,0,"camera switches must not move any DOM subtree");observer.disconnect();world();
});

test("zooming out of fit and releasing it leaves correctly scaled world faces", () => {
  frame("reading");screens.setReadSlot("reading");render();
  for (const distance of [120,300,900,2000]) {
    const p=screens.byId("reading").placement.position;
    camera.position.set(p.x,90+distance*.25,p.z+distance);camera.lookAt(p);camera.updateMatrixWorld(true);render();
    assertConnected();assertNoStrayPage();
  }
  world();assertConnected();assertNoStrayPage();
  assert.ok(state().every(s=>!s.fitted));
});

test("an oversized/refused fit remains an honest 3D board instead of a black slab", () => {
  frame("reading");screens.setReadSlot("reading");render();assert.equal(state().find(s=>s.slot==="reading").fitted,true);
  frame("reading",10);render();
  const reading=state().find(s=>s.slot==="reading");
  assert.equal(reading.fitted,false);assert.equal(reading.painted,true);assert.equal(reading.object.visible,true);
  assertConnected();assertNoStrayPage();world();
});

// A board must read as an object IN the world, not a sticker floating over it.
// The screen is a DOM layer above the canvas and can never be depth-tested, so
// when a hill or a tree stands between it and the eye it has to fade — but it
// must fade SOFTLY (a fraction over five face points, smoothed over frames, so
// an orbiting camera cannot make it snap) and it must NEVER be detached, or the
// running lesson and its media die. The shell dims with the page, because the
// original bug was a faded page over a solid near-black backing: a black slab.
test("terrain in front of a board fades it back instead of letting it float over the hill", () => {
  screens.setReadSlot(null);
  const p=screens.byId("reading").placement.position;
  const stand=(z)=>{camera.position.set(0,fixture.terrainHeight(0,z)+1.7,z);camera.lookAt(p);camera.updateMatrixWorld(true);render();};
  stand(100-5.4);
  const clear=state().find(s=>s.slot==="reading");
  assert.equal(clear.painted,true,"an unobstructed board must be fully opaque");

  // The pose that used to be a hard binary: every face sample sits below the
  // intervening terrain, so the board is genuinely behind the hill.
  const x=Math.sin(1.2)*450,z=Math.cos(1.2)*450-5.4;
  camera.position.set(x,fixture.terrainHeight(x,z)+1.7,z);camera.lookAt(p);camera.updateMatrixWorld(true);
  // Let the smoothing converge, the same way a real frame loop would.
  for (let i=0;i<60;i++) render();
  const shown=state().find(s=>s.slot==="reading");
  const alpha=parseFloat(shown.host.style.opacity);
  assert.ok(alpha<0.5,`an obstructed board must fade back, got opacity ${alpha}`);

  // The regression that mattered: the WebGL shell must dim WITH the page.
  const idx=screens.screens.findIndex(s=>s.slot==="reading");
  const fade=screens.shells.children[idx].userData.fade;
  assert.ok(Array.isArray(fade)&&fade.length>0,"board shell must expose its fade materials");
  for (const m of fade) {
    assert.ok(Math.abs(m.opacity-alpha)<0.02,`shell opacity ${m.opacity} diverged from page ${alpha} — black slab`);
  }

  // The fade must be a GRADIENT, not a switch. Walk the eye back toward the
  // board and some stance has to land strictly between clear and hidden, or
  // this is the old binary test wearing a decimal point.
  let intermediate=0;
  for (let d=450; d>=120; d-=15) {
    const sx=Math.sin(1.2)*d, sz=Math.cos(1.2)*d-5.4;
    camera.position.set(sx,fixture.terrainHeight(sx,sz)+1.7,sz);camera.lookAt(p);camera.updateMatrixWorld(true);
    for (let i=0;i<60;i++) render();
    const a=parseFloat(state().find(s=>s.slot==="reading").host.style.opacity);
    if (a>0.02 && a<0.98) intermediate+=1;
  }
  assert.ok(intermediate>0,`no stance produced a partial fade — the fade is binary (${intermediate} intermediate)`);

  // Faded, but still mounted and still playing: occlusion is not a stop command.
  assertConnected();
  assert.equal(shown.host.isConnected,true);
  assert.equal(shown.shellVisible,true,"the shell must stay in the scene; the depth buffer hides it");

  stand(100-5.4);
  for (let i=0;i<60;i++) render();
  const back=state().find(s=>s.slot==="reading");
  assert.equal(back.painted,true,"the board must return to full opacity once the ridge is gone");
});

test("a tree across the face fades the board but never blanks it or stops media", () => {
  screens.setReadSlot(null);frame("reading");
  const p=screens.byId("reading").placement.position;
  fixture.registerTreeObstacles([{x:p.x,z:(p.z+camera.position.z)/2,baseY:-10,height:60,radius:1}]);
  for (let i=0;i<60;i++) render();
  const thin=parseFloat(state().find(s=>s.slot==="reading").host.style.opacity);
  assert.ok(thin>0.5,`a 1 m trunk must not fade the whole board (opacity ${thin})`);

  // A trunk the width of the entire board: now the fade is justified, but it is
  // still a fade — the page stays mounted and its browsing context survives.
  fixture.registerTreeObstacles([{x:p.x,z:(p.z+camera.position.z)/2,baseY:-10,height:60,radius:60}]);
  for (let i=0;i<60;i++) render();
  const shown=state().find(s=>s.slot==="reading");
  const alpha=parseFloat(shown.host.style.opacity);
  assert.ok(alpha<0.5,`a full-width obstruction must fade the board, got ${alpha}`);
  // A thin trunk proved the gradient; here the point is that even total
  // obstruction leaves the page MOUNTED — a fade is not a detach, and the
  // iframe's browsing context and any playing media must survive it.
  assertConnected();
  assert.equal(shown.host.isConnected,true,"an obstructed board must never be detached");

  // Pinning is a deliberate full-screen UI mode: no hill gets a vote over it.
  screens.setReadSlot("reading");render();
  const fitted=state().find(s=>s.slot==="reading");
  assert.equal(fitted.painted,true,"a pinned board must ignore occlusion and fill the screen");
  assert.equal(fitted.host.querySelector(".nature3d-board-fog").style.opacity,"0");
  fixture.registerTreeObstacles([]);world();
});

test("a board seen from behind stays physical, but its hidden page is inert and never detached", () => {
  screens.setReadSlot(null);
  const p=screens.byId("notes").placement;
  const normal=new fixture.THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw));
  camera.position.copy(p.position).addScaledVector(normal,-30);camera.lookAt(p.position);camera.updateMatrixWorld(true);render();
  const notes=state().find(s=>s.slot==="notes");
  assert.equal(notes.painted,false);assert.equal(notes.object.visible,false);assert.equal(notes.shellVisible,true);
  assert.equal(notes.host.inert,true);assertConnected();world();
});

test("no free-camera pose paints a page with a corner behind the eye", () => {
  screens.setReadSlot(null);const corner=new fixture.THREE.Vector3();let painted=0;
  for (const d of [6,12,20,30,45,80,200,600,1200]) for (let deg=0;deg<360;deg+=15) for (const pitch of [.12,.6,1.2]) {
    const yaw=deg*Math.PI/180;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch)*d,12+Math.sin(pitch)*d,Math.cos(yaw)*Math.cos(pitch)*d-5.4);
    camera.lookAt(0,12,-5.4);camera.updateMatrixWorld(true);render();
    for (const s of state().filter(s=>s.painted)) {
      painted++;const p=s.placement,c=Math.cos(p.yaw),sn=Math.sin(p.yaw);
      for (const x of [-1,1]) for (const y of [-1,1]) {
        corner.set(p.position.x+x*15*c,p.position.y+y*8.4375,p.position.z-x*15*sn).project(camera);
        assert.ok(corner.z>=-1&&corner.z<=1,`${s.slot} ${d}m/${deg}deg/${pitch}: invalid near/far projection`);
      }
    }
    assertNoStrayPage();
  }
  assert.ok(painted>100,"sweep must exercise visible pages");world();
});

test("phone landscape frames the board large; portrait is untouched", () => {
  const { studyLetterbox } = fixture;
  const hud = { top: 48, bottom: 100, left: 10, right: 10 };

  // A landscape phone is ~900x390. The top stats chip and the bottom dock used
  // to claim ~164 px of the 390 px SHORT edge (42%), and because the page is
  // letterboxed to 16:9 the board came out only ~226 px tall — a small floating
  // page in a wide view. The vertical cap must give most of the height back.
  const land = studyLetterbox(900, 390, hud);
  assert.ok(land.h >= 280, `landscape board is only ${land.h.toFixed(0)} px tall — fit not optimised`);
  assert.ok(land.h / 390 >= 0.7, `landscape board fills only ${(land.h / 390 * 100).toFixed(0)}% of the short edge`);
  // Still 16:9, and still fully inside the viewport.
  assert.ok(Math.abs(land.w / land.h - 16 / 9) < 0.01, `landscape lost its 16:9 aspect (${land.w}x${land.h})`);
  assert.ok(
    land.x >= 0 && land.y >= 0 && land.x + land.w <= 900 && land.y + land.h <= 390,
    "landscape board overflows the viewport",
  );

  // Portrait must be untouched by the cap: there padT + padB is already well
  // under it, so a portrait board stays width-limited exactly as before.
  const port = studyLetterbox(390, 900, hud);
  assert.ok(Math.abs(port.w - (390 - 2 * (10 + 8))) < 1, `portrait width changed unexpectedly: ${port.w}`);
  assert.ok(port.h < port.w, "portrait board should be width-limited, not height-limited");
});

test("resize, projection-only and board-size changes invalidate the pose; idle frames do no DOM work", () => {
  world();const before=screens.byId("reading").host.style.transform;
  camera.setViewOffset(1600,900,40,10,1600,900);screens.render(camera);
  assert.notEqual(screens.byId("reading").host.style.transform,before);
  camera.clearViewOffset();screens.setScale(3);frame("reading",150);screens.setReadSlot("reading");screens.render(camera);
  assertConnected();assertNoStrayPage();
  screens.setScale(1);camera.updateProjectionMatrix();world();
  // The occlusion fade needs a few frames to converge after the camera stops.
  // That settling is intentional, so drain it before measuring: what must not
  // happen is PERPETUAL churn once nothing is moving.
  for (let i=0;i<80;i++) screens.render(camera);
  const observer=new window.MutationObserver(()=>{});observer.observe(screens.domElement,{attributes:true,subtree:true});
  for (let i=0;i<10000;i++) screens.render(camera);
  assert.equal(observer.takeRecords().length,0,"idle camera wrote styles or performed a pin transition");observer.disconnect();
});

test("winter frost never blurs/replaces board content or changes its stable parent", () => {
  const reading=screens.byId("reading");const button=document.createElement("button");button.textContent="Continue";
  reading.element.appendChild(button);let clicks=0;button.addEventListener("click",()=>clicks++);
  screens.setWinter(true);
  for (const slot of ["reading","notes",null]) {if(slot)frame(slot);screens.setReadSlot(slot);render();assertConnected();assert.ok(reading.element.contains(button));button.click();}
  assert.equal(clicks,3);screens.setWinter(false);assert.equal(reading.element.dataset.iceAge,undefined);button.remove();
  const css=fs.readFileSync("src/nature3d/winter.css","utf8");assert.doesNotMatch(css,/backdrop-filter|filter:|transform:/);
});

test("disposal removes all faces and hosts, fitted or not", () => {
  frame("notes");screens.setReadSlot("notes");render();assertConnected();screens.dispose();
  assert.equal(document.querySelectorAll(".nature3d-board-screen").length,0);
});
