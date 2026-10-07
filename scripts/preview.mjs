import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import worker from '../src/worker.js';
const app=path.resolve(import.meta.dirname,'..'), library=path.resolve(app,'../slowread-library');
const remoteFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
  const u=new URL(url);
  if(u.hostname!=='api.github.com')return remoteFetch(url,options);
  const relative=u.pathname.split('/contents/')[1];
  if(!relative)return new Response('',{status:404});
  try{return Response.json(JSON.parse(await readFile(path.join(library,relative),'utf8')))}catch{return new Response('',{status:404})}
};
const env={CONTENT_REPO:'gmij/slowread-library',CONTENT_REF:'main',ASSETS:{async fetch(request){let file=new URL(request.url).pathname;if(file==='/')file='/index.html';if(!['/index.html','/app.js','/style.css'].includes(file))return new Response('Not found',{status:404});return new Response(await readFile(path.join(app,'public',file)),{headers:{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8'}})}}};
http.createServer(async(req,res)=>{try{const result=await worker.fetch(new Request('http://127.0.0.1:8767'+req.url,{method:req.method}),env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()))}catch{res.writeHead(500);res.end('Preview failed')}}).listen(8767,'127.0.0.1',()=>console.log('Local fixture preview: http://127.0.0.1:8767 (not Cloudflare deployment)'));
