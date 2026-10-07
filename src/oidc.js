const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const jwksCache=new Map();
export async function verifyIdToken(token,{issuer,audience,nonce,jwksUrl},fetcher=fetch){
 if(typeof token!=='string'||token.length>20000)throw Error('登录令牌无效');const pieces=token.split('.');if(pieces.length!==3)throw Error('登录令牌无效');
 const header=JSON.parse(new TextDecoder().decode(decode(pieces[0]))),claims=JSON.parse(new TextDecoder().decode(decode(pieces[1])));
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('登录签名算法无效');
 let cached=jwksCache.get(jwksUrl),key;
 for(let attempt=0;attempt<2;attempt++){if(!cached||cached.expires<Date.now()||attempt){const response=await fetcher(jwksUrl,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('登录公钥暂时不可用');cached={keys:(await response.json()).keys,expires:Date.now()+3600000};jwksCache.set(jwksUrl,cached)}key=cached.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));if(key)break}
 if(!key)throw Error('登录签名公钥无效');const publicKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,decode(pieces[2]),new TextEncoder().encode(pieces[0]+'.'+pieces[1])))throw Error('登录签名校验失败');
 const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud],now=Math.floor(Date.now()/1000);
 if(![issuer,...(issuer==='https://accounts.google.com'?['accounts.google.com']:[])].includes(claims.iss)||!audiences.includes(audience)||(audiences.length>1&&claims.azp!==audience)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||claims.nonce!==nonce||typeof claims.sub!=='string'||!/^[A-Za-z0-9._-]{1,200}$/.test(claims.sub))throw Error('登录令牌已过期或身份不匹配');
 return claims;
}
export async function appleClientSecret(env){
 const now=Math.floor(Date.now()/1000),head=encode(new TextEncoder().encode(JSON.stringify({alg:'ES256',kid:env.APPLE_KEY_ID}))),body=encode(new TextEncoder().encode(JSON.stringify({iss:env.APPLE_TEAM_ID,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:env.APPLE_CLIENT_ID})));
 const pem=env.APPLE_PRIVATE_KEY.replace(/\\n/g,'\n').replace(/-----[^-]+-----/g,'').replace(/\s/g,'');const key=await crypto.subtle.importKey('pkcs8',decode(pem),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(head+'.'+body));return head+'.'+body+'.'+encode(signature);
}
