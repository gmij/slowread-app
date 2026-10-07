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
