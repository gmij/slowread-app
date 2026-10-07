const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'private, max-age=60'}});
const valid = value => /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
async function content(path, env) {
  if (!/^[\w-]+\/[\w.-]+$/.test(env.CONTENT_REPO || '')) throw new Error('CONTENT_REPO is not configured');
  const url = `https://api.github.com/repos/${env.CONTENT_REPO}/contents/${path}?ref=${encodeURIComponent(env.CONTENT_REF || 'main')}`;
  const headers = {'Accept':'application/vnd.github.raw+json','User-Agent':'Slowread-Worker','X-GitHub-Api-Version':'2022-11-28'};
  if (env.GITHUB_CONTENT_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_CONTENT_TOKEN}`;
  const response = await fetch(url, {headers});
  if (!response.ok) throw new Error(`Content repository unavailable (${response.status})`);
  return response.json();
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return json({error:'Only GET is supported'},405);
    try {
      if (url.pathname === '/api/health') return json({ok:true,mode:'read-only',storage:'GitHub',translation:'pre-generated'});
      const catalog = await content('catalog.json',env);
      if (url.pathname === '/api/books') {
        const q = (url.searchParams.get('q') || '').trim().toLocaleLowerCase().slice(0,200);
        return json({books:catalog.books.filter(b => !q || [b.title,b.titleEn,b.author,...(b.aliases||[])].join(' ').toLocaleLowerCase().includes(q))});
      }
      const match = url.pathname.match(/^\/api\/books\/([^/]+)(?:\/chapters\/([^/]+))?$/);
      if (!match || !valid(match[1]) || (match[2] && !valid(match[2]))) return json({error:'Not found'},404);
      const book = catalog.books.find(b => b.id === match[1]);
      if (!book) return json({error:'Book not found'},404);
      if (!match[2]) return json(book);
      if (!book.chapters.some(c => c.id === match[2] && c.available)) return json({error:'Chapter is not available'},404);
      const base = `books/${book.id}`;
      const [original, translation] = await Promise.all([content(`${base}/chapters/${match[2]}.json`,env),content(`${base}/translations/zh-CN/${match[2]}.json`,env)]);
      if (original.sourceHash !== translation.sourceHash || original.paragraphs.length !== translation.paragraphs.length) throw new Error('Translation version mismatch');
      return json({bookId:book.id,id:match[2],title:original.title,language:'zh-CN',paragraphs:original.paragraphs.map((p,i)=>({id:p.id,en:p.text,zh:translation.paragraphs[i].text})),source:book.source});
    } catch (error) {
      console.error('Reading content unavailable:',error.message);
      return json({error:'书库暂时无法读取，请稍后再试。'},503);
    }
  }
};
