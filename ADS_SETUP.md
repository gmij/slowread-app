# 慢读广告联盟接入准备

核查日期：2026-10-07。状态：选型与申请准备；没有联盟账号、审核通过的网站或真实广告位，尚未接入投放，不宣称产生收入。禁止用示例广告或假完成事件替代真实收入。

## 当前建议

优先申请 Google AdSense，先在书库或章节目录放一个普通展示广告位，不插入阅读正文、不弹窗、不诱导点击。普通展示广告不能作为“观看完成后解锁章节”的奖励依据。后续通过 Google Ad Manager 的网页 rewarded 格式实现自愿观看广告解锁章节；Ad Manager 需要有效 AdSense 账号，获得账号并不代表已获得程序化广告需求或填充保证。

Adsterra 是新网站普通展示广告的备选，其官方页面说明没有最低流量要求，但禁止 incentivized traffic。因此不能拿普通横幅、Smartlink 点击或倒计时冒充激励广告。未确认广告分类过滤能力和流量规则前不接入；不采用弹窗、跳转、仿系统通知等影响阅读的格式。

国内流量不能直接套用海外平台的填充或收益假设。本次没有取得百度等国内联盟可用于本 Cloudflare 网页的明确准入和激励格式说明，因此暂不推荐为已确定方案。移动 App SDK 不等于支持当前网页。

## 当前阻塞点

1. 联盟发布商账号：可用普通 Google 账号申请 AdSense，不需要 Google OAuth 开发者应用。用户本人完成合同、收款身份及付款资料；源码接入不能代替这些手续。
2. 网站域名：当前 slowread-app.gmij.workers.dev 是平台子域名；AdSense 申请仅允许其认可的托管合作平台使用子域名。需要用户指定自有域名，在 Cloudflare 配置慢读站点。不要未经确认占用现有主站域名。
3. 网站审核：Google 要求高质量原创内容。公开原文或机器译文不能保证获批；应保留真实出处，补充实际编写的书籍介绍、编辑说明和站点联系/隐私说明，不制造内容或虚假审核证明。
4. 账号审批后需要 publisher ID 与真实广告位 ID。ads.txt 使用该账号后台提供的真实卖方记录，不写示例 ID。
5. 海外个性化广告按流量地区配置 Google 认证 CMP；自行添加“同意广告”按钮不能替代认证 CMP。

## 接入顺序与验收

- 用户确认联盟账号与自有域名。
- 完成域名与页面审核准备，在站点放联盟验证标签和真实 ads.txt；账号审核通过后再启用投放。
- 普通广告位放书库/目录，预留尺寸防止页面跳动；广告失败、拦截或无填充不得阻止阅读。不把邮箱或 GitHub 身份发送给联盟做广告参数。
- 验证真实广告请求、显示、隐私选项及无填充回退，通过联盟报表确认收入；不要自己点击广告测试收益。
- 激励广告另行接入：展示前说明具体章节权益，用户主动选择、可取消；仅 reward granted 事件发放权益，关闭/点击/计时不算完成。前端事件不是防伪收款凭证，不以它结算推广现金分成。
- 当前公共 GitHub 译文仍可直接访问。若需要严格广告解锁，必须把受控内容获取与权益校验放到服务端，不能只隐藏正文。翻译与广告容量先预留，确保奖励可兑现。

## 官方依据

- Google AdSense 网站 URL： https://support.google.com/adsense/answer/2784438
- Google AdSense 资格： https://support.google.com/adsense/answer/9724
- Google Ad Manager 注册： https://support.google.com/admanager/answer/7084151
- 网页激励广告： https://support.google.com/admanager/answer/9116812
- 激励广告奖励政策： https://support.google.com/admanager/answer/7496282
- Google CMP 要求： https://support.google.com/adsense/answer/13554116
- Adsterra 准入及禁止激励流量： https://adsterra.com/blog/set-up-publishers-dashboard/
