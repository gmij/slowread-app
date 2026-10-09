const enc=new TextEncoder();
import {socialRoute,socialConfigured,finishLogin} from './oauth-login.js';
import {accountStub} from './accounts.js';
import {mailConfigured} from './mail.js';
import {normalizeEmail,emailAccountId} from './identity.js';
const base64=bytes=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const unbase64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const random=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
function configured(env){return !!(env.GITHUB_OAUTH_CLIENT_ID&&env.GITHUB_OAUTH_CLIENT_SECRET&&env.AUTH_SESSION_SECRET)}
async function key(env){if(!env.AUTH_SESSION_SECRET||env.AUTH_SESSION_SECRET.length<32)throw new Error('登录服务尚未启用');return crypto.subtle.importKey('raw',enc.encode(env.AUTH_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export async function signCookie(value,env){const payload=base64(enc.encode(JSON.stringify(value)));return payload+'.'+base64(await crypto.subtle.sign('HMAC',await key(env),enc.encode(payload)))}
export async function verifyCookie(value,env){try{const [payload,signature,extra]=value.split('.');if(extra||!await crypto.subtle.verify('HMAC',await key(env),unbase64(signature),enc.encode(payload)))return null;const data=JSON.parse(new TextDecoder().decode(unbase64(payload)));return data.exp>Date.now()?data:null}catch{return null}}
const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const getCookie=(request,name)=>request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function authRoute(request,env){
 const url=new URL(request.url),path=url.pathname;if(path!=='/api/me'&&!path.startsWith('/api/auth/'))return null;
 if(path==='/api/auth/providers')return json({github:configured(env),google:socialConfigured('google',env),apple:socialConfigured('apple',env),emailVerification:mailConfigured(env)&&!!env.ACCOUNTS,x:false,bookRequests:env.BOOK_REQUESTS_ENABLED==='true'});
 if(path==='/api/me'){const session=await verifyCookie(getCookie(request,'__Host-slowread-session'),env);return json({user:session?{id:session.id,name:session.name,provider:session.provider||'github',email:session.email||null,emailVerified:!!session.emailVerifiedAt}:null})}
 if(path==='/api/auth/email/send'||path==='/api/auth/email/verify'){
  if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'请从本站验证邮箱'},403);
  const existing=await verifyCookie(getCookie(request,'__Host-slowread-session'),env);
  if(!mailConfigured(env)||!env.ACCOUNTS)return json({error:'邮箱验证服务尚未配置'},503);
  const text=await request.text();if(text.length>1024)return json({error:'请求过长'},413);let input;try{input=JSON.parse(text)}catch{return json({error:'请求无效'},400)}
  const email=normalizeEmail(input?.email);if(!existing&&!email)return json({error:'请填写有效邮箱'},400);
  const session=existing||{id:await emailAccountId(email,env),name:email,provider:'email'};
  const response=await accountStub(env,session.id).fetch('https://account.internal/'+(path.endsWith('/send')?'send':'verify'),{method:'POST',body:JSON.stringify({id:session.id,email:input?.email,code:input?.code})});if(!response.ok||path.endsWith('/send'))return response;
  const {profile}=await response.json();
  if(!existing){const ownerResponse=await accountStub(env,session.id).fetch('https://account.internal/email-owner',{method:'POST',body:JSON.stringify({id:session.id})});if(!ownerResponse.ok)return json({error:'账号服务暂时不可用'},503);session.id=(await ownerResponse.json()).id}
  return new Response(JSON.stringify({verified:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie('__Host-slowread-session',await signCookie({...session,email:profile.email,emailVerifiedAt:profile.emailVerifiedAt,exp:Date.now()+604800000},env),604800)}});
 }
 const social=await socialRoute(request,env);if(social)return social;
 if(path==='/api/auth/logout'){if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'Invalid request'},403);return new Response(null,{status:204,headers:{'Set-Cookie':cookie('__Host-slowread-session','',0),'Cache-Control':'no-store'}})}
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!configured(env))return json({error:'GitHub 登录尚未配置'},503);
 if(path==='/api/auth/github/start'){
  const state=random(),verifier=random(),challenge=base64(await crypto.subtle.digest('SHA-256',enc.encode(verifier)));
  const target=new URL('https://github.com/login/oauth/authorize');target.searchParams.set('client_id',env.GITHUB_OAUTH_CLIENT_ID);target.searchParams.set('redirect_uri',url.origin+'/api/auth/github/callback');target.searchParams.set('scope','user:email');target.searchParams.set('state',state);target.searchParams.set('code_challenge',challenge);target.searchParams.set('code_challenge_method','S256');
  return new Response(null,{status:302,headers:{Location:target.href,'Set-Cookie':cookie('__Host-slowread-oauth',await signCookie({state,verifier,exp:Date.now()+600000},env),600),'Cache-Control':'no-store'}});
 }
 if(path==='/api/auth/github/callback'){
  const state=await verifyCookie(getCookie(request,'__Host-slowread-oauth'),env);if(!state||state.state!==url.searchParams.get('state')||!url.searchParams.get('code'))return json({error:'登录校验失败，请重新登录'},400);
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GITHUB_OAUTH_CLIENT_ID,client_secret:env.GITHUB_OAUTH_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:url.origin+'/api/auth/github/callback',code_verifier:state.verifier})});
  const token=await response.json();if(!response.ok||!token.access_token)return json({error:'登录未完成，请重试'},400);
  const profileResponse=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/vnd.github+json','User-Agent':'Slowread-Worker'}});if(!profileResponse.ok)return json({error:'暂时无法确认 GitHub 身份'},503);const profile=await profileResponse.json();if(!Number.isSafeInteger(profile.id)||typeof profile.login!=='string')return json({error:'身份信息无效'},400);
  const emailsResponse=await fetch('https://api.github.com/user/emails',{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/vnd.github+json','User-Agent':'Slowread-Worker'},signal:AbortSignal.timeout(15000)});
  if(!emailsResponse.ok)return json({error:'无法读取 GitHub 已验证邮箱，请重新授权登录'},503);
  const emails=await emailsResponse.json();const verified=Array.isArray(emails)?emails.filter(x=>x.verified===true&&normalizeEmail(x.email)):[];const email=(verified.find(x=>x.primary===true)||verified[0])?.email;
  const result=await finishLogin({id:`github:${profile.id}`,name:profile.login,provider:'github',email:normalizeEmail(email),emailVerifiedAt:email?Date.now():undefined},env);result.headers.append('Set-Cookie',cookie('__Host-slowread-oauth','',0));return result;
 }
 return json({error:'Not found'},404);
}
