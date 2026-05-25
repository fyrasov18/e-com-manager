import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import { normalizeAssignablePermissions } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ensureWorkspaceDefaultRoles } from "@/lib/workspace-access";

function normalizeRoleInput(payload: {
  name?: unknown;
  description?: unknown;
  permissions?: unknown;
}) {
  const errors: Record<string, string> = {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";
  const permissions = normalizeAssignablePermissions(payload.permissions);

  if (!name) {
    errors.name = "Le nom du role est requis.";
  } else if (name.length < 2) {
    errors.name = "Le nom du role est trop court.";
  } else if (name.length > 60) {
    errors.name = "Le nom du role est trop long.";
  }

  if (description.length > 180) {
    errors.description = "La description est trop longue.";
  }

  return {
    success: Object.keys(errors).length === 0,
    errors,
    data: {
      name,
      description: description || null,
      permissions,
    },
  };
}

function toRolePayload(role: {
  id: string;
  name: string;
  description: string | null;
  permissions: Prisma.JsonValue;
  isSystem: boolean;
  isOwner: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: normalizeAssignablePermissions(role.permissions),
    isSystem: role.isSystem,
    isOwner: role.isOwner,
    editable: !role.isSystem && !role.isOwner,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export async function GET() {
  const { user, response } = await requirePermission("users:manage");

  if (response || !user) {
    return response;
  }

  if (!user.teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  await ensureWorkspaceDefaultRoles(user.teamId);

  const roles = await prisma.workspaceRole.findMany({
    where: { teamId: user.teamId },
    orderBy: [{ isOwner: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ roles: roles.map(toRolePayload) });
}

export async function POST(req: Request) {
  if (!isSameOriginUnsafeRequest(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const { user, response } = await requirePermission("users:manage");

  if (response || !user) {
    return response;
  }

  if (!user.teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  let body: { name?: unknown; description?: unknown; permissions?: unknown };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
  }

  const validation = normalizeRoleInput(body);

  if (!validation.success) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  try {
    const role = await prisma.workspaceRole.create({
      data: {
        teamId: user.teamId,
        name: validation.data.name,
        description: validation.data.description,
        permissions: validation.data.permissions,
      },
    });

    return NextResponse.json({ success: true, role: toRolePayload(role) }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { errors: { name: "Un role avec ce nom existe deja." } },
        { status: 409 }
      );
    }

    console.error("[Admin roles] Create failed:", error);
    return NextResponse.json(
      { error: "Impossible de creer ce role." },
      { status: 500 }
    );
  }
}
