import {loadBook} from './importer.js';
import {readShared} from './shared-library.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function learningRoute(request,env,loader=loadBook,sharedReader=readShared){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'请从阅读页面查词'},403);
 if(!env.TRANSLATIONS||!env.AI||env.TRANSLATION_ENABLED!=='true')return json({error:'语境解释暂未开放'},503);
 const text=await request.text();if(text.length>1024)return json({error:'选词请求过长'},413);
 let input;try{input=JSON.parse(text)}catch{return json({error:'选词无效'},400)}
 if(!input||!/^gutenberg-[1-9]\d{0,6}$/.test(input.book)||!/^\d{2,4}$/.test(input.chapter)||!/^p[1-9]\d{0,5}$/.test(input.paragraph)||typeof input.selection!=='string'||input.selection.trim().length<1||input.selection.length>160||!['en','zh-CN'].includes(input.target))return json({error:'请选择一个词、短语或短句（最多160字）'},400);
 const book=await loader(input.book),chapter=book.sections.find(c=>c.id===input.chapter),p=chapter?.paragraphs.find(p=>p.id===input.paragraph);
 if(!p||!p.text.includes(input.selection))return json({error:'选中内容必须来自当前原文段落'},400);
 const at=p.text.indexOf(input.selection),context=p.text.length<=12000?p.text:p.text.slice(Math.max(0,at-5900),at+input.selection.length+5900);
 let reference='';if(env.CONTENT_REPO){try{const shared=await sharedReader(book,chapter,input.target,env);reference=shared?.paragraphs.find(row=>row.id===p.id)?.zh||''}catch{}}
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));const client=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return env.TRANSLATIONS.get(env.TRANSLATIONS.idFromName('global-v1')).fetch('https://translation.internal/explain',{method:'POST',body:JSON.stringify({selection:input.selection,context,reference,sourceLanguage:book.sourceLanguage||'en',target:input.target,client})});
}
