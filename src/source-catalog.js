import {describe} from './importer.js';
const topics={all:'',classic:'s.fiction',fairy:'s.fairy',mystery:'s.detective',learning:'s.short'};
const cache=new Map();
const clean=text=>text.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
export function parseCatalogPage(html,page,language){
 const books=[...html.matchAll(/<li class="booklink">([\s\S]*?)<\/li>/g)].map(m=>{const block=m[1],id=block.match(/href="\/ebooks\/(\d+)"/),title=block.match(/<span class="title">([\s\S]*?)<\/span>/),author=block.match(/<span class="subtitle">([\s\S]*?)<\/span>/);return id&&title?describe({number:Number(id[1]),title:clean(title[1]),titleEn:clean(title[1]),author:author?clean(author[1]):'作者信息见原书',sourceLanguage:language==='zh'?'zh-CN':language||'en'}):null}).filter(Boolean);
 if(!books.length&&!/No (?:results|ebooks)|No books|Displaying results/i.test(html))throw Error('书源目录暂时无法读取，请稍后重试');
 return {books,page,hasNext:/title="Go to the next page of results\."/.test(html)};
}
export async function browseSource(input){
 const page=Number(input.get('page')||1),language=input.get('language')||'',category=input.get('category')||'all',author=(input.get('author')||'').trim();
 if(!Number.isInteger(page)||page<1||page>3200||!['','en','zh','fr','de','es'].includes(language)||!Object.hasOwn(topics,category)||author.length>80)throw Error('目录筛选条件无效');
 const query=[language?'l.'+language:'',topics[category],author?'a.'+author.replace(/[\x00-\x1f]/g,''):''].filter(Boolean).join(' '),key=JSON.stringify([page,query]);
 const saved=cache.get(key);if(saved?.expires>Date.now())return saved.value;
 const url=new URL('https://www.gutenberg.org/ebooks/search/');url.searchParams.set('query',query);url.searchParams.set('start_index',String((page-1)*25+1));
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('书源目录暂时不可用，请稍后重试');const value=parseCatalogPage(await response.text(),page,language);
 if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(key,{value,expires:Date.now()+300000});return value;
}
export const recommendations=[
 [1342,'傲慢与偏见','Pride and Prejudice','Jane Austen','classic','在婚姻与偏见之间，读一段机智的爱情故事。'],
 [84,'弗兰肯斯坦','Frankenstein','Mary Shelley','classic','关于创造、孤独与责任的科幻经典。'],
 [2701,'白鲸','Moby Dick','Herman Melville','classic','跟随捕鲸船，驶入执念与命运的海洋。'],
 [1260,'简·爱','Jane Eyre','Charlotte Brontë','classic','一位女性寻找独立、尊严与爱情的旅程。'],
 [11,'爱丽丝梦游仙境',"Alice’s Adventures in Wonderland",'Lewis Carroll','fairy','从兔子洞进入充满想象与语言游戏的世界。'],
 [2591,'格林童话',"Grimms’ Fairy Tales",'Jacob Grimm and Wilhelm Grimm','fairy','熟悉的童话，也有原作意想不到的细节。'],
 [1597,'安徒生童话','Andersen’s Fairy Tales','Hans Christian Andersen','fairy','温柔与忧伤交织的经典童话。'],
 [55,'绿野仙踪','The Wonderful Wizard of Oz','L. Frank Baum','fairy','沿着黄砖路，寻找勇气、智慧与归途。'],
 [1661,'福尔摩斯冒险史','The Adventures of Sherlock Holmes','Arthur Conan Doyle','mystery','一篇一个谜案，适合分次阅读。'],
 [2852,'巴斯克维尔的猎犬','The Hound of the Baskervilles','Arthur Conan Doyle','mystery','迷雾中的庄园，传说背后的真相。'],
 [43,'化身博士','Dr. Jekyll and Mr. Hyde','Robert Louis Stevenson','mystery','短篇幅的悬疑故事，探寻人的双面性。'],
 [345,'德古拉','Dracula','Bram Stoker','mystery','通过书信与日记，走近哥特文学经典。'],
 [113,'秘密花园','The Secret Garden','Frances Hodgson Burnett','learning','跟随孩子们探索花园，适合逐章对照学习。'],
 [45,'绿山墙的安妮','Anne of Green Gables','L. M. Montgomery','learning','日常对话丰富，适合熟悉人物与生活表达。'],
 [3207,'小公主','A Little Princess','Frances Hodgson Burnett','learning','从完整故事中学习人物对话与情绪表达。'],
 [514,'小妇人','Little Women','Louisa May Alcott','learning','在家庭与成长故事中积累日常词汇。']
].map(([number,title,titleEn,author,category,intro])=>({...describe({number,title,titleEn,author}),category,intro}));
