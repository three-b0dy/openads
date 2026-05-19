export interface RedisConfig {
  REDIS_REST_URL?: string
  REDIS_REST_TOKEN?: string
}

export function createRedisClient(config?: RedisConfig) {
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
    incr: async (key: string) => {
      const val = (store.get(key) || 0) + 1
      store.set(key, val)
      return val
    },
    expire: async (key: string, seconds: number) => {
      setTimeout(() => store.delete(key), seconds * 1000)
      return 1
    }
  } as any
}

export type RedisClient = ReturnType<typeof createRedisClient>
