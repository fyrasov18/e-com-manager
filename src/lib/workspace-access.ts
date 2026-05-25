import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getPermissionsForRole,
  normalizePermissionList,
  permissionsHavePermission,
  type Permission,
  type Role,
} from "@/lib/rbac";

export const OWNER_ROLE_NAME = "Owner";
export const MANAGER_ROLE_NAME = "Manager";
export const MEMBER_ROLE_NAME = "Membre";

const OWNER_PERMISSIONS: Permission[] = ["admin:all", "profile:read"];
const MANAGER_PERMISSIONS = [...getPermissionsForRole("manager")];
const MEMBER_PERMISSIONS = [...getPermissionsForRole("user")];

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export type WorkspaceAccess = {
  userId: string;
  email: string | null;
  name: string | null;
  status: string;
  teamId: string | null;
  workspaceId: string | null;
  membershipId: string | null;
  workspaceRoleId: string | null;
  workspaceRoleName: string | null;
  isWorkspaceOwner: boolean;
  isPlatformAdmin: boolean;
  role: Role;
  permissions: Permission[];
};

function inferRoleFromPermissions(permissions: readonly Permission[]): Role {
  if (permissionsHavePermission(permissions, "admin:all")) {
    return "admin";
  }

  if (
    permissionsHavePermission(permissions, "orders:write") ||
    permissionsHavePermission(permissions, "products:write") ||
    permissionsHavePermission(permissions, "delivery:write")
  ) {
    return "manager";
  }

  return "user";
}

function legacyPermissions(roleValue: unknown) {
  const role = typeof roleValue === "string" ? roleValue.trim().toLowerCase() : "";

  if (role === "owner" || role === "admin") {
    return OWNER_PERMISSIONS;
  }

  if (role === "manager") {
    return MANAGER_PERMISSIONS;
  }

  return MEMBER_PERMISSIONS;
}

export function toMembershipRoleValue(params: {
  roleName?: string | null;
  isOwner?: boolean | null;
  permissions?: readonly Permission[];
}) {
  if (params.isOwner || permissionsHavePermission(params.permissions, "admin:all")) {
    return "owner";
  }

  const name = params.roleName?.trim().toLowerCase();

  if (name === "manager") {
    return "manager";
  }

  return "user";
}

export async function ensureWorkspaceDefaultRoles(
  teamId: string,
  client: PrismaLike = prisma
) {
  const owner = await client.workspaceRole.upsert({
    where: { teamId_name: { teamId, name: OWNER_ROLE_NAME } },
    update: {
      description: "Full protected access to the organisation.",
      permissions: OWNER_PERMISSIONS,
      isSystem: true,
      isOwner: true,
    },
    create: {
      teamId,
      name: OWNER_ROLE_NAME,
      description: "Full protected access to the organisation.",
      permissions: OWNER_PERMISSIONS,
      isSystem: true,
      isOwner: true,
    },
  });

  const manager = await client.workspaceRole.upsert({
    where: { teamId_name: { teamId, name: MANAGER_ROLE_NAME } },
    update: {
      description: "Operational access for orders, products, finance and delivery.",
      permissions: MANAGER_PERMISSIONS,
      isSystem: false,
      isOwner: false,
    },
    create: {
      teamId,
      name: MANAGER_ROLE_NAME,
      description: "Operational access for orders, products, finance and delivery.",
      permissions: MANAGER_PERMISSIONS,
      isSystem: false,
      isOwner: false,
    },
  });

  const member = await client.workspaceRole.upsert({
    where: { teamId_name: { teamId, name: MEMBER_ROLE_NAME } },
    update: {
      description: "Basic access for finance and expenses visibility.",
      permissions: MEMBER_PERMISSIONS,
      isSystem: false,
      isOwner: false,
    },
    create: {
      teamId,
      name: MEMBER_ROLE_NAME,
      description: "Basic access for finance and expenses visibility.",
      permissions: MEMBER_PERMISSIONS,
      isSystem: false,
      isOwner: false,
    },
  });

  return { owner, manager, member };
}

export async function getWorkspaceAccessForUser(
  userId: string
): Promise<WorkspaceAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      teamId: true,
      isPlatformAdmin: true,
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          teamId: true,
          role: true,
          roleId: true,
          workspaceRole: {
            select: {
              id: true,
              name: true,
              permissions: true,
              isOwner: true,
            },
          },
          team: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== "APPROVED") {
    return null;
  }

  const memberships = user.memberships.filter(
    (membership) => membership.team.status === "ACTIVE"
  );
  const membership =
    memberships.find((item) => item.teamId === user.teamId) ?? memberships[0] ?? null;

  if (membership && membership.teamId !== user.teamId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { teamId: membership.teamId },
    });
  }

  let workspaceRole = membership?.workspaceRole ?? null;

  if (membership && !workspaceRole) {
    const roles = await ensureWorkspaceDefaultRoles(membership.teamId);
    workspaceRole =
      membership.role === "owner" || membership.role === "admin"
        ? roles.owner
        : membership.role === "manager"
          ? roles.manager
          : roles.member;

    await prisma.membership.update({
      where: { id: membership.id },
      data: { roleId: workspaceRole.id },
    });
  }

  const permissions = user.isPlatformAdmin
    ? OWNER_PERMISSIONS
    : workspaceRole
      ? normalizePermissionList(workspaceRole.permissions, {
          allowAdminAll: workspaceRole.isOwner,
        })
      : legacyPermissions(membership?.role ?? user.role);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    teamId: membership?.teamId ?? null,
    workspaceId: membership?.teamId ?? null,
    membershipId: membership?.id ?? null,
    workspaceRoleId: workspaceRole?.id ?? null,
    workspaceRoleName: workspaceRole?.name ?? null,
    isWorkspaceOwner: Boolean(workspaceRole?.isOwner),
    isPlatformAdmin: user.isPlatformAdmin,
    role: inferRoleFromPermissions(permissions),
    permissions,
  };
}

export async function switchActiveWorkspace(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      teamId: workspaceId,
      status: "ACTIVE",
      team: { status: "ACTIVE" },
    },
    select: { teamId: true },
  });

  if (!membership) {
    return false;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { teamId: membership.teamId },
  });

  return true;
}
