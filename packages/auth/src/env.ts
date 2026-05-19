import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url(),
    ENABLE_REGISTRATION: z
      .string()
      .optional()
      .default("true")
      .transform(val => val === "true"),
  },

  runtimeEnv: process.env,
})
