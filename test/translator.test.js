import test from 'node:test';import assert from 'node:assert/strict';
import {quote,chunks,translateParagraph} from '../src/translator.js';
test('English output retries mixed text and rejects uncorrected Chinese fragments',async()=>{
 let calls=0;const corrected=await translateParagraph('完整性校验甲','en',{run:async()=>({response:++calls===1?'The 天地 opened.':'Heaven and earth opened.'})},'zh-CN');assert.equal(calls,2);assert.equal(corrected.text,'Heaven and earth opened.');
 await assert.rejects(()=>translateParagraph('完整性校验乙','en',{run:async()=>({response:'The 天地 opened.'})},'zh-CN'),/未翻译/);
});
test('quote disclosure, chunk completeness and translation errors',async()=>{
 const q=quote([{text:'Hello world'}],'zh-CN',false);assert.equal(q.readerPriceUsd,0);assert.equal(q.available,false);assert.ok(q.estimatedProviderCostUsd>0);assert.throws(()=>quote([],'invalid',true));
 const text=('One sentence. ').repeat(120);assert.equal(chunks(text).join(' ').replace(/\s/g,''),text.replace(/\s/g,''));assert.ok(chunks(text).every(c=>c.length<=600));
 let calls=0;const ai={run:async()=>{calls++;return {choices:[{message:{content:'真实返回的译文'},finish_reason:'stop'}]}}};assert.equal((await translateParagraph('Unique test input','zh-CN',ai)).text,'真实返回的译文');assert.equal((await translateParagraph('Unique test input','zh-CN',ai)).cached,true);assert.equal(calls,1);await assert.rejects(()=>translateParagraph('Other input','ja',{run:async()=>({})}),/有效文本/);await assert.rejects(()=>translateParagraph('Truncated input','ja',{run:async()=>({choices:[{message:{content:'不完整'},finish_reason:'length'}]})}),/长度限制/);
});

test('Chinese original can be translated into English with the correct source prompt',async()=>{let prompt;const result=await translateParagraph('中文原文测试句。','en',{run:async(model,input)=>{prompt=input.messages[0].content;return {response:'An English translation.'}}},'zh-CN');assert.equal(result.text,'An English translation.');assert.match(prompt,/Chinese/);assert.match(prompt,/into English/)});
