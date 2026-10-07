import test from 'node:test';
import assert from 'node:assert/strict';
import {bookshelfRoute} from '../src/bookshelf.js';
import {UserBookshelf,createBookshelfStore} from '../src/bookshelf-store.js';
import {shelfSnapshot,importShelfSnapshot} from '../src/bookshelf-data.js';
import {signCookie} from '../src/auth.js';
const entry={book:'gutenberg-23962',title:'西游记',author:'吴承恩',chapter:'01',chapterTitle:'第一回',position:'p2',language:'en',updatedAt:123};
test('portable export/import preserves account and timestamps and validates before writes',async()=>{
 const written=[];const store={upsert:async(id,e)=>written.push({id,...e})};const snapshot=shelfSnapshot('github:1',[entry]);
 assert.equal(await importShelfSnapshot(store,'github:1',JSON.parse(JSON.stringify(snapshot))),1);assert.equal(written[0].updatedAt,123);
 await assert.rejects(importShelfSnapshot(store,'github:2',snapshot));await assert.rejects(importShelfSnapshot(store,'github:1',{...snapshot,schemaVersion:99}));
 await assert.rejects(importShelfSnapshot(store,'github:1',{...snapshot,books:[entry,{...entry,book:'invalid'}]}));assert.equal(written.length,1);
 assert.throws(()=>createBookshelfStore({BOOKSHELF_STORAGE:'r2'}),/适配器/);
});
test('authenticated API exports through a replaceable store without Cloudflare bindings',async()=>{
 const env={AUTH_SESSION_SECRET:'s'.repeat(32)},seen=[];const token=await signCookie({id:'github:1',exp:Date.now()+60000},env);
 const response=await bookshelfRoute(new Request('https://slowread.test/api/bookshelf?export=1',{headers:{Cookie:'__Host-slowread-session='+token}}),env,()=>{throw Error('No source needed')},()=>({list:async id=>{seen.push(id);return [entry]}}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),shelfSnapshot('github:1',[entry]));assert.deepEqual(seen,['github:1']);assert.match(response.headers.get('Content-Disposition'),/attachment/);
});
test('legacy stored keys remain readable and an older import cannot overwrite newer progress',async()=>{
 const values=new Map([['book:'+entry.book,{...entry,updatedAt:500}]]);const tx={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)};
 const object=new UserBookshelf({storage:{...tx,list:async()=>new Map(values),transaction:async fn=>fn(tx)}});
 await object.fetch(new Request('https://bookshelf.internal/',{method:'POST',body:JSON.stringify(entry)}));
 const data=await(await object.fetch(new Request('https://bookshelf.internal/'))).json();assert.equal(data.books[0].updatedAt,500);assert.equal(data.books[0].position,'p2');
});
