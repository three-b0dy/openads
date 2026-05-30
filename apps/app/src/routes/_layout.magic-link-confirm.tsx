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

  return (
    <Header gap="sm" alignment="center">
      <HeaderTitle>确认登录</HeaderTitle>
      <HeaderDescription>点击下方按钮完成登录，此链接有效期 10 分钟。</HeaderDescription>
      <div className="mt-6 flex flex-col gap-4 w-full max-w-sm">
        <Button
          className="w-full"
          onClick={() => {
            const verifyUrl = new URL(`${env.VITE_API_URL}/api/auth/magic-link/verify`)
            verifyUrl.searchParams.set("token", token)
            if (callbackURL) verifyUrl.searchParams.set("callbackURL", callbackURL)
            // full-page navigation required for better-auth Set-Cookie response header
            window.location.href = verifyUrl.toString()
          }}
        >
          点击登录
        </Button>
      </div>
    </Header>
  )
}
