import {originalResponse} from './book-response.js';
import {preferencesRoute} from './reading-preferences.js';
import {learningRoute} from './learning.js';
import {bookshelfRoute} from './bookshelf.js';
import {BOOKSHELF_SCHEMA_VERSION} from './bookshelf-data.js';
export {UserBookshelf} from './bookshelf.js';
export {UserAccount} from './accounts.js';
import {smartSearch} from './search-intent.js';
import {searchBooks,loadBook} from './importer.js';
import original from './sample/original.json';
import translation from './sample/zh.json';
import {quote,translateParagraph,languages,TRANSLATION_ENGINE_VERSION} from './translator.js';
import {readShared,saveShared,receipt,sourceHash} from './shared-library.js';
export {TranslationCoordinator} from './translation-coordinator.js';
import {bookStatus,invalidateBookStatus} from './book-status.js';
import {authRoute} from './auth.js';
import {createBookRequest} from './book-requests.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, max-age=60'}});
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(url.pathname==='/api/reading-preferences'||url.pathname==='/api/learning/explain'||url.pathname==='/api/entitlements'){try{return await (url.pathname==='/api/reading-preferences'?preferencesRoute:learningRoute)(request,env)}catch{return Response.json({error:'阅读服务暂时无法连接，请稍后重试'},{status:503,headers:{'Cache-Control':'no-store'}})}}
 if(url.pathname==='/api/bookshelf'){try{return await bookshelfRoute(request,env)}catch(error){console.error('Bookshelf service failure',error.message);return Response.json({error:'书架暂时无法同步，请稍后重试'},{status:503,headers:{'Cache-Control':'no-store'}})}}
 if(url.pathname==='/api/requests'){try{return await createBookRequest(request,env)}catch{return Response.json({error:'请求暂时无法提交'},{status:503})}}
 if(url.pathname==='/api/me'||url.pathname.startsWith('/api/auth/')){try{return await authRoute(request,env)}catch{return Response.json({error:'登录服务暂时不可用'},{status:503,headers:{'Cache-Control':'no-store'}})}}
 const action=url.pathname.match(/^\/api\/books\/(gutenberg-[1-9]\d{0,6})\/chapters\/(\d{2,4})\/(quote|translate|save)$/);
 if(request.method!=='GET'&&!(request.method==='POST'&&['translate','save'].includes(action?.[3])))return json({error:'Method not allowed'},405);
 try{
  if(url.pathname==='/api/translation-status'){if(!env.TRANSLATIONS)return json({available:false,message:'翻译任务服务暂不可用'});return env.TRANSLATIONS.get(env.TRANSLATIONS.idFromName('global-v1')).fetch('https://translation.internal/status');}
  if(url.pathname==='/api/health')return json({ok:true,authIntegrationVersion:1,mode:'source-import',bookshelfSchema:BOOKSHELF_SCHEMA_VERSION,bookshelfEnabled:!!env.BOOKSHELVES,translationEngine:TRANSLATION_ENGINE_VERSION,translationEnabled:env.TRANSLATION_ENABLED==='true'&&!!env.AI&&!!env.GITHUB_CONTENT_TOKEN&&!!env.TRANSLATIONS,sharedWritesEnabled:!!env.GITHUB_CONTENT_TOKEN});
  if(action){
   const book=await loadBook(action[1]);const chapter=book.sections.find(c=>c.id===action[2]);if(!chapter)return json({error:'Chapter not found'},404);
   const enabled=env.TRANSLATION_ENABLED==='true'&&!!env.AI&&!!env.GITHUB_CONTENT_TOKEN&&!!env.TRANSLATIONS;
   if(action[3]==='quote')return json({...quote(chapter.paragraphs,url.searchParams.get('target')||'zh-CN',enabled),sourceHash:await sourceHash(chapter)});
   if(request.method!=='POST')return json({error:'Method not allowed'},405);
   if(!enabled)return json({error:'真实翻译尚未启用。可以先阅读原文。'},503);
   if(request.headers.get('Origin')!==url.origin)return json({error:'请从本站确认翻译'},403);
   if(Number(request.headers.get('Content-Length')||0)>(action[3]==='save'?500000:2048))return json({error:'Request too large'},413);
   const body=await request.text();if(body.length>(action[3]==='save'?500000:2048))return json({error:'Request too large'},413);
   const input=JSON.parse(body);if(!languages[input.target]||input.confirmed!==true)return json({error:'请先确认语言与本章费用'},400);
   if(action[3]==='save'){const saved=await saveShared(book,chapter,input.target,input.rows,env);invalidateBookStatus();return json(saved);}
   if(!Number.isInteger(input.index)||input.index<0||input.index>=chapter.paragraphs.length)return json({error:'段落不存在'},400);
   if(chapter.paragraphs.reduce((n,p)=>n+p.text.length,0)>50000)return json({error:'此章超出试用长度上限，可以阅读原文。'},413);
   const shared=await readShared(book,chapter,input.target,env);
   let result;if(shared)result={text:shared.paragraphs[input.index].zh,cached:true};else{const response=await env.TRANSLATIONS.get(env.TRANSLATIONS.idFromName('global-v1')).fetch('https://translation.internal/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:chapter.paragraphs[input.index].text,target:input.target,sourceLanguage:book.sourceLanguage||'en'})});if(!response.ok)return response;result=await response.json();}
   return Response.json({index:input.index,id:chapter.paragraphs[input.index].id,...result,...await receipt(book,chapter,input.target,input.index,result.text,env)},{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/api/books')return json(await smartSearch((url.searchParams.get('q')||'').trim().slice(0,200),env));
  const statusMatch=url.pathname.match(/^\/api\/books\/(gutenberg-[1-9]\d{0,6})\/status$/);
  if(statusMatch){const target=url.searchParams.get('target')||'zh-CN';if(target!=='en'&&!languages[target])return json({error:'Language not supported'},400);return json(await bookStatus(await loadBook(statusMatch[1]),target,env));}
  const m=url.pathname.match(/^\/api\/books\/(gutenberg-[1-9]\d{0,6})(?:\/chapters\/(\d{2,4}))?$/);if(!m)return json({error:'Not found'},404);
  const book=await loadBook(m[1]);if(!m[2]){const {sections,...details}=book;return json(details);}
  const c=book.sections.find(c=>c.id===m[2]);if(!c)return json({error:'Chapter not found'},404);
  const target=url.searchParams.get('target')||'zh-CN';if(target!=='en'&&!languages[target])return json({error:'Language not supported'},400);
  if(target===(book.sourceLanguage||'en'))return json(originalResponse(book,c));
  const shared=await readShared(book,c,target,env);if(shared)return json({...shared,sourceLanguage:book.sourceLanguage||'en'});
  if(target==='zh-CN'&&book.number===1342&&c.id==='01')return json({bookId:book.id,id:c.id,title:c.title,language:'zh-CN',paragraphs:original.paragraphs.map((p,i)=>({id:p.id,en:p.text,zh:translation.paragraphs[i].text})),source:book.source});
  return json(originalResponse(book,c));
 }catch(e){return json({error:['TimeoutError','AbortError'].includes(e.name)?'书源连接超时，请稍后重试。':e.message||'书源暂时不可用，请稍后重试。'},503);}
}};
