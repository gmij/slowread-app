import {searchBooks,loadBook} from './importer.js';
import original from './sample/original.json';
import translation from './sample/zh.json';
import {quote,translateParagraph,languages} from './translator.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, max-age=60'}});
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 const action=url.pathname.match(/^\/api\/books\/(gutenberg-[1-9]\d{0,6})\/chapters\/(\d{2,4})\/(quote|translate)$/);
 if(request.method!=='GET'&&!(request.method==='POST'&&action?.[3]==='translate'))return json({error:'Method not allowed'},405);
 try{
  if(url.pathname==='/api/health')return json({ok:true,mode:'source-import',translationEnabled:env.TRANSLATION_ENABLED==='true'&&!!env.AI});
  if(action){
   const book=await loadBook(action[1]);const chapter=book.sections.find(c=>c.id===action[2]);if(!chapter)return json({error:'Chapter not found'},404);
   const enabled=env.TRANSLATION_ENABLED==='true'&&!!env.AI;
   if(action[3]==='quote')return json(quote(chapter.paragraphs,url.searchParams.get('target')||'zh-CN',enabled));
   if(!enabled)return json({error:'真实翻译尚未启用。可以先阅读原文。'},503);
   if(request.headers.get('Origin')!==url.origin)return json({error:'请从本站确认翻译'},403);
   if(Number(request.headers.get('Content-Length')||0)>2048)return json({error:'Request too large'},413);
   const input=await request.json();if(!languages[input.target]||!Number.isInteger(input.index)||input.index<0||input.index>=chapter.paragraphs.length||input.confirmed!==true)return json({error:'请先确认语言与本章费用'},400);
   if(chapter.paragraphs.reduce((n,p)=>n+p.text.length,0)>50000)return json({error:'此章超出试用长度上限，可以阅读原文。'},413);
   const result=await translateParagraph(chapter.paragraphs[input.index].text,input.target,env.AI);
   return Response.json({index:input.index,id:chapter.paragraphs[input.index].id,...result},{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/api/books')return json(await searchBooks((url.searchParams.get('q')||'').trim().slice(0,200)));
  const m=url.pathname.match(/^\/api\/books\/(gutenberg-[1-9]\d{0,6})(?:\/chapters\/(\d{2,4}))?$/);if(!m)return json({error:'Not found'},404);
  const book=await loadBook(m[1]);if(!m[2]){const {sections,...details}=book;return json(details);}
  const c=book.sections.find(c=>c.id===m[2]);if(!c)return json({error:'Chapter not found'},404);
  if(book.number===1342&&c.id==='01')return json({bookId:book.id,id:c.id,title:c.title,language:'zh-CN',paragraphs:original.paragraphs.map((p,i)=>({id:p.id,en:p.text,zh:translation.paragraphs[i].text})),source:book.source});
  return json({bookId:book.id,id:c.id,title:c.title,language:'en',paragraphs:c.paragraphs.map(p=>({id:p.id,en:p.text})),source:book.source});
 }catch(e){return json({error:e.message||'书源暂时不可用，请稍后重试。'},503);}
}};
