import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidEmail, normalizeEmail } from "@/lib/auth-validation";
import bcrypt from "bcryptjs";

/**
 * GET /api/setup
 * Retourne si un utilisateur admin existe déjà.
 */
export async function GET() {
  try {
    const count = await prisma.user.count();
    return NextResponse.json({ hasUser: count > 0 });
  } catch {
    return NextResponse.json({ hasUser: false });
  }
}

/**
 * POST /api/setup
 * Crée le premier administrateur si aucun utilisateur n'existe.
 * Bloqué une fois qu'un utilisateur existe.
 */
export async function POST(req: Request) {
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      return NextResponse.json(
        { success: false, error: "Un administrateur existe déjà. Accès refusé." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, password } = body;
    const email = normalizeEmail(body.email);

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email et mot de passe requis." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "Veuillez saisir une adresse email valide." },
        { status: 400 }
      );
    }

    if (typeof password !== "string") {
      return NextResponse.json(
        { success: false, error: "Mot de passe invalide." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : "Administrateur",
        email,
        password: hashed,
        role: "admin",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Compte administrateur créé avec succès.",
      userId: user.id,
    });
  } catch (err) {
    console.error("[Setup] Error:", err);
    return NextResponse.json(
      { success: false, error: "Erreur serveur lors de la création du compte." },
      { status: 500 }
    );
  }
}
