import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { normalizeEmail, validateLoginCredentials } from "@/lib/auth-validation";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import {
  checkLoginAttemptRateLimit,
  getLoginRateLimitBypassToken,
} from "@/lib/login-rate-limit";
import { rateLimitJsonResponse } from "@/lib/rate-limit";

const INVALID_LOGIN_MESSAGE = "Invalid email or password.";
const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Please try again later.";

function getSafeCallbackUrl(value: unknown) {
  if (typeof value !== "string") {
    return "/";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export async function POST(req: Request) {
  if (!isSameOriginUnsafeRequest(req)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    const rateLimit = await checkLoginAttemptRateLimit(req, "unknown");
    if (!rateLimit.allowed) {
      return rateLimitJsonResponse(rateLimit, TOO_MANY_ATTEMPTS_MESSAGE);
    }

    return Response.json({ error: INVALID_LOGIN_MESSAGE }, { status: 400 });
  }

  const payload = body as {
    email?: unknown;
    password?: unknown;
    callbackUrl?: unknown;
  };
  const emailForRateLimit =
    typeof payload.email === "string" ? normalizeEmail(payload.email) : "unknown";
  const rateLimit = await checkLoginAttemptRateLimit(req, emailForRateLimit);

  if (!rateLimit.allowed) {
    return rateLimitJsonResponse(rateLimit, TOO_MANY_ATTEMPTS_MESSAGE);
  }

  const validation = validateLoginCredentials(payload.email, payload.password);

  if (!validation.success) {
    return Response.json({ errors: validation.errors }, { status: 400 });
  }

  try {
    await signIn("credentials", {
      email: validation.data.email,
      password: validation.data.password,
      rateLimitBypass: getLoginRateLimitBypassToken(),
      redirect: false,
      redirectTo: getSafeCallbackUrl(payload.callbackUrl),
    });

    return Response.json({ success: true });
  } catch (error) {
    const authErrorType = (error as { type?: string; name?: string }).type;
    const authErrorName = (error as { name?: string }).name;

    if (
      !(
        error instanceof AuthError ||
        authErrorType === "CallbackRouteError" ||
        authErrorType === "CredentialsSignin" ||
        authErrorName === "CallbackRouteError" ||
        authErrorName === "CredentialsSignin"
      )
    ) {
      console.error("[Login] Sign-in error:", error);
    }

    return Response.json({ error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }
}
