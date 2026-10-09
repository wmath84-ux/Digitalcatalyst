import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const module={exports:{}};
const compiled=ts.transpileModule(fs.readFileSync('src/components/pdp/PdpSelectionSummary.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',compiled)(name=>name==='../../utils/money'?{paiseToRupees:value=>Math.round(value)/100}:require(name),module,module.exports);
const Summary=module.exports.default;
const selection={purchaseKind:'selected_modules',productIds:['course'],moduleIds:['a','b'],resourceIds:[],updateId:null,subscriptionPlanId:null,billingCycle:null,featureIds:[],couponCode:null,returnRoute:null};
const lines=[{id:'a',moduleId:'a',kind:'selected_modules',title:'Algebra',parentTitle:'',regularPrice:499,salePrice:null,effectivePrice:499,quantity:1,alreadyOwned:false},{id:'b',moduleId:'b',kind:'selected_modules',title:'Geometry',parentTitle:'',regularPrice:399,salePrice:299,effectivePrice:299,quantity:1,alreadyOwned:false}];
const snapshot={selection,summary:{mode:'selected_modules',lineItems:lines,selectedCount:2,selectedTitles:['Algebra','Geometry'],regularSubtotal:898,saleSavings:100,effectiveSubtotal:798},valid:true,rules:['Algebra is required for Geometry. Included in this selection.']};
const view={selectionKey:'test',status:'ready',error:'',applying:false,couponIntent:'SAVE10',refresh(){}};
const quote={quoteId:'verified',uid:'user',currency:'INR',purchaseKind:'selected_modules',verifiedLineItems:lines.map(line=>({...line,regularPrice:line.regularPrice*100,effectivePrice:line.effectivePrice*100,salePrice:line.salePrice===null?null:line.salePrice*100})),regularSubtotal:89800,saleDiscount:10000,couponDiscount:7980,cashPayable:71820,minimumPayable:0,expiresAt:Date.now()+900000,status:'active',couponCode:'SAVE10'};
const render=(pricing)=>new JSDOM(renderToStaticMarkup(React.createElement(Summary,{snapshot,pricing}))).window.document;

test('selected item names, individual amounts, dependencies and access scope remain visible',()=>{
  const doc=render({...view,status:'idle',quote:null,couponIntent:null});
  assert.match(doc.querySelector('[data-pdp-summary-items]').textContent,/Algebra₹499/);
  assert.match(doc.querySelector('[data-pdp-summary-items]').textContent,/Geometry₹399₹299/);
  assert.match(doc.querySelector('[data-pdp-selection-rules]').textContent,/not the full product/);
  assert.match(doc.querySelector('[data-pdp-selection-rules]').textContent,/Algebra is required for Geometry/);
  assert.equal(doc.querySelectorAll('button').length,0);
});
test('server paise values produce exact rupee sale/coupon breakdown and final payable',()=>{
  const doc=render({...view,quote});
  assert.match(doc.querySelector('[data-pdp-summary-breakdown]').textContent,/Items subtotal₹898Price discount−₹100Subtotal after discount₹798Coupon SAVE10−₹79.8/);
  assert.equal(doc.querySelector('.dc-pdp-current-price').textContent,'₹718.2');
  assert.match(doc.querySelector('[data-pdp-summary-total]').textContent,/Final total/);
  assert.equal(doc.querySelector('[data-pdp-order-summary]').dataset.pricingStatus,'verified');
});
test('unverified estimates never invent a coupon reduction or claim a final server total',()=>{
  const doc=render({...view,status:'loading',quote:null});
  assert.equal(doc.querySelector('[data-pdp-coupon-discount]'),null);
  assert.equal(doc.querySelector('.dc-pdp-current-price').textContent,'₹798');
  assert.match(doc.querySelector('[data-pdp-summary-total]').textContent,/Estimated total/);
  assert.match(doc.querySelector('[role="status"]').textContent,/Verifying coupon/);
});
test('zero and minimum-charge orders show numeric INR and disclose the floor',()=>{
  for(const cashPayable of [0,100]){
    const doc=render({...view,quote:{...quote,couponDiscount:cashPayable?79700:79800,cashPayable,minimumPayable:cashPayable}});
    assert.equal(doc.querySelector('.dc-pdp-current-price').textContent,cashPayable?'₹1':'₹0');
    if(cashPayable)assert.match(doc.querySelector('[data-pdp-selection-rules]').textContent,/Minimum payable.*₹1/);
  }
});
