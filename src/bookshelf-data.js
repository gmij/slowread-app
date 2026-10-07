// Portable data contract, independent of Cloudflare bindings and authentication.
export const BOOKSHELF_SCHEMA_VERSION=1;
export function shelfEntry(value){
 if(!value||!/^gutenberg-[1-9]\d{0,6}$/.test(value.book)||!/^\d{2,4}$/.test(value.chapter)||!/^p[1-9]\d{0,5}$/.test(value.position)||!['en','zh-CN'].includes(value.language)||!['title','author','chapterTitle'].every(k=>typeof value[k]==='string'&&value[k].length<=1000)||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0)throw Error('书架记录格式无效');
 return Object.fromEntries(['book','title','author','chapter','chapterTitle','position','language','updatedAt'].map(k=>[k,value[k]]));
}
export function shelfSnapshot(accountId,books){
 if(!/^github:\d+$/.test(accountId))throw Error('书架账号无效');
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
