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
function frame(distance=60) {
 camera.position.copy(p.position).addScaledVector(normal,distance);
 camera.lookAt(p.position); camera.updateMatrixWorld(true);
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
}, async () => {
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
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
