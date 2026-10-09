import {catalogManifest,snapshotFile} from './catalog-store.js';
const displayTitles={1342:'傲慢与偏见',11:'爱丽丝梦游仙境',1661:'福尔摩斯冒险史',84:'弗兰肯斯坦',23962:'西游记'};
export function searchTokens(text){return [...new Set(text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').match(/[a-z0-9]{2,}|[\u3400-\u9fff]/g)||[])].slice(0,8)}
async function bucket(token){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,2)}
export function bookCard(record){const number=Number(record.externalId);return {id:record.id,number,canonicalId:record.canonicalId,sourceEditionId:record.sourceEditionId,providerId:record.providerId,title:displayTitles[number]||record.title,titleEn:record.title,author:record.authors.join('; ')||'佚名',sourceLanguage:record.languages[0]==='zh'?'zh-CN':record.languages[0]||'en',languages:record.languages,subjects:record.subjects,bookshelves:record.bookshelves,rights:record.rights,assets:record.assets,source:{url:`https://www.gutenberg.org/ebooks/${number}`,notice:'原文来自 Project Gutenberg，保留原书来源及许可；各地区版权规则可能不同。'}}}
export async function editionMetadata(number,env={},manifest){if(!Number.isSafeInteger(number)||number<1||number>9999999)throw Error('书源编号无效');const m=manifest||await catalogManifest(env);const data=await snapshotFile(m,`editions/${Math.floor(number/1000)}.json`,env);const record=data[number];if(!record)throw Error('书目中尚未收录此版本');return record}
async function cards(ids,m,env){const groups=[...new Set(ids.map(n=>Math.floor(n/1000)))],records={};for(let i=0;i<groups.length;i+=4){await Promise.all(groups.slice(i,i+4).map(async group=>Object.assign(records,await snapshotFile(m,`editions/${group}.json`,env))))}return ids.map(n=>records[n]).filter(Boolean).map(bookCard)}
export async function indexedSearch(query,env={}){
 if(typeof query!=='string'||query.length>160)throw Error('搜索内容过长');const terms=searchTokens(query);if(!terms.length)return {books:[],searchScope:'慢读书目索引'};
 const m=await catalogManifest(env),buckets=await Promise.all(terms.map(bucket)),data={};await Promise.all([...new Set(buckets)].map(async key=>{data[key]=await snapshotFile(m,`search/${key}.json`,env)}));
 const lists=terms.map((term,i)=>data[buckets[i]][term]||[]).sort((a,b)=>a.length-b.length);
 const sets=lists.slice(1).map(list=>new Set(list));const matches=lists[0].filter(id=>sets.every(set=>set.has(id)));
 const books=await cards(matches.slice(0,12),m,env);return {books,total:matches.length,searchScope:'慢读书目索引',indexedAt:m.syncedAt};
}
export async function indexedBrowse(input,env={}){
 const page=Number(input.get('page')||1),language=input.get('language')||'',shelf=input.get('shelf')||'',authorId=input.get('author_id')||'',author=(input.get('author')||'').trim();
 if(!Number.isInteger(page)||page<1||page>10000||!['','en','zh','fr','de','es'].includes(language)||author.length>80||[shelf,authorId].some(v=>v&&!/^\d{1,14}$/.test(v)))throw Error('目录筛选条件无效');
 const m=await catalogManifest(env);let path=shelf?'shelf-'+shelf:authorId?'author-'+authorId:language?'language-'+language:'all';
 let ids;if(shelf||authorId){const kind=shelf?'shelf':'author',id=shelf||authorId;ids=(await snapshotFile(m,`browse/${kind}/${Number(id)%256}.json`,env))[id]||[]}else ids=await snapshotFile(m,`browse/${path}.json`,env);
 if(language&&(shelf||authorId)){const allowed=new Set(await snapshotFile(m,`browse/language-${language}.json`,env));ids=ids.filter(id=>allowed.has(id))}
 if(author){const result=await matchingIds(author,m,env);const allowed=new Set(result);ids=ids.filter(id=>allowed.has(id))}
 const books=await cards(ids.slice((page-1)*25,page*25),m,env);return {books,page,hasNext:page*25<ids.length,total:ids.length,indexedAt:m.syncedAt};
}
async function matchingIds(query,m,env){const terms=searchTokens(query);if(!terms.length)return [];const lists=await Promise.all(terms.map(async term=>(await snapshotFile(m,`search/${await bucket(term)}.json`,env))[term]||[]));lists.sort((a,b)=>a.length-b.length);const sets=lists.slice(1).map(x=>new Set(x));return lists[0].filter(n=>sets.every(s=>s.has(n)))}
export async function indexedDirectory(input,env={},translate=value=>value){
 const kind=input.get('kind')||'categories',letter=input.get('letter')||'a',page=Number(input.get('page')||1);
 if(!['categories','lists','authors'].includes(kind)||! /^[a-z]$/.test(letter)||!Number.isInteger(page)||page<1||page>1000)throw Error('目录条件无效');
 const m=await catalogManifest(env);
 if(kind==='authors'){const all=await snapshotFile(m,`authors/${letter}.json`,env);return {authors:all.slice((page-1)*60,page*60),page,hasNext:page*60<all.length,total:all.length,indexedAt:m.syncedAt}}
 const directory=await snapshotFile(m,'directory.json',env);const entries=directory.filter(x=>x.category===(kind==='categories')).map(x=>({...x,title:translate(x.title)}));
 // Preserve source taxonomy. Group alphabetically rather than inventing genre relationships.
 const groups=new Map();for(const item of entries){const letter=kind==='categories'?translate(item.group||'Other'):item.titleEn[0]?.toUpperCase()||'#';if(!groups.has(letter))groups.set(letter,[]);groups.get(letter).push(item)}
 return {groups:[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([title,items])=>({title,items:items.sort((a,b)=>a.titleEn.localeCompare(b.titleEn))})),indexedAt:m.syncedAt};
}

export async function canonicalMetadata(id,env={}){if(!/^bk_[a-f0-9]{24}$/.test(id))throw Error('书籍标识无效');const m=await catalogManifest(env);const books=await snapshotFile(m,`books/${id.slice(3,5)}.json`,env);if(!books[id])throw Error('没有找到这本书');return books[id]}
