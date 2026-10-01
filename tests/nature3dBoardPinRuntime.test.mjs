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
import { createBoardScreens } from "./src/nature3d/engine/boardScreens";
import { terrainHeight } from "./src/nature3d/engine/terrain";
import { registerTreeObstacles } from "./src/nature3d/engine/flora";
export { THREE, terrainHeight, registerTreeObstacles };
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

// A board is a SCREEN, not a window: whatever module, notes or mind map is
// running keeps running and keeps painting, no matter what stands between it
// and the eye. The old occlusion ray-test hid the page whenever the terrain
// broke the sightline — and because the 3D frame stayed visible while the DOM
// content went to opacity 0, the learner saw a BLACK BOARD that flickered on
// and off as the camera orbited the boundary. That behaviour is gone; these
// two tests now assert its absence.
test("terrain in front of a board never hides the page — it keeps painting", () => {
  screens.setReadSlot(null);
  const p=screens.byId("reading").placement.position;
  const stand=(z)=>{camera.position.set(0,fixture.terrainHeight(0,z)+1.7,z);camera.lookAt(p);camera.updateMatrixWorld(true);render();};
  stand(100-5.4);assert.equal(state().find(s=>s.slot==="reading").painted,true);
  // The pose that USED to hide the page: every face sample sits below the
  // intervening terrain, so the old nine-ray test called it fully obstructed.
  const x=Math.sin(1.2)*450,z=Math.cos(1.2)*450-5.4;
  camera.position.set(x,fixture.terrainHeight(x,z)+1.7,z);camera.lookAt(p);camera.updateMatrixWorld(true);render();
  const shown=state().find(s=>s.slot==="reading");
  assert.equal(shown.painted,true,"terrain obstruction hid the page — boards must never blank");
  assert.equal(shown.host.style.visibility,"visible");
  assert.equal(shown.host.inert,false);
  assert.equal(shown.shellVisible,true);assert.equal(shown.host.isConnected,true);
  stand(100-5.4);assert.equal(state().find(s=>s.slot==="reading").painted,true);
});

test("neither a leaf/trunk nor a whole tree across the face can blank the board or stop media", () => {
  screens.setReadSlot(null);frame("reading");
  const p=screens.byId("reading").placement.position;
  fixture.registerTreeObstacles([{x:p.x,z:(p.z+camera.position.z)/2,baseY:-10,height:60,radius:1}]);render();
  assert.equal(state().find(s=>s.slot==="reading").painted,true,"partial obstruction hid the whole board");
  // A trunk the width of the entire board. This still must not blank it: the
  // page is a live DOM surface composited ABOVE the canvas, so "hiding" it
  // never revealed the scenery — it only took the lesson away and left a
  // black frame behind.
  fixture.registerTreeObstacles([{x:p.x,z:(p.z+camera.position.z)/2,baseY:-10,height:60,radius:60}]);render();
  const shown=state().find(s=>s.slot==="reading");
  assert.equal(shown.painted,true,"a full-width obstruction blanked the board");
  assert.equal(shown.host.style.visibility,"visible");assert.equal(shown.host.inert,false);
  assertConnected();
  screens.setReadSlot("reading");render();
  const fitted=state().find(s=>s.slot==="reading");
  assert.equal(fitted.painted,true);assert.equal(fitted.host.querySelector(".nature3d-board-fog").style.opacity,"0");
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

test("resize, projection-only and board-size changes invalidate the pose; idle frames do no DOM work", () => {
  world();const before=screens.byId("reading").host.style.transform;
  camera.setViewOffset(1600,900,40,10,1600,900);screens.render(camera);
  assert.notEqual(screens.byId("reading").host.style.transform,before);
  camera.clearViewOffset();screens.setScale(3);frame("reading",150);screens.setReadSlot("reading");screens.render(camera);
  assertConnected();assertNoStrayPage();
  screens.setScale(1);camera.updateProjectionMatrix();world();
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
