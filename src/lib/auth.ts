// src/lib/auth.ts
// Configuration NextAuth v5 (Auth.js) - Jody Manager

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validateLoginCredentials } from "@/lib/auth-validation";
import {
  checkLoginAttemptRateLimit,
  isValidLoginRateLimitBypass,
} from "@/lib/login-rate-limit";
import { normalizeRole } from "@/lib/rbac";
import { getWorkspaceAccessForUser } from "@/lib/workspace-access";

const useSecureCookies = process.env.NODE_ENV === "production";
const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "production"
    ? undefined
    : "local-development-only-auth-secret-change-before-production");

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth",
  secret: authSecret,
  session: { strategy: "jwt" },
  useSecureCookies,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }

      const userId =
        typeof token.id === "string"
          ? token.id
          : typeof token.sub === "string"
            ? token.sub
            : null;

      if (userId) {
        const access = await getWorkspaceAccessForUser(userId);

        if (access) {
          token.id = access.userId;
          token.role = access.role;
          token.status = access.status;
          token.teamId = access.teamId;
          token.workspaceId = access.workspaceId;
          token.membershipId = access.membershipId;
          token.workspaceRoleId = access.workspaceRoleId;
          token.workspaceRoleName = access.workspaceRoleName;
          token.isWorkspaceOwner = access.isWorkspaceOwner;
          token.isPlatformAdmin = access.isPlatformAdmin;
          token.permissions = access.permissions;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role ? normalizeRole(token.role) : "admin";
        session.user.status = typeof token.status === "string" ? token.status : "APPROVED";
        session.user.teamId = (token.teamId as string | null | undefined) ?? null;
        session.user.workspaceId =
          (token.workspaceId as string | null | undefined) ??
          (token.teamId as string | null | undefined) ??
          null;
        session.user.membershipId =
          (token.membershipId as string | null | undefined) ?? null;
        session.user.workspaceRoleId =
          (token.workspaceRoleId as string | null | undefined) ?? null;
        session.user.workspaceRoleName =
          (token.workspaceRoleName as string | null | undefined) ?? null;
        session.user.isWorkspaceOwner = Boolean(token.isWorkspaceOwner);
        session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
        session.user.permissions = Array.isArray(token.permissions)
          ? (token.permissions as string[])
          : [];
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, request) {
        const validation = validateLoginCredentials(
          credentials?.email,
          credentials?.password
        );
        const email = validation.success ? validation.data.email : "";
        const rateLimitBypass = (credentials as { rateLimitBypass?: unknown })
          ?.rateLimitBypass;

        if (!isValidLoginRateLimitBypass(rateLimitBypass)) {
          const rateLimit = await checkLoginAttemptRateLimit(request, email);
          if (!rateLimit.allowed) {
            return null;
          }
        }

        if (!validation.success) {
          return null;
        }

        const { password } = validation.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user?.password) {
          return null;
        }

        if ("isActive" in user && !(user as { isActive?: boolean }).isActive) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
          return null;
        }

        if (user.status !== "APPROVED") {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: normalizeRole(user.role),
          status: user.status,
          teamId: user.teamId ?? null,
          workspaceId: user.teamId ?? null,
          isPlatformAdmin: user.isPlatformAdmin,
        };
      },
    }),
  ],
});
