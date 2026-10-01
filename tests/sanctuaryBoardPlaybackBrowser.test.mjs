// Real browser regression. Run with Playwright Chromium installed, or set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a Chromium binary. No live account or
// external YouTube connection is needed: the real ResourceViewer uses a fake
// IFrame API boundary backed by a REAL iframe and playing HTMLVideoElement.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
const browserTest = (name, fn) => test(name, { skip: enabled ? false : "Install Playwright Chromium to run the iframe/media browser regression" }, fn);
const DIR = path.join(process.cwd(), "node_modules/.cache/sanctuary-browser");
let browser;
let server;
let origin;
let bundle;
let iframeLoads = 0;

before(async () => {
  if (!enabled) return;
  fs.mkdirSync(DIR, { recursive: true });
  const stub = path.join(DIR, "docsAccess.ts");
  fs.writeFileSync(stub, `export function useDocsEditorAccess() { return { editorAccess: { doc: "off", sheet: "off", slides: "off" } }; }`);
  await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
import * as THREE from "three";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import ResourceViewer from "./src/course/ResourceViewer";
import { createBoardScreens } from "./src/nature3d/engine/boardScreens";
import { registerTreeObstacles } from "./src/nature3d/engine/flora";

const root = document.getElementById("stage")!;
const screens = createBoardScreens(false);
root.appendChild(screens.domElement);
const camera = new THREE.PerspectiveCamera(52, 1600 / 900, 0.1, 4000);
const api = { creates: 0, destroys: 0, pauses: 0, iframe: null as HTMLIFrameElement | null };
(window as any).YT = { Player: function(host: HTMLElement, opts: any) {
  api.creates++;
  const iframe = document.createElement("iframe");
  iframe.src = "/player.html"; iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0";
  host.replaceWith(iframe); api.iframe = iframe;
  iframe.addEventListener("load", () => opts.events.onReady());
  return {
    getCurrentTime: () => (iframe.contentWindow as any)?.document.querySelector("video")?.currentTime || 0,
    getDuration: () => 10000,
    pauseVideo: () => { api.pauses++; (iframe.contentWindow as any)?.document.querySelector("video")?.pause(); },
    destroy: () => { api.destroys++; iframe.remove(); },
  };
} };
const file: any = { id: "lesson-video", name: "Persistent lesson", type: "youtube", youtubeVideoId: "dQw4w9WgXcQ" };
const reactHost = document.createElement("div"); root.appendChild(reactHost);
const reactRoot = createRoot(reactHost);
const originalParents = screens.screens.map(s => [s.host.parentNode, s.element.parentNode]);
function BoardContents({ tick }: { tick: number }) {
 return <>{createPortal(<ResourceViewer file={file} active desktopView />, screens.byId("reading")!.element)}
 {createPortal(<button id="note-hit" style={{ position: "absolute", left: 800, top: 500, width: 200, height: 80 }} onClick={() => { (window as any).clicks++; }}>Note button {tick}</button>, screens.byId("notes")!.element)}</>;
}
(window as any).clicks = 0;
let tick = 0;
reactRoot.render(<BoardContents tick={tick}/>);
function resize(w: number, h: number) {
 root.style.width = w + "px"; root.style.height = h + "px";
 camera.aspect = w/h; camera.updateProjectionMatrix(); screens.setSize(w,h);
}
function frame(slot: any, pin = false, distance = 60) {
 const p = screens.byId(slot)!.placement;
 camera.position.copy(p.position).addScaledVector(new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw)),distance);
 camera.lookAt(p.position); camera.updateMatrixWorld(true);
 screens.setReadSlot(pin ? slot : null); screens.render(camera,true);
}
resize(1600,900); frame("reading",true);
(window as any).boards = {
 api, frame, resize, screens, camera, originalParents, registerTreeObstacles,
 rerender: () => reactRoot.render(<BoardContents tick={++tick}/>),
 render: () => screens.render(camera,true),
 checkConnected: () => screens.screens.every((s,i) => s.host.isConnected && s.element.parentNode === originalParents[i][1] && s.host.parentNode === originalParents[i][0]),
 measure: (slot: any) => {
   const s = screens.byId(slot)!;
   const e = s.element.getBoundingClientRect();
   return { x:e.x, y:e.y, w:e.width, h:e.height, opacity:s.host.style.opacity, matrix:s.host.style.transform, display:s.host.style.display };
 },
 corners: (slot: any) => {
   const s = screens.byId(slot)!; const p = s.placement; const scale = s.object.scale.x;
   return [[0,0],[1920,0],[0,1080],[1920,1080]].map(([x,y]) => {
     const v = new THREE.Vector3((x-960)*scale, (540-y)*scale, 0).applyAxisAngle(new THREE.Vector3(0,1,0),p.yaw).add(p.position).project(camera);
     return [(v.x*.5+.5)*root.clientWidth,(-v.y*.5+.5)*root.clientHeight];
   });
 },
};
` },
    outfile: path.join(DIR, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent",
    plugins: [{ name: "no-live-settings", setup(b) {
      b.onResolve({ filter: /useDocsEditorAccess$/ }, () => ({ path: stub }));
    } }],
  });
  bundle = fs.readFileSync(path.join(DIR, "fixture.js"));
  const style = `html,body{margin:0;background:#ceddec}#stage{position:relative;overflow:hidden}.h-full{height:100%}.w-full{width:100%}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.min-h-0{min-height:0}.min-w-0{min-width:0}.overflow-hidden{overflow:hidden}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.bg-black{background:#000}.pointer-events-none{pointer-events:none}[data-course-viewer-embed]{height:100%;width:100%;position:relative}`;
  server = http.createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle); return; }
    if (req.url === "/player.html") {
      iframeLoads++;
      res.setHeader("Content-Type", "text/html");
      res.end(`<!doctype html><body style="margin:0;background:navy"><video autoplay muted playsinline style="width:100%;height:100%"></video><script>
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
        const context=canvas.getContext('2d');let frame=0;
        const paint=()=>{context.fillStyle=frame++%2?'#116633':'#2255aa';context.fillRect(0,0,320,180)};
        paint();setInterval(paint,40);
        const video=document.querySelector('video');video.srcObject=canvas.captureStream(25);video.play();
        window.generation=${iframeLoads};
      </script>`); return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><head><style>${style}</style></head><body><div id="stage"></div><script src="/fixture.js"></script></body>`);
  });
  await new Promise(resolve => server.listen(0, "0.0.0.0", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.rmSync(DIR, { recursive: true, force: true }); });

async function readyPage() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(origin);
  await page.waitForFunction(() => window.boards?.api.iframe?.contentDocument?.querySelector("video")?.currentTime > 0.15);
  return page;
}

browserTest("real video keeps its browsing context and clock across board/camera/fit/HUD/native-fullscreen/size switches", async () => {
  const page = await readyPage();
  const beforeLoads = iframeLoads;
  const start = await page.evaluate(() => window.boards.api.iframe.contentDocument.querySelector("video").currentTime);
  for (const slot of ["notes", "mindmap", "reading", "notes", "reading"]) {
    await page.evaluate(slot => {
      const b=window.boards;
      b.frame(slot,true); b.rerender();
      b.screens.setHudInsets({top:0,bottom:0,left:0,right:0}); b.render();
      b.resize(844,390); b.frame(slot,true);
      b.resize(1600,900); b.frame(slot,false);
      for (const scale of [1.5,2,3,1]) { b.screens.setScale(scale); b.frame(slot,true,60*scale); }
      b.camera.position.set(0,40,-200); b.camera.lookAt(0,12,0); b.screens.setReadSlot(null); b.render();
      if (!b.checkConnected()) throw new Error("live board reparented/detached");
    }, slot);
    await page.waitForTimeout(90);
  }
  // Browser top-layer fullscreen is distinct from a CSS fit. Use a real
  // trusted click (required user activation), then both resize and unfit.
  await page.evaluate(() => {
    const button=document.createElement("button");button.id="fullscreen-probe";
    button.textContent="Fullscreen";
    button.style.cssText="position:fixed;left:12px;top:12px;z-index:2147483647";
    button.onclick=()=>document.getElementById("stage").requestFullscreen();
    document.getElementById("stage").appendChild(button);
  });
  await page.locator("#fullscreen-probe").click();
  await page.waitForFunction(() => document.fullscreenElement?.id === "stage");
  await page.evaluate(() => { const b=window.boards;b.resize(innerWidth,innerHeight);b.frame("reading",true);b.rerender(); });
  await page.waitForTimeout(90);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => document.fullscreenElement === null);
  await page.evaluate(() => { const b=window.boards;b.resize(1600,900);b.frame("notes",false); });
  const result = await page.evaluate(() => ({
    creates:window.boards.api.creates, destroys:window.boards.api.destroys, pauses:window.boards.api.pauses,
    time:window.boards.api.iframe.contentDocument.querySelector("video").currentTime,
    paused:window.boards.api.iframe.contentDocument.querySelector("video").paused,
    connected:window.boards.checkConnected(),
  }));
  assert.equal(iframeLoads, beforeLoads, "iframe navigated/reloaded on camera change");
  assert.equal(result.creates, 1); assert.equal(result.destroys, 0); assert.equal(result.pauses, 0);
  assert.equal(result.paused, false); assert.ok(result.time > start + 0.3); assert.equal(result.connected, true);
  await page.close();
});

browserTest("world matrix projects the exact face bounds, fit returns to 3D, and native buttons remain clickable", async () => {
  const page = await readyPage();
  for (const slot of ["reading", "notes", "mindmap"]) {
    await page.evaluate(slot => window.boards.frame(slot,false), slot);
    const { rect, corners } = await page.evaluate(slot => ({ rect:window.boards.measure(slot), corners:window.boards.corners(slot) }), slot);
    const xs=corners.map(p=>p[0]), ys=corners.map(p=>p[1]);
    assert.ok(Math.abs(rect.x-Math.min(...xs)) < 0.1); assert.ok(Math.abs(rect.y-Math.min(...ys)) < 0.1);
    assert.ok(Math.abs(rect.w-(Math.max(...xs)-Math.min(...xs))) < 0.1);
    assert.ok(Math.abs(rect.h-(Math.max(...ys)-Math.min(...ys))) < 0.1);
    assert.equal(rect.opacity,"1"); assert.match(rect.matrix,/matrix3d/);
    await page.evaluate(slot => window.boards.frame(slot,true),slot);
    assert.match((await page.evaluate(slot=>window.boards.measure(slot),slot)).matrix,/scale/);
  }
  await page.evaluate(()=>window.boards.frame("notes",true));
  await page.locator("#note-hit").click();
  assert.equal(await page.evaluate(()=>window.clicks),1);
  await page.evaluate(()=>window.boards.frame("notes",false));
  await page.locator("#note-hit").click();
  assert.equal(await page.evaluate(()=>window.clicks),2);
  await page.close();
});

browserTest("a foreground tree cannot blank or fog the fitted board, even at 3x size", async () => {
  const page = await readyPage();
  const result = await page.evaluate(() => {
    const b=window.boards;
    b.screens.setScale(3);b.frame("reading",true,150);
    const p=b.screens.byId("reading").placement.position;
    b.registerTreeObstacles([{x:p.x,z:(p.z+b.camera.position.z)/2,baseY:-10,height:100,radius:100}]);b.render();
    return {rect:b.measure("reading"),fog:b.screens.byId("reading").host.querySelector(".nature3d-board-fog").style.opacity};
  });
  assert.equal(result.rect.opacity,"1");assert.equal(result.rect.display,"");assert.equal(result.fog,"0");
  assert.match(result.rect.matrix,/scale/);
  await page.close();
});
