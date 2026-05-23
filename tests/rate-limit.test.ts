import assert from "node:assert/strict";
import {
  RATE_LIMIT_ERROR_MESSAGE,
  RATE_LIMIT_POLICIES,
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  rateLimitJsonResponse,
  resetRateLimitsForTests,
} from "../src/lib/rate-limit";
import {
  checkLoginAttemptRateLimit,
  getLoginRateLimitKey,
  resetLoginRateLimitsForTests,
} from "../src/lib/login-rate-limit";

process.env.RATE_LIMIT_ENABLED = "true";
process.env.TRUST_PROXY_HEADERS = "true";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main() {
await test("allows requests under the configured limit", async () => {
  resetRateLimitsForTests();

  const first = await checkRateLimit({
    policy: { action: "test:allowed", limit: 2, windowMs: 60_000 },
    keyParts: ["user:1"],
  });
  const second = await checkRateLimit({
    policy: { action: "test:allowed", limit: 2, windowMs: 60_000 },
    keyParts: ["user:1"],
  });

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
});

await test("blocks requests over the configured limit", async () => {
  resetRateLimitsForTests();

  const policy = { action: "test:blocked", limit: 1, windowMs: 60_000 };

  assert.equal((await checkRateLimit({ policy, keyParts: ["ip:1"] })).allowed, true);

  const blocked = await checkRateLimit({ policy, keyParts: ["ip:1"] });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds > 0, true);
});

await test("login brute-force limit uses IP and normalized email key", async () => {
  resetLoginRateLimitsForTests();

  const request = new Request("http://localhost/api/login", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  const normalizedEmail = "admin@example.com";
  const key = getLoginRateLimitKey(request, normalizedEmail);

  assert.equal(key, "203.0.113.10:admin@example.com");

  for (let i = 0; i < RATE_LIMIT_POLICIES.login.limit; i += 1) {
    const result = await checkLoginAttemptRateLimit(request, normalizedEmail);
    assert.equal(result.allowed, true);
  }

  const blocked = await checkLoginAttemptRateLimit(request, normalizedEmail);

  assert.equal(blocked.allowed, false);
});

await test("429 responses include rate limit headers", async () => {
  resetRateLimitsForTests();

  const policy = { action: "test:response", limit: 0, windowMs: 60_000 };
  const blocked = await checkRateLimit({ policy, keyParts: ["ip:2"] });
  const response = rateLimitJsonResponse(blocked);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 429);
  assert.equal(body.error, RATE_LIMIT_ERROR_MESSAGE);
  assert.equal(response.headers.get("Retry-After") !== null, true);
  assert.equal(response.headers.get("X-RateLimit-Limit"), "0");
  assert.equal(response.headers.get("X-RateLimit-Remaining"), "0");
  assert.equal(response.headers.get("X-RateLimit-Reset") !== null, true);
});

await test("rate limit header helper mirrors blocked retry metadata", async () => {
  resetRateLimitsForTests();

  const blocked = await checkRateLimit({
    policy: { action: "test:headers", limit: 0, windowMs: 60_000 },
    keyParts: ["ip:3"],
  });
  const headers = getRateLimitHeaders(blocked);

  assert.equal(headers.get("Retry-After"), String(blocked.retryAfterSeconds));
  assert.equal(headers.get("X-RateLimit-Limit"), "0");
});

await test("client IP uses trusted proxy headers in local development", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.7, 198.51.100.8",
  });

  assert.equal(getClientIp(headers), "198.51.100.7");
});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
