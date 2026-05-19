import { createAuthServer } from "@openads/auth/server"
import { renderMagicLink } from "@openads/emails"
import { env } from "~/env"
import { emails } from "./emails"

export const auth = createAuthServer({
  APP_URL: env.APP_URL,
  enableRegistration: env.ENABLE_REGISTRATION,
  onSendMagicLink: async (email, url) => {
    const rendered = await renderMagicLink({ url })
    await emails.send({
      to: email,
      subject: "Sign in to OpenAds",
      html: rendered.html,
      text: rendered.text,
    })
  },
})
