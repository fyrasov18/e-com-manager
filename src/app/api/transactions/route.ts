import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const transactions = await prisma.transaction.findMany({
      where: { teamId },
      orderBy: { date: "desc" },
      take: 50,
    });
    return NextResponse.json(transactions);
  } catch {
    return NextResponse.json({ error: "Impossible de charger les transactions." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = (await req.json()) as {
      amount?: number;
      type?: string;
      category?: string;
      isRecurring?: boolean;
    };

    if (!body.amount || !body.type || !body.category) {
      return NextResponse.json(
        { error: "amount, type et category sont obligatoires." },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: body.amount,
        type: body.type,
        category: body.category,
        isRecurring: body.isRecurring ?? false,
        teamId,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Impossible de créer la transaction." }, { status: 500 });
  }
}
