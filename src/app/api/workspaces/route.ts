import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      status: true,
      teamId: true,
      memberships: {
        where: {
          status: "ACTIVE",
          team: { status: "ACTIVE" },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          teamId: true,
          workspaceRole: {
            select: {
              name: true,
              isOwner: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== "APPROVED") {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  return Response.json({
    activeWorkspaceId: user.teamId,
    workspaces: user.memberships.map((membership) => ({
      membershipId: membership.id,
      id: membership.team.id,
      name: membership.team.name,
      slug: membership.team.slug,
      roleName: membership.workspaceRole?.name ?? null,
      isOwner: Boolean(membership.workspaceRole?.isOwner),
      isActive: membership.teamId === user.teamId,
    })),
  });
}
