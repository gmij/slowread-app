import test from 'node:test';
import assert from 'node:assert/strict';
import {TranslationCoordinator} from '../src/translation-coordinator.js';

function state(values=new Map()){
 let tail=Promise.resolve();
 const storage={get:async key=>structuredClone(values.get(key)),put:async(key,value)=>values.set(key,structuredClone(value))};
 storage.transaction=fn=>{const job=tail.then(()=>fn(storage));tail=job.catch(()=>{});return job};
 const state={storage,blockConcurrencyWhile:fn=>{state.ready=Promise.resolve().then(fn)}};return state;
}
const request=text=>new Request('https://translation.internal/translate',{method:'POST',body:JSON.stringify({text,target:'en',sourceLanguage:'zh-CN'})});
test('learning explanations reuse cached context and share the chapter budget',async()=>{
 const s=state();let calls=0;const object=new TranslationCoordinator(s,{TRANSLATION_DAILY_CHARACTERS:'50',AI:{run:async()=>{calls++;return {response:'此处指需要。'}}}});await s.ready;
 const lookup=context=>new Request('https://translation.internal/explain',{method:'POST',body:JSON.stringify({selection:'want',context,target:'zh-CN',client:'a'.repeat(64)})});
 assert.equal((await object.fetch(lookup('in want of a wife'))).status,200);const used=object.used;assert.equal((await(await object.fetch(lookup('in want of a wife'))).json()).cached,true);assert.equal(calls,1);assert.equal(object.used,used);
 assert.equal((await object.fetch(lookup('x'.repeat(50)))).status,429);assert.equal(calls,1);
});

test('concurrent identical tasks share inference and a single budget reservation',async()=>{
 const stateA=state();let release,calls=0;
 const gate=new Promise(resolve=>release=resolve);
 const object=new TranslationCoordinator(stateA,{TRANSLATION_DAILY_CHARACTERS:'100',AI:{run:async()=>{calls++;await gate;return {response:'Translated text'}}}});
 await stateA.ready;const first=object.fetch(request('测试同一段'));const second=object.fetch(request('测试同一段'));
 await new Promise(resolve=>setTimeout(resolve,10));release();
 const results=await Promise.all([first,second]);assert.equal(calls,1);assert.equal((await results[0].json()).text,'Translated text');assert.equal((await results[1].json()).text,'Translated text');
 const used=object.used;assert.equal((await (await object.fetch(request('测试同一段'))).json()).cached,true);assert.equal(object.used,used);
 const replacement=new TranslationCoordinator(stateA,{TRANSLATION_DAILY_CHARACTERS:String(used),AI:{run:async()=>{throw Error('Must not run')}}});await stateA.ready;
 assert.equal((await replacement.fetch(request('新的内容'))).status,429);
});

test('distinct concurrent jobs are bounded and quota exhaustion is explicit',async()=>{
 const stateA=state();let release;const gate=new Promise(resolve=>release=resolve);
 const object=new TranslationCoordinator(stateA,{TRANSLATION_DAILY_CHARACTERS:'100',AI:{run:async()=>{await gate;return {response:'English'}}}});await stateA.ready;
 const a=object.fetch(request('并发任务甲'));const b=object.fetch(request('并发任务乙'));await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal((await object.fetch(request('并发任务丙'))).status,429);release();await Promise.all([a,b]);
 const zeroState=state();const zero=new TranslationCoordinator(zeroState,{TRANSLATION_DAILY_CHARACTERS:'0'});await zeroState.ready;
 assert.equal((await zero.fetch(request('额度耗尽'))).status,429);const status=await (await zero.fetch(new Request('https://translation.internal/status'))).json();assert.equal(status.available,false);
});

test('learning entitlements expose account limits and distinguish personal from shared exhaustion',async()=>{const day=new Date().toISOString().slice(0,10),client='b'.repeat(64),values=new Map([['learning:'+client,{day,count:50}]]);const st=state(values),o=new TranslationCoordinator(st,{TRANSLATION_DAILY_CHARACTERS:'10000',AI:{run:async()=>({response:'翻译：需要'})}});await st.ready;const lookup=scope=>new Request('https://translation.internal/explain',{method:'POST',body:JSON.stringify({selection:'want',context:'want',target:'zh-CN',client,scope})});let response=await o.fetch(lookup('guest'));assert.equal(response.status,429);assert.equal((await response.json()).code,'LEARNING_QUOTA_EXHAUSTED');response=await o.fetch(lookup('account'));assert.equal(response.status,200);const status=await(await o.fetch(new Request('https://translation.internal/learning-status',{method:'POST',body:JSON.stringify({client,scope:'account'})}))).json();assert.equal(status.limit,200);assert.equal(status.used,51);assert.equal(status.remaining,149);assert.match(status.resetAt,/T00:00:00/);const zero=state(),empty=new TranslationCoordinator(zero,{TRANSLATION_DAILY_CHARACTERS:'0'});await zero.ready;assert.equal((await(await empty.fetch(lookup('account'))).json()).code,'SHARED_QUOTA_EXHAUSTED')});
