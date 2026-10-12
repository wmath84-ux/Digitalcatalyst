import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/course/localProgress.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { LocalProgress } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };
const empty = () => ({ completedFileIds: [], lastOpenedFileId: null });
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
test('edits are durable before any cloud write, and rapid toggles coalesce', async () => {
  const storage = memory(), batches = [];
  const s = new LocalProgress('u1/course', { storage, read: async () => empty(), write: async b => batches.push(b) }, 60000);
  await s.start();
  s.complete('a', true); s.complete('a', false); s.complete('b', true); s.open('b');
  assert.equal(batches.length, 0);
  assert.deepEqual(JSON.parse(storage.getItem('u1/course')).completedFileIds, ['b']);
  await s.flush();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].changes.a.value, false);
  assert.equal(batches[0].changes.b.value, true);
  assert.equal(s.snapshot().opened, null);
  s.stop();
});
test('offline outbox survives restart; accounts and courses remain separate', async () => {
  const storage = memory();
  const a = new LocalProgress('u1/a', { storage, read: async () => {throw Error('offline');}, write: async () => {throw Error('offline');} });
  await a.start(); a.complete('local', true); await a.flush(); a.stop();
  const b = new LocalProgress('u2/a', {storage, read: async () => empty(), write: async () => {}});
  assert.deepEqual(b.snapshot().completedFileIds, []); b.stop();
  const writes = [];
  const restored = new LocalProgress('u1/a', {storage, read: async () => ({completedFileIds: ['remote'], lastOpenedFileId: null}), write: async b => writes.push(b)});
  assert.deepEqual(restored.snapshot().completedFileIds, ['local']);
  await restored.start(); assert.deepEqual(new Set(restored.snapshot().completedFileIds), new Set(['local','remote']));
  await restored.flush(); assert.equal(writes.length, 1); restored.stop();
});
test('edits during an upload cannot be cleared by an older acknowledgement', async () => {
  let release;
  const writes = [];
  const s = new LocalProgress('u/a', { storage: memory(), read: async () => empty(), write: async b => {writes.push(b); await new Promise(r => {release=r;});} }, 60000);
  await s.start(); s.complete('x', true);
  const first = s.flush(); s.complete('x', false); await s.flush();
  assert.equal(writes.length, 1);
  release(); await first;
  assert.equal(s.snapshot().changes.x.value, false);
  const second = s.flush(); release(); await second;
  assert.equal(s.snapshot().changes.x, undefined); s.stop();
});
test('a slow initial read never replaces unacknowledged local changes', async () => {
  let finish;
  const s = new LocalProgress('u/a', {storage: memory(), read: () => new Promise(r=>{finish=r;}), write: async () => {}}, 60000);
  const starting = s.start(); s.complete('x', false); s.open('mine');
  finish({completedFileIds:['x','y'], lastOpenedFileId:'other'}); await starting;
  assert.deepEqual(s.snapshot().completedFileIds, ['y']); assert.equal(s.snapshot().lastOpenedFileId, 'mine'); s.stop();
});
test('storage quota failures stay visible and do not discard the memory outbox', async () => {
  const s = new LocalProgress('u/a', {storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}},read:async()=>empty(),write:async()=>{throw Error('offline');}});
  await s.start(); s.complete('x',true); assert.match(s.error,/storage/); await s.flush(); assert.ok(s.snapshot().changes.x); s.stop();
});
test('background interval batches instead of writing on each interaction', async () => {
  let count = 0;
  const s = new LocalProgress('u/a',{storage:memory(),read:async()=>empty(),write:async()=>{count++;}},10);
  await s.start(); for(let n=0;n<50;n++) s.open(String(n));
  assert.equal(count,0); await tick(); assert.equal(count,1); s.stop();
});
test('the lesson does not await optional tools and hot playback events are throttled', () => {
  const player = fs.readFileSync('src/CoursePlayerApp.tsx','utf8');
  assert.match(player,/const isReady = readinessStages.access && readinessStages.playback/);
  assert.doesNotMatch(player,/onSnapshot\(progressRef/);
  assert.match(player,/playbackSaveTimer.current = setTimeout/);
  const notes = fs.readFileSync('src/course/useCourseNotes.ts','utf8');
  assert.match(notes,/fetchCloudNotes\(uidText, productText\).then/);
  assert.doesNotMatch(notes,/subscribeCloudNotes/);
  for(const tool of ['Notes','MindMap','Sketch']) assert.match(fs.readFileSync(`src/course/useCourse${tool}.ts`,'utf8'), /DEFAULT_DEBOUNCE_MS = 30000/);
});
