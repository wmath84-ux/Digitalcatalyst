import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
let server, browser, origin;
const url = (suffix = "#/revision") => `${origin}/tests/fixtures/revisionShellHarness/index.html${suffix}`;
const browserTest = (name, fn) => test(name, { timeout: 90000 }, async t => {
  if (!enabled) return t.skip("Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  await fn();
});
before(async () => {
  if (!enabled) return;
  server = await createServer({ configFile: "tests/fixtures/revisionShellHarness/vite.config.mjs", server: { port: 0 }, logLevel: "error" });
  await server.listen();
  origin = `http://localhost:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", ...(process.env.PLAYWRIGHT_CHROMIUM_ARGS || "").split(/\s+/).filter(Boolean)] });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open(suffix = "#/revision", width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url(suffix));
  if (suffix.startsWith("#")) await page.locator('[data-revision-access-loading]').waitFor({state:'detached'});
  return { page, errors };
}
async function navigate(page, route, heading) {
  await page.evaluate(route => { location.hash = `#/revision${route}`; }, route);
  if (heading) await page.getByRole('heading', { name: heading, exact: true }).waitFor();
}
function ratio(a, b) {
  const luminance = color => {
    const values = color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return values[0]*.2126+values[1]*.7152+values[2]*.0722;
  };
  const x=luminance(a), y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

browserTest("Revision stays light on a dark device, including selected controls and portals", async () => {
  const { page, errors } = await open();
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(()=> { document.documentElement.dataset.theme='dark'; document.documentElement.classList.add('dark'); });
  await navigate(page, '/profile', "Learner's plan");
  const colors = await page.locator('[data-recall-root]').evaluate(el=>({theme:el.dataset.recallTheme, bg:getComputedStyle(el).backgroundColor, fg:getComputedStyle(el).color, scheme:getComputedStyle(el).colorScheme}));
  assert.equal(colors.theme,'light'); assert.equal(colors.scheme,'light');
  assert.ok(ratio(colors.fg,colors.bg)>7);
  for(const route of ['/ai-settings','/bulk-import']) {
    await navigate(page,route,route==='/ai-settings'?'AI Configuration':'Bulk Import');
    for(const element of await page.locator('.bg-primary-soft').all()) {
      const c=await element.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}));
      assert.ok(ratio(c.fg,c.bg)>4.5, `${route}: ${JSON.stringify(c)}`);
    }
  }
  await page.keyboard.press('Control+n');
  const dialog=page.getByRole('dialog'); await dialog.waitFor();
  const dc=await dialog.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color,scheme:getComputedStyle(el).colorScheme}));
  assert.equal(dc.scheme,'light'); assert.ok(ratio(dc.fg,dc.bg)>7);
  assert.deepEqual(errors,[]); await page.close();
});

browserTest("deck clicks, UUID deep links, reload and Back/Forward keep URL and Recall view together", async () => {
  const {page, errors}=await open();
  await page.locator('[data-revision-deck-card]').click();
  await page.waitForURL(/#\/revision\/decks\/deck-uuid-123$/);
  await page.getByRole('heading',{name:'Browser regression deck',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Revision pages'}).getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  await page.goBack(); await page.getByRole('heading',{name:'Browser regression deck',exact:true}).waitFor();
  await page.reload(); await page.getByRole('heading',{name:'Browser regression deck',exact:true}).waitFor();
  await page.goForward(); await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  assert.deepEqual(errors,[]); await page.close();
});

browserTest("all Revision subpages and invalid session links show content rather than a blank page", async () => {
  const {page,errors}=await open();
  const destinations = [
    ['/decks','My Decks'], ['/browser','Card Browser'], ['/tags','Tags'], ['/stats','Statistics'],
    ['/settings','Settings'], ['/import-hub','Import Decks'], ['/bank','Test Bank'],
    ['/weak-topics','Weak Topics'], ['/progress','Progress'], ['/profile',"Learner's plan"],
    ['/ai-settings','AI Configuration'], ['/ai-generate','AI Revision Generator'], ['/bulk-import','Bulk Import'],
    ['/study','No active session'], ['/test/result/999999','Result'], ['/session/999999/result','Revision Results'],
    ['/decks/missing-uuid','Deck not found'],
  ];
  for(const [route,heading] of destinations) {
    await navigate(page,route,heading);
    assert.equal(await page.locator('[data-recall-root]').getAttribute('data-recall-theme'),'light');
    if(route!='/study') assert.equal(await page.locator('[data-site-footer-nav]').count(),1,route);
  }
  assert.deepEqual(errors,[]); await page.close();
});

browserTest("Revision uses the Home dock without inheriting Recall sizing, on phone and tablet", async () => {
  for(const width of [390,820]) for(const style of ['uiverse','glass-dock']) {
    const {page}=await open('?fixture=home',width);
    await page.evaluate(style=>{localStorage.setItem('dc-footer-navigation-style',style);dispatchEvent(new Event('dc:footer-navigation-style-change'));},style);
    const measure = () => page.locator('[data-site-footer]').last().evaluate(el=> {
      const c=getComputedStyle(el), rect=el.getBoundingClientRect();
      const button=el.querySelector('button'), b=getComputedStyle(button);
      return { width:Math.round(rect.width),height:Math.round(rect.height),radius:c.borderRadius,font:b.fontSize,minHeight:b.minHeight };
    });
    await page.locator('[data-site-footer]').last().waitFor();
    // Let the dock spring settle; this measures the same default state, not a hover frame.
    await page.waitForTimeout(300); const home=await measure();
    await page.goto(url('#/revision/ai-generate')); await page.getByRole('heading',{name:'AI Revision Generator',exact:true}).waitFor();
    await page.waitForTimeout(300);
    assert.deepEqual(await measure(),home,`${width}/${style}`);
    assert.equal(await page.locator('[data-site-footer-nav]').count(),1);
    assert.equal(await page.locator('[data-recall-root] [data-site-footer-nav]').count(),0);
    const bounds=await page.locator('[data-site-footer]').last().boundingBox(); assert.ok(bounds.y+bounds.height<=845);
    await page.close();
  }
});

browserTest("both landing Install PWA labels stay black in light and dark host themes", async () => {
  const {page}=await open('?fixture=landing');
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
    const labels=page.getByText('⬇️ Install the PWA',{exact:true});
    assert.equal(await labels.count(),2);
    for(const label of await labels.all()) assert.equal(await label.evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 0)');
  }
  await page.close();
});

browserTest("failed brand sources terminate at a fallback, and one reconnect permits a retry", async () => {
  const page=await browser.newPage();const requests=[];
  await page.route('**/missing-*.png', route=> {requests.push(route.request().url());return route.abort();});
  await page.goto(url('?fixture=image'));
  await page.getByText('Image fallback',{exact:true}).waitFor();
  assert.equal(requests.length,2); assert.equal(await page.locator('img').count(),0);
  await page.evaluate(()=>dispatchEvent(new Event('online')));
  await page.getByText('Image fallback',{exact:true}).waitFor();
  assert.equal(requests.length,4);
  await page.close();
});
