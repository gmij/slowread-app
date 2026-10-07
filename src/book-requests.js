import {verifyCookie} from './auth.js';
const attempts=new Map();
export async function createBookRequest(request,env){
 const origin=new URL(request.url).origin;if(request.method!=='POST'||request.headers.get('Origin')!==origin)return Response.json({error:'请从慢读提交请求'},{status:403});
 if(env.BOOK_REQUESTS_ENABLED!=='true'||!env.CONTENT_REPO||!env.GITHUB_CONTENT_TOKEN)return Response.json({error:'找书请求暂时不可用，请稍后重试'},{status:503});
 const rawCookie=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-slowread-session='))?.split('=').slice(1).join('=')||'';
 const user=await verifyCookie(rawCookie,env);if(!user)return Response.json({error:'请先登录后再提交找书请求'},{status:401});
 const text=await request.text();if(text.length>5000)return Response.json({error:'请求内容过长'},{status:413});let input;try{input=JSON.parse(text)}catch{return Response.json({error:'请求格式无效'},{status:400})}
 const title=typeof input?.title==='string'?input.title.trim():'',author=typeof input?.author==='string'?input.author.trim():'',notes=typeof input?.notes==='string'?input.notes.trim():'';
 if(!title||title.length>160||author.length>120||notes.length>1000||!['en','zh-CN'].includes(input?.language))return Response.json({error:'请检查书名和补充信息'},{status:400});
 const id=user.id+':'+new Date().toISOString().slice(0,10),entry=attempts.get(id)||{count:0,seen:new Set()};if(entry.count>=3||entry.seen.has(title.toLowerCase()))return Response.json({error:'请求已提交，或今日请求次数已用完，请先查看已有请求'},{status:429});
 if(attempts.size>1000)attempts.delete(attempts.keys().next().value);entry.count++;entry.seen.add(title.toLowerCase());attempts.set(id,entry);
 const requestId=crypto.randomUUID();
 let r;try{const record={id:requestId,title,author,language:input.language,notes,requestedBy:user.name,createdAt:new Date().toISOString(),status:'pending'};const bytes=new TextEncoder().encode(JSON.stringify(record,null,2));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);r=await fetch(`https://api.github.com/repos/${env.CONTENT_REPO}/contents/requests/${requestId}.json`,{method:'PUT',headers:{Authorization:`Bearer ${env.GITHUB_CONTENT_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Slowread-Worker'},body:JSON.stringify({message:`Save book request ${requestId}`,branch:env.CONTENT_REF||'main',content:btoa(binary)})});}catch{r=null}
 if(!r?.ok){entry.count--;entry.seen.delete(title.toLowerCase());return Response.json({error:'暂时无法保存请求，请稍后重试'},{status:503})}return Response.json({id:requestId},{status:201,headers:{'Cache-Control':'no-store'}});
}
