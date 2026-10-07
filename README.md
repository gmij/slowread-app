# Slowread 应用仓库

前端和 Cloudflare Worker，内容来自独立的 `gmij/slowread-library`。不使用R2、D1，阅读进度保存在浏览器。

## Cloudflare 部署

1. 在 Workers 中导入本仓库。安装命令 `npm install`，部署命令 `npx wrangler deploy`，根目录 `/`，无需前端构建。
2. 创建只允许读取 `gmij/slowread-library` 内容的 GitHub fine-grained token，将其保存为 Worker secret `GITHUB_CONTENT_TOKEN`。不要放进前端、仓库或普通变量。
3. `CONTENT_REPO` 为 `gmij/slowread-library`，`CONTENT_REF` 初始为 `main`；正式发布建议固定到审核后的内容提交SHA。
4. 打开 `/api/health` 和首页，搜索“傲慢与偏见”，进入第一章。

本地：`npm install` 后 `npm run dev`；将同一只读凭据保存在未跟踪的 `.dev.vars`。无需凭据的本地样本：`node scripts/preview.mjs`。

## 边界

当前只搜索自有书目，不抓取Goodreads；只有已准备章节可读。没有模型调用、付费、账户同步和在线内容写入。外站检索与实时翻译需后续接入。

私有内容通过Worker访问，GitHub凭据不发给浏览器。应用当前无用户访问控制，网站上线后其阅读API对访客开放，因此只能接入允许提供的试读内容。付费内容必须先增加鉴权，不能把私有仓库当付费保护。

GitHub是版本化内容来源，不是无限容量文件服务器。当前API请求使用GitHub接口，受速率限制；浏览器有短期缓存。流量增长后应增加共享缓存，未实现缓存不能宣称有共享缓存。PDF/OCR未接入。

## 验证

`npm test` 检查搜索、章节读取、路径与方法限制、译文版本匹配、来源错误及凭据不出现在响应中。

