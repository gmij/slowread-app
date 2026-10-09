import {signCookie,verifyCookie} from './auth.js';
import {verifyIdToken,appleClientSecret} from './oidc.js';
import {accountProfile,accountStub} from './accounts.js';
import {normalizeEmail,emailAccountId} from './identity.js';
import {mailConfigured} from './mail.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const cookie=(name,value,maxAge,sameSite='Lax')=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;
const getCookie=(r,name)=>r.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
export function socialConfigured(provider,env){return !!(env.AUTH_SESSION_SECRET&&env.ACCOUNTS&&mailConfigured(env)&&(provider==='google'?env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET:provider==='apple'?env.APPLE_CLIENT_ID&&env.APPLE_TEAM_ID&&env.APPLE_KEY_ID&&env.APPLE_PRIVATE_KEY:false))}
export async function finishLogin(identity,env){
 if(identity.provider==='github'&&identity.emailVerifiedAt&&normalizeEmail(identity.email)&&env.ACCOUNTS){
  const previous=await accountProfile(env,identity.id);if(previous?.email&&normalizeEmail(previous.email)!==normalizeEmail(identity.email))await accountStub(env,await emailAccountId(normalizeEmail(previous.email),env)).fetch('https://account.internal/unlink-email-owner',{method:'POST',body:JSON.stringify({id:identity.id})});
  const trusted=await accountStub(env,identity.id).fetch('https://account.internal/trusted-profile',{method:'POST',body:JSON.stringify(identity)});if(!trusted.ok)throw Error('账号服务暂时不可用');
  await accountStub(env,await emailAccountId(normalizeEmail(identity.email),env)).fetch('https://account.internal/email-owner',{method:'POST',body:JSON.stringify({id:identity.id})});
 }
 const profile=await accountProfile(env,identity.id);const session={id:identity.id,provider:identity.provider,name:identity.name||'慢读读者',...(profile?{email:profile.email,emailVerifiedAt:profile.emailVerifiedAt}:typeof identity.email==='string'&&identity.email.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(identity.email)?{email:identity.email}:{}),exp:Date.now()+604800000};
 if(identity.emailVerifiedAt&&identity.email){session.email=normalizeEmail(identity.email);session.emailVerifiedAt=identity.emailVerifiedAt}
 const headers=new Headers({Location:session.emailVerifiedAt?'/':'/?verify-email=1','Cache-Control':'no-store'});headers.append('Set-Cookie',cookie('__Host-slowread-session',await signCookie(session,env),604800));return new Response(null,{status:302,headers});
}
export async function socialRoute(request,env){
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/auth\/(google|apple)\/(start|callback)$/);if(!match)return null;const [,provider,action]=match,name='__Host-slowread-oauth-'+provider;
 if(!socialConfigured(provider,env))return json({error:(provider==='google'?'Google':'Apple')+' 登录尚未配置'},503);
 if(url.protocol!=='https:')return json({error:'请使用安全连接登录'},400);
 if(action==='start'){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const state=random(),nonce=random(),verifier=random(),clientId=provider==='google'?env.GOOGLE_CLIENT_ID:env.APPLE_CLIENT_ID;
  const target=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://appleid.apple.com/auth/authorize');for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:url.origin+'/api/auth/'+provider+'/callback',response_type:'code',scope:provider==='google'?'openid email':'email',state,nonce}))target.searchParams.set(k,v);
  if(provider==='google'){target.searchParams.set('code_challenge_method','S256');target.searchParams.set('code_challenge',encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))}else target.searchParams.set('response_mode','form_post');
  return new Response(null,{status:302,headers:{Location:target.href,'Cache-Control':'no-store','Set-Cookie':cookie(name,await signCookie({provider,state,nonce,verifier,exp:Date.now()+600000},env),600,provider==='apple'?'None':'Lax')}});
 }
 if(request.method!==(provider==='apple'?'POST':'GET'))return json({error:'Method not allowed'},405);
 if(provider==='apple'&&(Number(request.headers.get('Content-Length')||0)>20000||!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')))return json({error:'登录回调无效'},400);
 let input=url.searchParams;if(provider==='apple'){const text=await request.text();if(text.length>20000)return json({error:'登录回调过长'},413);input=new URLSearchParams(text)}
 const state=await verifyCookie(getCookie(request,name),env);if(!state||state.provider!==provider||state.state!==input.get('state')||!input.get('code')||input.get('code').length>4096)return json({error:'登录校验失败，请重新登录'},400);
 const response=await fetch(provider==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:provider==='google'?env.GOOGLE_CLIENT_ID:env.APPLE_CLIENT_ID,client_secret:provider==='google'?env.GOOGLE_CLIENT_SECRET:await appleClientSecret(env),code:input.get('code'),grant_type:'authorization_code',redirect_uri:url.origin+'/api/auth/'+provider+'/callback',...(provider==='google'?{code_verifier:state.verifier}:{})}),signal:AbortSignal.timeout(15000)});
 const tokens=await response.json();if(!response.ok||!tokens.id_token)return json({error:'登录未完成，请重试'},400);
 const claims=await verifyIdToken(tokens.id_token,{issuer:provider==='google'?'https://accounts.google.com':'https://appleid.apple.com',audience:provider==='google'?env.GOOGLE_CLIENT_ID:env.APPLE_CLIENT_ID,nonce:state.nonce,jwksUrl:provider==='google'?'https://www.googleapis.com/oauth2/v3/certs':'https://appleid.apple.com/auth/keys'});
 const result=await finishLogin({id:provider+':'+claims.sub,provider,email:(claims.email_verified===true||claims.email_verified==='true')?claims.email:undefined},env);result.headers.append('Set-Cookie',cookie(name,'',0,provider==='apple'?'None':'Lax'));return result;
}
