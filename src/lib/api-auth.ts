import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPermissionsForRole,
  normalizeRole,
  roleHasPermission,
  type Permission,
} from "@/lib/rbac";

export type CurrentUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: ReturnType<typeof normalizeRole>;
  status?: string;
  teamId?: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      teamId: true,
    },
  });

  if (!user || user.status !== "APPROVED") {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role),
    status: user.status,
    teamId: user.teamId ?? null,
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

  if (!roleHasPermission(user.role, permission)) {
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
    permissions: getPermissionsForRole(user.role),
  };
}
