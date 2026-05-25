import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  normalizeRole,
  permissionsHavePermission,
  type Permission,
} from "@/lib/rbac";
import { getWorkspaceAccessForUser } from "@/lib/workspace-access";

export type CurrentUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: ReturnType<typeof normalizeRole>;
  status?: string;
  teamId?: string | null;
  workspaceId?: string | null;
  membershipId?: string | null;
  workspaceRoleId?: string | null;
  workspaceRoleName?: string | null;
  isWorkspaceOwner?: boolean;
  isPlatformAdmin?: boolean;
  permissions: Permission[];
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const access = await getWorkspaceAccessForUser(session.user.id);

  if (!access) {
    return null;
  }

  return {
    id: access.userId,
    email: access.email,
    name: access.name,
    role: normalizeRole(access.role),
    status: access.status,
    teamId: access.teamId,
    workspaceId: access.workspaceId,
    membershipId: access.membershipId,
    workspaceRoleId: access.workspaceRoleId,
    workspaceRoleName: access.workspaceRoleName,
    isWorkspaceOwner: access.isWorkspaceOwner,
    isPlatformAdmin: access.isPlatformAdmin,
    permissions: access.permissions,
  };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Access denied." }, { status: 403 });
}

export async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, response: unauthorizedResponse() };
  }

  if (!permissionsHavePermission(user.permissions, permission)) {
    return { user, response: forbiddenResponse() };
  }

  return { user, response: null };
}

export function getSafeUserPayload(user: CurrentUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    teamId: user.teamId,
    workspaceId: user.teamId,
    membershipId: user.membershipId,
    workspaceRoleId: user.workspaceRoleId,
    workspaceRoleName: user.workspaceRoleName,
    isWorkspaceOwner: user.isWorkspaceOwner,
    isPlatformAdmin: user.isPlatformAdmin,
    permissions: user.permissions,
  };
}
