export function requestIssueUrl({title,author='',language='zh-CN',notes=''}){
 const url=new URL('https://github.com/gmij/slowread-library/issues/new');
 url.searchParams.set('title',`[找书请求] ${title.trim().slice(0,160)}`);
 url.searchParams.set('body',`## 想阅读的书\n书名：${title.trim()}\n作者：${author.trim()||'暂不清楚'}\n目标语言：${language==='en'?'English':'简体中文'}\n\n## 补充信息\n${notes.trim()||'无'}\n\n## 处理与通知\n请核对版本和可用授权来源，找到后回复可阅读的慢读链接。提交者可订阅本 Issue，接收 GitHub 通知。`);
 return url.href;
}
