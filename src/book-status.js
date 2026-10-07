import {sourceHash,translationPath} from './shared-library.js';
let cachedTree;
async function translationPaths(env){
 const key=env.CONTENT_REPO+':'+(env.CONTENT_REF||'main');
 if(cachedTree?.key===key&&cachedTree.expires>Date.now())return cachedTree.paths;
 const headers={'Accept':'application/vnd.github+json','User-Agent':'Slowread-Worker'};
 if(env.GITHUB_CONTENT_TOKEN)headers.Authorization=`Bearer ${env.GITHUB_CONTENT_TOKEN}`;
 const r=await fetch(`https://api.github.com/repos/${env.CONTENT_REPO}/git/trees/${encodeURIComponent(env.CONTENT_REF||'main')}?recursive=1`,{headers});
 if(!r.ok)throw new Error('暂时无法读取整本翻译进度');const data=await r.json();if(data.truncated||!Array.isArray(data.tree))throw new Error('翻译目录暂时无法完整读取');
 const paths=new Set(data.tree.filter(p=>p.type==='blob').map(p=>p.path));cachedTree={key,paths,expires:Date.now()+30000};return paths;
}
export function invalidateBookStatus(){cachedTree=null}
export async function bookStatus(book,target,env){
 const original=target===(book.sourceLanguage||'en');
 const paths=original?new Set():await translationPaths(env);
 const chapters=await Promise.all(book.sections.map(async c=>({id:c.id,translated:original||paths.has(translationPath(book,c,target,await sourceHash(c)))||(book.number===1342&&target==='zh-CN'&&c.id==='01')})));
 const completed=chapters.filter(c=>c.translated).length,total=chapters.length,unit=book.sections.some(c=>c.title?.startsWith('阅读分节'))?'节':'章';
 return {target,sourceLanguage:book.sourceLanguage||'en',original,totalChapters:total,translatedChapters:completed,percent:total?Math.round(completed/total*100):0,unit,chapters,updatedAt:new Date().toISOString(),basis:original?'原文完整可读':unit==='节'?'按完整阅读分节计算，未完成段落不计入':'按已保存的完整章节计算，未完成段落不计入',readers:null,shares:null,statisticsNotice:'读者和分享统计尚未接入'};
}
