import {searchBooks,loadBook} from './importer.js';
import original from './sample/original.json';
import translation from './sample/zh.json';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, max-age=60'}});
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);if(request.method!=='GET')return json({error:'Only GET is supported'},405);
 try{
  if(url.pathname==='/api/health')return json({ok:true,mode:'source-import',translation:'first-chapter-sample'});
  if(url.pathname==='/api/books')return json(await searchBooks((url.searchParams.get('q')||'').trim().slice(0,200)));
  const m=url.pathname.match(/^\/api\/books\/(gutenberg-[1-9]\d{0,6})(?:\/chapters\/(\d{2,4}))?$/);if(!m)return json({error:'Not found'},404);
  const book=await loadBook(m[1]);if(!m[2]){const {sections,...details}=book;return json(details);}
  const c=book.sections.find(c=>c.id===m[2]);if(!c)return json({error:'Chapter not found'},404);
  if(book.number===1342&&c.id==='01')return json({bookId:book.id,id:c.id,title:c.title,language:'zh-CN',paragraphs:original.paragraphs.map((p,i)=>({id:p.id,en:p.text,zh:translation.paragraphs[i].text})),source:book.source});
  return json({bookId:book.id,id:c.id,title:c.title,language:'en',paragraphs:c.paragraphs.map(p=>({id:p.id,en:p.text})),source:book.source});
 }catch(e){return json({error:e.message||'书源暂时不可用，请稍后重试。'},503);}
}};
