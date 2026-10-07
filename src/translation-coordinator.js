import {translateParagraph,languages} from './translator.js';

// One named object coordinates all new inference across Worker isolates.
export class TranslationCoordinator {
 constructor(state,env){this.state=state;this.env=env;this.jobs=new Map();this.cache=new Map();this.used=0;this.day='';state.blockConcurrencyWhile(async()=>{const saved=await state.storage.get('budget');if(saved){this.day=saved.day;this.used=saved.used}})}
 limit(){const n=Number(this.env.TRANSLATION_DAILY_CHARACTERS||100000);return Number.isFinite(n)&&n>=0?n:0}
 async reset(){const day=new Date().toISOString().slice(0,10);if(day!==this.day){this.day=day;this.used=0;await this.state.storage.put('budget',{day,used:0})}}
 async fetch(request){
  await this.reset();
  const headers={'Cache-Control':'no-store'};
  if(new URL(request.url).pathname==='/status')return Response.json({available:this.used<this.limit(),remainingCharacters:Math.max(0,this.limit()-this.used),maximumCharacters:this.limit(),activeTasks:this.jobs.size,message:this.used>=this.limit()?'今日试用翻译额度已用完，可继续阅读已有译文和原文。':'新翻译使用全站每日试用额度；额度每日 UTC 00:00 重置。'}, {headers});
  const {text,target,sourceLanguage}=await request.json();
  if(typeof text!=='string'||!text.trim()||text.length>12000||!languages[target]||!['en','zh-CN'].includes(sourceLanguage))return Response.json({error:'翻译任务无效'},{status:400,headers});
  const key=sourceLanguage+':'+target+':'+text;
  const cached=this.cache.get(key);if(cached?.expires>Date.now())return Response.json({...cached.result,cached:true},{headers});
  if(this.jobs.has(key))return (await this.jobs.get(key)).clone();
  if(this.jobs.size>=2)return Response.json({error:'翻译服务正在处理其他章节，请稍后点击继续翻译。'},{status:429,headers});
  // Reserve a slot before any await; otherwise concurrent arrivals can bypass limits.
  const task=this.run(text,target,sourceLanguage,headers,key);this.jobs.set(key,task);
  try{return (await task).clone()}finally{this.jobs.delete(key)}
 }
 async run(text,target,sourceLanguage,headers,key){
  let accepted=false;
  await this.state.storage.transaction(async tx=>{const saved=await tx.get('budget')||{day:this.day,used:0};if(saved.used+text.length<=this.limit()){saved.used+=text.length;await tx.put('budget',saved);this.used=saved.used;accepted=true}});
  if(!accepted)return Response.json({error:'今日试用翻译额度不足，可继续阅读已有译文和原文，明天再继续翻译。'},{status:429,headers});
  try{const result=await translateParagraph(text,target,this.env.AI,sourceLanguage);if(this.cache.size>=500)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{result,expires:Date.now()+3600000});return Response.json(result,{headers})}catch(error){return Response.json({error:error.message||'翻译暂时失败，请稍后继续。'},{status:503,headers})}
 }
}
