import { getCurrentUser, getSafeUserPayload, unauthorizedResponse } from "@/lib/api-auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorizedResponse();
  }

  return Response.json({ user: getSafeUserPayload(user) });
}
