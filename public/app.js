const $=id=>document.getElementById(id);
let selectedBook,selectedChapter,chapterData,observer,currentQuote,translationRun=0;
const params=new URLSearchParams(location.search);
const storageKey=(b,c)=>`slowread:${b}:${c}`;
const translationKey=target=>`slowread:translation:${selectedBook.id}:${selectedChapter}:${target}`;
function show(id){['library','detail','reading'].forEach(n=>$(n).hidden=n!==id)}
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n}
async function api(path,options){const r=await fetch('/api'+path,options);const data=await r.json();if(!r.ok)throw new Error(data.error||'请求失败');return data}
function stop(){translationRun++;observer?.disconnect();$('pauseTranslation').hidden=true;$('resumeTranslation').hidden=true}
function record(position){try{localStorage.setItem(storageKey(selectedBook.id,selectedChapter),position)}catch{}}
function readSaved(target){try{const s=JSON.parse(localStorage.getItem(translationKey(target)));if(s?.source===JSON.stringify(chapterData.paragraphs.map(p=>p.en)))return s.texts}catch{}return []}
function save(target,texts){try{localStorage.setItem(translationKey(target),JSON.stringify({source:JSON.stringify(chapterData.paragraphs.map(p=>p.en)),texts}))}catch{$('readingStatus').textContent+=' 当前浏览器无法保存译文。'}}
function readerVisible(){ $('languageChoice').hidden=true;['readerTools','text','done'].forEach(n=>$(n).hidden=false) }
function render(texts,originalOnly=false){
 $('text').replaceChildren();$('compare').checked=false;$('compare').disabled=originalOnly;$('text').className='';
 chapterData.paragraphs.forEach((p,i)=>{const row=node('div','');row.className='paragraph';row.id=p.id;const en=node('p',p.en);if(originalOnly){row.append(en)}else{en.className='en';row.append(en,node('p',texts[i]||'这一段正在等待翻译…'))}$('text').append(row)});
 observer?.disconnect();observer=new IntersectionObserver(entries=>{const p=entries.find(e=>e.isIntersecting);if(p)record(p.target.id)},{rootMargin:'-10% 0px -60% 0px'});document.querySelectorAll('.paragraph').forEach(p=>observer.observe(p));
}
async function search(){const query=$('query').value.trim();$('libraryStatus').textContent='正在查找…';$('books').replaceChildren();try{const {books,warning}=await api('/books?q='+encodeURIComponent(query));for(const b of books){const card=node('section','');card.className='book';card.append(node('h2',b.title),node('p',b.author),node('p',b.statusLabel));const button=node('button','查看章节');button.onclick=()=>openBook(b.id);card.append(button);$('books').append(card)}$('libraryStatus').textContent=warning||(books.length?`找到 ${books.length} 本书`:'暂未找到。其他作品请试试英文书名或作者。')}catch(e){$('libraryStatus').textContent=e.message}}
async function openBook(id){stop();$('libraryStatus').textContent='正在查找原文并整理章节…';try{selectedBook=await api('/books/'+encodeURIComponent(id));show('detail');$('author').textContent=selectedBook.author;$('title').textContent=selectedBook.title;$('description').textContent=selectedBook.description;$('chapters').replaceChildren();for(const c of selectedBook.chapters){const button=node('button',`${Number(c.id)} · ${c.title} · 开始阅读`);button.disabled=!c.available;button.onclick=()=>openChapter(c.id);$('chapters').append(button)}$('source').textContent=`来源：${selectedBook.source.url}。${selectedBook.source.notice}`;history.replaceState(null,'','?book='+id+location.hash)}catch(e){show('library');$('libraryStatus').textContent=e.message}}
async function updateQuote(){
 const target=$('targetLanguage').value;$('languageChoiceTitle').textContent='这一章还没有'+$('targetLanguage').selectedOptions[0].textContent+'译文';$('translateChapter').disabled=true;$('quoteAmount').textContent='正在估算…';
 try{const q=await api(`/books/${selectedBook.id}/chapters/${selectedChapter}/quote?target=${target}`);if(target!==$('targetLanguage').value)return;currentQuote=q;$('quoteAmount').textContent='本次试用费用：US$0';$('quoteDetails').textContent=`模型服务成本粗估：约 US$${q.estimatedProviderCostUsd.toFixed(4)}（不向你收取）。${q.pricingBasis}`;$('translateChapter').disabled=!q.available||q.characters>q.maximumCharacters;$('translateChapter').textContent=q.available?'确认免费翻译本章':'翻译服务暂未启用';$('quoteScope').textContent=q.characters>q.maximumCharacters?'此章超过试用长度上限，请阅读原文。':'仅当前章节；可暂停，译文会逐段显示。免费额度用尽时停止，不会自动收费。';}catch(e){$('quoteAmount').textContent='暂时无法报价';$('quoteDetails').textContent=e.message}
}
async function openChapter(id){
 stop();const run=translationRun;show('reading');$('languageChoice').hidden=true;['readerTools','text','done'].forEach(n=>$(n).hidden=true);$('chapterTitle').textContent='正在准备正文…';$('text').replaceChildren();$('readingStatus').textContent='';
 try{const data=await api(`/books/${selectedBook.id}/chapters/${id}`);if(run!==translationRun)return;chapterData=data;selectedChapter=id;$('chapterTitle').textContent=selectedBook.title+' · '+data.title;history.replaceState(null,'',`?book=${selectedBook.id}&chapter=${id}`+location.hash);
  const target=params.get('lang')==='ja'?'ja':'zh-CN';$('targetLanguage').value=target;
  const saved=readSaved(target);if(data.language==='zh-CN'&&target==='zh-CN'){readerVisible();render(data.paragraphs.map(p=>p.zh));$('readingStatus').textContent='中文译文已准备好，可以直接阅读。'}else if(saved.length===data.paragraphs.length&&saved.every(Boolean)){readerVisible();render(saved);$('readingStatus').textContent='已恢复当前浏览器保存的译文。'}else{$('languageChoice').hidden=false;const words=data.paragraphs.reduce((n,p)=>n+(p.en.match(/\S+/g)||[]).length,0);$('translationSize').textContent=`翻译范围：仅当前章节，约 ${words.toLocaleString()} 个原文单词，共 ${data.paragraphs.length} 段。`;$('readingStatus').textContent=saved.filter(Boolean).length?'已有部分译文，确认后可从未完成处继续。':'请选择目标语言，或免费阅读原文。';await updateQuote();}
 }catch(e){$('chapterTitle').textContent='正文暂时无法打开';$('readingStatus').textContent=e.message}
}
async function translate(){
 if(!currentQuote?.available)return;const target=$('targetLanguage').value;const run=++translationRun;const texts=readSaved(target);readerVisible();render(texts);$('pauseTranslation').hidden=false;$('translateChapter').disabled=true;history.replaceState(null,'',`?book=${selectedBook.id}&chapter=${selectedChapter}&lang=${target}`);
 try{for(let i=0;i<chapterData.paragraphs.length;i++){if(run!==translationRun)return;if(texts[i])continue;$('readingStatus').textContent=`正在翻译 ${i+1}/${chapterData.paragraphs.length} 段，已完成部分可直接阅读。`;const result=await api(`/books/${selectedBook.id}/chapters/${selectedChapter}/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,index:i,confirmed:true})});if(run!==translationRun)return;texts[i]=result.text;save(target,texts);$('text').children[i].lastElementChild.textContent=result.text;}$('readingStatus').textContent='本章翻译完成。译文已保存在当前浏览器，可切换原文对照。';}catch(e){if(run===translationRun){$('readingStatus').textContent=`翻译暂停：${e.message} 已完成部分保留，可稍后继续。`;$('resumeTranslation').hidden=false;}}finally{if(run===translationRun)$('pauseTranslation').hidden=true;}
}
$('translateChapter').onclick=translate;
$('pauseTranslation').onclick=()=>{stop();$('readingStatus').textContent='已暂停。已完成的译文保留在当前浏览器。';$('resumeTranslation').hidden=false};
$('resumeTranslation').onclick=()=>{$('resumeTranslation').hidden=true;translate()};
$('readOriginal').onclick=()=>{stop();readerVisible();render([],true);$('readingStatus').textContent='正在免费阅读原文。'};
$('switchOriginal').onclick=$('readOriginal').onclick;$('targetLanguage').onchange=updateQuote;
$('search').onsubmit=e=>{e.preventDefault();search()};$('back').onclick=()=>{stop();show('library');history.replaceState(null,'','/');search()};$('toc').onclick=()=>{stop();$('resumeTranslation').hidden=true;openBook(selectedBook.id)};
$('compare').onchange=()=>$('text').classList.toggle('compare',$('compare').checked);
$('share').onclick=async()=>{let position;try{position=localStorage.getItem(storageKey(selectedBook.id,selectedChapter))}catch{}const u=new URL(location.href);u.hash=position||'p1';try{await navigator.clipboard.writeText(u.href);$('readingStatus').textContent='阅读链接已复制；译文目前只保存在你的浏览器，分享不会自动传送译文。'}catch{$('readingStatus').textContent='请复制链接：'+u.href}};
$('done').onclick=()=>{record($('text').lastElementChild?.id||'p1');$('readingStatus').textContent='本章已读完，阅读位置已保存。'};
if(params.has('book')){await openBook(params.get('book'));if(selectedBook&&params.has('chapter'))await openChapter(params.get('chapter'))}else await search();
