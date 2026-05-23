export const RATE_LIMIT_ERROR_MESSAGE =
  "Too many requests. Please try again later.";

export type RateLimitPolicy = {
  action: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  key: string;
  store: "memory" | "upstash" | "disabled";
};

type StoredCounter = {
  count: number;
  resetAt: number;
};

type RateLimitStore = {
  readonly name: "memory" | "upstash";
  increment(key: string, windowMs: number): Promise<StoredCounter>;
  reset?(key: string): Promise<void>;
};

export const RATE_LIMIT_POLICIES = {
  login: {
    action: "login",
    limit: 5,
    windowMs: 15 * 60 * 1000,
  },
  passwordReset: {
    action: "password-reset",
    limit: 3,
    windowMs: 60 * 60 * 1000,
  },
  emailVerification: {
    action: "email-verification",
    limit: 3,
    windowMs: 60 * 60 * 1000,
  },
  generalApi: {
    action: "api:general",
    limit: 100,
    windowMs: 60 * 1000,
  },
  writeAction: {
    action: "api:write",
    limit: 20,
    windowMs: 60 * 1000,
  },
  publicForm: {
    action: "public-form",
    limit: 5,
    windowMs: 10 * 60 * 1000,
  },
} satisfies Record<string, RateLimitPolicy>;

const memoryCounters = new Map<string, StoredCounter>();
let warnedAboutProductionMemoryStore = false;
let upstashStore: UpstashRateLimitStore | null | undefined;

function now() {
  return Date.now();
}

function isRateLimitEnabled() {
  return process.env.RATE_LIMIT_ENABLED !== "false";
}

function isStrictMode() {
  return process.env.RATE_LIMIT_STRICT_MODE === "true";
}

function shouldTrustProxyHeaders() {
  if (process.env.TRUST_PROXY_HEADERS) {
    return process.env.TRUST_PROXY_HEADERS === "true";
  }

  return (
    process.env.NODE_ENV !== "production" ||
    Boolean(process.env.VERCEL || process.env.CF_PAGES || process.env.RENDER)
  );
}

function hashKeyPart(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeKeyPart(value: unknown) {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().toLowerCase() || "unknown";
}

export function getClientIp(headers: Headers) {
  if (!shouldTrustProxyHeaders()) {
    return "unknown";
  }

  const forwardedFor = headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    firstForwardedIp ||
    "unknown"
  );
}

export function getRateLimitSubject(input: {
  ip?: string | null;
  userId?: string | null;
}) {
  if (input.userId) {
    return `user:${input.userId}`;
  }

  return `ip:${input.ip || "unknown"}`;
}

export function buildRateLimitKey(policy: RateLimitPolicy, keyParts: unknown[]) {
  const hashedParts = keyParts.map((part) => hashKeyPart(normalizeKeyPart(part)));
  const rawKey = [policy.action, ...hashedParts].join(":");
  return `rl:${policy.action}:${hashKeyPart(rawKey)}`;
}

class MemoryRateLimitStore implements RateLimitStore {
  readonly name = "memory" as const;

  async increment(key: string, windowMs: number) {
    const currentTime = now();
    const existing = memoryCounters.get(key);

    if (!existing || existing.resetAt <= currentTime) {
      const next = { count: 1, resetAt: currentTime + windowMs };
      memoryCounters.set(key, next);
      return next;
    }

    existing.count += 1;
    memoryCounters.set(key, existing);
    return existing;
  }

  async reset(key: string) {
    memoryCounters.delete(key);
  }
}

class UpstashRateLimitStore implements RateLimitStore {
  readonly name = "upstash" as const;

  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  async increment(key: string, windowMs: number) {
    const response = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, windowMs],
        ["PTTL", key],
      ]),
    });

    if (!response.ok) {
      throw new Error(`Upstash rate limit request failed: ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    const error = payload.find((item) => item.error)?.error;

    if (error) {
      throw new Error(error);
    }

    const count = Number(payload[0]?.result ?? 0);
    const ttl = Number(payload[2]?.result ?? windowMs);

    return {
      count: Number.isFinite(count) ? count : 1,
      resetAt: now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs),
    };
  }
}

const memoryStore = new MemoryRateLimitStore();

function getUpstashStore() {
  if (upstashStore !== undefined) {
    return upstashStore;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  upstashStore = url && token ? new UpstashRateLimitStore(url, token) : null;
  return upstashStore;
}

function getStore(): RateLimitStore {
  const upstash = getUpstashStore();
  if (upstash) return upstash;

  if (process.env.NODE_ENV === "production" && !warnedAboutProductionMemoryStore) {
    warnedAboutProductionMemoryStore = true;
    console.warn(
      "[RateLimit] Using in-memory store in production. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for durable limits."
    );
  }

  return memoryStore;
}

export async function checkRateLimit(input: {
  policy: RateLimitPolicy;
  keyParts: unknown[];
}) {
  const { policy, keyParts } = input;
  const key = buildRateLimitKey(policy, keyParts);

  if (!isRateLimitEnabled()) {
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now() + policy.windowMs,
      retryAfterSeconds: 0,
      key,
      store: "disabled",
    } satisfies RateLimitResult;
  }

  const store = getStore();

  try {
    const counter = await store.increment(key, policy.windowMs);
    const remaining = Math.max(policy.limit - counter.count, 0);
    const retryAfterSeconds = Math.max(
      Math.ceil((counter.resetAt - now()) / 1000),
      1
    );

    return {
      allowed: counter.count <= policy.limit,
      limit: policy.limit,
      remaining,
      resetAt: counter.resetAt,
      retryAfterSeconds: counter.count <= policy.limit ? 0 : retryAfterSeconds,
      key,
      store: store.name,
    } satisfies RateLimitResult;
  } catch (error) {
    console.error("[RateLimit] Store error:", error);

    if (isStrictMode()) {
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetAt: now() + 60_000,
        retryAfterSeconds: 60,
        key,
        store: store.name,
      } satisfies RateLimitResult;
    }

    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now() + policy.windowMs,
      retryAfterSeconds: 0,
      key,
      store: store.name,
    } satisfies RateLimitResult;
  }
}

export function getRateLimitHeaders(result: RateLimitResult) {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }

  return headers;
}

export function rateLimitJsonResponse(
  result: RateLimitResult,
  message = RATE_LIMIT_ERROR_MESSAGE
) {
  return Response.json(
    { error: message },
    {
      status: 429,
      headers: getRateLimitHeaders(result),
    }
  );
}

export async function resetRateLimitKey(policy: RateLimitPolicy, keyParts: unknown[]) {
  const store = getStore();
  if (store.reset) {
    await store.reset(buildRateLimitKey(policy, keyParts));
  }
}

export function resetRateLimitsForTests() {
  memoryCounters.clear();
  upstashStore = undefined;
  warnedAboutProductionMemoryStore = false;
}
