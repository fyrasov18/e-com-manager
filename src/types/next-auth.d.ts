import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      status?: string;
      teamId?: string | null;
      workspaceId?: string | null;
      membershipId?: string | null;
      workspaceRoleId?: string | null;
      workspaceRoleName?: string | null;
      isWorkspaceOwner?: boolean;
      isPlatformAdmin?: boolean;
      permissions?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: string;
    status?: string;
    teamId?: string | null;
    workspaceId?: string | null;
    membershipId?: string | null;
    workspaceRoleId?: string | null;
    workspaceRoleName?: string | null;
    isWorkspaceOwner?: boolean;
    isPlatformAdmin?: boolean;
    permissions?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    status?: string;
    teamId?: string | null;
    workspaceId?: string | null;
    membershipId?: string | null;
    workspaceRoleId?: string | null;
    workspaceRoleName?: string | null;
    isWorkspaceOwner?: boolean;
    isPlatformAdmin?: boolean;
    permissions?: string[];
  }
}
