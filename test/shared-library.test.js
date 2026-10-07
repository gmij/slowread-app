import test from 'node:test';
import assert from 'node:assert/strict';
import {receipt,saveShared,sourceHash,readShared} from '../src/shared-library.js';
import {splitChapters} from '../src/importer.js';
test('shared chapter writes validate receipts and reuse committed multilingual content',async()=>{
 const originalFetch=globalThis.fetch,env={GITHUB_CONTENT_TOKEN:'unit-test-only',CONTENT_REPO:'example/library'},book={id:'gutenberg-11',source:{url:'https://www.gutenberg.org/ebooks/11'}},chapter={id:'01',title:'Chapter I',paragraphs:[{id:'p1',text:'Hello world.'}]};
 const files=new Map();let puts=0;
 try{globalThis.fetch=async(url,opt={})=>{const key=String(url).split('/contents/')[1]?.split('?')[0];if(opt.method==='PUT'){puts++;const body=JSON.parse(opt.body);if(files.has(key))return new Response('',{status:422});files.set(key,body.content);return Response.json({})}return files.has(key)?Response.json({content:files.get(key)}):new Response('',{status:404})};
 const r=await receipt(book,chapter,'zh-CN',0,'你好世界。',env),rows=[{index:0,text:'你好世界。',signature:r.signature}];
 await assert.rejects(()=>saveShared(book,chapter,'zh-CN',[{...rows[0],text:'Tampered'}],env));assert.equal(puts,0);
 const saved=await saveShared(book,chapter,'zh-CN',rows,env);assert.equal(saved.shared,true);assert.equal(puts,2);assert.equal((await readShared(book,chapter,'zh-CN',env)).paragraphs[0].zh,'你好世界。');await saveShared(book,chapter,'zh-CN',rows,env);assert.equal(puts,2);
 await assert.rejects(()=>saveShared(book,chapter,'ja',rows,env));assert.equal(saved.sourceHash,await sourceHash(chapter));
 }finally{globalThis.fetch=originalFetch}
});
test('symbol-only noise is removed while meaningful unicode text survives',()=>{const chapters=splitChapters('CHAPTER I\n'+('Readable words. '.repeat(40))+'\n\n* * *\n\n12345\n\n中文段落。\n\n[Illustration: drawing]');assert.equal(chapters[0].paragraphs.length,2);assert.equal(chapters[0].paragraphs[1].text,'中文段落。')});
