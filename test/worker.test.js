import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import worker from '../src/worker.js';
test('Worker content integration and failure boundaries',async()=>{
 const previous=globalThis.fetch;let broken=false,mismatch=false;
 const env={CONTENT_REPO:'gmij/slowread-library',GITHUB_CONTENT_TOKEN:'test-only-secret'};
 globalThis.fetch=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test-only-secret');if(broken)return new Response('',{status:403});const relative=new URL(url).pathname.split('/contents/')[1];let data=JSON.parse(await readFile(path.resolve(import.meta.dirname,'../../slowread-library',relative),'utf8'));if(mismatch&&relative.includes('/translations/'))data.sourceHash='wrong';return Response.json(data)};
 const request=(p,method='GET')=>worker.fetch(new Request('https://example.com'+p,{method}),env);
 try{
  let r=await request('/api/books?q='+encodeURIComponent('奥斯汀'));assert.equal(r.status,200);assert.equal((await r.json()).books.length,1);
  r=await request('/api/books?q=missing');assert.equal((await r.json()).books.length,0);
  r=await request('/api/books/pride-and-prejudice/chapters/01');const chapter=await r.json();assert.equal(r.status,200);assert.equal(chapter.paragraphs.length,34);assert.ok(chapter.paragraphs.every(p=>p.zh&&p.en));assert.ok(!JSON.stringify(chapter).includes(env.GITHUB_CONTENT_TOKEN));
  assert.equal((await request('/api/books/pride-and-prejudice/chapters/02')).status,404);
  assert.equal((await request('/api/books/not-valid!')).status,404);
  assert.equal((await request('/api/books','POST')).status,405);
  mismatch=true;assert.equal((await request('/api/books/pride-and-prejudice/chapters/01')).status,503);mismatch=false;
  broken=true;assert.equal((await request('/api/books')).status,503);
 }finally{globalThis.fetch=previous}
});
