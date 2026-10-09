import {verifyCookie} from './auth.js';
import {validAccountId} from './identity.js';
import {createBookshelfStore} from './bookshelf-store.js';
export function validPreference(p){return p&&['read','study'].includes(p.purpose)&&p.language==='zh-CN'&&(p.display===undefined||validDisplay(p.display))}
export function validDisplay(d){return d&&['scroll','pages'].includes(d.turn)&&['paper','white','green','night'].includes(d.theme)&&['serif','sans'].includes(d.font)&&[16,18,20,22,24,28].includes(d.size)&&[1.5,1.8,2.1].includes(d.lineHeight)}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function preferencesRoute(request,env,storeFactory=createBookshelfStore){
 const url=new URL(request.url),raw=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-slowread-session='))?.slice(24)||'';
 const session=await verifyCookie(raw,env);
 if(!session||!validAccountId(session.id))return json({error:'请先登录后保存账号偏好'},401);
 if(!session.id.startsWith('github:')&&!session.emailVerifiedAt)return json({error:'请先验证联系邮箱'},403);
 const store=storeFactory(env);
 if(request.method==='GET')return json(await store.preferences(session.id));
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('Origin')!==url.origin)return json({error:'请从本站保存偏好'},403);
 const text=await request.text();if(text.length>1024)return json({error:'偏好内容过长'},413);
 let input;try{input=JSON.parse(text)}catch{return json({error:'偏好无效'},400)}
 if(!validPreference(input)||input.book!==undefined&&!/^gutenberg-[1-9]\d{0,6}$/.test(input.book))return json({error:'偏好无效'},400);
 await store.savePreference(session.id,{purpose:input.purpose,language:input.language,...(input.display?{display:input.display}:{}),...(input.book?{book:input.book}:{})});
 return json({saved:true});
}
