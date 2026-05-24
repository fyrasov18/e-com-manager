import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { normalizeRole } from "@/lib/rbac";

const USER_ROLES = ["ADMIN", "USER"] as const;
const USER_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

type AdminUserRole = (typeof USER_ROLES)[number];
type AdminUserStatus = (typeof USER_STATUSES)[number];

function normalizeRequestedRole(value: unknown): AdminUserRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const role = value.trim().toUpperCase();
  return USER_ROLES.includes(role as AdminUserRole) ? (role as AdminUserRole) : null;
}

function normalizeRequestedStatus(value: unknown): AdminUserStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const status = value.trim().toUpperCase();
  return USER_STATUSES.includes(status as AdminUserStatus)
    ? (status as AdminUserStatus)
    : null;
}

function toStoredRole(role: AdminUserRole) {
  return role.toLowerCase();
}

function isApprovedAdmin(user: { role: string; status: string }) {
  return normalizeRole(user.role) === "admin" && user.status === "APPROVED";
}

async function countApprovedAdmins() {
  return prisma.user.count({
    where: {
      status: "APPROVED",
      OR: [{ role: "admin" }, { role: "ADMIN" }],
    },
  });
}

async function getAdminContext() {
  const { user, response } = await requirePermission("admin:all");

  if (response || !user) {
    return { user: null, response: response ?? NextResponse.json({ error: "Access denied." }, { status: 403 }) };
  }

  return { user, response: null };
}

function toAdminUserPayload(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...user,
    role: normalizeRole(user.role).toUpperCase(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user: currentUser, response } = await getAdminContext();

  if (response || !currentUser) {
    return response;
  }

  const { id } = await context.params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  let body: { role?: unknown; status?: unknown };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
  }

  const requestedRole = body.role === undefined ? null : normalizeRequestedRole(body.role);
  const requestedStatus =
    body.status === undefined ? null : normalizeRequestedStatus(body.status);

  if (body.role !== undefined && !requestedRole) {
    return NextResponse.json({ error: "Role invalide." }, { status: 400 });
  }

  if (body.status !== undefined && !requestedStatus) {
    return NextResponse.json({ error: "Status invalide." }, { status: 400 });
  }

  if (!requestedRole && !requestedStatus) {
    return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
  }

  const nextRole = requestedRole ? toStoredRole(requestedRole) : target.role;
  const nextStatus = requestedStatus ?? target.status;
  const targetIsApprovedAdmin = isApprovedAdmin(target);
  const targetWillRemainApprovedAdmin = isApprovedAdmin({
    role: nextRole,
    status: nextStatus,
  });

  if (
    currentUser.id === target.id &&
    targetIsApprovedAdmin &&
    !targetWillRemainApprovedAdmin
  ) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas retirer votre propre acces admin." },
      { status: 400 }
    );
  }

  if (targetIsApprovedAdmin && !targetWillRemainApprovedAdmin) {
    const approvedAdmins = await countApprovedAdmins();

    if (approvedAdmins <= 1) {
      return NextResponse.json(
        { error: "Impossible de retirer le dernier admin approuve." },
        { status: 400 }
      );
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...(requestedRole ? { role: nextRole } : {}),
      ...(requestedStatus ? { status: requestedStatus } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    user: toAdminUserPayload(updatedUser),
  });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user: currentUser, response } = await getAdminContext();

  if (response || !currentUser) {
    return response;
  }

  const { id } = await context.params;

  if (currentUser.id === id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas supprimer votre propre compte." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  if (isApprovedAdmin(target)) {
    const approvedAdmins = await countApprovedAdmins();

    if (approvedAdmins <= 1) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier admin approuve." },
        { status: 400 }
      );
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (error) {
    console.error("[Admin users] Delete failed:", error);
    return NextResponse.json(
      { error: "Impossible de supprimer cet utilisateur." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
