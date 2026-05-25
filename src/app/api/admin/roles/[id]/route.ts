import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import { normalizeAssignablePermissions } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

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

async function getRoleForCurrentOrganisation(id: string, teamId: string) {
  return prisma.workspaceRole.findFirst({
    where: { id, teamId },
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const role = await getRoleForCurrentOrganisation(id, user.teamId);

  if (!role) {
    return NextResponse.json({ error: "Role introuvable." }, { status: 404 });
  }

  if (role.isOwner || role.isSystem) {
    return NextResponse.json(
      { error: "Ce role systeme ne peut pas etre modifie." },
      { status: 400 }
    );
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
    const updatedRole = await prisma.workspaceRole.update({
      where: { id: role.id },
      data: {
        name: validation.data.name,
        description: validation.data.description,
        permissions: validation.data.permissions,
      },
    });

    return NextResponse.json({ success: true, role: toRolePayload(updatedRole) });
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

    console.error("[Admin roles] Update failed:", error);
    return NextResponse.json(
      { error: "Impossible de modifier ce role." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const role = await getRoleForCurrentOrganisation(id, user.teamId);

  if (!role) {
    return NextResponse.json({ error: "Role introuvable." }, { status: 404 });
  }

  if (role.isOwner || role.isSystem) {
    return NextResponse.json(
      { error: "Ce role systeme ne peut pas etre supprime." },
      { status: 400 }
    );
  }

  const assignedMembers = await prisma.membership.count({
    where: { teamId: user.teamId, roleId: role.id },
  });

  if (assignedMembers > 0) {
    return NextResponse.json(
      { error: "Ce role est assigne a des utilisateurs." },
      { status: 400 }
    );
  }

  await prisma.workspaceRole.delete({ where: { id: role.id } });

  return NextResponse.json({ success: true });
}
