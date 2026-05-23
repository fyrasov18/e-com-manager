import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    const updated = await prisma.deliveryPayment.update({
      where: { id },
      data: { status: "PAYMENT_RECEIVED_VALIDATED_MANUAL" },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Validation manuelle impossible." }, { status: 500 });
  }
}
