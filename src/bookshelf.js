import {verifyCookie} from './auth.js';
import {loadBook} from './importer.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export class UserBookshelf {
 constructor(state){this.storage=state.storage}
 async fetch(request){
  if(request.method==='GET'){const entries=await this.storage.list({prefix:'book:'});return json({books:[...entries.values()].sort((a,b)=>b.updatedAt-a.updatedAt)})}
  const entry=await request.json();
  await this.storage.put('book:'+entry.book, {...entry,updatedAt:Date.now()});return json({saved:true});
 }
}
export async function bookshelfRoute(request,env,loader=loadBook){
 const url=new URL(request.url);
 const raw=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-slowread-session='))?.slice('__Host-slowread-session='.length)||'';
 const session=await verifyCookie(raw,env);
 if(!session||!/^github:\d+$/.test(session.id))return json({error:'请先登录后使用我的书架'},401);
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'请从本站保存阅读进度'},403);
 if(!env.BOOKSHELVES)return json({error:'书架服务暂时不可用，请稍后重试'},503);
 // Only the verified session chooses the account. Client-supplied user ids are ignored.
 const shelf=env.BOOKSHELVES.get(env.BOOKSHELVES.idFromName(session.id));
 if(request.method==='GET')return shelf.fetch('https://bookshelf.internal/');
 const text=await request.text();if(text.length>2048)return json({error:'阅读记录过长'},413);
 let input;try{input=JSON.parse(text)}catch{return json({error:'阅读记录无效'},400)}
 if(!input||!/^gutenberg-[1-9]\d{0,6}$/.test(input.book)||!/^\d{2,4}$/.test(input.chapter)||!/^p[1-9]\d{0,5}$/.test(input.position)||!['en','zh-CN'].includes(input.language))return json({error:'阅读记录无效'},400);
 const book=await loader(input.book),chapter=book.sections.find(c=>c.id===input.chapter);
 if(!chapter||!chapter.paragraphs.some(p=>p.id===input.position))return json({error:'章节或段落不存在'},400);
 return shelf.fetch('https://bookshelf.internal/',{method:'POST',body:JSON.stringify({book:book.id,title:book.title,author:book.author,chapter:chapter.id,chapterTitle:chapter.title,position:input.position,language:input.language})});
}
