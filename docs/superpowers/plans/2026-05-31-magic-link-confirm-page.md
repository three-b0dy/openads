# Magic Link 确认页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 magic link 验证之前插入确认页，防止剪贴板管理软件自动抓取 URL 消耗一次性 token。

**Architecture:** `onSendMagicLink` 回调中将 better-auth 生成的验证 URL 重写为指向 App 确认页的 URL（携带 token + callbackURL 参数）；确认页展示一个按钮，用户点击后浏览器导航至真实的 better-auth 验证端点，token 在此时才被消耗。

**Tech Stack:** Hono (apps/api), TanStack Router + React (apps/app), better-auth magicLink plugin, @openads/ui/button

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `apps/api/src/services/auth.ts` | `onSendMagicLink` 中重写 URL |
| 新建 | `apps/app/src/routes/_layout.magic-link-confirm.tsx` | 确认页路由组件 |

---

### Task 1：API — 重写 magic link URL

**Files:**
- Modify: `apps/api/src/services/auth.ts`

- [ ] **Step 1: 打开文件，理解当前结构**

  当前 `onSendMagicLink` 直接将 better-auth 生成的 `url` 传给邮件模板：

  ```typescript
  onSendMagicLink: async (email, url) => {
    const rendered = await renderMagicLink({ url })
    await emails.send({
      to: email,
      subject: "Sign in to OpenAds",
      html: rendered.html,
      text: rendered.text,
    })
  },
  ```

  `url` 的格式为：`{API_URL}/api/auth/magic-link/verify?token=ABC&callbackURL=X`  
  `env.APP_URL` 已在该文件中通过 `createAuthServer({ APP_URL: env.APP_URL })` 传入——但重写 URL 需要直接在此文件中访问 `env.APP_URL`，它已经通过 `import { env } from "~/env"` 引入。

- [ ] **Step 2: 替换 `onSendMagicLink` 实现**

  将整个 `onSendMagicLink` 回调替换为：

  ```typescript
  onSendMagicLink: async (email, url) => {
    const verifyUrl = new URL(url)
    const token = verifyUrl.searchParams.get("token")
    const callbackURL = verifyUrl.searchParams.get("callbackURL")

    const confirmUrl = new URL(`${env.APP_URL}/magic-link-confirm`)
    if (token) confirmUrl.searchParams.set("token", token)
    if (callbackURL) confirmUrl.searchParams.set("callbackURL", callbackURL)

    const rendered = await renderMagicLink({ url: confirmUrl.toString() })
    await emails.send({
      to: email,
      subject: "Sign in to OpenAds",
      html: rendered.html,
      text: rendered.text,
    })
  },
  ```

  完整文件结果：

  ```typescript
  import { createAuthServer } from "@openads/auth/server"
  import { renderMagicLink } from "@openads/emails"
  import { env } from "~/env"
  import { emails } from "./emails"

  export const auth = createAuthServer({
    APP_URL: env.APP_URL,
    enableRegistration: env.ENABLE_REGISTRATION,
    onSendMagicLink: async (email, url) => {
      const verifyUrl = new URL(url)
      const token = verifyUrl.searchParams.get("token")
      const callbackURL = verifyUrl.searchParams.get("callbackURL")

      const confirmUrl = new URL(`${env.APP_URL}/magic-link-confirm`)
      if (token) confirmUrl.searchParams.set("token", token)
      if (callbackURL) confirmUrl.searchParams.set("callbackURL", callbackURL)

      const rendered = await renderMagicLink({ url: confirmUrl.toString() })
      await emails.send({
        to: email,
        subject: "Sign in to OpenAds",
        html: rendered.html,
        text: rendered.text,
      })
    },
  })
  ```

- [ ] **Step 3: 确认 TypeScript 无类型错误**

  ```bash
  cd apps/api && bun run tsc --noEmit
  ```

  期望：无错误输出。

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/src/services/auth.ts
  git commit -m "feat: rewrite magic link URL to confirmation page before sending email"
  ```

---

### Task 2：App — 新建确认页路由

**Files:**
- Create: `apps/app/src/routes/_layout.magic-link-confirm.tsx`

- [ ] **Step 1: 创建文件，添加路由骨架**

  TanStack Router 使用文件名约定：`_layout.magic-link-confirm.tsx` 会生成路径 `/_layout/magic-link-confirm`，即 URL `/magic-link-confirm`（`_layout` 是无路径段布局）。

  创建 `apps/app/src/routes/_layout.magic-link-confirm.tsx`，内容：

  ```typescript
  import { Button } from "@openads/ui/button"
  import { createFileRoute, Link, redirect } from "@tanstack/react-router"
  import { z } from "zod"
  import { Header, HeaderDescription, HeaderTitle } from "~/components/ui/header"
  import { env } from "~/env"

  export const Route = createFileRoute("/_layout/magic-link-confirm")({
    validateSearch: z.object({
      token: z.string().optional(),
      callbackURL: z.string().optional(),
    }),

    loader: async ({ context: { trpc } }) => {
      const session = await trpc.auth.getSession.fetch()
      if (session?.user) {
        throw redirect({ to: "/" })
      }
    },

    component: MagicLinkConfirm,
  })

  function MagicLinkConfirm() {
    const { token, callbackURL } = Route.useSearch()

    if (!token) {
      return (
        <Header gap="sm" alignment="center">
          <HeaderTitle>链接无效</HeaderTitle>
          <HeaderDescription>此登录链接无效，请重新获取。</HeaderDescription>
          <div className="mt-6 flex flex-col gap-4 w-full max-w-sm">
            <Link to="/login">
              <Button variant="outline" className="w-full">
                返回登录
              </Button>
            </Link>
          </div>
        </Header>
      )
    }

    const verifyUrl = new URL(`${env.VITE_API_URL}/api/auth/magic-link/verify`)
    verifyUrl.searchParams.set("token", token)
    if (callbackURL) verifyUrl.searchParams.set("callbackURL", callbackURL)

    return (
      <Header gap="sm" alignment="center">
        <HeaderTitle>确认登录</HeaderTitle>
        <HeaderDescription>点击下方按钮完成登录，此链接有效期 10 分钟。</HeaderDescription>
        <div className="mt-6 flex flex-col gap-4 w-full max-w-sm">
          <Button className="w-full" onClick={() => { window.location.href = verifyUrl.toString() }}>
            点击登录
          </Button>
        </div>
      </Header>
    )
  }
  ```

  > 注意：`window.location.href` 是全页面导航，这是必要的——better-auth 验证后需要通过 `Set-Cookie` 响应头设置 session cookie，客户端路由跳转无法捕获该响应头。

- [ ] **Step 2: 检查 TanStack Router 是否需要手动注册路由**

  查看 `apps/app/src/routeTree.gen.ts` 是否由 vite 插件自动生成：

  ```bash
  head -5 apps/app/src/routeTree.gen.ts
  ```

  若文件头包含 `// This file is auto-generated`，则路由会在 `bun run dev` 重启后自动被检测到，无需手动注册。

- [ ] **Step 3: 确认 TypeScript 无类型错误**

  ```bash
  cd apps/app && bun run tsc --noEmit
  ```

  期望：无错误输出。若提示 `routeTree.gen.ts` 相关错误，先启动开发服务器让其自动更新生成文件。

- [ ] **Step 4: Commit**

  ```bash
  git add apps/app/src/routes/_layout.magic-link-confirm.tsx
  git commit -m "feat: add magic link confirmation page to prevent clipboard manager token consumption"
  ```

---

### Task 3：手动验证

- [ ] **Step 1: 启动开发服务器**

  ```bash
  bun run dev
  ```

  等待 api 和 app 均启动完成。

- [ ] **Step 2: 触发 magic link 邮件**

  访问 `http://localhost:5183/login`（或 app 实际端口），输入邮件地址，点击 Send Magic Link。

  在 API 日志或 console 中查看生成的确认页 URL（开发环境下 `onSendMagicLink` 会 console.log）：

  ```bash
  tail -f apps/api/logs/openads.log
  ```

  确认 URL 格式为：`http://localhost:5183/magic-link-confirm?token=...&callbackURL=...`（而非之前的 `/api/auth/magic-link/verify?...`）。

- [ ] **Step 3: 验证确认页正常渲染**

  在浏览器访问上一步得到的确认页 URL，确认：
  - 页面显示 Logo + "确认登录" 标题
  - 显示 "点击下方按钮完成登录，此链接有效期 10 分钟" 描述
  - 显示"点击登录"按钮

- [ ] **Step 4: 验证登录流程完整**

  点击"点击登录"按钮，确认：
  - 浏览器跳转至 API 验证端点
  - better-auth 完成验证，重定向至 callbackURL（或 `/`）
  - 用户处于已登录状态

- [ ] **Step 5: 验证 token 缺失时的降级展示**

  访问 `http://localhost:5183/magic-link-confirm`（不带 token 参数），确认：
  - 显示"链接无效"标题
  - 显示"返回登录"按钮
  - 不显示"点击登录"按钮

- [ ] **Step 6: 验证已登录状态的重定向**

  在已登录浏览器中访问确认页 URL，确认自动重定向至 `/`。
