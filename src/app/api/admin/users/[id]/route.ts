import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { toMembershipRoleValue } from "@/lib/workspace-access";

const MEMBERSHIP_STATUSES = ["ACTIVE", "INACTIVE"] as const;

type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

function normalizeStatus(value: unknown): MembershipStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const status = value.trim().toUpperCase();
  return MEMBERSHIP_STATUSES.includes(status as MembershipStatus)
    ? (status as MembershipStatus)
    : null;
}

function toMemberPayload(membership: {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
  workspaceRole: {
    id: string;
    name: string;
    isOwner: boolean;
    isSystem: boolean;
  } | null;
}) {
  return {
    membershipId: membership.id,
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    phone: membership.user.phone,
    status: membership.status,
    accountStatus: membership.user.status,
    roleId: membership.workspaceRole?.id ?? null,
    roleName: membership.workspaceRole?.name ?? "Membre",
    isOwnerRole: Boolean(membership.workspaceRole?.isOwner),
    isSystemRole: Boolean(membership.workspaceRole?.isSystem),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    userCreatedAt: membership.user.createdAt.toISOString(),
  };
}

async function countActiveOwners(teamId: string) {
  return prisma.membership.count({
    where: {
      teamId,
      status: "ACTIVE",
      workspaceRole: { isOwner: true },
    },
  });
}

async function getMembership(userId: string, teamId: string) {
  return prisma.membership.findFirst({
    where: { userId, teamId },
    select: {
      id: true,
      userId: true,
      teamId: true,
      status: true,
      workspaceRole: {
        select: {
          id: true,
          name: true,
          isOwner: true,
        },
      },
      user: {
        select: {
          id: true,
          teamId: true,
        },
      },
    },
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginUnsafeRequest(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const { user: currentUser, response } = await requirePermission("users:manage");

  if (response || !currentUser) {
    return response;
  }

  if (!currentUser.teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  const { id } = await context.params;
  const membership = await getMembership(id, currentUser.teamId);

  if (!membership) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  let body: { roleId?: unknown; status?: unknown };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
  }

  const nextStatus =
    body.status === undefined ? null : normalizeStatus(body.status);
  const nextRole =
    typeof body.roleId === "string" && body.roleId.trim()
      ? await prisma.workspaceRole.findFirst({
          where: { id: body.roleId.trim(), teamId: currentUser.teamId },
          select: {
            id: true,
            name: true,
            isOwner: true,
          },
        })
      : null;

  if (body.status !== undefined && !nextStatus) {
    return NextResponse.json({ error: "Status invalide." }, { status: 400 });
  }

  if (body.roleId !== undefined && !nextRole) {
    return NextResponse.json({ error: "Role invalide." }, { status: 400 });
  }

  if (!nextRole && !nextStatus) {
    return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
  }

  if (nextRole?.isOwner && !currentUser.isWorkspaceOwner && !currentUser.isPlatformAdmin) {
    return NextResponse.json(
      { error: "Seul un owner peut assigner le role Owner." },
      { status: 403 }
    );
  }

  const isRemovingOwnerAccess =
    membership.workspaceRole?.isOwner &&
    ((nextRole && !nextRole.isOwner) || nextStatus === "INACTIVE");

  if (currentUser.id === membership.userId && isRemovingOwnerAccess) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas retirer votre propre acces Owner." },
      { status: 400 }
    );
  }

  if (isRemovingOwnerAccess && (await countActiveOwners(currentUser.teamId)) <= 1) {
    return NextResponse.json(
      { error: "Impossible de retirer le dernier Owner actif." },
      { status: 400 }
    );
  }

  const updatedMembership = await prisma.membership.update({
    where: { id: membership.id },
    data: {
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextRole
        ? {
            roleId: nextRole.id,
            role: toMembershipRoleValue({
              roleName: nextRole.name,
              isOwner: nextRole.isOwner,
            }),
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      workspaceRole: {
        select: {
          id: true,
          name: true,
          isOwner: true,
          isSystem: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    user: toMemberPayload(updatedMembership),
  });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginUnsafeRequest(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const { user: currentUser, response } = await requirePermission("users:manage");

  if (response || !currentUser) {
    return response;
  }

  if (!currentUser.teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  const { id } = await context.params;

  if (currentUser.id === id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas retirer votre propre acces." },
      { status: 400 }
    );
  }

  const membership = await getMembership(id, currentUser.teamId);

  if (!membership) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  if (membership.workspaceRole?.isOwner && (await countActiveOwners(currentUser.teamId)) <= 1) {
    return NextResponse.json(
      { error: "Impossible de retirer le dernier Owner actif." },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: membership.id } });

    if (membership.user.teamId === currentUser.teamId) {
      const nextMembership = await tx.membership.findFirst({
        where: {
          userId: membership.userId,
          status: "ACTIVE",
          team: { status: "ACTIVE" },
        },
        orderBy: { createdAt: "asc" },
        select: { teamId: true },
      });

      await tx.user.update({
        where: { id: membership.userId },
        data: { teamId: nextMembership?.teamId ?? null },
      });
    }

    await tx.activityLog.create({
      data: {
        teamId: currentUser.teamId,
        userId: currentUser.id,
        action: "organisation.member_removed",
        entityType: "User",
        entityId: membership.userId,
      },
    });
  });

  return NextResponse.json({ success: true });
}
