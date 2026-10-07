const library=new Map();
export const knownBooks=[{number:1342,title:'傲慢与偏见',titleEn:'Pride and Prejudice',author:'Jane Austen',aliases:['奥斯汀','Austen']},{number:11,title:'爱丽丝梦游仙境',titleEn:"Alice's Adventures in Wonderland",author:'Lewis Carroll',aliases:['Alice','爱丽丝','卡罗尔']},{number:1661,title:'福尔摩斯冒险史',titleEn:'The Adventures of Sherlock Holmes',author:'Arthur Conan Doyle',aliases:['福尔摩斯','Sherlock','Doyle']},{number:84,title:'弗兰肯斯坦',titleEn:'Frankenstein',author:'Mary Shelley',aliases:['科学怪人','Shelley']}];
export function describe(b){return {...b,id:`gutenberg-${b.number}`,statusLabel:b.number===1342?'自动整理原文 · 第一章中文试读':'自动获取原文并整理章节',source:{url:`https://www.gutenberg.org/ebooks/${b.number}`,notice:'原文来自 Project Gutenberg，保留原书来源及许可；各地区版权规则可能不同。'}};}
export function splitChapters(raw){
 let text=raw.replace(/\r/g,'');const start=text.match(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);if(start)text=text.slice(start.index+start[0].length);text=text.split(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i)[0];
 const marks=[...text.matchAll(/^[ \t]*CHAPTER[ \t]+(?:[IVXLCDM]+|\d+)[.\]:]?[^\n]{0,100}$/gim)];
 const sections=marks.map((m,i)=>({title:m[0].trim().replace(/\]$/,''),text:text.slice(m.index+m[0].length,marks[i+1]?.index??text.length)})).filter(s=>s.text.trim().length>300);
 if(!sections.length){const p=text.split(/\n\s*\n/);for(let i=0;i<p.length;i+=30)sections.push({title:`阅读分节 ${sections.length+1}`,text:p.slice(i,i+30).join('\n\n')});}
 return sections.map((s,i)=>({id:String(i+1).padStart(2,'0'),title:s.title,paragraphs:s.text.replace(/\[Illustration:[\s\S]*?\]/gi,'').split(/\n\s*\n/).map(p=>p.replace(/\s*\n\s*/g,' ').trim()).filter(Boolean).map((text,j)=>({id:`p${j+1}`,text}))}));
}
export async function searchBooks(q){
 const local=knownBooks.filter(b=>!q||[b.title,b.titleEn,b.author,...b.aliases].join(' ').toLowerCase().includes(q.toLowerCase())).map(describe);if(!q||local.length)return {books:local,searchScope:'经典书籍索引'};
 try{const r=await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}&languages=en&copyright=false`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error();const data=await r.json();return {books:(data.results||[]).filter(b=>b.copyright===false&&b.authors?.length&&b.authors.every(a=>a.death_year&&a.death_year<1950)).slice(0,12).map(b=>describe({number:b.id,title:b.title,titleEn:b.title,author:b.authors.map(a=>a.name).join(', '),aliases:[]})),searchScope:'Project Gutenberg 英文书源'};}catch{return {books:[],warning:'外部书源搜索暂时不可用。请试试傲慢与偏见、爱丽丝、福尔摩斯或 Frankenstein。'};}
}
export async function loadBook(id){
 const m=id.match(/^gutenberg-([1-9]\d{0,6})$/);if(!m)throw new Error('没有找到这本书');const number=Number(m[1]);const cached=library.get(number);if(cached&&cached.expires>Date.now())return cached.book;
 let metadata=knownBooks.find(b=>b.number===number);
 if(!metadata){const r=await fetch(`https://gutendex.com/books/${number}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('书源暂时不可用');const b=await r.json();if(b.copyright!==false||!b.authors?.length||b.authors.some(a=>!a.death_year||a.death_year>=1950))throw new Error('此版本暂未纳入可阅读范围');metadata={number,title:b.title,titleEn:b.title,author:b.authors.map(a=>a.name).join(', ')};}
 const r=await fetch(`https://www.gutenberg.org/cache/epub/${number}/pg${number}.txt`,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('原文下载暂时失败，请稍后重试');const raw=await r.text();if(raw.length>4000000||!raw.includes('Project Gutenberg'))throw new Error('书源内容不适合自动整理');
 const chapters=splitChapters(raw);const book={...describe(metadata),description:`已自动取得原文并整理为 ${chapters.length} 个章节或阅读分节。`,chapters:chapters.map(c=>({id:c.id,title:c.title,available:true})),sections:chapters};if(library.size>=8)library.delete(library.keys().next().value);library.set(number,{book,expires:Date.now()+600000});return book;
}
