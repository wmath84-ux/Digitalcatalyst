// Run with Playwright Chromium installed, or BOARD_TEST_CHROMIUM=/path/to/chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const fixture = `
import * as THREE from 'three';
import { createBoardScreens } from './src/nature3d/engine/boardScreens';
const boards = createBoardScreens(false);
const scene = new THREE.Scene();
scene.add(boards.shells);
const renderer = new THREE.WebGLRenderer({alpha:true, antialias:false, preserveDrawingBuffer:true});
renderer.setSize(1000, 700);
renderer.setClearColor(0x223344, 1);
Object.assign(renderer.domElement.style, {position:'absolute', inset:'0', zIndex:'1', pointerEvents:'none'});
document.body.append(boards.domElement, renderer.domElement);
boards.setSize(1000,700);
boards.setFog(10000,20000,new THREE.Color());
const camera = new THREE.PerspectiveCamera(52,1000/700,0.1,4000);
const reading = boards.byId('reading');
const p = reading.placement;
const normal = new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw));
const obstacle = new THREE.Mesh(new THREE.BoxGeometry(3,8,1),new THREE.MeshBasicMaterial({color:0xff0000}));
obstacle.position.copy(p.position).addScaledVector(normal,15);
obstacle.rotation.y = p.yaw;
scene.add(obstacle);
obstacle.visible = false;
function frame(distance=60, slot="reading") {
 const target=boards.byId(slot).placement;
 const targetNormal=new THREE.Vector3(Math.sin(target.yaw),0,Math.cos(target.yaw));
 camera.position.copy(target.position).addScaledVector(targetNormal,distance);
 camera.lookAt(target.position); camera.updateMatrixWorld(true);
}
function render() { boards.render(camera,true); renderer.render(scene,camera); }
function pixel(x,y) {
 const gl=renderer.getContext(); const rgba=new Uint8Array(4);
 gl.readPixels(x,700-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba); return [...rgba];
}
reading.element.style.background = '#00ff00';
const iframe = document.createElement('iframe');
iframe.style.cssText='width:100%;height:100%;border:0';
iframe.srcdoc='<body style="margin:0;background:#00ff00"><button id="play" onclick="window.clicks=(window.clicks||0)+1">Play</button><script>window.playbackPosition=137;<\/script>';
let loads=0; iframe.addEventListener('load',()=>loads++);
reading.element.append(iframe);
frame(); render();
window.fixture={boards,camera,reading,iframe,obstacle,frame,render,pixel,loads:()=>loads};
`;

const executablePath = process.env.BOARD_TEST_CHROMIUM || chromium.executablePath();
test('real browser: iframe survives pin/desk/zoom; foreground only covers its own pixels', {
  skip: existsSync(executablePath) ? false : 'Install Playwright Chromium or set BOARD_TEST_CHROMIUM',
}, async (t) => {
  const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife' });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : '<body style="margin:0"><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.fixture?.loads() === 1);
    const center = await sharp(await page.screenshot()).extract({ left: 500, top: 350, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.deepEqual([...center], [0,255,0], 'world-view CSS projection paints the live iframe through the aperture');
    const result = await page.evaluate(() => {
      const f = window.fixture;
      const initialWindow = f.iframe.contentWindow;
      const initialDocument = f.iframe.contentDocument;
      const openCenter = f.pixel(500,350);
      f.obstacle.visible = true; f.render();
      const blockedCenter = f.pixel(500,350);
      const openSide = f.pixel(600,350);
      // The DOM face stays visible even behind an obstacle; the depth buffer
      // masks its covered pixels, not a host display/visibility toggle.
      const stillVisible = f.reading.host.style.visibility;
      for (const slot of ['reading',null,'notes','mindmap',null,'reading',null]) {
        f.boards.setReadSlot(slot);
        for (const distance of [60,200,600,-60,60]) { f.frame(distance); f.render(); }
      }
      f.obstacle.visible=false; f.boards.setReadSlot('reading'); f.frame(); f.render();
      const rect=f.reading.host.getBoundingClientRect();
      return {openCenter,blockedCenter,openSide,stillVisible,
        sameWindow:initialWindow===f.iframe.contentWindow,
        sameDocument:initialDocument===f.iframe.contentDocument,
        position:f.iframe.contentWindow.playbackPosition,
        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
    });
    assert.equal(result.openCenter[3], 0, 'unobstructed board punches through canvas');
    assert.deepEqual(result.blockedCenter, [255,0,0,255], 'foreground geometry covers the center');
    assert.equal(result.openSide[3], 0, 'uncovered portion must NOT become black');
    assert.equal(result.stillVisible, 'visible');
    assert.equal(result.sameWindow, true);
    assert.equal(result.sameDocument, true);
    assert.equal(result.position, 137);
    assert.ok(result.rect.width > 100 && result.rect.width < 1000);
    await page.frameLocator('iframe').locator('#play').click();
    assert.equal(await page.evaluate(() => window.fixture.iframe.contentWindow.clicks), 1, 'native iframe buttons work in framed view');
    assert.equal(await page.evaluate(() => window.fixture.loads()), 1, 'camera transitions never reload iframe');
    await t.test('fog uses the depth aperture with correct premultiplied alpha', async () => {
      const result = await page.evaluate(() => {
        const f = window.fixture;
        f.boards.setReadSlot(null);
        f.boards.setFog(1, 100, { r: 0.7, g: 0.8, b: 0.9 });
        const screen = f.boards.screens[0];
        f.frame(60, screen.slot); f.render();
        const aperture = f.boards.shells.children[f.boards.screens.indexOf(screen)].getObjectByName('board-aperture');
        return { rgba: f.pixel(500,350), opacity: aperture.material.uniforms.uBoardFogOpacity.value,
          overlays: f.boards.domElement.querySelectorAll('.nature3d-board-fog').length };
      });
      assert.equal(result.overlays, 0, 'do not allocate a full-size DOM fog layer per board');
      assert.ok(result.opacity > 0 && result.opacity <= 0.82);
      for (let channel = 0; channel < 4; channel++) {
        const expected = [0.7, 0.8, 0.9, 1][channel] * result.opacity * 255;
        assert.ok(Math.abs(result.rgba[channel] - expected) <= 1, 'fog must preserve premultiplied canvas alpha');
      }
    });

    await t.test('foggy camera zoom reuses compositor textures instead of re-rasterizing panels', async () => {
      await page.evaluate(async () => {
        const f = window.fixture;
        // A populated notes/map surface makes repeated full-page raster work
        // observable; no live external service or YouTube network dependency.
        for (const board of f.boards.screens) {
          if (board === f.reading) continue;
          board.element.innerHTML = '<div style="color:white;padding:40px;display:grid;grid-template-columns:repeat(4,1fr)">' +
            Array.from({length:240}, (_,i) => '<p style="border:1px solid gray;background:linear-gradient(40deg,#123,#456)">Study notes '+i+'</p>').join('') + '</div>';
        }
        f.boards.setFog(16,420,{r:0.7,g:0.8,b:0.9});
        for (let i=0;i<30;i++) {
          await new Promise(requestAnimationFrame);
          f.frame(65+Math.sin(i/25)*20); f.render();
        }
      });
      const cdp = await page.context().newCDPSession(page);
      const events = [];
      cdp.on('Tracing.dataCollected', ({value}) => events.push(...value));
      await cdp.send('Tracing.start', {categories:'devtools.timeline,disabled-by-default-devtools.timeline,cc', transferMode:'ReportEvents'});
      try {
        await page.evaluate(async () => {
          const f = window.fixture;
          for (let i=30;i<120;i++) {
            await new Promise(requestAnimationFrame);
            f.frame(65+Math.sin(i/25)*20); f.render();
          }
        });
      } finally {
        const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        await complete;
        await cdp.detach();
      }
      const rasters = events.filter(event => event.name === 'RasterTask' && event.ph === 'X').length;
      // Allow initial tile allocation/cache eviction. The regression produced
      // many raster tasks per frame; timings themselves are intentionally not
      // asserted because headless/software GPU speed varies across CI hosts.
      assert.ok(rasters < 90, `90 camera frames caused ${rasters} raster tasks`);
      assert.equal(await page.evaluate(() => window.fixture.loads()), 1);
    });

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
