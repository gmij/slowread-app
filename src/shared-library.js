import {MODEL,PROMPT_VERSION} from './translator.js';
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sourceHash(chapter){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(chapter.paragraphs))));}
export const translationPath=(book,chapter,target,hash)=>`books/${book.id}/translations/${target}/${chapter.id}-${hash}${book.sourceLanguage==='zh-CN'&&target==='en'?'-'+PROMPT_VERSION:''}.json`;
const path=translationPath;
function config(env){if(!env.GITHUB_CONTENT_TOKEN)throw new Error('共享译文保存尚未配置，暂时无法启动新翻译。');if(!/^[\w-]+\/[\w.-]+$/.test(env.CONTENT_REPO||''))throw new Error('内容仓库未配置');}
async function github(env,file,options={}){config(env);return fetch(`https://api.github.com/repos/${env.CONTENT_REPO}/contents/${file}`,{...options,headers:{'Accept':'application/vnd.github+json','User-Agent':'Slowread-Worker','X-GitHub-Api-Version':'2022-11-28','Authorization':`Bearer ${env.GITHUB_CONTENT_TOKEN}`,'Content-Type':'application/json',...(options.headers||{})}});}
const encode=value=>{const bytes=encoder.encode(JSON.stringify(value));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary)};
const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))));
export async function readShared(book,chapter,target,env){
 const hash=await sourceHash(chapter),filePath=path(book,chapter,target,hash);
 const r=env.GITHUB_CONTENT_TOKEN?await github(env,filePath+`?ref=${encodeURIComponent(env.CONTENT_REF||'main')}`):await fetch(`https://raw.githubusercontent.com/${env.CONTENT_REPO}/${env.CONTENT_REF||'main'}/${filePath}`);
 if(r.status===404)return null;if(!r.ok)throw new Error('共享书库暂时无法读取，请稍后再试。');
 const file=await r.json(),data=env.GITHUB_CONTENT_TOKEN?decode(file.content):file;
 if(data.sourceHash!==hash||data.language!==target||data.paragraphs?.length!==chapter.paragraphs.length||data.paragraphs.some((p,i)=>p.en!==chapter.paragraphs[i].text||typeof p.zh!=='string'||!p.zh.trim()))throw new Error('共享译文版本不匹配。');
 return {...data,shared:true};
}
async function signingKey(env){config(env);return crypto.subtle.importKey('raw',encoder.encode('slowread-receipt-v1:'+env.GITHUB_CONTENT_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const receiptPayload=(book,chapter,target,hash,index,text)=>JSON.stringify({book:book.id,chapter:chapter.id,target,hash,index,text,model:MODEL,...(book.sourceLanguage==='zh-CN'&&target==='en'?{promptVersion:PROMPT_VERSION}:{})});
export async function receipt(book,chapter,target,index,text,env){const hash=await sourceHash(chapter);return {sourceHash:hash,signature:hex(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(receiptPayload(book,chapter,target,hash,index,text))))};}
export async function saveShared(book,chapter,target,rows,env){
 config(env);const hash=await sourceHash(chapter),key=await signingKey(env);
 if(!Array.isArray(rows)||rows.length!==chapter.paragraphs.length)throw new Error('本章尚未翻译完整，暂不提交。');
 for(let i=0;i<rows.length;i++){const row=rows[i];if(row.index!==i||typeof row.text!=='string'||row.text.length>24000||!row.text.trim()||!/^[a-f0-9]{64}$/.test(row.signature||''))throw new Error('译文提交校验失败。');const signature=Uint8Array.from(row.signature.match(/../g),h=>parseInt(h,16));if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(receiptPayload(book,chapter,target,hash,i,row.text))))throw new Error('译文提交校验失败。');}
 const existing=await readShared(book,chapter,target,env);if(existing)return existing;
 const result={bookId:book.id,id:chapter.id,title:chapter.title,language:target,sourceLanguage:book.sourceLanguage||'en',sourceHash:hash,model:MODEL,promptVersion:PROMPT_VERSION,source:book.source,paragraphs:chapter.paragraphs.map((p,i)=>({id:p.id,en:p.text,zh:rows[i].text})),createdAt:new Date().toISOString()};
 // Immutable source-version files avoid overwriting another reader's completed chapter.
 const originalFile=`books/${book.id}/chapters/${chapter.id}-${hash}.json`;
 const originalResult=await github(env,originalFile,{method:'PUT',body:JSON.stringify({message:`Import ${book.id} chapter ${chapter.id}`,branch:env.CONTENT_REF||'main',content:encode({bookId:book.id,id:chapter.id,title:chapter.title,sourceHash:hash,source:book.source,paragraphs:chapter.paragraphs})})});
 if(!originalResult.ok&&![409,422].includes(originalResult.status))throw new Error('原文章节保存失败，请稍后重试。');
 const r=await github(env,path(book,chapter,target,hash),{method:'PUT',body:JSON.stringify({message:`Save ${target} translation for ${book.id} chapter ${chapter.id}`,branch:env.CONTENT_REF||'main',content:encode(result)})});
 if(!r.ok){if([409,422].includes(r.status)){const winner=await readShared(book,chapter,target,env);if(winner)return winner;}throw new Error('译文保存失败。已完成译文保留，可重试提交。');}
 return {...result,shared:true};
}
