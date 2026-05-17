import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    AWS_SES_REGION: z.string().default("us-east-1"),
    AWS_SES_ACCESS_KEY_ID: z.string().optional().or(z.literal("")),
    AWS_SES_SECRET_ACCESS_KEY: z.string().optional().or(z.literal("")),
    EMAIL_FROM_ADDRESS: z.string().email().optional().or(z.literal("")),
    EMAIL_FROM_NAME: z.string().default("OpenAds"),
  },

  runtimeEnv: process.env,
})
