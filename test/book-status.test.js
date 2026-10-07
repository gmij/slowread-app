import test from 'node:test';
import assert from 'node:assert/strict';
import {bookStatus,invalidateBookStatus} from '../src/book-status.js';
import {sourceHash} from '../src/shared-library.js';
import {resolveLanguage} from '../public/language.js';
test('whole-book progress counts only matching completed source versions and languages',async()=>{
 const book={id:'gutenberg-11',number:11,sections:[{id:'01',paragraphs:[{id:'p1',text:'One'}]},{id:'02',paragraphs:[{id:'p1',text:'Two'}]}]},hash=await sourceHash(book.sections[0]),nativeFetch=globalThis.fetch;
 try{invalidateBookStatus();globalThis.fetch=async()=>Response.json({tree:[{type:'blob',path:`books/gutenberg-11/translations/zh-CN/01-${hash}.json`},{type:'blob',path:'books/gutenberg-11/translations/zh-CN/02-old-version.json'}]});const zh=await bookStatus(book,'zh-CN',{CONTENT_REPO:'example/library'});assert.equal(zh.translatedChapters,1);assert.equal(zh.percent,50);assert.equal(zh.readers,null);assert.equal((await bookStatus(book,'ja',{CONTENT_REPO:'example/library'})).percent,0);assert.equal((await bookStatus(book,'en',{CONTENT_REPO:'example/library'})).percent,100);
 invalidateBookStatus();globalThis.fetch=async()=>Response.json({tree:[],truncated:true});await assert.rejects(()=>bookStatus(book,'zh-CN',{CONTENT_REPO:'example/library'}));
 }finally{globalThis.fetch=nativeFetch;invalidateBookStatus()}
});
test('language preference precedence and unsupported browser fallback',()=>{
 assert.equal(resolveLanguage({userPreference:'en',linkLanguage:'zh-CN',savedPreference:'en',browserLanguages:['zh-CN']}),'en');
 assert.equal(resolveLanguage({linkLanguage:'en',savedPreference:'zh-CN'}),'en');
 assert.equal(resolveLanguage({savedPreference:'en',browserLanguages:['zh-CN']}),'en');
 assert.equal(resolveLanguage({browserLanguages:['zh-TW']}),'zh-CN');
 assert.equal(resolveLanguage({browserLanguages:['fr-FR','ja-JP']}),'en');
 assert.equal(resolveLanguage({browserLanguages:['fr-FR']}),'en');
});

test('Chinese original is readable while English is counted as a translation',async()=>{const old=globalThis.fetch;invalidateBookStatus();globalThis.fetch=async()=>Response.json({tree:[]});try{const b={id:'gutenberg-23962',number:23962,sourceLanguage:'zh-CN',sections:[{id:'01',paragraphs:[{id:'p1',text:'中文'}]}]};assert.equal((await bookStatus(b,'zh-CN',{CONTENT_REPO:'example/library'})).percent,100);const en=await bookStatus(b,'en',{CONTENT_REPO:'example/library'});assert.equal(en.original,false);assert.equal(en.percent,0)}finally{globalThis.fetch=old;invalidateBookStatus()}});
