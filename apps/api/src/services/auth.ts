import { createAuthServer } from "@openads/auth/server"
import { renderMagicLink } from "@openads/emails"
import { env } from "~/env"
import { logger } from "~/services/logger"
import { emails } from "./emails"

export const auth = createAuthServer({
  APP_URL: env.APP_URL,
  enableRegistration: env.ENABLE_REGISTRATION,
  onSendMagicLink: async (email, url) => {
    let verifyUrl: URL
    try {
      verifyUrl = new URL(url)
    } catch {
      logger.error("Invalid magic link URL received from better-auth", { url })
      return
    }

    const token = verifyUrl.searchParams.get("token")
    if (!token) throw new Error("Magic link URL is missing token param")

    const callbackURL = verifyUrl.searchParams.get("callbackURL")

    const confirmUrl = new URL("/magic-link-confirm", env.APP_URL)
    confirmUrl.searchParams.set("token", token)
    if (callbackURL) {
      const isSameOrigin =
        callbackURL.startsWith("/") || callbackURL.startsWith(env.APP_URL)
      if (isSameOrigin) confirmUrl.searchParams.set("callbackURL", callbackURL)
    }

    const rendered = await renderMagicLink({ url: confirmUrl.toString() })
    await emails.send({
      to: email,
      subject: "Sign in to OpenAds",
      html: rendered.html,
      text: rendered.text,
    })
  },
})
