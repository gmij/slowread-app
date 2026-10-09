# 登录与邮件验证配置

本次增加 Google OIDC、Apple Sign in with Apple 和六位邮箱验证码。配置缺失时按钮禁用，GitHub 原有登录仍可使用。发信配置完成后，首次 GitHub 登录也会提示验证邮箱，求书要求已验证邮箱。Google、Apple 未验证邮箱不能使用书架或求书。

## 最少保留的数据

服务端仅保留稳定登录标识（provider:sub）、登录来源、联系邮箱和验证时间，以隔离书架并发送联系邮件。邮箱不会写入公开 GitHub Issue；不保存 OAuth access/refresh token、头像或第三方个人资料。GitHub 原有用户名仍用于 Issue 提及和会话显示。不同提供商不按邮箱自动合并账号。

## 免费发信方案

Cloudflare Email Service 的免费层只能向账户内已验证收件地址发信；向任意注册用户发信需要 Workers Paid。因此此版本使用 Resend 免费层（每月 3000 封、每天 100 封），不自动开通付费计划。

在 Resend 添加并验证自己的发信域名，配置其提供的 DNS 记录。在 Cloudflare Worker 设置 EMAIL_PROVIDER=resend、EMAIL_FROM=发信邮箱；通过加密 Secret 设置 RESEND_API_KEY。不要把密钥提交到 GitHub。免费名额不代表无限使用；本应用预留余量，验证码全站每天最多 90 封、每月 2800 封，每账号每天最多 3 封，重发间隔 60 秒。失败发送也占应用名额，其他服务共用同一个 Resend 账号时应进一步降低额度。

验证码有效十分钟、最多五次尝试、验证后不可重放；仅保存 HMAC 摘要，定时清除过期挑战。联系邮箱可以使用 Apple 隐藏邮箱，但必须能实际收到验证码。发送流程仅限已完成第三方身份验证的会话。

## Google

Google Cloud 创建 OAuth Web 应用，启用所需的 OAuth 同意屏幕配置。权限仅 openid email，不申请通讯录等权限。

授权回调：https://slowread-app.gmij.workers.dev/api/auth/google/callback

Worker 加密 Secret：GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET。正式开放前将同意屏幕从测试状态按 Google 要求发布。代码验证 JWT 签名、issuer、audience、有效期、nonce 和稳定 sub，使用 PKCE 与浏览器绑定的 state。

## Apple

需要 Apple Developer 配置：开启 Sign in with Apple 的主 App ID、关联 Services ID，登记网站域名 slowread-app.gmij.workers.dev 和返回地址：

https://slowread-app.gmij.workers.dev/api/auth/apple/callback

Worker 加密 Secret：APPLE_CLIENT_ID（Services ID）、APPLE_TEAM_ID、APPLE_KEY_ID、APPLE_PRIVATE_KEY（完整 .p8 私钥，可用真正换行或转义换行）。代码动态生成五分钟有效的 ES256 client secret。Apple 回调使用 form_post，临时状态 Cookie 为 Secure/HttpOnly/SameSite=None；验证 Apple JWT，忽略未经签名的 user 字段。

Apple 隐藏邮箱发信还需在 Apple Developer 注册发信地址/域名并完成 SPF/DKIM 要求，否则验证码可能无法投递。Apple 开发者资格可能涉及已有会员或付费资格，不能将 Apple 接入承诺为零成本。

## Cloudflare 部署与验证

wrangler.jsonc 新增 SQLite Durable Object UserAccount（ACCOUNTS），迁移 v3-user-accounts。默认不填写外部凭据。已有 AUTH_SESSION_SECRET 至少 32 字符。GitHub 推送触发现有 Cloudflare 自动部署。

配置完成后先检查 /api/auth/providers 的对应登录方式与 emailVerification=true，再分别完成真实 Google/Apple 登录、接收验证码、验证、退出和重新登录，确认书架隔离。当前自动测试不等于外部 OAuth 应用审核通过或真实邮件已投递。

已准备联系邮箱与验证码邮件。求书完成后的自动邮件通知尚未实现；需要后续接入私有请求与账户映射及 Issue 状态通知，不能只靠公开 Issue 查到邮箱。

官方资料：
- https://developers.cloudflare.com/email-service/platform/pricing/
- https://resend.com/pricing
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
- https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/


## 登录身份规则（2026-10-09）

- GitHub OAuth 请求只读 `user:email` 权限，从 `/user/emails` 选取已验证邮箱，优先主邮箱。取得已验证邮箱即可获得正式用户权益，无需另发验证码；读取失败提示重新授权，未提供已验证邮箱时提示补充验证。
- 旧会话需要重新登录以取得邮箱验证状态。GitHub 账号内部 ID 保持不变，已有书架保留。
- 邮箱验证码登录支持 QQ、163 等常见邮箱，首次成功验证自动注册。完整邮箱去除首尾空格并按小写归一化，作为登录名；内部 ID 为带服务端密钥的摘要，邮箱不会进入书架路径或公开 Issue。
- 发信未配置时，邮箱登录按钮停用并展示说明，不影响 GitHub 登录。启用现有 Resend 配置后开放邮箱注册、登录。
- GitHub 已验证邮箱首次登记后，使用该邮箱验证码登录可复用 GitHub 账号的书架。已独立创建的不同历史账号不自动合并；邮箱归属记录不会被另一个账号覆盖。更换 GitHub 已验证邮箱时移除原邮箱登录关联。
- 验证码十分钟有效，每邮箱每日最多三次发送，间隔一分钟；最多五次校验，成功后失效。保留全站每日90封、每月2800封发送上限。只在成功发信后允许校验并建立会话。
