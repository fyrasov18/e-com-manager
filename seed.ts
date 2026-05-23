// prisma/seed.ts
// Crée le premier compte admin Jody Shop

import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@jodyshop.tn";
  const password = "JodyAdmin2026!";

  // Vérifier si admin existe déjà
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("✓ Admin existe déjà :", email);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email,
      name: "Admin Jody Shop",
      password: hashed,
      role: "admin",
    },
  });

  console.log("✅ Compte admin créé !");
  console.log("   Email    :", email);
  console.log("   Password :", password);
  console.log("");
  console.log("⚠️  Changez le mot de passe après la première connexion !");

  // Créer quelques catégories de base
  const categories = ["Vêtements", "Chaussures", "Accessoires", "Sacs"];
  for (const name of categories) {
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
    await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
  }
  console.log("✅ Catégories de base créées :", categories.join(", "));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
