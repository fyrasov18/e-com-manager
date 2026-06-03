const DEV_AUTH_SECRET = "local-development-only-auth-secret-change-before-production";

export function getAuthSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : DEV_AUTH_SECRET)
  );
}

export function shouldUseSecureAuthCookies() {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const deploymentUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

  if (deploymentUrl && !deploymentUrl.includes("localhost")) {
    return true;
  }

  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;

  if (!authUrl) {
    return false;
  }

  try {
    return new URL(authUrl).protocol === "https:";
  } catch {
    return false;
  }
}
