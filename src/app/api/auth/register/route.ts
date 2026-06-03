import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  validateRegisterRequest,
} from "@/lib/auth-validation";
import { isSameOriginUnsafeRequest } from "@/lib/http-security";
import { ensureWorkspaceForUser } from "@/lib/saas";

const EMAIL_EXISTS_MESSAGE = "Un compte avec cet email existe deja.";
const SUCCESS_MESSAGE =
  "Votre compte Free a ete cree. Vous pouvez maintenant vous connecter.";

export async function POST(req: Request) {
  if (!isSameOriginUnsafeRequest(req)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let payload: {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
    phone?: unknown;
    role?: unknown;
  };

  try {
    payload = await req.json();
  } catch {
    return Response.json(
      { error: "Donnees d'inscription invalides." },
      { status: 400 }
    );
  }

  const validation = validateRegisterRequest(payload);

  if (!validation.success) {
    return Response.json({ errors: validation.errors }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: validation.data.email },
    select: { id: true },
  });

  if (existingUser) {
    return Response.json(
      { errors: { email: EMAIL_EXISTS_MESSAGE }, error: EMAIL_EXISTS_MESSAGE },
      { status: 409 }
    );
  }

  let createdUserId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: {
        name: validation.data.name,
        email: validation.data.email,
        password: await bcrypt.hash(validation.data.password, 12),
        phone: validation.data.phone,
        role: "admin",
        status: "APPROVED",
      },
      select: { id: true, name: true },
    });
    createdUserId = user.id;

    await ensureWorkspaceForUser(user.id, `${user.name}'s workspace`);
  } catch (error) {
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => null);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("email")
    ) {
      return Response.json(
        { errors: { email: EMAIL_EXISTS_MESSAGE }, error: EMAIL_EXISTS_MESSAGE },
        { status: 409 }
      );
    }

    console.error("[Register] Failed:", error);
    return Response.json(
      { error: "Erreur serveur lors de la creation du compte." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, message: SUCCESS_MESSAGE }, { status: 201 });
}
