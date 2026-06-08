import { createEmailClient, type EmailClient } from "@openads/emails"
import { env } from "~/env"

export const emails: EmailClient = createEmailClient({
  region: env.AWS_SES_REGION,
  accessKeyId: env.AWS_SES_ACCESS_KEY_ID || "",
  secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY || "",
  from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
})
