import {sharedCatalog} from './library-catalog.js';
import {searchBooks} from './importer.js';
const aliases=[
 {match:/安徒生|卖火柴|賣火柴|丑小鸭|醜小鴨|海的女儿|海的女兒|皇帝的新装|皇帝的新裝/,query:'Andersen fairy tales',label:'安徒生童话'},
 {match:/格林|白雪公主|灰姑娘|小红帽|小紅帽/,query:'Grimm fairy tales',label:'格林童话'},
 {match:/小王子/,query:'The Little Prince',label:'小王子'},
 {match:/绿野仙踪|綠野仙蹤/,query:'Wonderful Wizard of Oz',label:'绿野仙踪'},
 {match:/绿山墙|绿山牆|綠山牆|清秀佳人/,query:'Anne of Green Gables',label:'绿山墙的安妮'},
 {match:/鲁滨逊|魯濱遜|荒岛.*漂流|荒島.*漂流/,query:'Robinson Crusoe',label:'鲁滨逊漂流记'},
 {match:/海底两万里|海底兩萬里|凡尔纳|凡爾納/,query:'Twenty Thousand Leagues',label:'海底两万里'},
 {match:/简爱|簡愛/,query:'Jane Eyre',label:'简爱'},
 {match:/雾都孤儿|霧都孤兒/,query:'Oliver Twist',label:'雾都孤儿'},
 {match:/小妇人|小婦人/,query:'Little Women',label:'小妇人'},
 {match:/莎士比亚|莎士比亞/,query:'Shakespeare',label:'莎士比亚'},
 {match:/狄更斯/,query:'Dickens',label:'狄更斯'}
];
export function aliasIntent(query){return aliases.find(x=>x.match.test(query))}
export function parseIntent(raw){try{const value=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));return Array.isArray(value.queries)?value.queries.filter(q=>typeof q==='string'&&q.trim()&&q.length<=120).slice(0,2):[]}catch{return []}}
export async function smartSearch(query,env={},search=searchBooks){
 if(search===searchBooks)search=q=>searchBooks(q,env);
 if(!query)return {books:await sharedCatalog(env),searchScope:'共享书库'};
 const alias=aliasIntent(query);if(alias){const result=await search(alias.query);return {...result,interpretedAs:alias.label,searchHint:`按“${alias.label}”查找，结果可能包含收录该故事的作品集。`}}
 const direct=await search(query);if(direct.books.length||!env.TRANSLATIONS||!env.AI||env.TRANSLATION_ENABLED!=='true')return direct;
 try{const response=await env.TRANSLATIONS.get(env.TRANSLATIONS.idFromName('global-v1')).fetch('https://translation.internal/search-intent',{method:'POST',body:JSON.stringify({query})});if(!response.ok)return {...direct,searchHint:'智能识别暂不可用，可换一种描述或提交找书请求。'};const {queries}=await response.json();const results=await Promise.all(queries.map(q=>search(q)));const books=[...new Map(results.flatMap(x=>x.books).map(b=>[b.id,b])).values()].slice(0,12);return {books,interpretedAs:queries.join(' / '),searchHint:books.length?'根据你的描述找到以下候选，请选择想读的版本。':'暂未找到可用版本，可以换一种描述或提交找书请求。'}}catch{return direct}
}
