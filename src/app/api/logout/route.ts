import { signOut } from "@/lib/auth";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";

export async function POST(req: Request) {
  if (!isSameOriginUnsafeRequest(req)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  await signOut({ redirect: false });
  return Response.json({ success: true });
}
