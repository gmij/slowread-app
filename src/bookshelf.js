import {validAccountId} from './identity.js';
import {verifyCookie} from './auth.js';
import {loadBook} from './importer.js';
import {createBookshelfStore} from './bookshelf-store.js';
import {shelfSnapshot} from './bookshelf-data.js';
export {UserBookshelf} from './bookshelf-store.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function bookshelfRoute(request,env,loader=loadBook,storeFactory=createBookshelfStore){
 const url=new URL(request.url);
 const raw=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-slowread-session='))?.slice('__Host-slowread-session='.length)||'';
 const session=await verifyCookie(raw,env);
 if(!session||!validAccountId(session.id))return json({error:'请先登录后使用我的书架'},401);
 if(!session.id.startsWith('github:')&&!session.emailVerifiedAt)return json({error:'请先完成邮箱验证码验证'},403);
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'请从本站保存阅读进度'},403);
 // Only the verified session chooses the account. Client-supplied user ids are ignored.
 const store=storeFactory(env);
 if(request.method==='GET'){
  const books=await store.list(session.id);
  if(url.searchParams.get('export')==='1')return Response.json(shelfSnapshot(session.id,books),{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="slowread-bookshelf.json"'}});
  return json({books});
 }
 const text=await request.text();if(text.length>2048)return json({error:'阅读记录过长'},413);
 let input;try{input=JSON.parse(text)}catch{return json({error:'阅读记录无效'},400)}
 if(!input||!/^gutenberg-[1-9]\d{0,6}$/.test(input.book)||!/^\d{2,4}$/.test(input.chapter)||!/^p[1-9]\d{0,5}$/.test(input.position)||!['en','zh-CN'].includes(input.language))return json({error:'阅读记录无效'},400);
 const book=await loader(input.book,env),chapter=book.sections.find(c=>c.id===input.chapter);
 if(!chapter||!chapter.paragraphs.some(p=>p.id===input.position))return json({error:'章节或段落不存在'},400);
 await store.upsert(session.id,{book:book.id,...(book.canonicalId?{canonicalId:book.canonicalId,sourceEditionId:book.sourceEditionId}:{}),title:book.title,author:book.author,chapter:chapter.id,chapterTitle:chapter.title,position:input.position,language:input.language,updatedAt:Date.now()});
 return json({saved:true});
}
