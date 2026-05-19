import { db } from "@openads/db"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { admin, lastLoginMethod, magicLink } from "better-auth/plugins"

export interface AuthConfig {
  APP_URL: string
  enableRegistration?: boolean
  onSendMagicLink?: (email: string, url: string) => Promise<void>
}

export function createAuthServer(config: AuthConfig) {
  return betterAuth({
    database: prismaAdapter(db, {
      provider: "postgresql",
    }),

    account: {
      accountLinking: {
        enabled: true,
      },
    },

    databaseHooks: {
      user: {
        create: {
          before: async user => {
            if (config.enableRegistration === false) {
              throw new Error("Registration is currently disabled.")
            }
            return { data: user }
          },
        },
      },
    },

    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },

    advanced: {
      database: {
        generateId: false,
      },

      crossSubDomainCookies: {
        enabled: true,
      },
    },

    trustedOrigins: [config.APP_URL],
    plugins: [
      admin(),
      lastLoginMethod(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (config.onSendMagicLink) {
            await config.onSendMagicLink(email, url)
          } else {
            console.log(`[Magic Link] to ${email}: ${url}`)
          }
        },
      }),
    ],
  })
}

export type AuthServer = ReturnType<typeof createAuthServer>
export type Session = AuthServer["$Infer"]["Session"]
