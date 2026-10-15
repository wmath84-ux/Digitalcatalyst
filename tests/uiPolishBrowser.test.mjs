import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { chromium } from 'playwright';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
const stubs = {
 AuthContext: `export const useAuth=()=>({user:null,logout:async()=>{}});`,
 BrandingContext: `export const useBranding=()=>({appName:'Eduvora',logoUrl:'',homeGradientFrom:'#004ac6',homeGradientTo:'#3768cf'});`,
 CommerceContext: `export const useCommerce=()=>({cartIds:new Set(),favoriteIds:new Set()});`,
 CatalogContext: `export const useCatalog=()=>({products:[],purchasedIds:new Set()});`,
 FeatureVisibilityContext: `export const useFeatureVisibilityMap=()=>({});`,
 useUnreadNotificationCount: `export const useUnreadNotificationCount=()=>0;`,
};
let server, browser, origin;
before(async()=>{
 if(!enabled) return;
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':path.resolve('src')}},plugins:[react(),tailwind(),{name:'fixture-io',enforce:'pre',resolveId(id){const key=id.split('/').at(-1);if(key in stubs)return '\0fixture:'+key;},load(id){if(id.startsWith('\0fixture:'))return stubs[id.slice(9)];}}],server:{host:'0.0.0.0',allowedHosts:true,port:0},logLevel:'error'});
 await server.listen(); origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
});
after(async()=>{await browser?.close();await server?.close();});
const check=(name,fn)=>test(name,{timeout:90000},async t=>{if(!enabled)return t.skip('Chromium required');await fn();});
async function open(query='',width=390){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/tests/fixtures/uiPolishHarness/index.html?'+query);
 try{await page.locator('[data-app-frame],[data-desktop-shell]').first().waitFor({timeout:20000});}catch(e){throw new Error(errors.join('\n')||await page.content());}
 return page;
}
check('app marks are 42px and page names are 27px across phone and tablet headers',async()=>{
 for(const width of [320,390,768]){
  const page=await open('',width);
  for(const selector of ['[data-site-header] h1','[data-home-greeting]']) assert.equal(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).fontSize),'27px',`${width}/${selector}`);
  for(const selector of ['[data-header-app-icon]','[data-home-logo] img']){if(await page.locator(selector).count())assert.equal(await page.locator(selector).first().evaluate(el=>el.getBoundingClientRect().width),42);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.close();
 }
});
check('only the large branded Upgrade action remains in desktop/tablet topbar',async()=>{
 for(const width of [960,1440]){
  const page=await open('desktop',width);
  assert.equal(await page.locator('[data-desktop-topbar] [aria-label="Subscription"]').count(),0);
  assert.equal(await page.locator('[data-header-upgrade]').count(),1);
  assert.equal(await page.locator('[data-header-upgrade]').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
  assert.ok(await page.locator('[data-desktop-page-title]').evaluate(el=>el.getBoundingClientRect().width>60),'page title remains visible');
  assert.match(await page.locator('[data-header-upgrade]').evaluate(el=>getComputedStyle(el).backgroundImage),/0, 74, 198/);
  assert.equal(await page.locator('[data-desktop-page-title]').evaluate(el=>getComputedStyle(el).fontSize),'27px');
  assert.equal(await page.locator('[data-header-app-icon]').evaluate(el=>el.getBoundingClientRect().width),42);
  if(process.env.UI_POLISH_SCREENSHOTS && width===1440){await page.screenshot({path:path.join(process.env.UI_POLISH_SCREENSHOTS,'desktop.png'),fullPage:true});}
  await page.locator('[data-header-upgrade]').click();assert.equal(await page.evaluate(()=>location.hash),'#/subscription');
  await page.close();
 }
});
check('Home and Store cards have identical presentation at equal widths in light and dark',async()=>{
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  const page=await open(width>=960?'desktop':'',width);
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForTimeout(500);
  await page.locator('[data-home-grid],[data-store-grid]').evaluateAll(els=>els.forEach(el=>{el.style.setProperty('width','300px','important');el.style.setProperty('grid-template-columns','300px','important');}));
  const selectors=['.dc-marketplace-card','.dc-marketplace-open','.dc-marketplace-cover','.dc-marketplace-copy','.dc-marketplace-copy h3','.dc-marketplace-card-actions','.dc-marketplace-price strong','.dc-marketplace-buy'];
  const props=['display','flexDirection','gridTemplateColumns','aspectRatio','padding','fontSize','lineHeight','borderRadius','color','backgroundColor','boxShadow'];
  for(const selector of selectors){
   const read=async root=>page.locator(root+' '+selector).first().evaluate((el,props)=>{const css=getComputedStyle(el);return Object.fromEntries(props.map(p=>[p,css[p]]));},props);
   assert.deepEqual(await read('[data-store-grid]'),await read('[data-home-grid]'),`${width}/${theme} ${selector}`);
  }
  await page.close();
 }
});
check('long notes/maps grow rows, keep actions reachable and never overlap their siblings',async()=>{
 for(const width of [240,320,768]){
  const page=await open('library',width);
  const result=await page.locator('[data-branched-leaf]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),label=el.querySelector('.branched-menu__label').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,labelBottom:label.bottom,labelTop:label.top,labelWidth:label.width,width:r.width,text:el.textContent.slice(0,60),style:el.querySelector('.branched-menu__label').getAttribute('style'),whiteSpace:getComputedStyle(el.querySelector('.branched-menu__label')).whiteSpace,display:getComputedStyle(el.querySelector('.branched-menu__label')).display};}));
  assert.ok(result[0].height>60,JSON.stringify({width,result}));assert.ok(result[0].bottom<=result[1].top);for(const row of result){assert.ok(row.labelTop>=row.top);assert.ok(row.labelBottom<=row.bottom);}
  assert.equal(await page.locator('[data-course-library-module]').evaluate(el=>getComputedStyle(el).fontWeight),'900');
  if(process.env.UI_POLISH_SCREENSHOTS && width===320){await page.screenshot({path:path.join(process.env.UI_POLISH_SCREENSHOTS,'library.png'),fullPage:true});}
  await page.close();
 }
});
check('Brain library uses clean auto-height Read rows in narrow player panes',async()=>{
 const page=await open('brain',320);const row=page.locator('[data-brain-library-row]');await row.waitFor();
 assert.equal(await row.evaluate(el=>getComputedStyle(el).boxShadow),'none');
 const bounds=await row.evaluate(el=>{const r=el.getBoundingClientRect();const t=el.querySelector('[data-brain-library-title]').getBoundingClientRect();return{bottom:r.bottom,titleBottom:t.bottom};});assert.ok(bounds.titleBottom<=bounds.bottom);
 if(process.env.UI_POLISH_SCREENSHOTS){await page.screenshot({path:path.join(process.env.UI_POLISH_SCREENSHOTS,'brain.png'),fullPage:true});}
 await page.close();
});

check('phone Home search is exactly 10px shorter and hero shadow is restrained',async()=>{
 const page=await open('',390);
 const input=page.locator('[data-home-search-slot] .dc-scene-field');
 const compact=await input.evaluate(el=>el.getBoundingClientRect().height);
 await input.locator('.relative.flex').evaluate(el=>el.style.paddingBlock='8px');
 const previous=await input.evaluate(el=>el.getBoundingClientRect().height);
 assert.equal(previous-compact,10);
 await input.locator('.relative.flex').evaluate(el=>el.style.paddingBlock='');
 const shadow=await page.locator('.dc-home-hero-module > .dc-scene-plate').evaluate(el=>getComputedStyle(el).boxShadow);
 assert.match(shadow,/0\.28/);
 if(process.env.UI_POLISH_SCREENSHOTS){await page.screenshot({path:path.join(process.env.UI_POLISH_SCREENSHOTS,'phone.png'),fullPage:true});}
 await page.close();
});
