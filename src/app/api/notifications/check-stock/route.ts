import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendStockAlert } from "@/lib/email";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function POST() {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const products = await prisma.product.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        lowStockThreshold: true,
      },
    });

    const lowStockProducts = products.filter(
      (p) => p.stockQuantity <= p.lowStockThreshold
    );

    const results = [];
    for (const product of lowStockProducts) {
      const adminEmail = process.env.ADMIN_EMAIL ?? "admin@jodyshop.tn";
      const result = await sendStockAlert({
        to: adminEmail,
        productName: product.name,
        sku: product.sku,
        currentStock: product.stockQuantity,
      });
      results.push({ product: product.name, sent: result.success });
    }

    return NextResponse.json({
      success: true,
      checked: products.length,
      alerted: results.filter((r) => r.sent).length,
      results,
    });
  } catch {
    return NextResponse.json({ error: "Failed to check stock alerts" }, { status: 500 });
  }
}