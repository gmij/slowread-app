import {runtimeLimit} from './runtime-limits.js';
import {validAccountId,normalizeEmail} from './identity.js';
import {mailConfigured,sendVerificationEmail} from './mail.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function accountStub(env,id){if(!validAccountId(id)||!env.ACCOUNTS)throw Error('账号服务尚未配置');return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id))}
export async function accountProfile(env,id){if(!env.ACCOUNTS)return null;const r=await accountStub(env,id).fetch('https://account.internal/profile');if(!r.ok)throw Error('账号服务暂时不可用');return (await r.json()).profile}
async function digest(value,env){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.AUTH_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export class UserAccount {
 constructor(state,env){this.storage=state.storage;this.env=env}
 async fetch(request){
  const path=new URL(request.url).pathname;if(request.method==='GET'&&path==='/profile')return json({profile:await this.storage.get('profile')||null});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const input=await request.json(),now=Date.now();
  if(path==='/email-owner'){
   let id;await this.storage.transaction(async tx=>{id=await tx.get('email-owner');if(!id&&validAccountId(input.id)){id=input.id;await tx.put('email-owner',id)}});return json({id:id||null});
  }
  if(path==='/unlink-email-owner'){
   await this.storage.transaction(async tx=>{if(await tx.get('email-owner')===input.id)await tx.delete('email-owner')});return json({ok:true});
  }
  if(path==='/trusted-profile'){
   const email=normalizeEmail(input.email);if(!validAccountId(input.id)||!email)return json({error:'账号无效'},400);
   const profile={id:input.id,provider:input.provider,email,emailVerifiedAt:now};await this.storage.put('profile',profile);return json({profile});
  }
  if(path==='/reserve-mail'){
   const day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7);let accepted=false;
   await this.storage.transaction(async tx=>{const v=await tx.get('quota')||{};if(v.day!==day){v.day=day;v.daily=0}if(v.month!==month){v.month=month;v.monthly=0}if(v.daily<runtimeLimit(this.env,'EMAIL_DAILY_LIMIT')&&v.monthly<runtimeLimit(this.env,'EMAIL_MONTHLY_LIMIT')){v.daily++;v.monthly++;accepted=true;await tx.put('quota',v)}});
   return accepted?json({ok:true}):json({error:'今日邮箱验证名额已用完，请稍后再试'},429);
  }
  if(!validAccountId(input.id))return json({error:'账号无效'},400);
  if(path==='/send'){
   if(!mailConfigured(this.env))return json({error:'邮箱验证服务尚未配置'},503);
   const email=normalizeEmail(input.email)||'';
   if(email.length>254||!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))return json({error:'请填写有效邮箱'},400);
   let accepted=false;await this.storage.transaction(async tx=>{const day=new Date(now).toISOString().slice(0,10),v=await tx.get('send-limit')||{};if(v.day!==day){v.day=day;v.count=0}if((v.last||0)+60000<=now&&v.count<runtimeLimit(this.env,'EMAIL_ACCOUNT_DAILY_LIMIT')){v.count++;v.last=now;accepted=true;await tx.put('send-limit',v)}});
   if(!accepted)return json({error:`请间隔一分钟重发，每个账号每天最多${runtimeLimit(this.env,'EMAIL_ACCOUNT_DAILY_LIMIT')}次`},429);
   const quota=await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('mail-quota-v1')).fetch('https://account.internal/reserve-mail',{method:'POST',body:'{}'});if(!quota.ok)return quota;
   let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=4294000000);const code=String(n%1000000).padStart(6,'0'),challenge=crypto.randomUUID();
   await this.storage.put('challenge',{email,hash:await digest(input.id+':'+email+':'+code,this.env),expires:now+600000,tries:0,challenge,sent:false});
   await this.storage.setAlarm(now+600000);
   try{await sendVerificationEmail(email,code,this.env,challenge);const saved=await this.storage.get('challenge');if(saved?.challenge===challenge){saved.sent=true;await this.storage.put('challenge',saved)}return json({sent:true})}catch{return json({error:'邮件暂时发送失败，请稍后重试'},503)}
  }
  if(path==='/verify'){
   let profile=null;await this.storage.transaction(async tx=>{const c=await tx.get('challenge');if(!c||!c.sent||c.expires<=now||c.tries>=5||!/^\d{6}$/.test(input.code||''))return;c.tries++;if(await digest(input.id+':'+c.email+':'+input.code,this.env)===c.hash){profile={id:input.id,provider:input.id.split(':')[0],email:c.email,emailVerifiedAt:now};await tx.put('profile',profile);await tx.delete('challenge')}else await tx.put('challenge',c)});
   return profile?json({profile}):json({error:'验证码错误、已过期或尝试次数过多'},400);
  }
  return json({error:'Not found'},404);
 }
 async alarm(){const c=await this.storage.get('challenge');if(c&&c.expires<=Date.now())await this.storage.delete('challenge')}
}
