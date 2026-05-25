import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { normalizeEmail } from "@/lib/auth-validation";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import {
  ensureWorkspaceDefaultRoles,
  toMembershipRoleValue,
} from "@/lib/workspace-access";

const MIN_PASSWORD_LENGTH = 6;

function normalizeCreateUserPayload(payload: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  phone?: unknown;
  roleId?: unknown;
}) {
  const errors: Record<string, string> = {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword =
    typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const roleId = typeof payload.roleId === "string" ? payload.roleId.trim() : "";

  if (!name) {
    errors.name = "Le nom complet est requis.";
  }

  if (!email) {
    errors.email = "L'adresse email est requise.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Veuillez saisir une adresse email valide.";
  }

  if (!password) {
    errors.password = "Le mot de passe est requis.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = "Le mot de passe doit contenir au moins 6 caracteres.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "La confirmation du mot de passe est requise.";
  } else if (password && confirmPassword !== password) {
    errors.confirmPassword = "Les mots de passe ne correspondent pas.";
  }

  if (phone.length > 40) {
    errors.phone = "Le telephone est trop long.";
  }

  if (!roleId) {
    errors.roleId = "Le role est requis.";
  }

  return {
    success: Object.keys(errors).length === 0,
    errors,
    data: {
      name,
      email,
      password,
      phone: phone || null,
      roleId,
    },
  };
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

export async function GET() {
  const { user, response } = await requirePermission("users:manage");

  if (response || !user) {
    return response;
  }

  if (!user.teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  await ensureWorkspaceDefaultRoles(user.teamId);

  const memberships = await prisma.membership.findMany({
    where: { teamId: user.teamId },
    orderBy: { createdAt: "desc" },
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
    users: memberships.map(toMemberPayload),
  });
}

export async function POST(req: Request) {
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

  let body: {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
    phone?: unknown;
    roleId?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
  }

  const validation = normalizeCreateUserPayload(body);

  if (!validation.success) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  const role = await prisma.workspaceRole.findFirst({
    where: { id: validation.data.roleId, teamId: currentUser.teamId },
    select: {
      id: true,
      name: true,
      isOwner: true,
      permissions: true,
    },
  });

  if (!role) {
    return NextResponse.json({ errors: { roleId: "Role introuvable." } }, { status: 400 });
  }

  if (role.isOwner && !currentUser.isWorkspaceOwner && !currentUser.isPlatformAdmin) {
    return NextResponse.json(
      { error: "Seul un owner peut assigner le role Owner." },
      { status: 403 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: validation.data.email },
    select: {
      id: true,
      teamId: true,
      memberships: {
        where: { teamId: currentUser.teamId },
        select: { id: true },
      },
    },
  });

  if (existingUser?.memberships.length) {
    return NextResponse.json(
      { error: "Cet utilisateur appartient deja a cette organisation." },
      { status: 409 }
    );
  }

  try {
    const membership = await prisma.$transaction(async (tx) => {
      const targetUser =
        existingUser ??
        (await tx.user.create({
          data: {
            name: validation.data.name,
            email: validation.data.email,
            password: await bcrypt.hash(validation.data.password, 12),
            phone: validation.data.phone,
            role: "user",
            status: "APPROVED",
            teamId: currentUser.teamId,
          },
          select: { id: true, teamId: true },
        }));

      if (existingUser && !existingUser.teamId) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { teamId: currentUser.teamId },
        });
      }

      const createdMembership = await tx.membership.create({
        data: {
          userId: targetUser.id,
          teamId: currentUser.teamId!,
          roleId: role.id,
          role: toMembershipRoleValue({
            roleName: role.name,
            isOwner: role.isOwner,
          }),
          status: "ACTIVE",
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

      await tx.activityLog.create({
        data: {
          teamId: currentUser.teamId,
          userId: currentUser.id,
          action: "organisation.member_added",
          entityType: "User",
          entityId: targetUser.id,
          metadata: { roleId: role.id },
        },
      });

      return createdMembership;
    });

    return NextResponse.json(
      { success: true, user: toMemberPayload(membership) },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Cet utilisateur appartient deja a cette organisation." },
        { status: 409 }
      );
    }

    console.error("[Admin users] Create failed:", error);
    return NextResponse.json(
      { error: "Impossible d'ajouter cet utilisateur." },
      { status: 500 }
    );
  }
}
