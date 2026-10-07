import test from 'node:test';
import assert from 'node:assert/strict';
import {originalResponse} from '../src/book-response.js';

test('untranslated Chinese chapters retain Chinese source language for English readers',()=>{
 const data=originalResponse({id:'gutenberg-23962',sourceLanguage:'zh-CN'},{id:'02',title:'第二回',paragraphs:[{id:'p1',text:'中文正文'}]});
 assert.equal(data.language,'zh-CN');assert.equal(data.sourceLanguage,'zh-CN');assert.equal(data.paragraphs[0].en,'中文正文');assert.equal(data.paragraphs[0].zh,undefined);
});
