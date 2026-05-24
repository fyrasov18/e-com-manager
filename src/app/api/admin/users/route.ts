import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { normalizeRole } from "@/lib/rbac";

function toAdminUserPayload(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...user,
    role: normalizeRole(user.role).toUpperCase(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function GET() {
  const { response } = await requirePermission("admin:all");

  if (response) {
    return response;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    users: users.map(toAdminUserPayload),
  });
}
