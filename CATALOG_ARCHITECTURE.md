# 慢读书库与供应商架构

实施日期：2026-10-09。此文描述已落地的索引和兼容结构；未实现的增补能力单独列出。

## 数据边界

| 层 | 身份与职责 | 存储 |
| --- | --- | --- |
| Provider | 元数据接入方式、能力、优先级和同步策略；官方 CSV/RDF 与 Gutendex 可以属于同一 origin | `src/providers.js`、同步 manifest |
| ProviderBook / Edition | 上游编号、语言、作者、分类、原始元数据、来源许可；同一来源版本被多个接入方式看到仍是一份版本 | `metadata/<version>/editions/` |
| Canonical Book | 慢读独立 `bk_...` 标识和来源版本关系；人工核实后允许合并多个版本 | `metadata/<version>/books/` |
| Metadata Index | 分页、语言、作者、类目、关键词索引，查询不下载正文 | `metadata/<version>/browse/`、`authors/`、`search/` |
| Shared Content | 真正获取过的正文、已经生成的译文；按来源版本与原文 hash 隔离 | 既有 `books/gutenberg-N/` |
| Translation Index | 可直接阅读的中文章节；不扫描全部正文 | 既有 `indexes/translations-zh-CN.json` |
| Personal Shelf | 用户读过的书、章节、段落、偏好 | 既有私有 Bookshelf 存储适配器，不进入公共索引 |

首页数字来自本地书目 manifest，表示同步到的**文字版电子书记录数**，不表示独立作品数、已有译文数或个人藏书数。藏书阁的全部藏书/作者/类目使用元数据索引；已有译文使用译文索引；我的书架仍独立。

## 身份与版本兼容

`providerId=gutenberg-catalog` 和 `providerId=gutendex` 是两种接入方式，二者的 `origin=gutenberg` 相同。因此 #1342 的来源版本身份始终是 `gutenberg:1342`，不会因换 API 而复制一份书。

初次建库为每份来源记录分配稳定 `bk_<24位hash>`，依据 origin 与上游编号生成，标题修正不会改变身份。**不同上游编号不按同名自动合并**：不同语言、卷次和版本很容易同名。可在 `metadata/canonical-mappings.json` 人工指定兼容键到既有 canonical ID 的映射。后续跨供应商匹配应先产生待审核建议，再合并；不能直接重用某份译文。

目前 canonical 和 source edition 默认一一对应，但已经分别存储。正文、旧链接、历史书架仍使用 `gutenberg-N`，新增书架和译文记录附加 canonical/source edition 身份；旧数据不必立即重写。译文复用继续要求原文 hash、章节、目标语言匹配。跨版本或跨供应商复用不能仅依据 canonical ID。

## 自动同步与发布

```text
GitHub Actions（slowread-library）
  每天 08:30 UTC：RSS → 逐本 RDF → 更新 metadata
  星期日：官方 CSV → 全量校验
  手动：可选择 full / incremental
       ↓
验证字段、记录规模、身份冲突
       ↓
生成不可变版本目录与完整索引
       ↓
同一个 Git 提交发布版本与 manifest
       ↓
Cloudflare Worker 读 manifest → 读取所需分片
```

官方 CSV 每周更新，官方 RDF 每日更新。RSS 是近期新增/修改窗口，可能漏掉停机期间的变化，周全量同步负责校验补齐，不承诺实时。字段缺失、网络失败、记录数异常下降都会中止发布，网站继续使用之前成功的版本。每日任务串行，发布遇到读者保存译文产生的新提交时先 rebase 后重试，保留译文和索引提交。

`manifest` 提供 schema/version、最近成功同步时间、记录数量、同步方式、Provider 状态。失败记录由 Actions 日志和任务状态保存。只保留当前和上一版目录，历史 Git 提交可回滚；不能把执行失败误报为同步成功。

## 查询与资源获取

检索使用标题、作者、主题和书单词项的完整倒排列表；SHA-256 前两位确定分片，多词求交集。分页读取完整 ID 索引后只获取当前页的元数据分片；作者/类目索引也做分片。中文别名和现有意图识别只负责把用户表达转成查询，展示内容必须来自真实书目。

全文、HTML、EPUB、版权等字段在上游没有提供时不能推测为已验证。初始 CSV 不提供完整资源格式或下载热度，故不伪造这些字段或宣称按热度排序。打开未知书籍时单独读取官方逐本 RDF 核实来源许可，再按需获取正文。目前阅读器支持英文与中文原文，其余语言可以浏览元数据，但尚未接入阅读流程。

公共元数据缓存有时间、分片大小、总大小和条目上限；并发相同分片请求合并。索引查询不进入账户数据库，也不触发翻译。接口：`/api/providers`、`/api/library-summary`、`/api/library-directory`、`/api/library-catalog`、`/api/library-books/:canonicalId`，原阅读接口继续兼容。

## 存储隔离与成本

元数据存储使用 `METADATA_REPO` / `METADATA_REF`，正文与译文使用 `CONTENT_REPO` / `CONTENT_REF`，用户数据继续使用私有存储适配器。当前元数据和内容物理上都在 slowread-library，但职责与配置已经分开，可迁到独立仓库。网站唯一的元数据存储入口是 `catalog-store.js`，将来换 R2 等实现只替换此适配器。

本次不创建 D1、Vectorize 或额外数据库。定时处理在 GitHub Actions 执行；索引体积、Git 历史增长、Actions 时长和 Worker 请求仍应监测，不能保证无限量无成本。当前全量文字书目约 7.8 万记录、单版分片约 86 MB；对象按内容由 Git 去重，但长期增长应评估 R2，不能无限累加完整快照。

## 后续增补与供应商接入

中文书名/作者、阅读难度、字数、预计时长、摘要、主题、向量等属于独立 enrichment 层，按 canonical/edition 身份关联并保存生成来源与版本。当前仅保留少量人工中文别名，**没有对全库批量调用 AI**。

新增供应商需要实现其同步/元数据规范化适配器、稳定 origin/externalId、资源与许可检查，并显式做 canonical 映射。当前官方 CSV/RDF 是生产 Provider；Gutendex 已登记但默认关闭，不是生产搜索依赖。Standard Ebooks、Wikisource、Internet Archive 只是未来候选，尚未接入。

参考：[Gutenberg 官方机器可读目录与更新频率](https://www.gutenberg.org/ebooks/offline_catalogs.html)、[自动访问政策](https://www.gutenberg.org/policy/robot_access.html)。
