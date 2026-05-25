import { prisma } from "@/lib/prisma";
import { getAuthenticatedWorkspaceId } from "@/lib/saas";

export async function getOrCreateDefaultTeamId() {
  const workspaceId = await getAuthenticatedWorkspaceId();

  if (workspaceId) {
    return workspaceId;
  }

  const existingTeam = await prisma.team.findFirst({
    select: { id: true },
    orderBy: { name: "asc" },
  });

  if (existingTeam) {
    return existingTeam.id;
  }

  const createdTeam = await prisma.team.create({
    data: { name: "Equipe principale" },
    select: { id: true },
  });

  return createdTeam.id;
}
