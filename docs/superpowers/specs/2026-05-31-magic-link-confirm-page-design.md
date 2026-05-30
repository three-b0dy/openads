# Magic Link 确认页设计

**日期：** 2026-05-31  
**状态：** 已批准，待实现

## 问题背景

部分剪贴板管理软件（如 Alfred、Raycast、Pasteboard 等）在用户复制链接时会自动发起 GET 请求以获取预览信息。由于 magic link 的验证 URL 是一次性的，剪贴板软件的自动抓取会消耗 token，导致用户粘贴到浏览器后无法登录。

## 解决方案

在 magic link 验证之前插入一个确认页。邮件中的链接指向确认页（静态 HTML，不消耗 token），用户主动点击按钮后才真正触发验证。

## 数据流

```
1. 用户在 /login 输入邮箱
2. authClient.signIn.magicLink() → better-auth 生成 token
3. onSendMagicLink 回调拦截 URL：
     原始：{API_URL}/api/auth/magic-link/verify?token=ABC&callbackURL=X
     重写：{APP_URL}/magic-link-confirm?token=ABC&callbackURL=X
4. 邮件发出（按钮 + 纯文本均使用确认页 URL）
5. 剪贴板管理软件抓取确认页 URL → 得到 HTML，token 未消耗
6. 用户打开链接 → /magic-link-confirm 确认页
7. 用户点击"点击登录"按钮
8. 浏览器导航至 {API_URL}/api/auth/magic-link/verify?token=ABC&callbackURL=X
9. better-auth 消耗 token、建立 session → 重定向至 callbackURL
```

## 改动范围

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `apps/api/src/services/auth.ts` | 修改 | `onSendMagicLink` 中重写 URL |
| `apps/app/src/routes/_layout.magic-link-confirm.tsx` | 新建 | 确认页路由组件 |

**不改动：**
- `packages/auth/src/server.ts`（better-auth 插件配置）
- `packages/emails/src/templates/magic-link.tsx`（模板结构不变，仅 URL 内容变化）
- token 有效期（保持 better-auth 默认 10 分钟）

## 确认页 UI

复用 `_layout` 布局，与 `/login` 页风格完全一致（Logo + 居中卡片 + 渐变背景）。使用现有的 `Header` / `HeaderTitle` / `HeaderDescription` 组件和 `@openads/ui` 的 `Button`。

**路由：** `/_layout/magic-link-confirm`  
**Search params：** `token: string`（必填）、`callbackURL?: string`

页面内容：
- 标题：确认登录
- 描述：点击下方按钮完成登录，此链接有效期 10 分钟
- 按钮：点击登录（全宽，点击后 `window.location.href` 导航至验证 URL）

## API 侧 URL 重写逻辑

```typescript
// apps/api/src/services/auth.ts
onSendMagicLink: async (email, url) => {
  const verifyUrl = new URL(url)
  const token = verifyUrl.searchParams.get("token")
  const callbackURL = verifyUrl.searchParams.get("callbackURL")

  const confirmUrl = new URL(`${env.APP_URL}/magic-link-confirm`)
  if (token) confirmUrl.searchParams.set("token", token)
  if (callbackURL) confirmUrl.searchParams.set("callbackURL", callbackURL)

  const rendered = await renderMagicLink({ url: confirmUrl.toString() })
  await emails.send({ to: email, subject: "Sign in to OpenAds", ...rendered })
}
```

## 错误处理 & 边界情况

| 情况 | 处理方式 |
|------|---------|
| `token` 参数缺失（直接访问确认页） | 显示"链接无效"提示 + 返回登录页链接，不渲染按钮 |
| token 已过期（点击后 better-auth 拒绝） | better-auth 默认错误处理，v1 不额外处理 |
| `callbackURL` 缺失 | 允许，重定向默认回 `"/"` |
| 用户已登录（loader 检测到 session） | `redirect({ to: "/" })`，与 login 页一致 |
| token 重放（已用过的 token 再点击） | better-auth 原有机制拒绝 |

## 安全说明

确认页本身不执行任何鉴权操作，token 仍由 better-auth 的原有验证逻辑处理。确认页只是一个需要用户主动交互（点击）才能跳转的中间页，无法被自动化 HTTP 客户端"点击"。
