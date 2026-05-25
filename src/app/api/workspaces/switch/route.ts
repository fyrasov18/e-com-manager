import { auth } from "@/lib/auth";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import { switchActiveWorkspace } from "@/lib/workspace-access";

export async function POST(req: Request) {
  if (!isSameOriginUnsafeRequest(req)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: { workspaceId?: unknown };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Donnees invalides." }, { status: 400 });
  }

  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";

  if (!workspaceId) {
    return Response.json({ error: "Organisation requise." }, { status: 400 });
  }

  const switched = await switchActiveWorkspace(session.user.id, workspaceId);

  if (!switched) {
    return Response.json({ error: "Organisation introuvable." }, { status: 404 });
  }

  return Response.json({ success: true, workspaceId });
}
