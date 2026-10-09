import {knownBooks,describe,sourceMetadata} from './importer.js';
let cached=null,pending=null,summaryCache=null;
export function clearCatalog(){cached=null;summaryCache=null;clearMetadataCache()}
export async function sharedCatalog(env,metadata=sourceMetadata){
 if(!env.CONTENT_REPO)return knownBooks.map(describe);
 if(cached?.repo===env.CONTENT_REPO&&cached.expires>Date.now())return cached.books;
 if(pending)return pending;
 pending=(async()=>{const books=knownBooks.map(describe);try{const response=await fetch(`https://api.github.com/repos/${env.CONTENT_REPO}/contents/books?ref=${encodeURIComponent(env.CONTENT_REF||'main')}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Slowread-Worker',...(env.GITHUB_CONTENT_TOKEN?{Authorization:`Bearer ${env.GITHUB_CONTENT_TOKEN}`}:{})},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('共享目录暂不可用');const files=await response.json();if(!Array.isArray(files))throw Error('共享目录无效');const ids=files.filter(f=>f.type==='dir'&&/^gutenberg-[1-9]\d{0,6}$/.test(f.name)).map(f=>Number(f.name.slice(10))).filter(n=>!knownBooks.some(b=>b.number===n)).slice(0,30);for(let i=0;i<ids.length;i+=3){const results=await Promise.allSettled(ids.slice(i,i+3).map(metadata));for(const result of results)if(result.status==='fulfilled')books.push(describe(result.value))}cached={repo:env.CONTENT_REPO,books,expires:Date.now()+300000};return books}catch{return books}})();try{return await pending}finally{pending=null}
}

export function parseSourceCount(html){
 const value=html.match(/Project Gutenberg offers ([\d,]+) free eBooks/i)?.[1];
 const count=Number(value?.replaceAll(',',''));if(!Number.isSafeInteger(count)||count<1)throw Error('书源藏书数量暂时无法读取');return count;
}
import {catalogManifest,clearMetadataCache} from './catalog-store.js';
export async function catalogSummary(env){const m=await catalogManifest(env);return {totalBooks:m.totalBooks,canonicalBooks:m.canonicalBooks,source:'Project Gutenberg',scope:'source-catalog',indexedAt:m.syncedAt,providers:m.providers}}
