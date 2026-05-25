import bcrypt from "bcryptjs";
import { ensureFreePlan } from "./src/lib/plans";
import { prisma } from "./src/lib/prisma";
import { ensureWorkspaceDefaultRoles } from "./src/lib/workspace-access";

const DEFAULT_ADMIN_EMAIL = "admin@jodyshop.tn";
const DEFAULT_ADMIN_PASSWORD = "JodyAdmin2026!";
const DEFAULT_ADMIN_NAME = "Admin Jody Shop";
const DEFAULT_TEAM_NAME = "Equipe principale";

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function getOrCreateSeedTeam() {
  const teamName = getEnv("SEED_TEAM_NAME") ?? DEFAULT_TEAM_NAME;
  const plan = await ensureFreePlan();
  const existingTeam = await prisma.team.findFirst({
    where: { name: teamName },
    select: { id: true, name: true },
  });

  if (existingTeam) {
    await prisma.team.update({
      where: { id: existingTeam.id },
      data: { planId: plan.id },
    });
    return existingTeam;
  }

  return prisma.team.create({
    data: { name: teamName, planId: plan.id },
    select: { id: true, name: true },
  });
}

async function main() {
  const team = await getOrCreateSeedTeam();
  const roles = await ensureWorkspaceDefaultRoles(team.id);
  const email = (getEnv("SEED_ADMIN_EMAIL") ?? getEnv("ADMIN_EMAIL") ?? DEFAULT_ADMIN_EMAIL).toLowerCase();
  const password = getEnv("SEED_ADMIN_PASSWORD") ?? DEFAULT_ADMIN_PASSWORD;
  const name = getEnv("SEED_ADMIN_NAME") ?? DEFAULT_ADMIN_NAME;
  const shouldResetPassword = getEnv("SEED_ADMIN_RESET_PASSWORD") === "true";

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        role: "admin",
        status: "APPROVED",
        isPlatformAdmin: true,
        teamId: team.id,
        ...(shouldResetPassword
          ? { password: await bcrypt.hash(password, 12) }
          : {}),
      },
    });

    await prisma.membership.upsert({
      where: { userId_teamId: { userId: existingUser.id, teamId: team.id } },
      update: { roleId: roles.owner.id, role: "owner", status: "ACTIVE" },
      create: {
        userId: existingUser.id,
        teamId: team.id,
        roleId: roles.owner.id,
        role: "owner",
        status: "ACTIVE",
      },
    });

    const plan = await ensureFreePlan();
    const existingSubscription = await prisma.subscription.findFirst({
      where: { teamId: team.id, status: "ACTIVE" },
      select: { id: true },
    });

    if (!existingSubscription) {
      await prisma.subscription.create({
        data: {
          teamId: team.id,
          planId: plan.id,
          status: "ACTIVE",
          interval: "MONTHLY",
          amount: 0,
          currency: "USD",
        },
      });
    }

    console.log(`Seed admin already existed: ${email}`);
    console.log(`Seed admin team ensured: ${team.name}`);
    if (!shouldResetPassword) {
      console.log("Password left unchanged. Set SEED_ADMIN_RESET_PASSWORD=true to rotate it.");
    }
    return;
  }

  const createdUser = await prisma.user.create({
    data: {
      email,
      name,
      password: await bcrypt.hash(password, 12),
      role: "admin",
      status: "APPROVED",
      isPlatformAdmin: true,
      teamId: team.id,
    },
    select: { id: true },
  });

  await prisma.membership.create({
    data: {
      userId: createdUser.id,
      teamId: team.id,
      roleId: roles.owner.id,
      role: "owner",
      status: "ACTIVE",
    },
  });

  const plan = await ensureFreePlan();
  await prisma.subscription.create({
    data: {
      teamId: team.id,
      planId: plan.id,
      status: "ACTIVE",
      interval: "MONTHLY",
      amount: 0,
      currency: "USD",
    },
  });

  console.log(`Seed admin created: ${email}`);
  console.log(`Seed admin team ensured: ${team.name}`);
  if (!getEnv("SEED_ADMIN_PASSWORD")) {
    console.log("Default seed password was used. Change it after the first login.");
  }
}

main()
  .catch((error) => {
    console.error("[seed] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
