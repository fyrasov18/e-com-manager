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

const useSecureCookies = process.env.NODE_ENV === "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth",
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
        token.role = normalizeRole(user.role);
        token.teamId = user.teamId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = normalizeRole(token.role);
        session.user.teamId = (token.teamId as string | null | undefined) ?? null;
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

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: normalizeRole(user.role),
          teamId: user.teamId ?? null,
        };
      },
    }),
  ],
});
