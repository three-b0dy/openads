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
