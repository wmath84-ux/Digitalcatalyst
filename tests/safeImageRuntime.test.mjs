import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const require=createRequire(import.meta.url);
const outfile=path.resolve('node_modules/.cache/safe-image-runtime.cjs');
fs.mkdirSync(path.dirname(outfile),{recursive:true});
buildSync({entryPoints:['src/components/ui/SafeImage.tsx'],outfile,bundle:true,platform:'node',format:'cjs',external:['react'],logLevel:'silent'});
const {SafeImage}=require(outfile);

function fixture(run) {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://localhost/'});
  const values={window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true};
  const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  const host=document.getElementById('root'),root=createRoot(host);
  try {
    const render=(props)=>act(()=>root.render(React.createElement(SafeImage,{...props,fallback:React.createElement('span',null,'Initials')})));
    const fail=()=>act(()=>host.querySelector('img').dispatchEvent(new window.Event('error')));
    run({host,render,fail});
  } finally {
    act(()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of saved) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
}

test('both failed URLs remain failed, duplicate/empty sources terminate, and a new URL re-arms immediately',()=>fixture(({host,render,fail})=>{
  render({src:'/primary.png',secondarySrc:'/secondary.png'});
  assert.equal(host.querySelector('img').getAttribute('referrerpolicy'),'no-referrer');
  fail();assert.equal(host.querySelector('img').getAttribute('src'),'/secondary.png');
  fail();assert.equal(host.textContent,'Initials');
  render({src:'/primary.png',secondarySrc:'/secondary.png'});assert.equal(host.textContent,'Initials');
  render({src:'/new.png',secondarySrc:'/secondary.png'});assert.equal(host.querySelector('img').getAttribute('src'),'/new.png');
  render({src:'/same.png',secondarySrc:'/same.png'});fail();assert.equal(host.textContent,'Initials');
  render({src:'',secondarySrc:''});assert.equal(host.textContent,'Initials');
}));

test('a changed fallback URL and a network reconnect both permit a fresh bounded attempt',()=>fixture(({host,render,fail})=>{
  render({src:'',secondarySrc:'/fallback.png'});fail();assert.equal(host.textContent,'Initials');
  render({src:'',secondarySrc:'/updated-fallback.png'});assert.equal(host.querySelector('img').getAttribute('src'),'/updated-fallback.png');
  fail();assert.equal(host.textContent,'Initials');
  act(()=>window.dispatchEvent(new window.Event('online')));assert.equal(host.querySelector('img').getAttribute('src'),'/updated-fallback.png');
  fail();assert.equal(host.textContent,'Initials');
}));
