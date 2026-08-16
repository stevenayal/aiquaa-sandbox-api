import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv } from "./env";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms timestamp when the current window resets. */
  reset: number;
}

let ratelimit: Ratelimit | undefined;

function getRatelimit(): Ratelimit {
  if (!ratelimit) {
    const env = getEnv();
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    ratelimit = new Ratelimit({
      redis,
      // 30 requests/minute per API key — generous for interactive Postman
      // exploration, tight enough to stop a runaway loop from one student.
      limiter: Ratelimit.slidingWindow(30, "60 s"),
      prefix: "aiquaa-sandbox",
    });
  }
  return ratelimit;
}

// Keyed by apiKeyId (post-authentication), not IP — many students may share
// a network (classroom Wi-Fi/NAT), and the limit is meant to be per-student.
export async function checkRateLimit(apiKeyId: string): Promise<RateLimitResult> {
  const { success, limit, remaining, reset } = await getRatelimit().limit(apiKeyId);
  return { success, limit, remaining, reset };
}
