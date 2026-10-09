// Storage adapter: immutable public metadata only. Account data never enters this cache.
const cache=new Map(),pending=new Map();
const MAX_BYTES=4000000,MAX_CACHE_BYTES=6000000;
let cacheBytes=0;
export function clearMetadataCache(){cache.clear();pending.clear();cacheBytes=0}
export async function catalogFile(path,env={},ttl=600000){
 if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.includes('..'))throw Error('书目路径无效');
 const repo=env.METADATA_REPO||'gmij/slowread-library',ref=env.METADATA_REF||'main';
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('书目存储配置无效');
 const url=`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/metadata/${path}`;
 const saved=cache.get(url);if(saved?.expires>Date.now())return saved.value;
 if(pending.has(url))return pending.get(url);
 const task=(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(15000),cf:{cacheTtl:ttl===60000?60:600}});
  if(!r.ok)throw Error('书目索引暂时无法读取，请稍后重试');
  if(Number(r.headers.get('content-length'))>MAX_BYTES)throw Error('书目索引超过安全大小');
  const reader=r.body.getReader(),chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BYTES){await reader.cancel();throw Error('书目索引超过安全大小')}chunks.push(value)}
  const buffer=new Uint8Array(length);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}
  const value=JSON.parse(new TextDecoder().decode(buffer));
  if(saved){cacheBytes-=saved.bytes;cache.delete(url)}
  while(cache.size>=32||cacheBytes+length>MAX_CACHE_BYTES){const first=cache.keys().next().value;if(!first)break;cacheBytes-=cache.get(first).bytes;cache.delete(first)}
  cache.set(url,{value,bytes:length,expires:Date.now()+ttl});cacheBytes+=length;return value;
 })();pending.set(url,task);try{return await task}finally{pending.delete(url)}
}
export async function catalogManifest(env){const m=await catalogFile('manifest.json',env,60000);if(m.schemaVersion!==1||!/^v-[a-f0-9]{20}$/.test(m.version)||!Number.isSafeInteger(m.totalBooks)||m.totalBooks<1)throw Error('书目索引版本无效');return m}
export async function snapshotFile(manifest,path,env){return catalogFile(`${manifest.version}/${path}`,env)}
