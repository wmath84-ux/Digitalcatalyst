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
const fixture = "/tests/fixtures/accountMinimalHarness/index.html";
const productPath = "/tests/fixtures/accountMinimalHarness/products.ts";
const state = `const params=new URLSearchParams(location.search);const record=value=>{document.querySelector('output').textContent=value;};`;
const usage = `const unknown=params.has('quotaUnknown');const exhausted=params.has('exhausted');const unlimited=params.has('unlimited');const snapshot={planId:unlimited?'pro':'free',planName:unlimited?'Pro':'Free',cycle:'monthly',dailyUsed:exhausted?10:7,dailyLimit:10,dailyRemaining:exhausted?0:3,dailyUnlimited:unlimited,dailyResetsAt:Date.now()+3600000,windowHours:6,windowUsed:2,windowLimit:5,windowRemaining:3,windowUnlimited:unlimited,windowResetsAt:Date.now()+7200000,tokensEnabled:params.has('tokens'),tokensUsedDay:3500,dailyTokenBudget:10000,tokensRemaining:6500,tokensUnlimited:unlimited,tokensResetsAt:Date.now()+3600000,costEnabled:params.has('cost'),costUsedMicros:100000,costBudgetMicros:1000000,costRemainingMicros:900000,costUnlimited:unlimited,termEndsAt:Date.now()+86400000*7,allowed:!exhausted,blockedReason:exhausted?'Daily allowance used up. Wait for reset.':null};`;
const stubs = {
  AuthContext: `${state} export const useAuth=()=>({user:{id:'fixture',name:'Ananya Sharma',email:'account@example.test',role:'student'},logout:async()=>{}});`,
  CatalogContext: `import {products as all} from '${productPath}';${state}export const useCatalog=()=>({products:params.has('empty')?[]:all,purchasedIds:new Set(['full','book']),loading:params.has('loading'),error:null});`,
  CommerceContext: `export const useCommerce=()=>({cartIds:new Set(['full']),favoriteIds:new Set(['book'])});`,
  BrandingContext: `export const useBranding=()=>({appName:'Digital Catalyst',logoUrl:'',homeGradientFrom:'#4f46e5',homeGradientTo:'#7c3aed'});`,
  useUnreadNotificationCount: `export const useUnreadNotificationCount=()=>0;`,
  useOwnedProducts: "",
  useCourseAccess: `${state}export const useOwnedProducts=()=>({ownedProductIds:params.has('empty')||params.has('loading')?[]:['full','plan','book'],accessibleProductIds:params.has('empty')||params.has('loading')?[]:['full','partial','plan','book'],permanentProductIds:['full','book'],signedIn:true,loading:params.has('loading')});export const useCourseAccess=({product})=>{const partial=product.id==='partial';const plan=product.id==='plan';return{loading:false,hasActiveSubscription:plan,subscription:plan?{expiresAt:Date.now()+86400000*7}:null,resolution:{hasFullProductAccess:!partial,ownedModuleIds:new Set(partial?['m1','m2']:[]),ownedResourceIds:new Set(partial?['r1']:[]),ownedUpdateIds:new Set(),accessibleModuleIds:new Set(partial?['m1','m2']:[]),accessibleResourceIds:new Set(partial?['r1']:[])}};};`,
  useMyDayAccess: `${state}const unknown=params.has('quotaUnknown');const exhausted=params.has('exhausted');const unlimited=params.has('unlimited');export const useMyDayAccess=()=>({unlimited,canCreate:!exhausted,freeLimit:3,freeUsed:exhausted?3:2,freeRemaining:exhausted?0:1,resetAt:Date.now()+3600000,loading:false,error:unknown?'Server unavailable':null,uid:'fixture',access:{dayKey:unknown?'':'2026-10-09'},refresh:async()=>record('myday-refresh')});`,
  aiUsage: `${state}${usage}export const emptyUsage=()=>({lastUsage:null,updatedAt:0});export const subscribeAiUsage=(_uid,callback)=>{callback({lastUsage:null,updatedAt:0},{exists:!unknown});return()=>{};};export const computeUsageSnapshot=()=>snapshot;export const refreshAiUsageStatus=async()=>{record('ai-refresh');if(unknown)throw Error('Server unavailable');return snapshot;};`,
  catalogService: `export const fetchRemoteCatalog=async()=>null;`,
  webPush: `export const ensureSavedWebPushSubscription=async()=>{};export const subscribeToWebPush=async()=>{};`,
  firebase: `export const db={};export const auth={currentUser:{getIdToken:async()=> 'fixture'}};`,
  apiBase: `${state}let tokens=[{tokenId:'fixture-browser',label:'Chrome on laptop',status:'active',scopes:['notes:create'],lastUsedAt:Date.now()-60000,createdAt:Date.now()-86400000,expiresAt:Date.now()+86400000}];export const apiFetch=async(_url,options)=>{const body=JSON.parse(options.body);if(params.has('clipperError'))return{ok:false,status:503,json:async()=>({ok:false,error:'Browser connections unavailable'})};if(body.action==='joplin.clipper.status')return{ok:true,json:async()=>({ok:true,tokens})};if(body.action==='joplin.clipper.pair.start'){record('pair');return{ok:true,json:async()=>({ok:true,code:'529106',expiresAt:Date.now()+(params.has('expiredCode')?-60000:600000)})};}if(body.action==='joplin.clipper.revoke'){record('disconnect');tokens=body.all?[]:tokens.filter(token=>token.tokenId!==body.tokenId);return{ok:true,json:async()=>({ok:true})};}return{ok:false,status:400,json:async()=>({error:'Unknown action'})};};`,
};
let server, browser, origin;
before(async()=>{
  if(!enabled)return;
  server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':path.resolve('src')}},plugins:[react(),tailwindcss(),{name:'account-fixture-services',enforce:'pre',resolveId(id){const name=id.split('/').at(-1);if(Object.hasOwn(stubs,name))return '\0account-fixture:'+name;},load(id){if(id.startsWith('\0account-fixture:'))return stubs[id.slice('\0account-fixture:'.length)];}}],server:{host:'0.0.0.0',allowedHosts:true,port:0},logLevel:'error'});
  await server.listen();origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
});
after(async()=>{await browser?.close();await server?.close();});
const check=(name,fn)=>test(name,{timeout:180000},async(t)=>{if(!enabled)return t.skip('Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH');await fn();});
async function open(query='page=profile',width=390){const page=await browser.newPage({viewport:{width,height:1000},hasTouch:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`${origin}${fixture}?${query}`);await page.locator(query.includes('page=usage')?'[data-usage-limits-layout]':query.includes('page=purchases')?'[data-purchases-page]':'[data-account-profile]').waitFor();await page.evaluate(()=>document.fonts.ready);return{page,errors};}
async function capture(page,name){if(!process.env.ACCOUNT_SCREENSHOT_DIR)return;fs.mkdirSync(process.env.ACCOUNT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ACCOUNT_SCREENSHOT_DIR,name),fullPage:true});}

check('Profile, My Purchases and Usage Limits are bounded, readable and free of nested cards',async()=>{
  for(const name of ['profile','purchases','usage']){
    const{page,errors}=await open(`page=${name}`);
    for(const width of [320,350,390,520,768,1024,1440]){
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: overflow at ${width}`);
      const content=page.locator(name==='profile'?'[data-account-profile]':name==='purchases'?'[data-purchases-page]':'[data-usage-limits-layout]');
      assert.equal(await content.locator('.dc-glass-card, .dc-scene-plate, .dc-profile-subpanel').count(),0,`${name}: no nested cards`);
      const heading=await content.locator('h1').evaluate(node=>({size:parseFloat(getComputedStyle(node).fontSize),weight:Number(getComputedStyle(node).fontWeight)}));
      assert.ok(heading.size>=24&&heading.weight>=700,`${name}: readable title`);
    }
    await capture(page,`${name}-desktop.png`);await page.setViewportSize({width:390,height:1000});await capture(page,`${name}-mobile.png`);
    assert.deepEqual(errors,[]);await page.close();
  }
});

check('Profile retains plan, expiry, manual renewal, feature access and reminder controls without duplicate actions',async()=>{
  const{page,errors}=await open();
  assert.equal(await page.locator('[data-profile-plan-label]').count(),1);
  assert.equal(await page.locator('[data-profile-membership-status]').textContent(),'Active');
  assert.match(await page.locator('[data-profile-membership-details]').textContent(),/Billing cycleMonthly/);
  assert.match(await page.locator('[data-member-test-bank-capacity]').textContent(),/Unlimited saved tests/);
  assert.match(await page.locator('[data-renewal-card]').textContent(),/Renewal is manual/);
  assert.equal(await page.locator('[data-member-renew]').count(),1);
  await page.locator('[data-member-renew]').click();assert.equal(await page.locator('output').textContent(),'renew');
  await page.locator('[data-member-change-plan]').click();assert.equal(await page.locator('output').textContent(),'plans');
  await page.locator('[data-renewal-reminder-toggle]').click();assert.equal(await page.locator('[data-renewal-reminder-toggle]').getAttribute('aria-pressed'),'false');
  await page.locator('[data-member-features] summary').click();await page.locator('[data-profile-membership-feature="myday"]').click();assert.equal(await page.locator('output').textContent(),'feature:myday');
  await page.locator('[data-profile-membership-courses] summary').click();await page.getByRole('button',{name:'Physics through your plan',exact:true}).click();assert.equal(await page.locator('output').textContent(),'course:plan');
  await page.locator('[data-profile-usage-limits-link]').click();assert.equal(await page.locator('output').textContent(),'limits');
  await page.locator('[data-profile-study-library]').click();assert.equal(await page.locator('output').textContent(),'study-library');
  assert.equal(await page.locator('[data-profile-open-dashboard]').count(),0);
  assert.deepEqual(errors,[]);await page.close();
});

check('Free and expired profiles keep honest access information and referral-use rules',async()=>{
  for(const mode of ['free','expired']){
    const{page,errors}=await open(`page=profile&${mode}&usedReferral`,320);
    if(mode==='free'){assert.equal(await page.locator('[data-profile-plan-label]').textContent(),'Free Plan');assert.equal(await page.locator('[data-member-renew]').count(),0);}
    else{assert.equal(await page.locator('[data-profile-membership-status]').textContent(),'Expired');assert.match(await page.locator('[data-renewal-card]').textContent(),/Saved work is retained/);}
    await page.locator('[data-profile-referral-card] summary').click();
    assert.ok(await page.getByRole('button',{name:'Copy',exact:true}).isDisabled());assert.match(await page.locator('[data-profile-referral-card]').textContent(),/cannot be used again/);
    assert.deepEqual(errors,[]);await page.close();
  }
});

check('Profile photo fallback, editing, validation and failed-save recovery still work',async()=>{
  const{page,errors}=await open('page=profile&brokenPhoto');
  await page.locator('[data-profile-photo-fallback]').waitFor();await page.locator('[data-profile-photo-upload]').click();assert.equal(await page.locator('output').textContent(),'photo');
  await page.locator('[data-profile-edit]').click();
  await page.getByLabel('Full name',{exact:true}).fill('A');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').textContent(),/full name/);
  await page.getByLabel('Full name',{exact:true}).fill('Aditi Sharma');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-profile-hero] h2').textContent==='Aditi Sharma');
  assert.equal(await page.locator('output').textContent(),'profile-saved');assert.deepEqual(errors,[]);await page.close();
  const failed=await open('page=profile&saveError');await failed.page.locator('[data-profile-edit]').click();await failed.page.getByRole('button',{name:'Save Changes',exact:true}).click();await failed.page.getByRole('alert').waitFor();assert.match(await failed.page.getByRole('alert').textContent(),/retry/);assert.ok(await failed.page.getByRole('button',{name:'Save Changes',exact:true}).isEnabled());assert.deepEqual(failed.errors,[]);await failed.page.close();
});

check('Purchases show partial and plan access accurately, and each entry has only one open action',async()=>{
  const{page,errors}=await open('page=purchases',320);
  assert.equal(await page.locator('[data-purchase-entry]').count(),4);
  assert.equal(await page.locator('[data-purchase-access]').count(),4);
  assert.match(await page.locator('[data-purchase-entry="partial"]').textContent(),/2 modules · 1 resource/);
  assert.match(await page.locator('[data-purchase-entry="partial"]').textContent(),/Only your purchased content/);
  assert.match(await page.locator('[data-purchase-entry="plan"]').textContent(),/Plan access · Ends/);
  assert.equal(await page.getByText(/Lifetime access/).count(),0);
  await page.locator('[data-purchase-access="partial"]').click();assert.equal(await page.locator('output').textContent(),'course:partial');
  await page.getByRole('searchbox',{name:'Search purchases',exact:true}).fill('no match');assert.equal(await page.getByRole('heading',{name:'No matches',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Clear search',exact:true}).count(),1);
  await page.getByRole('button',{name:'Clear search',exact:true}).click();assert.equal(await page.locator('[data-purchase-entry]').count(),4);
  assert.deepEqual(errors,[]);await page.close();
  const empty=await open('page=purchases&empty');assert.equal(await empty.page.getByRole('heading',{name:'No purchases yet',exact:true}).count(),1);await empty.page.getByRole('button',{name:'Browse Store',exact:true}).click();assert.equal(await empty.page.evaluate(()=>location.hash),'#/store');await empty.page.close();
  const loading=await open('page=purchases&loading');assert.equal(await loading.page.getByRole('heading',{name:'No purchases yet',exact:true}).count(),0);assert.match(await loading.page.getByRole('status').last().textContent(),/Loading/);await loading.page.close();
});

check('Usage displays real used, remaining, reset and blocking rules, including unverified and unlimited states',async()=>{
  const{page,errors}=await open('page=usage',320);
  assert.match(await page.locator('[data-myday-allowance-card]').textContent(),/1 left/);assert.match(await page.locator('[data-myday-allowance-card]').textContent(),/Used 2 · Limit 3/);
  assert.match(await page.locator('[data-ai-quota-card]').textContent(),/Used 7 · Limit 10/);assert.match(await page.locator('[data-ai-quota-card]').textContent(),/6-hour safety window/);assert.ok(await page.locator('[data-usage-reset]').count()>=2);
  assert.equal(await page.getByRole('button',{name:'Compare plans',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Go unlimited',exact:true}).count(),0);
  await page.locator('[data-myday-allowance-refresh]').click();assert.equal(await page.locator('output').textContent(),'myday-refresh');await page.locator('[data-myday-allowance-open]').click();assert.equal(await page.evaluate(()=>location.hash),'#/my-day');
  assert.deepEqual(errors,[]);await page.close();
  for(const mode of ['quotaUnknown','exhausted','unlimited','tokens&cost']){
    const current=await open(`page=usage&${mode}`,350);
    const ai=current.page.locator('[data-ai-quota-card]');
    if(mode==='quotaUnknown'){await ai.getByRole('alert').waitFor();assert.equal(await ai.locator('[data-usage-used]').count(),0);assert.equal(await current.page.locator('[data-myday-allowance-card] [data-usage-used]').count(),0);}
    if(mode==='exhausted'){assert.match(await ai.textContent(),/Paused/);assert.match(await ai.textContent(),/Daily allowance used up/);}
    if(mode==='unlimited'){assert.match(await ai.textContent(),/Unlimited/);assert.equal(await ai.locator('progress').count(),0);}
    if(mode==='tokens&cost'){assert.match(await ai.textContent(),/Tokens today/);assert.match(await ai.textContent(),/6,500 left/);assert.match(await ai.textContent(),/Model budget \(USD\)/);assert.match(await ai.textContent(),/Term ends/);}
    assert.deepEqual(current.errors,[]);await current.page.close();
  }
});

check('Web Clipper keeps pairing expiry and browser revocation while staying in a concise disclosure',async()=>{
  const{page,errors}=await open('page=usage',390);
  await page.locator('[data-usage-clipper] summary').click();await page.getByRole('button',{name:'Pair a browser',exact:true}).click();await page.locator('[data-web-clipper-code]').waitFor();assert.match(await page.locator('[data-web-clipper-code]').textContent(),/Single use · Expires/);
  await page.getByRole('button',{name:'Disconnect Chrome on laptop',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-web-clipper-tokens]').textContent.includes('No connected browsers'));
  assert.deepEqual(errors,[]);await page.close();
  const expired=await open('page=usage&expiredCode');await expired.page.locator('[data-usage-clipper] summary').click();await expired.page.getByRole('button',{name:'Pair a browser',exact:true}).click();assert.ok(await expired.page.getByRole('button',{name:'Copy pairing code',exact:true}).isDisabled());assert.match(await expired.page.locator('[data-web-clipper-code]').textContent(),/Expired/);assert.deepEqual(expired.errors,[]);await expired.page.close();
});
