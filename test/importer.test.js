import test from 'node:test';
import assert from 'node:assert/strict';
import {splitChapters,searchBooks,loadBook} from '../src/importer.js';
test('search, source retrieval and chapter parsing',async()=>{
 const raw='Project Gutenberg\n*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\nPreface\nChapter I.]\n'+('First paragraph. '.repeat(30))+'\n\nSecond paragraph.\nCHAPTER II.\n'+('Next chapter. '.repeat(40))+'\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***';
 const c=splitChapters(raw);assert.equal(c.length,2);assert.ok(c[0].paragraphs[0].text.startsWith('First'));assert.equal(c[1].id,'02');
 assert.equal((await searchBooks('傲慢')).books[0].id,'gutenberg-1342');
 const nativeFetch=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async url=>{calls++;assert.equal(url,'https://www.gutenberg.org/cache/epub/1342/pg1342.txt');return new Response(raw)};const b=await loadBook('gutenberg-1342');assert.equal(b.chapters.length,2);await loadBook('gutenberg-1342');assert.equal(calls,1);await assert.rejects(()=>loadBook('https://internal/'));globalThis.fetch=async()=>new Response('',{status:403});assert.match((await searchBooks('unknown-query')).warning,/暂时不可用/);}finally{globalThis.fetch=nativeFetch;}
});
