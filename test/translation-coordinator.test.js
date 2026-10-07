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
