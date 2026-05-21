import { createRedisClient } from "@openads/redis"
import { env } from "~/env"

export const redis = createRedisClient({
  REDIS_URL: env.REDIS_URL,
})
