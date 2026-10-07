const library=new Map();
const clean=value=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
async function sourceSearch(q){
 const r=await fetch(`https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(q)}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('搜索书源暂时不可用');const html=await r.text();
 const books=[...html.matchAll(/<li class="booklink">([\s\S]*?)<\/li>/g)].slice(0,12).map(m=>{const block=m[1],id=block.match(/href="\/ebooks\/(\d+)"/),title=block.match(/<span class="title">([\s\S]*?)<\/span>/),author=block.match(/<span class="subtitle">([\s\S]*?)<\/span>/);return id&&title?describe({number:Number(id[1]),title:clean(title[1]),titleEn:clean(title[1]),author:author?clean(author[1]):'作者信息见原书'}):null}).filter(Boolean);return {books,searchScope:'Project Gutenberg 在线搜索'};
}
async function sourceMetadata(number){
 const r=await fetch(`https://www.gutenberg.org/ebooks/${number}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('书籍资料暂时无法取得');const html=await r.text();if(!/Public domain in the USA/i.test(html))throw new Error('此版本暂未纳入可阅读范围');const heading=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);if(!heading)throw new Error('无法识别书籍资料');const parts=clean(heading[1]).split(' by ');return {number,title:parts[0],titleEn:parts[0],author:parts.slice(1).join(' by ')||'作者信息见原书'};
}
export const knownBooks=[{number:23962,title:'西游记',titleEn:'Journey to the West',author:'吴承恩',sourceLanguage:'zh-CN',aliases:['西遊記','Wu Cheng','Journey to the West']},{number:1342,title:'傲慢与偏见',titleEn:'Pride and Prejudice',author:'Jane Austen',aliases:['奥斯汀','Austen']},{number:11,title:'爱丽丝梦游仙境',titleEn:"Alice's Adventures in Wonderland",author:'Lewis Carroll',aliases:['Alice','爱丽丝','卡罗尔']},{number:1661,title:'福尔摩斯冒险史',titleEn:'The Adventures of Sherlock Holmes',author:'Arthur Conan Doyle',aliases:['福尔摩斯','Sherlock','Doyle']},{number:84,title:'弗兰肯斯坦',titleEn:'Frankenstein',author:'Mary Shelley',aliases:['科学怪人','Shelley']}];
export function describe(b){return {...b,sourceLanguage:b.sourceLanguage||'en',id:`gutenberg-${b.number}`,statusLabel:b.number===1342?'自动整理原文 · 第一章中文试读':'自动获取原文并整理章节',source:{url:`https://www.gutenberg.org/ebooks/${b.number}`,notice:'原文来自 Project Gutenberg，保留原书来源及许可；各地区版权规则可能不同。'}};}
export function splitChapters(raw){
 let text=raw.replace(/\r/g,'');const start=text.match(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);if(start)text=text.slice(start.index+start[0].length);text=text.split(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i)[0];
 const chinese=[...text.matchAll(/^[ \t　]*第[一二三四五六七八九十百千零〇○两兩0-9]+[回章节][ \t　]+[^\n]{1,100}$/gm)];
 const marks=chinese.length?chinese:[...text.matchAll(/^[ \t]*CHAPTER[ \t]+(?:[IVXLCDM]+|\d+)[.\]:]?[^\n]{0,100}$/gim)];
 const sections=marks.map((m,i)=>({title:m[0].trim().replace(/\]$/,''),text:text.slice(m.index+m[0].length,marks[i+1]?.index??text.length)})).filter(s=>s.text.trim().length>300);
 if(!sections.length){const p=text.split(/\n\s*\n/);for(let i=0;i<p.length;i+=30)sections.push({title:`阅读分节 ${sections.length+1}`,text:p.slice(i,i+30).join('\n\n')});}
 return sections.map((s,i)=>({id:String(i+1).padStart(2,'0'),title:s.title,paragraphs:s.text.replace(/\[Illustration:[\s\S]*?\]/gi,'').split(/\n\s*\n/).map(p=>p.replace(/\s*\n\s*/g,' ').trim()).filter(p=>/\p{L}/u.test(p)&&!/^\[Illustration\]$/i.test(p)).map((text,j)=>({id:`p${j+1}`,text}))}));
}
export async function searchBooks(q){
 const local=knownBooks.filter(b=>!q||[b.title,b.titleEn,b.author,...b.aliases].join(' ').toLowerCase().includes(q.toLowerCase())).map(describe);if(!q||local.length)return {books:local,searchScope:'经典书籍索引'};
 try{const r=await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}&languages=en&copyright=false`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error();const data=await r.json();return {books:(data.results||[]).filter(b=>b.copyright===false&&b.authors?.length&&b.authors.every(a=>a.death_year&&a.death_year<1950)).slice(0,12).map(b=>describe({number:b.id,title:b.title,titleEn:b.title,author:b.authors.map(a=>a.name).join(', '),aliases:[]})),searchScope:'Project Gutenberg 英文书源'};}catch{try{return await sourceSearch(q)}catch{return {books:[],warning:'外部书源搜索暂时不可用。请试试傲慢与偏见、爱丽丝、福尔摩斯或 Frankenstein。'};}}
}
export async function loadBook(id){
 const m=id.match(/^gutenberg-([1-9]\d{0,6})$/);if(!m)throw new Error('没有找到这本书');const number=Number(m[1]);const cached=library.get(number);if(cached&&cached.expires>Date.now())return cached.book;
 let metadata=knownBooks.find(b=>b.number===number);
 if(!metadata){try{const r=await fetch(`https://gutendex.com/books/${number}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('书源暂时不可用');const b=await r.json();if(b.copyright!==false||!b.authors?.length||b.authors.some(a=>!a.death_year||a.death_year>=1950))throw new Error('此版本暂未纳入可阅读范围');metadata={number,title:b.title,titleEn:b.title,author:b.authors.map(a=>a.name).join(', ')};}catch{metadata=await sourceMetadata(number);}}
 const r=await fetch(`https://www.gutenberg.org/cache/epub/${number}/pg${number}.txt`,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('原文下载暂时失败，请稍后重试');const raw=await r.text();if(raw.length>4000000||!raw.includes('Project Gutenberg'))throw new Error('书源内容不适合自动整理');
 const sourceLanguage=/^Language:\s*Chinese/im.test(raw)?'zh-CN':metadata.sourceLanguage||'en';
 const chapters=splitChapters(raw);const book={...describe({...metadata,sourceLanguage}),description:`已自动取得原文并整理为 ${chapters.length} 个章节或阅读分节。`,chapters:chapters.map(c=>({id:c.id,title:c.title,available:true})),sections:chapters};if(library.size>=8)library.delete(library.keys().next().value);library.set(number,{book,expires:Date.now()+600000});return book;
}
