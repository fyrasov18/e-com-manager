import { randomUUID } from "node:crypto";
import {
  RATE_LIMIT_POLICIES,
  checkRateLimit,
  getClientIp,
  resetRateLimitKey,
  resetRateLimitsForTests as resetAllRateLimitsForTests,
} from "@/lib/rate-limit";

const INTERNAL_LOGIN_RATE_LIMIT_BYPASS = randomUUID();

export function getLoginRateLimitBypassToken() {
  return INTERNAL_LOGIN_RATE_LIMIT_BYPASS;
}

export function isValidLoginRateLimitBypass(value: unknown) {
  return (
    typeof value === "string" && value === INTERNAL_LOGIN_RATE_LIMIT_BYPASS
  );
}

export function getLoginRateLimitKeyParts(request: Request, email: string) {
  return [getClientIp(request.headers), email || "unknown"];
}

export function getLoginRateLimitKey(request: Request, email: string) {
  return getLoginRateLimitKeyParts(request, email).join(":");
}

export async function checkLoginAttemptRateLimit(
  request: Request,
  email: string
) {
  return checkRateLimit({
    policy: RATE_LIMIT_POLICIES.login,
    keyParts: getLoginRateLimitKeyParts(request, email),
  });
}

export async function checkLoginRateLimit(key: string) {
  return checkRateLimit({
    policy: RATE_LIMIT_POLICIES.login,
    keyParts: [key],
  });
}

export async function recordFailedLogin(key: string) {
  return checkLoginRateLimit(key);
}

export async function clearLoginRateLimit(key: string) {
  await resetRateLimitKey(RATE_LIMIT_POLICIES.login, [key]);
}

export function resetLoginRateLimitsForTests() {
  resetAllRateLimitsForTests();
}
