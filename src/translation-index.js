const file='indexes/translations-zh-CN.json';
const cache=new Map();
const encoder=new TextEncoder();
const decode=content=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
const encode=data=>{let binary='';for(const byte of encoder.encode(JSON.stringify(data)))binary+=String.fromCharCode(byte);return btoa(binary)};
async function request(env,options={}){return fetch(`https://api.github.com/repos/${env.CONTENT_REPO}/contents/${file}${options.method?'':'?ref='+encodeURIComponent(env.CONTENT_REF||'main')}`,{...options,headers:{Accept:'application/vnd.github+json','User-Agent':'Slowread-Worker','Authorization':`Bearer ${env.GITHUB_CONTENT_TOKEN}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(12000)})}
export function mergeTranslationIndex(index,book,chapter,saved){
 const books=[...(index?.books||[])],existing=books.find(b=>b.id===book.id);
 const row={id:book.id,canonicalId:book.canonicalId||existing?.canonicalId,sourceEditionId:book.sourceEditionId||existing?.sourceEditionId,title:book.title,titleEn:book.titleEn||book.title,author:book.author,sourceLanguage:book.sourceLanguage||'en',totalChapters:book.chapters?.length||book.sections?.length,unit:book.sections?.some(c=>c.title?.startsWith('阅读分节'))?'节':'章',chapters:[...(existing?.chapters||[]).filter(c=>c.id!==chapter.id),{id:chapter.id,title:chapter.title,sourceHash:saved.sourceHash}].sort((a,b)=>a.id.localeCompare(b.id)),updatedAt:new Date().toISOString()};
 return {version:1,language:'zh-CN',updatedAt:new Date().toISOString(),books:[row,...books.filter(b=>b.id!==book.id)]};
}
export async function readTranslationIndex(env){
 const key=env.CONTENT_REPO+':'+(env.CONTENT_REF||'main');const saved=cache.get(key);if(saved?.expires>Date.now())return saved.value;
 const url=`https://raw.githubusercontent.com/${env.CONTENT_REPO}/${env.CONTENT_REF||'main'}/${file}`;const r=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('译文索引暂时无法读取，请稍后重试');const value=await r.json();if(value.version!==1||value.language!=='zh-CN'||!Array.isArray(value.books))throw Error('译文索引格式无效');cache.set(key,{value,expires:Date.now()+60000});return value;
}
export async function updateTranslationIndex(book,chapter,saved,env){
 for(let attempt=0;attempt<5;attempt++){
 const current=await request(env);if(!current.ok&&current.status!==404)throw Error('译文已保存，索引暂未更新，请重试提交');const record=current.ok?await current.json():null;const value=mergeTranslationIndex(record?decode(record.content):null,book,chapter,saved);
 const r=await request(env,{method:'PUT',body:JSON.stringify({message:`Index Chinese translation ${book.id} chapter ${chapter.id}`,branch:env.CONTENT_REF||'main',...(record?.sha?{sha:record.sha}:{}),content:encode(value)})});
 if(r.ok){cache.set(env.CONTENT_REPO+':'+(env.CONTENT_REF||'main'),{value,expires:Date.now()+60000});return}if(![409,422].includes(r.status))break;
 }throw Error('译文已保存，索引更新未完成，请重试提交');
}
