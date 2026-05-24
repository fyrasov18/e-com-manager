import bcrypt from "bcryptjs";
import { prisma } from "./src/lib/prisma";

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
  const existingTeam = await prisma.team.findFirst({
    where: { name: teamName },
    select: { id: true, name: true },
  });

  if (existingTeam) {
    return existingTeam;
  }

  return prisma.team.create({
    data: { name: teamName },
    select: { id: true, name: true },
  });
}

async function main() {
  const team = await getOrCreateSeedTeam();
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
        teamId: team.id,
        ...(shouldResetPassword
          ? { password: await bcrypt.hash(password, 12) }
          : {}),
      },
    });

    console.log(`Seed admin already existed: ${email}`);
    console.log(`Seed admin team ensured: ${team.name}`);
    if (!shouldResetPassword) {
      console.log("Password left unchanged. Set SEED_ADMIN_RESET_PASSWORD=true to rotate it.");
    }
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      password: await bcrypt.hash(password, 12),
      role: "admin",
      teamId: team.id,
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
