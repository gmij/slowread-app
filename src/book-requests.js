import {verifyCookie} from './auth.js';
import {mailConfigured} from './mail.js';
const attempts=new Map();
export async function createBookRequest(request,env){
 const origin=new URL(request.url).origin;if(request.method!=='POST'||request.headers.get('Origin')!==origin)return Response.json({error:'请从慢读提交请求'},{status:403});
 if(env.BOOK_REQUESTS_ENABLED!=='true'||!env.CONTENT_REPO||!(env.GITHUB_ISSUES_TOKEN||env.GITHUB_CONTENT_TOKEN))return Response.json({error:'找书请求暂时不可用，请稍后重试'},{status:503});
 const rawCookie=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-slowread-session='))?.split('=').slice(1).join('=')||'';
 const user=await verifyCookie(rawCookie,env);if(!user)return Response.json({error:'请先登录后再提交找书请求'},{status:401});
 if((!user.id?.startsWith('github:')||env.ACCOUNT_EMAIL_REQUIRED==='true'||mailConfigured(env))&&!user.emailVerifiedAt)return Response.json({error:'请先完成联系邮箱的验证码验证'},{status:403});
 const text=await request.text();if(text.length>5000)return Response.json({error:'请求内容过长'},{status:413});let input;try{input=JSON.parse(text)}catch{return Response.json({error:'请求格式无效'},{status:400})}
 const title=typeof input?.title==='string'?input.title.trim():'',author=typeof input?.author==='string'?input.author.trim():'',notes=typeof input?.notes==='string'?input.notes.trim():'';
 if(!title||title.length>160||author.length>120||notes.length>1000||!['en','zh-CN'].includes(input?.language))return Response.json({error:'请检查书名和补充信息'},{status:400});
 const id=user.id+':'+new Date().toISOString().slice(0,10),entry=attempts.get(id)||{count:0,seen:new Set()};if(entry.count>=3||entry.seen.has(title.toLowerCase()))return Response.json({error:'请求已提交，或今日请求次数已用完，请先查看已有请求'},{status:429});
 if(attempts.size>1000)attempts.delete(attempts.keys().next().value);entry.count++;entry.seen.add(title.toLowerCase());attempts.set(id,entry);
 const safe=value=>value.replace(/@/g,'＠');
 const login=user.id?.startsWith('github:')&&/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(user.name)?user.name:null;
 const requester=login?'@'+login:'慢读读者（'+(user.provider==='apple'?'Apple':user.provider==='google'?'Google':'站内')+' 登录）';
 let r;try{r=await fetch(`https://api.github.com/repos/${env.CONTENT_REPO}/issues`,{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_ISSUES_TOKEN||env.GITHUB_CONTENT_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Slowread-Worker','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({title:`[找书请求] ${safe(title)}`,body:`## 想阅读的书
书名：${safe(title)}
作者：${safe(author)||'暂不清楚'}
目标语言：${input.language==='en'?'English':'简体中文'}

请求者：${requester}

## 补充信息
${safe(notes)||'无'}

## 处理与通知
${login?`处理完成后请回复阅读链接并提及 ${requester}，通知取决于 GitHub 通知设置。`:`处理完成后请回复阅读链接。此用户使用站内联系邮箱，邮箱不公开；邮件处理通知仍需接入发送流程。`}`})});}catch{r=null}
 if(!r?.ok){entry.count--;entry.seen.delete(title.toLowerCase());const error=r?.status===403||r?.status===401?'求书服务权限尚未配置完成，请稍后重试':'暂时无法保存请求，请稍后重试';return Response.json({error},{status:503})}const issue=await r.json();return Response.json({number:issue.number},{status:201,headers:{'Cache-Control':'no-store'}});
}
