import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { LoginButton } from "~/components/auth/login-button"
import { Header, HeaderDescription, HeaderTitle } from "~/components/ui/header"
import { siteConfig } from "~/config/site"

export const Route = createFileRoute("/_layout/login")({
  validateSearch: z.object({
    callbackURL: z.string().optional(),
  }),

  loader: async ({ context: { trpc } }) => {
    const session = await trpc.auth.getSession.fetch()

    if (session?.user) {
      throw redirect({ to: "/" })
    }
  },

  component: App,
})

import { EmailLoginForm } from "~/components/auth/email-login-form"

function App() {
  const { callbackURL } = Route.useSearch()

  return (
    <Header gap="sm" alignment="center">
      <HeaderTitle>Login to {siteConfig.name}.</HeaderTitle>
      <HeaderDescription>{siteConfig.tagline}</HeaderDescription>

      <div className="mt-6 flex flex-col gap-4 w-full max-w-sm">
        <EmailLoginForm callbackURL={callbackURL} />
      </div>
    </Header>
  )
}
