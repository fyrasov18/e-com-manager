import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  ensureFreePlan,
  FREE_PLAN_CODE,
  FREE_PLAN_LIMITS,
  type UsageLimitKey,
} from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import {
  ensureWorkspaceDefaultRoles,
  getWorkspaceAccessForUser,
} from "@/lib/workspace-access";

function createWorkspaceSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${base || "workspace"}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function ensureWorkspaceForUser(userId: string, workspaceName?: string) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      teamId: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { teamId: true },
        take: 1,
      },
    },
  });

  if (!existingUser) {
    throw new Error("User not found.");
  }

  const activeTeamId =
    existingUser.memberships.find((membership) => membership.teamId === existingUser.teamId)
      ?.teamId ?? existingUser.memberships[0]?.teamId;

  if (activeTeamId) {
    if (existingUser.teamId !== activeTeamId) {
      await prisma.user.update({
        where: { id: userId },
        data: { teamId: activeTeamId },
      });
    }

    return activeTeamId;
  }

  const plan = await ensureFreePlan();
  const name =
    workspaceName?.trim() ||
    (existingUser.name ? `${existingUser.name}'s workspace` : "My workspace");

  const team = await prisma.$transaction(async (tx) => {
    const createdTeam = await tx.team.create({
      data: {
        name,
        slug: createWorkspaceSlug(name),
        ownerId: userId,
        planId: plan.id,
      },
      select: { id: true },
    });
    const roles = await ensureWorkspaceDefaultRoles(createdTeam.id, tx);

    await tx.membership.create({
      data: {
        userId,
        teamId: createdTeam.id,
        roleId: roles.owner.id,
        role: "owner",
        status: "ACTIVE",
      },
    });

    await tx.subscription.create({
      data: {
        teamId: createdTeam.id,
        planId: plan.id,
        status: "ACTIVE",
        interval: "MONTHLY",
        amount: 0,
        currency: "USD",
      },
    });

    await tx.settings.create({
      data: {
        teamId: createdTeam.id,
        platformName: "E-com Manager",
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { teamId: createdTeam.id },
    });

    await tx.activityLog.create({
      data: {
        teamId: createdTeam.id,
        userId,
        action: "workspace.created",
        entityType: "Team",
        entityId: createdTeam.id,
        metadata: { plan: FREE_PLAN_CODE },
      },
    });

    return createdTeam;
  });

  return team.id;
}

export async function getAuthenticatedWorkspaceId() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const access = await getWorkspaceAccessForUser(session.user.id);

  if (access?.workspaceId) {
    return access.workspaceId;
  }

  return ensureWorkspaceForUser(session.user.id);
}

export async function recordUsageEvent(params: {
  teamId: string;
  userId?: string | null;
  type: string;
  quantity?: number;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.usageEvent.create({
    data: {
      teamId: params.teamId,
      userId: params.userId ?? null,
      type: params.type,
      quantity: params.quantity ?? 1,
      metadata: params.metadata ?? {},
    },
  });
}

export async function trackActivity(params: {
  teamId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.activityLog.create({
    data: {
      teamId: params.teamId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ?? {},
    },
  });
}

export async function getWorkspacePlan(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      plan: {
        select: {
          code: true,
          name: true,
          limits: true,
          priceMonthly: true,
          priceYearly: true,
          currency: true,
        },
      },
    },
  });

  return team?.plan ?? (await ensureFreePlan());
}

export async function enforceFreePlanLimit(params: {
  teamId: string;
  limit: UsageLimitKey;
  currentValue: number;
}) {
  const plan = await getWorkspacePlan(params.teamId);
  const limits = (plan.limits ?? FREE_PLAN_LIMITS) as Partial<
    Record<UsageLimitKey, number>
  >;
  const max = limits[params.limit] ?? FREE_PLAN_LIMITS[params.limit];

  if (typeof max !== "number") {
    return { allowed: true, max: null };
  }

  return {
    allowed: params.currentValue < max,
    max,
  };
}
