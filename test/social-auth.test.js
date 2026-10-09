import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIdToken,appleClientSecret} from '../src/oidc.js';
import {authRoute} from '../src/auth.js';
import {UserAccount} from '../src/accounts.js';
const enc=new TextEncoder(),b64=b=>Buffer.from(b).toString('base64url');
test('OIDC verifies actual signatures, nonce, audience and expiry',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test'};
 const claims={iss:'https://accounts.google.com',sub:'123',aud:'client',nonce:'nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300};
 const sign=async c=>{const p=b64(enc.encode(JSON.stringify({alg:'RS256',kid:'test'})))+'.'+b64(enc.encode(JSON.stringify(c)));return p+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,enc.encode(p)))};
 const options={issuer:claims.iss,audience:'client',nonce:'nonce',jwksUrl:'https://keys.test/oidc'},fetcher=async()=>Response.json({keys:[jwk]});
 assert.equal((await verifyIdToken(await sign(claims),options,fetcher)).sub,'123');
 for(const change of [{nonce:'wrong'},{aud:'wrong'},{exp:1},{iss:'https://attacker.test'}])await assert.rejects(verifyIdToken(await sign({...claims,...change}),options,fetcher));
 const token=await sign(claims),parts=token.split('.');parts[1]=b64(enc.encode(JSON.stringify({...claims,sub:'attacker'})));await assert.rejects(verifyIdToken(parts.join('.'),options,fetcher));
});
test('Apple client secret has verifiable ES256 signature and short lifetime',async()=>{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
 const token=await appleClientSecret({APPLE_PRIVATE_KEY:pem,APPLE_KEY_ID:'key',APPLE_TEAM_ID:'team',APPLE_CLIENT_ID:'service'}),[h,p,s]=token.split('.');const claims=JSON.parse(Buffer.from(p,'base64url'));
 assert.equal(claims.sub,'service');assert.equal(claims.exp-claims.iat,300);assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,Buffer.from(s,'base64url'),enc.encode(h+'.'+p)));
});
test('provider gates, Google PKCE and Apple form-post state protections',async()=>{
 const env={AUTH_SESSION_SECRET:'a'.repeat(40),ACCOUNTS:{},EMAIL_PROVIDER:'resend',EMAIL_FROM:'test@example.com',RESEND_API_KEY:'test',GOOGLE_CLIENT_ID:'google',GOOGLE_CLIENT_SECRET:'secret',APPLE_CLIENT_ID:'apple',APPLE_TEAM_ID:'team',APPLE_KEY_ID:'key',APPLE_PRIVATE_KEY:'configured'};
 for(const provider of ['google','apple']){const response=await authRoute(new Request('https://slowread.test/api/auth/'+provider+'/start'),env),url=new URL(response.headers.get('Location'));assert.equal(response.status,302);assert.ok(url.searchParams.get('nonce'));if(provider==='google')assert.equal(url.searchParams.get('code_challenge_method'),'S256');else{assert.equal(url.searchParams.get('response_mode'),'form_post');assert.match(response.headers.get('Set-Cookie'),/SameSite=None/)}
 const invalid=await authRoute(new Request('https://slowread.test/api/auth/'+provider+'/callback?code=bad&state=bad',provider==='apple'?{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'code=bad&state=bad'}:{}),env);assert.equal(invalid.status,400)}
 assert.equal((await authRoute(new Request('https://slowread.test/api/auth/providers'),{...env,RESEND_API_KEY:''})).status,200);assert.equal((await (await authRoute(new Request('https://slowread.test/api/auth/providers'),{...env,RESEND_API_KEY:''})).json()).google,false);
});
class Storage{data=new Map();async get(k){return structuredClone(this.data.get(k))}async put(k,v){this.data.set(k,structuredClone(v))}async delete(k){this.data.delete(k)}async setAlarm(t){this.alarm=t}async transaction(fn){return fn(this)}}
test('email OTP stores only digest, prevents replay, throttles sends and keeps minimal profile',async()=>{
 const env={AUTH_SESSION_SECRET:'a'.repeat(40),EMAIL_PROVIDER:'resend',EMAIL_FROM:'test@example.com',RESEND_API_KEY:'test'},objects=new Map();env.ACCOUNTS={idFromName:id=>id,get:id=>{if(!objects.has(id))objects.set(id,new UserAccount({storage:new Storage()},env));return {fetch:(url,options)=>objects.get(id).fetch(new Request(url,options))}}};
 const account=env.ACCOUNTS.get('google:123'),post=(path,body)=>account.fetch('https://account.internal/'+path,{method:'POST',body:JSON.stringify({id:'google:123',...body})});
 const old=globalThis.fetch;let code;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const mail=JSON.parse(options.body);code=mail.text.match(/\d{6}/)[0];return Response.json({id:'mail'})};
 try{assert.equal((await post('send',{email:'reader@example.com'})).status,200);const storage=objects.get('google:123').storage;assert.equal(JSON.stringify(await storage.get('challenge')).includes(code),false);assert.equal((await post('send',{email:'reader@example.com'})).status,429);assert.equal((await post('verify',{code:code==='000000'?'000001':'000000'})).status,400);assert.equal((await post('verify',{code})).status,200);assert.equal((await post('verify',{code})).status,400);assert.deepEqual(Object.keys(await storage.get('profile')).sort(),['email','emailVerifiedAt','id','provider']);
 await storage.put('challenge',{email:'reader@example.com',sent:true,expires:1,tries:0});assert.equal((await post('verify',{code})).status,400);await objects.get('google:123').alarm();assert.equal(await storage.get('challenge'),undefined);
 }finally{globalThis.fetch=old}
});

import {signCookie,verifyCookie} from '../src/auth.js';
import {finishLogin} from '../src/oauth-login.js';
import {emailAccountId} from '../src/identity.js';
function emailEnv(){const env={AUTH_SESSION_SECRET:'a'.repeat(40),EMAIL_PROVIDER:'resend',EMAIL_FROM:'test@example.com',RESEND_API_KEY:'test'},objects=new Map();env.ACCOUNTS={idFromName:id=>id,get:id=>{if(!objects.has(id))objects.set(id,new UserAccount({storage:new Storage()},env));return {fetch:(url,options)=>objects.get(id).fetch(new Request(url,options))}}};return {env,objects}}
const sessionOf=async(r,env)=>verifyCookie(r.headers.get('Set-Cookie').split(';')[0].split('=')[1],env);
test('anonymous email login requires delivered OTP, normalizes identity and rejects replay and cross-origin',async()=>{
 const {env}=emailEnv(),old=globalThis.fetch;let code;
 const post=(path,body,origin='https://slowread.test')=>authRoute(new Request('https://slowread.test/api/auth/email/'+path,{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}),env);
 globalThis.fetch=async(url,options)=>{code=JSON.parse(options.body).text.match(/\d{6}/)[0];return Response.json({id:'mail'})};
 try{assert.equal((await post('verify',{email:'reader@qq.com',code:'123456'})).status,400);assert.equal((await post('send',{email:' READER@QQ.COM '})).status,200);assert.equal((await post('verify',{email:'other@qq.com',code})).status,400);const r=await post('verify',{email:'reader@qq.com',code});assert.equal(r.status,200);const session=await sessionOf(r,env);assert.equal(session.provider,'email');assert.equal(session.name,'reader@qq.com');assert.equal(session.email,'reader@qq.com');assert.ok(session.emailVerifiedAt);assert.match(session.id,/^email:[a-f0-9]{64}$/);assert.equal((await post('verify',{email:'reader@qq.com',code})).status,400);assert.equal((await post('send',{email:'reader@qq.com'},'https://attacker.test')).status,403);
 }finally{globalThis.fetch=old}
});
test('GitHub callback trusts only verified email and never sends another OTP',async()=>{
 const {env}=emailEnv();Object.assign(env,{GITHUB_OAUTH_CLIENT_ID:'client',GITHUB_OAUTH_CLIENT_SECRET:'secret'});const old=globalThis.fetch;let mails=[{email:'wrong@qq.com',primary:true,verified:false},{email:'reader@qq.com',primary:false,verified:true}];
 globalThis.fetch=async url=>url==='https://github.com/login/oauth/access_token'?Response.json({access_token:'token'}):url==='https://api.github.com/user'?Response.json({id:42,login:'reader'}):url==='https://api.github.com/user/emails'?Response.json(mails):assert.fail('unexpected send');
 const callback=async()=>{const state=await signCookie({state:'state',verifier:'verifier',exp:Date.now()+60000},env);return authRoute(new Request('https://slowread.test/api/auth/github/callback?state=state&code=code',{headers:{Cookie:'__Host-slowread-oauth='+state}}),env)};
 try{const r=await callback();assert.equal(r.headers.get('Location'),'/');const session=await sessionOf(r,env);assert.equal(session.id,'github:42');assert.equal(session.email,'reader@qq.com');assert.ok(session.emailVerifiedAt);mails=[];const fresh=emailEnv();Object.assign(fresh.env,{GITHUB_OAUTH_CLIENT_ID:'client',GITHUB_OAUTH_CLIENT_SECRET:'secret'});const pending=await finishLogin({id:'github:99',name:'reader',provider:'github'},fresh.env);assert.equal(pending.headers.get('Location'),'/?verify-email=1');assert.equal((await sessionOf(pending,fresh.env)).emailVerifiedAt,undefined);
 }finally{globalThis.fetch=old}
});
test('email login reuses a previously verified GitHub account and changing GitHub email removes old link',async()=>{
 const {env}=emailEnv();await finishLogin({id:'github:42',name:'reader',provider:'github',email:'reader@qq.com',emailVerifiedAt:Date.now()},env);
 const id=await emailAccountId('reader@qq.com',env),stub=env.ACCOUNTS.get(id);let owner=await stub.fetch('https://account.internal/email-owner',{method:'POST',body:JSON.stringify({id})});assert.equal((await owner.json()).id,'github:42');
 await finishLogin({id:'github:42',name:'reader',provider:'github',email:'new@163.com',emailVerifiedAt:Date.now()},env);owner=await stub.fetch('https://account.internal/email-owner',{method:'POST',body:'{}'});assert.equal((await owner.json()).id,null);
});
test('failed email delivery cannot issue a login session',async()=>{
 const {env}=emailEnv(),old=globalThis.fetch;let code;globalThis.fetch=async(url,options)=>{code=JSON.parse(options.body).text.match(/\d{6}/)[0];return new Response('',{status:503})};const post=(path,body)=>authRoute(new Request('https://slowread.test/api/auth/email/'+path,{method:'POST',headers:{Origin:'https://slowread.test'},body:JSON.stringify(body)}),env);
 try{assert.equal((await post('send',{email:'reader@163.com'})).status,503);const r=await post('verify',{email:'reader@163.com',code});assert.equal(r.status,400);assert.equal(r.headers.has('Set-Cookie'),false)}finally{globalThis.fetch=old}
});
