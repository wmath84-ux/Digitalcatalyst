import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const read = p => fs.readFileSync(p, 'utf8');
const outfile = path.resolve('node_modules/.cache/auth-reference-test.cjs');
await build({ entryPoints:['src/components/auth/AuthForm.tsx'], outfile, bundle:true, platform:'node', format:'cjs', jsx:'automatic', loader:{'.css':'empty'}, external:['react','react-dom','react/jsx-runtime'], plugins:[{
  name:'auth-boundaries', setup(build) {
    build.onResolve({filter:/context\/AuthContext$/},()=>({path:'auth',namespace:'stub'}));
    build.onResolve({filter:/utils\/nativeRuntime$/},()=>({path:'native',namespace:'stub'}));
    build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='auth' ? 'export const useAuth=()=>globalThis.__authFixture;' : 'export const isCapacitorNative=()=>false; export const isEmbeddedWebView=()=>false; export const hasNativeGoogleAuth=()=>false; export const warmNativeGoogleAuth=async()=>{};'}));
  }
}] });

test('minimal form preserves login, signup, reset, Google, remember and password visibility', async () => {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://example.test/#/auth'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.sessionStorage=dom.window.sessionStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const calls=[];
  const call = name => async (...args) => {calls.push([name,...args]); return {success:false,message:'Try again'};};
  globalThis.__authFixture={login:call('login'),signup:call('signup'),loginWithGoogle:call('google'),resetPassword:call('reset'),restoringSession:false,googleNotice:null,dismissGoogleNotice:()=>{}};
  const React=require('react');const {createRoot}=require('react-dom/client'); const AuthForm=require(outfile).default;
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(AuthForm)));
  const click=async selector=>React.act(async()=>document.querySelector(selector).click());
  const set=async(id,value)=>React.act(async()=>{
    const el=document.getElementById(id);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);
    el.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
  const submit=async()=>React.act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  await set('auth-email','USER@example.com');await set('auth-password','secret123');
  await click('input[type="checkbox"]');
  await submit();assert.deepEqual(calls.pop(),['login','user@example.com','secret123',false]);
  await click('.dc-auth-eye');assert.equal(document.getElementById('auth-password').type,'text');
  await click('.dc-auth-options .dc-auth-link');assert.deepEqual(calls.pop(),['reset','USER@example.com']);
  await click('[data-auth-google]');assert.deepEqual(calls.pop(),['google',false]);
  await click('.dc-auth-copy .dc-auth-link');
  assert.equal(document.querySelector('form').getAttribute('aria-label'),'Sign up');
  await set('auth-name','Test Learner');await set('auth-mobile','9876543210');await set('auth-password','newsecret');
  await submit();assert.deepEqual(calls.pop(),['signup',{name:'Test Learner',email:'user@example.com',mobile:'9876543210',password:'newsecret',remember:false}]);
  assert.equal(document.querySelector('[data-auth-apple]'),null);
  assert.doesNotMatch(document.body.textContent,/Firebase|256-Bit|10,000/);
  await React.act(async()=>root.unmount());dom.window.close();
});

test('authentication pages remain white regardless of the operating-system theme',()=>{
  const css=read('src/components/auth/auth-reference.css');postcss.parse(css);
  assert.doesNotMatch(css,/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
  assert.match(css,/--auth-page:\s*#f5f5f5/);
  assert.match(css,/--auth-card:\s*#ffffff/);
  assert.match(css,/color-scheme:\s*light/);
  assert.match(css,/width: 450px; max-width: 100%; border-radius: 20px/);
  assert.match(css,/\.dc-auth-submit \{[\s\S]*?background: #2d79f3/);
  const app=read('src/AuthApp.tsx');assert.doesNotMatch(app,/Firebase|SSL|Star|Sparkles|ThemeModeToggle/);
  assert.match(app,/resolveBackDestination/);
});

test('Apple additions are removed and Remember me reaches actual persistence',()=>{
  const context=read('src/context/AuthContext.tsx');
  assert.doesNotMatch(context,/loginWithApple|signInWithApple|apple\.com|OAuthProvider/);
  assert.doesNotMatch(read('src/components/auth/AuthForm.tsx'),/AppleIcon|handleApple|appleSubmitting/);
  assert.doesNotMatch(read('capacitor.config.ts'),/apple\.com/);
  assert.equal(fs.existsSync('docs/apple-sign-in-setup.md'),false);
  assert.match(context,/remember \? browserLocalPersistence : browserSessionPersistence/);
  assert.match(context,/details.remember !== false \? browserLocalPersistence : browserSessionPersistence/);
  assert.match(context,/signInWithGoogleIdToken\(oneTap.idToken, remember\)/);
});


test('authentication shell compiles and keeps its system-back cleanup', () => {
  const source = read('src/AuthApp.tsx');
  const result = ts.transpileModule(source, { fileName: 'src/AuthApp.tsx', reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX } });
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  assert.match(source, /return \(\) => window.removeEventListener\("popstate", handleSystemBack\)/);
});


test('mobile auth form starts below Back instead of vertical-centering into excessive blank space', () => {
  const css = read('src/components/auth/auth-reference.css');
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*?justify-content: flex-start/);
  assert.match(css, /padding-top: calc\(env\(safe-area-inset-top\) \+ 68px\)/);
  assert.match(css, /@media \(max-height: 640px\)/);
});
