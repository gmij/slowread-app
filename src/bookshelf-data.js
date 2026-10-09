import {validAccountId} from './identity.js';
// Portable data contract, independent of Cloudflare bindings and authentication.
export const BOOKSHELF_SCHEMA_VERSION=1;
export function shelfEntry(value){
 if(!value||!/^gutenberg-[1-9]\d{0,6}$/.test(value.book)||!/^\d{2,4}$/.test(value.chapter)||!/^p[1-9]\d{0,5}$/.test(value.position)||!['en','zh-CN'].includes(value.language)||!['title','author','chapterTitle'].every(k=>typeof value[k]==='string'&&value[k].length<=1000)||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0)throw Error('书架记录格式无效');
 if(value.canonicalId&&!/^bk_[a-f0-9]{24}$/.test(value.canonicalId))throw Error('书籍标识无效');
 if(value.sourceEditionId&&!/^gutenberg:[1-9]\d{0,6}$/.test(value.sourceEditionId))throw Error('来源版本标识无效');
 const result=Object.fromEntries(['book','title','author','chapter','chapterTitle','position','language','updatedAt'].map(k=>[k,value[k]]));
 if(value.canonicalId)result.canonicalId=value.canonicalId;if(value.sourceEditionId)result.sourceEditionId=value.sourceEditionId;return result;
}
export function shelfSnapshot(accountId,books){
 if(!validAccountId(accountId))throw Error('书架账号无效');
 return {schemaVersion:BOOKSHELF_SCHEMA_VERSION,accountId,books:books.map(shelfEntry)};
}
export async function importShelfSnapshot(store,accountId,snapshot){
 if(snapshot?.schemaVersion!==BOOKSHELF_SCHEMA_VERSION||snapshot.accountId!==accountId||!Array.isArray(snapshot.books))throw Error('书架版本或账号不匹配');
 // Validate everything before writes; adapter writes must preserve supplied timestamps.
 const entries=snapshot.books.map(shelfEntry);
 if(new Set(entries.map(e=>e.book)).size!==entries.length)throw Error('书架记录重复');
 for(const entry of entries)await store.upsert(accountId,entry);
 return entries.length;
}
