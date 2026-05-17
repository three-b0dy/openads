import { type S3BucketClient, createS3BucketClient } from "@openads/s3"
import { env } from "~/env"

export const s3: S3BucketClient = createS3BucketClient({
  region: env.S3_REGION || "dummy-region",
  bucket: env.S3_BUCKET || "dummy-bucket",
  accessKeyId: env.S3_ACCESS_KEY_ID || "dummy-key",
  secretAccessKey: env.S3_SECRET_ACCESS_KEY || "dummy-secret",
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  publicUrl: env.S3_PUBLIC_URL,
  signedUrlTtlSeconds: env.S3_SIGNED_URL_TTL,
})
