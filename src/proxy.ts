import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { isUnsafeMethod } from "@/lib/http-security";
import {
  RATE_LIMIT_ERROR_MESSAGE,
  RATE_LIMIT_POLICIES,
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  getRateLimitSubject,
} from "@/lib/rate-limit";
import {
  canAccessApiRoute,
  canAccessPath,
  normalizeRole,
  type Role,
} from "@/lib/rbac";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/setup",
  "/api/auth",
  "/api/login",
  "/api/auth/register",
  "/api/setup",
  "/api/cron/sync",
  "/api/cron/sync-delivery",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];
const useSecureCookies = process.env.NODE_ENV === "production";

type SessionSnapshot = {
  authenticated: boolean;
  userId: string | null;
  role: Role;
  status: string;
};

const AUTH_LOGIN_PATHS = new Set([
  "/auth/login",
  "/api/auth/login",
  "/api/auth/callback/credentials",
]);

const PUBLIC_FORM_PATHS = ["/api/setup", "/api/auth/register"];

const SENSITIVE_WRITE_PATHS = [
  "/api/orders",
  "/api/products",
  "/api/expenses",
  "/api/settings",
  "/api/import",
  "/api/notifications",
  "/api/shipping-providers",
  "/api/meta-ads",
  "/api/delivery",
  "/api/delivery-settings",
  "/api/delivery-revenue",
  "/api/revenue-livraison",
  "/api/payments",
  "/api/colissimo",
  "/api/insta-delivery",
  "/api/stock-movements",
  "/api/transactions",
  "/api/goals",
  "/api/tasks",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => (path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`))
  );
}

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/register" || pathname === "/setup";
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function matchesPath(pathname: string, paths: readonly string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function getProvidedCronSecret(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : null;

  return (
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    bearer
  );
}

function isAuthorizedCronRequest(req: NextRequest) {
  const expected = process.env.CRON_SECRET;

  if (!expected || !req.nextUrl.pathname.startsWith("/api/cron")) {
    return false;
  }

  return getProvidedCronSecret(req) === expected;
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (!origin) {
    return true;
  }

  return origin === req.nextUrl.origin;
}

async function getSessionSnapshot(req: NextRequest): Promise<SessionSnapshot> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    return { authenticated: false, userId: null, role: "user", status: "APPROVED" };
  }

  const token = await getToken({ req, secret, secureCookie: useSecureCookies });

  return {
    authenticated: Boolean(token?.sub || token?.id || token?.email),
    userId:
      typeof token?.id === "string"
        ? token.id
        : typeof token?.sub === "string"
          ? token.sub
          : null,
    role: normalizeRole(token?.role),
    status: typeof token?.status === "string" ? token.status : "APPROVED",
  };
}

async function applyProxyRateLimits(req: NextRequest, session: SessionSnapshot) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const ip = getClientIp(req.headers);
  const subject = getRateLimitSubject({
    ip,
    userId: session.authenticated ? session.userId : null,
  });

  const checks: Array<{
    policy: (typeof RATE_LIMIT_POLICIES)[keyof typeof RATE_LIMIT_POLICIES];
    keyParts: unknown[];
    message?: string;
  }> = [];

  if (isApiPath(pathname)) {
    checks.push({
      policy: RATE_LIMIT_POLICIES.generalApi,
      keyParts: [subject],
    });
  }

  if (method === "POST" && AUTH_LOGIN_PATHS.has(pathname)) {
    checks.push({
      policy: RATE_LIMIT_POLICIES.login,
      keyParts: [ip, pathname],
      message: "Too many attempts. Please try again later.",
    });
  }

  if (isUnsafeMethod(method)) {
    if (matchesPath(pathname, PUBLIC_FORM_PATHS)) {
      checks.push({
        policy: RATE_LIMIT_POLICIES.publicForm,
        keyParts: [ip, pathname],
      });
    }

    if (isApiPath(pathname) && matchesPath(pathname, SENSITIVE_WRITE_PATHS)) {
      checks.push({
        policy: RATE_LIMIT_POLICIES.writeAction,
        keyParts: [subject],
      });
    }
  }

  for (const check of checks) {
    const result = await checkRateLimit(check);

    if (!result.allowed) {
      return NextResponse.json(
        { error: check.message ?? RATE_LIMIT_ERROR_MESSAGE },
        {
          status: 429,
          headers: getRateLimitHeaders(result),
        }
      );
    }
  }

  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isUnsafeMethod(req.method) && !isSameOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (isAuthorizedCronRequest(req)) {
    return NextResponse.next();
  }

  const session = await getSessionSnapshot(req);
  const rateLimitResponse = await applyProxyRateLimits(req, session);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (isPublicPath(pathname)) {
    if (session.authenticated && isAuthPage(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  }

  if (!session.authenticated) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (session.status !== "APPROVED") {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Account approval required." },
        { status: 403 }
      );
    }

    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isApiPath(pathname)) {
    if (!canAccessApiRoute(pathname, req.method, session.role)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    return NextResponse.next();
  }

  if (!canAccessPath(pathname, session.role)) {
    return NextResponse.redirect(new URL("/forbidden", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot)).*)",
  ],
};
