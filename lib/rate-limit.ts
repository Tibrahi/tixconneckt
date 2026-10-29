import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { redisConfigured } from "./config";

let redis: Redis | null = null;
let redisInitializationFailed = false;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (!redisConfigured() || redisInitializationFailed) return null;
  if (!redis) {
    let url = process.env.UPSTASH_REDIS_REST_URL!.trim();
    let removedWrappingQuotes = false;
    while (
      url.length >= 2 &&
      ((url.startsWith('"') && url.endsWith('"')) ||
        (url.startsWith("'") && url.endsWith("'")))
    ) {
      url = url.slice(1, -1).trim();
      removedWrappingQuotes = true;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:" || /[\"']/.test(url)) {
        throw new Error("Invalid Upstash URL format");
      }
      redis = new Redis({ url, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
    } catch {
      redisInitializationFailed = true;
      console.error(
        "[rate-limit] Invalid UPSTASH_REDIS_REST_URL; use an unquoted https:// URL. Redis rate limiting is disabled.",
      );
      return null;
    }
    if (removedWrappingQuotes) {
      console.warn(
        "[rate-limit] Removed extra wrapping quotes from UPSTASH_REDIS_REST_URL; correct the deployment variable to an unquoted https:// URL.",
      );
    }
  }
  return redis;
}

function getLimiter(key: string, limit: number, window: `${number} ${"s" | "m" | "h" | "d"}`): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  const cacheKey = `${key}:${limit}:${window}`;
  const existing = limiters.get(cacheKey);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `tixconneckt:${key}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Sliding-window rate limit. When Redis is unavailable the request is allowed
 * (fail-open for availability) — sensitive endpoints still enforce OTP attempt
 * limits and expiry in the database.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit = 10,
  window: `${number} ${"s" | "m" | "h" | "d"}` = "10 m",
): Promise<RateLimitResult> {
  const limiter = getLimiter(bucket, limit, window);
  if (!limiter) {
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + 600_000) };
  }
  try {
    const res = await limiter.limit(identifier);
    return {
      allowed: res.success,
      remaining: res.remaining,
      resetAt: new Date(res.reset),
    };
  } catch {
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + 600_000) };
  }
}

export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}
