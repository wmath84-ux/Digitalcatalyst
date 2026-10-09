import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLibraryProductIds } from '../utils/libraryOwnership.js';

test('library discovers module/resource/update purchases without pretending they own the full product',()=>{
  const result=collectLibraryProductIds([{kind:'full_product',productId:'full',status:'active'},{kind:'selected_modules',productId:'partial',status:'active'},{kind:'selected_resources',productId:'partial',status:'active'},{kind:'paid_update',productId:'update',status:'active'},{kind:'free_entitlement',productId:'free',status:'active'}]);
  assert.deepEqual(result.full,['full','free']);assert.deepEqual(result.any,['full','partial','update','free']);
});
test('revoked and subscription-derived grants cannot become permanent lifetime purchases',()=>{
  const result=collectLibraryProductIds([{kind:'full_product',productId:'revoked',status:'revoked'},{kind:'full_product',productId:'plan',status:'active',planId:'premium'},{kind:'feature',productId:'not-a-product',status:'active'},{kind:'selected_modules',productId:'legacy'}]);
  assert.deepEqual(result.full,[]);assert.deepEqual(result.any,['legacy']);
});
test('invalid entries are ignored and actual product identifiers are deduplicated',()=>{
  assert.deepEqual(collectLibraryProductIds([null,[],{},'invalid',{kind:'full_product',productId:' '},{kind:'selected_resources',productId:0},{kind:'selected_modules',productId:'0'}]),{full:[],any:['0']});
});
