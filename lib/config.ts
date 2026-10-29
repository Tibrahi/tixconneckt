import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be 32+ chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("TIXCONNECKT <no-reply@tixconneckt.com>"),
  MUSE_SPARK_API_URL: z.string().default(""),
  MUSE_SPARK_API_KEY: z.string().default(""),
  MUSE_VOICE_API_URL: z.string().default(""),
  MUSE_VOICE_API_KEY: z.string().default(""),
  UPSTASH_REDIS_REST_URL: z.string().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("tixconneckt-private"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  CRON_SECRET: z.string().default(""),
  NODE_ENV: z.string().default("development"),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

/** Validate required server configuration at startup. Throws with clear errors in server logs. */
export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Non-throwing check used by health endpoints and degraded-mode banners. */
export function getConfigStatus(): { ok: boolean; missing: string[] } {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return { ok: true, missing: [] };
  return {
    ok: false,
    missing: parsed.error.issues.map((i) => i.path.join(".")),
  };
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function aiSparkConfigured(): boolean {
  return Boolean(process.env.MUSE_SPARK_API_URL && process.env.MUSE_SPARK_API_KEY);
}

export function aiVoiceConfigured(): boolean {
  return Boolean(process.env.MUSE_VOICE_API_URL && process.env.MUSE_VOICE_API_KEY);
}

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function storageConfigured(): boolean {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}
