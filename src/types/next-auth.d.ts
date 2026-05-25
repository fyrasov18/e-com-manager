import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      status?: string;
      teamId?: string | null;
      workspaceId?: string | null;
      isPlatformAdmin?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: string;
    status?: string;
    teamId?: string | null;
    workspaceId?: string | null;
    isPlatformAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    status?: string;
    teamId?: string | null;
    workspaceId?: string | null;
    isPlatformAdmin?: boolean;
  }
}
