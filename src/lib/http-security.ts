const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isSameOriginRequest(req: Request) {
  const origin = req.headers.get("origin");

  if (!origin) {
    return true;
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? req.headers.get("host");

  if (!host) {
    return false;
  }

  const protocol = forwardedProto ?? new URL(req.url).protocol.replace(":", "");
  return origin === `${protocol}://${host}`;
}

export function isSameOriginUnsafeRequest(req: Request) {
  return !isUnsafeMethod(req.method) || isSameOriginRequest(req);
}
