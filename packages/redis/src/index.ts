import { Redis } from "@upstash/redis"

export interface RedisConfig {
  REDIS_REST_URL: string
  REDIS_REST_TOKEN: string
}

export function createRedisClient(config: RedisConfig) {
  if (!config.REDIS_REST_URL || config.REDIS_REST_URL.includes("xyz.upstash.io")) {
    console.warn("Using in-memory dummy Redis client for local development")
    const store = new Map<string, any>()
    return {
      get: async (key: string) => store.get(key) || null,
      set: async (key: string, value: any) => {
        store.set(key, value)
        return "OK"
      },
      del: async (key: string) => {
        store.delete(key)
        return 1
      },
      // add other methods if needed by the app, but onboarding only uses get/set
    } as any
  }

  return new Redis({
    url: config.REDIS_REST_URL,
    token: config.REDIS_REST_TOKEN,
  })
}

export type RedisClient = ReturnType<typeof createRedisClient>
