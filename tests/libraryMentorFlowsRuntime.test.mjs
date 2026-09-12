import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");
const root = process.cwd();
const dir = path.join(root, "node_modules/.tmp-library-mentor-flows");
fs.mkdirSync(dir, { recursive: true });
const stub = path.join(dir, "boundary.mjs");
fs.writeFileSync(stub, `
export const auth = { currentUser: { uid: 'learner', getIdToken: async () => 'test-token' }, authStateReady: async () => {} };
export const calls = [];
export let response = () => Promise.resolve(new Response(JSON.stringify({ok:true,data:{answer:'test fixture'}})));
export function respond(fn) { response = fn; }
export function apiFetch(url, init) { calls.push({url, ...JSON.parse(init.body)}); return response(url, init); }
export async function fetchRemoteCatalog() { return null; }
export let database;
export function setDatabase(db) { database = db; }
export function adminDb() { return database; }
export async function requireFirebaseUser(req) {
  if (!req.__uid) throw Object.assign(new Error('unauthorized'), {statusCode:401});
  return {uid:req.__uid};
}
`);
await build({
  stdin: { contents: `export * from './src/ai/personalAiClient'; export * from './src/lib/personalCourseClient'; export {saveUserAiConfig, loadUserAiConfig} from './src/revision/engine/aiConfig';`, resolveDir: root, loader: "ts" },
  outfile: path.join(dir, "client.mjs"), bundle: true, platform: "node", format: "esm", logLevel: "silent",
  plugins: [{ name: "test-boundaries", setup(b) {
    b.onResolve({ filter: /(?:^|\/)firebase$|apiBase$|catalogService$/ }, () => ({ path: stub, external: true }));
  } }],
});
await build({ entryPoints:["api/_lib/personalCourse.ts"], outfile:path.join(dir,"server.mjs"), bundle:true, platform:"node", format:"esm", logLevel:"silent",
  plugins:[{name:"server-boundary",setup(b){ b.onResolve({filter:/firebaseAdmin\.js$/},()=>({path:stub,external:true})); }}],
});
const { handlePersonalCourse } = await import(pathToFileURL(path.join(dir,"server.mjs")));
const client = await import(pathToFileURL(path.join(dir, "client.mjs")));
const boundary = await import(pathToFileURL(stub));
const storage = new Map();
const oldStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) };
after(() => { globalThis.localStorage = oldStorage; fs.rmSync(dir, {recursive:true,force:true}); });
const config = { provider: "openai", apiKey: "test-own-key", model: "saved-model", baseUrl: "" };
const ask = () => client.askModuleAi({uid:"learner", question:"Explain force", courseContext:{productId:"physics"}});
const snapshot = {access:{entitled:true, allowedTypes:[]}, usage:{moduleCount:0,resourceCount:0}, modules:[],savedResources:[]};
const json = (body, status=200) => Promise.resolve(new Response(JSON.stringify(body), {status}));

test("Mentor uses Revision source and own-key model; re-reads changes without remount", async () => {
  boundary.respond(() => json({ok:true,data:{answer:"fixture"}}));
  client.saveUserAiConfig("learner", {source:"default",config});
  await ask();
  assert.equal(boundary.calls.at(-1).source,"default");
  assert.equal(boundary.calls.at(-1).config,undefined,"school never sends a copied key");
  client.saveUserAiConfig("learner", {source:"own",config});
  await ask();
  assert.equal(boundary.calls.at(-1).config.model,"saved-model");
  client.saveUserAiConfig("learner", {source:"own",config:{...config,model:"updated-model"}});
  await ask();
  assert.equal(boundary.calls.at(-1).config.model,"updated-model");
});
test("disabled, missing own config and different account never send a provider request", async () => {
  for (const [source, cfg, code] of [["offline",config,"AI_DISABLED"],["own",{...config,apiKey:""},"AI_NOT_CONFIGURED"]]) {
    client.saveUserAiConfig("learner",{source,config:cfg});
    const before = boundary.calls.length;
    await assert.rejects(ask(), error => error.code === code);
    assert.equal(boundary.calls.length,before);
  }
  await assert.rejects(client.askModuleAi({uid:"someone-else",question:"hi"}), e => e.code === "AUTH_REQUIRED");
});
test("Library loaded empty and populated snapshots are success, not generic failure", async () => {
  boundary.respond(() => json({ok:true,data:snapshot}));
  assert.deepEqual((await client.fetchPersonalCourseLibrary()).modules,[]);
  boundary.respond(() => json({ok:true,data:{...snapshot,modules:[{id:"m1",title:"Physics",resources:[]}]}}));
  assert.equal((await client.fetchPersonalCourseLibrary()).modules[0].id,"m1");
});
test("Library actual retry refetches after network failure; auth, permission and malformed data are distinct", async () => {
  boundary.respond(() => Promise.reject(new TypeError("network")));
  await assert.rejects(client.fetchPersonalCourseLibrary(), e => e.code === "NETWORK_ERROR" && e.retryable);
  const before = boundary.calls.length;
  boundary.respond(() => json({ok:true,data:snapshot}));
  await client.fetchPersonalCourseLibrary();
  assert.equal(boundary.calls.length,before+1);
  for (const status of [401,403]) {
    boundary.respond(() => json({ok:false,message:"sensitive internal URL"},status));
    await assert.rejects(client.fetchPersonalCourseLibrary(), e => e.status === status && !e.message.includes("sensitive"));
  }
  boundary.respond(() => json({ok:true,data:{modules:[]}}));
  await assert.rejects(client.fetchPersonalCourseLibrary(),e => e.code === "MALFORMED_SNAPSHOT");
});
test("Library infrastructure declares the exact collection-group owner index used by reads and transactions", () => {
  const config = JSON.parse(fs.readFileSync("firebase.json"));
  const indexes = JSON.parse(fs.readFileSync(config.firestore.indexes));
  assert.ok(indexes.fieldOverrides.some(f => f.collectionGroup === "resources" && f.fieldPath === "ownerUid" && f.indexes.some(i => i.queryScope === "COLLECTION_GROUP" && i.order === "ASCENDING")));
});

function libraryDb(rows, queryError) {
  const doc = p => ({
    path:p, id:p.split("/").at(-1),
    get parent() { const parentPath=p.split("/").slice(0,-1).join("/"); return {parent:doc(parentPath.split("/").slice(0,-1).join("/"))}; },
    collection:name=>collection(`${p}/${name}`),
    get:async()=>({id:p.split("/").at(-1),ref:doc(p),exists:rows.has(p),data:()=>rows.get(p)}),
  });
  const collection = p => ({ doc:id=>doc(`${p}/${id}`), limit(){return this;},
    get:async()=>({docs:await Promise.all([...rows.keys()].filter(k=>k.startsWith(`${p}/`) && k.split("/").length===p.split("/").length+1).map(k=>doc(k).get()))}),
  });
  return {collection,collectionGroup(name){
    assert.equal(name,"resources");
    return {where(field,op,uid){
      assert.equal(field,"ownerUid");assert.equal(op,"==");assert.equal(uid,"learner");
      return {limit(){return this;},async get(){
        if(queryError) throw queryError;
        return {docs:await Promise.all([...rows.keys()].filter(k=>k.includes("/resources/") && rows.get(k).ownerUid===uid).map(k=>doc(k).get()))};
      }};
    }};
  }};
}
async function loadServerLibrary(uid="learner") {
  let result;
  const res={status(status){this.statusCode=status;return this;},json(body){result={status:this.statusCode,body};return this;}};
  await handlePersonalCourse({method:"POST",__uid:uid,body:{action:"personalCourse.library"}},res);
  return result;
}
test("Library real handler queries verified owner, maps module/saved rows and returns loaded-empty", async () => {
  const rows=new Map();
  boundary.setDatabase(libraryDb(rows));
  const empty=await loadServerLibrary();
  assert.equal(empty.status,200);
  assert.deepEqual(empty.body.data.modules,[]);
  assert.deepEqual(empty.body.data.savedResources,[]);
  rows.set("users/learner/personalCourseModules/m1",{title:"Physics"});
  rows.set("users/learner/personalCourseModules/saved",{system:true,kind:"saved"});
  rows.set("users/learner/personalCourseModules/m1/resources/r1",{ownerUid:"learner",name:"Lecture",type:"pdf"});
  rows.set("users/learner/personalCourseModules/saved/resources/r2",{ownerUid:"learner",name:"Read later",type:"pdf"});
  // A collection-group match at any other path must not escape owner hierarchy.
  rows.set("users/other/personalCourseModules/m1/resources/r3",{ownerUid:"learner",name:"Foreign",type:"pdf"});
  const loaded=await loadServerLibrary();
  assert.equal(loaded.status,200,JSON.stringify(loaded));
  assert.equal(loaded.body.data.modules[0].resources[0].name,"Lecture");
  assert.equal(loaded.body.data.savedResources[0].name,"Read later");
  assert.equal(loaded.body.data.usage.resourceCount,2);
  assert.equal((await loadServerLibrary(null)).status,401);
});
test("Library handler diagnoses missing index without exposing console links; retry calls the query again", async () => {
  boundary.setDatabase(libraryDb(new Map(),Object.assign(new Error("query requires an index https://private.invalid"),{code:9})));
  const broken=await loadServerLibrary();
  assert.equal(broken.status,503);
  assert.equal(broken.body.code,"LIBRARY_INDEX_REQUIRED");
  assert.doesNotMatch(broken.body.message,/private.invalid/);
  boundary.setDatabase(libraryDb(new Map()));
  assert.equal((await loadServerLibrary()).status,200);
});

test("missing models are not invented, retired selections are not silently replaced, legacy keys have no inferred owner", async () => {
  client.saveUserAiConfig("learner",{source:"own",config:{...config,model:""}});
  await assert.rejects(ask(),e=>e.code==="AI_NOT_CONFIGURED");
  client.saveUserAiConfig("learner",{source:"own",config:{...config,provider:"gemini",model:"gemini-2.0-flash"}});
  boundary.respond(()=>json({ok:true,data:{answer:"fixture"}}));
  await ask();
  assert.equal(boundary.calls.at(-1).config.model,"gemini-2.0-flash");
  storage.set("dc_gemini_api_key","unowned-old-key");
  assert.equal(client.loadUserAiConfig("new-account").config.apiKey,"");
});
test("unknown/server and invalid-model errors are safe and retain retry semantics", async () => {
  client.saveUserAiConfig("learner",{source:"own",config});
  for(const [status,code,kind,retryable] of [[503,"UNCLASSIFIED","server",true],[404,"AI_MODEL_UNAVAILABLE","config",false],[400,"UNCLASSIFIED","unknown",false]]) {
    boundary.respond(()=>json({ok:false,code,message:"secret-key https://internal.invalid trace"},status));
    await assert.rejects(ask(),e=>e.kind===kind && e.retryable===retryable && !/secret-key|internal.invalid/.test(e.message));
  }
});
