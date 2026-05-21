import Redis from "ioredis"

export interface RedisConfig {
  REDIS_URL?: string
}

export function createRedisClient(config?: RedisConfig) {
  // 如果提供了 Redis TCP URL，则连接真实数据库
  if (config?.REDIS_URL) {
    console.info("Connecting to real Redis server via TCP...")
    return new Redis(config.REDIS_URL)
  }

  // 否则回退为内存模拟（本地免配置开发）
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
    },
  } as any
}

export type RedisClient = ReturnType<typeof createRedisClient>
