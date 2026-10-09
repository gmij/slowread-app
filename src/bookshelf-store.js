import {validAccountId} from './identity.js';
import {shelfEntry} from './bookshelf-data.js';
import {validPreference} from './reading-preferences.js';
// Storage contract: list(accountId) -> entries; upsert(accountId, entry) -> void.
// Accounts are always supplied by the verified application layer.
export function createBookshelfStore(env){
 const backend=env.BOOKSHELF_STORAGE||'durable-object';
 if(backend!=='durable-object')throw Error('尚未配置此书架存储适配器');
 if(!env.BOOKSHELVES)throw Error('书架服务暂时不可用，请稍后重试');
 return new DurableObjectBookshelfStore(env.BOOKSHELVES);
}
export class DurableObjectBookshelfStore {
 constructor(namespace){this.namespace=namespace}
 account(id){if(!validAccountId(id))throw Error('书架账号无效');return this.namespace.get(this.namespace.idFromName(id))}
 async list(id){const response=await this.account(id).fetch('https://bookshelf.internal/');if(!response.ok)throw Error('书架读取失败');const data=await response.json();return data.books.map(shelfEntry)}
 async upsert(id,entry){const response=await this.account(id).fetch('https://bookshelf.internal/',{method:'POST',body:JSON.stringify(shelfEntry(entry))});if(!response.ok)throw Error('书架保存失败')}
 async preferences(id){const r=await this.account(id).fetch('https://bookshelf.internal/preferences');if(!r.ok)throw Error('阅读偏好读取失败');return r.json()}
 async savePreference(id,p){const r=await this.account(id).fetch('https://bookshelf.internal/preferences',{method:'POST',body:JSON.stringify(p)});if(!r.ok)throw Error('阅读偏好保存失败')}
}
// Keep the deployed class name, namespace and book keys unchanged during refactoring.
export class UserBookshelf {
 constructor(state){this.storage=state.storage}
 async fetch(request){
  const json=data=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
  if(new URL(request.url).pathname==='/preferences'){
   if(request.method==='GET'){const entries=await this.storage.list({prefix:'preference:book:'});return json({defaults:await this.storage.get('preference:default')||null,books:Object.fromEntries([...entries].map(([k,v])=>[k.slice(16),v]))})}
   if(request.method!=='POST')return new Response(null,{status:405});
   const p=await request.json();if(!validPreference(p)||p.book!==undefined&&!/^gutenberg-[1-9]\d{0,6}$/.test(p.book))return new Response(null,{status:400});
   await this.storage.put(p.book?'preference:book:'+p.book:'preference:default',{purpose:p.purpose,language:p.language,...(p.display?{display:p.display}:{})});return json({saved:true});
  }
  if(request.method==='GET'){const entries=await this.storage.list({prefix:'book:'});return json({books:[...entries.values()].sort((a,b)=>b.updatedAt-a.updatedAt)})}
  if(request.method!=='POST')return new Response(null,{status:405});
  const entry=shelfEntry(await request.json());
  // Prevent a delayed import or older device write from rolling back newer progress.
  await this.storage.transaction(async tx=>{const prior=await tx.get('book:'+entry.book);if(!prior||prior.updatedAt<=entry.updatedAt)await tx.put('book:'+entry.book,entry)});
  return json({saved:true});
 }
}
