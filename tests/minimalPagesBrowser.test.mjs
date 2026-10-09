import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
let server, browser, origin;
const ai = { planId: "free", planName: "Free learner", cycle: "monthly", dailyLimit: 10, dailyUsed: 2, dailyRemaining: 8, dailyUnlimited: false, dailyResetsAt: Date.now() + 3600000, windowHours: 24, windowLimit: 20, windowUsed: 2, windowRemaining: 18, windowUnlimited: false, windowResetsAt: Date.now() + 3600000, tokensEnabled: true, dailyTokenBudget: 10000, tokensUsedDay: 2000, tokensRemaining: 8000, tokensUnlimited: false, tokensResetsAt: Date.now() + 3600000, allowed: true };
const stubs = {
  AuthContext: `export const useAuth = () => ({user:{id:'fixture', email:'learner@example.test'}});`,
  CommerceContext: `export const useCommerce = () => ({cartIds:new Set()});`,
  CatalogContext: `export const useCatalog = () => ({purchasedIds:new Set(),products:[]});`,
  BrandingContext: `export const useBranding = () => ({appName:'Digital Catalyst'});`,
  useCourseAccess: `export const useCourseAccess = () => ({resolution:{hasFullProductAccess:false,ownedUpdateIds:new Set(),ownedModuleIds:new Set(),ownedResourceIds:new Set()}});`,
  useProductReviews: `export const useHomepageProductReviews = () => ({reviews:[]}); export const usePublishedProductReviews = () => ({reviews:[{id:'review',productId:'long',rating:5,comment:'Clear and practical lessons.',name:'Learner',createdAtMs:Date.now()}]});`,
  useMyDayAccess: `export const useMyDayAccess = () => ({unlimited:false,canCreate:true,freeLimit:5,freeUsed:2,freeRemaining:3,resetAt:Date.now()+3600000,loading:false,error:null,uid:'fixture',access:{dayKey:'fixture'},refresh:async()=>{}});`,
  catalogService: `export const fetchRemoteCatalog = async () => ({});`,
  aiUsage: `const snap=${JSON.stringify(ai)}; export const emptyUsage = () => ({}); export const computeUsageSnapshot = () => snap; export const refreshAiUsageStatus = async () => snap; export const subscribeAiUsage = (uid,cb) => {cb({}, {exists:true});return ()=>{};};`,
  apiBase: `import {products} from '/tests/fixtures/collectionCardsHarness/products.ts';export const apiFetch=async(url,options)=>{if(!url.includes('quotes'))return{ok:true,json:async()=>({ok:true,tokens:[]})};const s=JSON.parse(options.body).selection;const p=products.find(p=>s.productIds.includes(p.id))||products[1];return{ok:true,json:async()=>({ok:true,quote:{quoteId:'quote-fixture',uid:'fixture',purchaseKind:s.purchaseKind,verifiedLineItems:[],regularSubtotal:p.price*100,saleDiscount:0,couponDiscount:0,cashPayable:p.price*100,minimumPayable:0,currency:'INR',expiresAt:Date.now()+900000,status:'active',couponCode:null}})};};`,
  firebase: `export const auth = {currentUser:{getIdToken:async()=> 'fixture'}}; export const db={};`,
  Header: `export default () => null;`,
  BottomNav: `export default () => null;`,
};
before(async () => {
  if (!enabled) return;
  server = await createServer({ configFile: false, root:process.cwd(), resolve:{alias:{'@':path.resolve('src')}}, plugins:[react(),tailwindcss(),{
    name:'minimal-fixture-data', enforce:'pre',
    resolveId(id) { const name = id.split('/').at(-1); if (stubs[name] && id !== 'firebase/firestore') return `\0fixture:${name}`; },
    load(id) { if (id.startsWith('\0fixture:')) return stubs[id.slice(9)]; },
  }],server:{host:'127.0.0.1',port:0},logLevel:'error' });
  await server.listen(); origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
});
after(async()=>{await browser?.close();await server?.close();});
const check = (name, fn) => test(name,{timeout:120000},async t=>{if(!enabled)return t.skip('Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to Chromium');await fn();});
async function open(name){const page=await browser.newPage();page.on('pageerror',e=>console.error('PAGE ERROR',e.message));await page.goto(`${origin}/tests/fixtures/minimalPagesHarness/index.html?page=${name}`);await page.locator(name==='usage'?'[data-ai-quota-card]':name==='pdp'?'[data-pdp-root]':'[data-subscription-member-view]').waitFor();return page;}
check('minimal pages render at mobile, portrait tablet, landscape tablet and desktop widths',async()=>{
 for(const name of ['usage','pdp','member']){
  const page=await open(name);
  for(const [width,height] of [[390,844],[768,1024],[820,1180],[1024,768],[1366,1024]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} at ${width}: page overflow`);
   if(name==='usage'){
    const styles=await page.locator('[data-ai-quota-card]').evaluate(el=>({radius:getComputedStyle(el).borderRadius,shadow:getComputedStyle(el).boxShadow,layers:[...el.children].filter(e=>e.hasAttribute('aria-hidden')).every(e=>getComputedStyle(e).display==='none')}));
    assert.deepEqual(styles,{radius:'0px',shadow:'none',layers:true});
   }
   if(name==='pdp') assert.equal(await page.locator('[data-pdp-reviews] > div[aria-hidden]').count(),0);
   if(name==='member') assert.equal(await page.locator('[data-important-membership]').count(),1);
  }
  if(process.env.MINIMAL_SCREENSHOT_DIR){fs.mkdirSync(process.env.MINIMAL_SCREENSHOT_DIR,{recursive:true});await page.setViewportSize({width:820,height:1180});await page.screenshot({path:path.join(process.env.MINIMAL_SCREENSHOT_DIR,`${name}.png`),fullPage:true});}
  await page.close();
 }
});
check('PDP tabs and purchase controls, usage navigation, and membership actions still work',async()=>{
 const pdp=await open('pdp');
 await pdp.getByRole('button',{name:'Content',exact:true}).click();
 assert.equal(await pdp.locator('[data-pdp-curriculum-module]').count(),1);
 await pdp.locator('[data-pdp-curriculum-module] button').first().click();
 await pdp.getByRole('button',{name:'About',exact:true}).click();
 assert.equal(await pdp.locator('[data-pdp-instructor]').count(),0,'the generic store brand is not repeated as a made-up instructor');
 await pdp.locator('[data-pdp-checkout], [data-pdp-cta-button]').click();assert.equal(await pdp.locator('output').textContent(),'checkout');
 await pdp.close();
 const usage=await open('usage');await usage.getByRole('button',{name:'Compare plans'}).click();assert.equal(await usage.evaluate(()=>location.hash),'#/subscription');await usage.close();
 const member=await open('member');await member.locator('[data-member-renew]').click();assert.equal(await member.locator('output').textContent(),'renew');await member.locator('[data-member-change-plan]').click();assert.equal(await member.locator('output').textContent(),'change');await member.close();
});
