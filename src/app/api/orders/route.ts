import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { syncOrderStock } from "@/lib/stock-sync";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id")?.trim() ?? "";
    const providerFilter = searchParams.get("provider") ?? "";
    const statusFilter = searchParams.get("status") ?? "";
    const search = searchParams.get("search") ?? "";

    const teamId = await getOrCreateDefaultTeamId();

    // Build where clause — no artificial source filter, show ALL delivery orders
    const where: any = { teamId };
    if (orderId) where.id = orderId;
    if (providerFilter) where.shippingProvider = providerFilter;
    if (statusFilter) where.status = statusFilter;
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { trackingNumber: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
        { shippingCity: { contains: search, mode: "insensitive" } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { date: "desc" },
      take: 500,
      select: {
        id: true, status: true, revenue: true, date: true,
        customerName: true, customerPhone: true,
        shippingAddress: true, shippingCity: true, shippingZip: true,
        trackingNumber: true, reference: true,
        shippingProvider: true, apiStatus: true,
        paymentNumber: true, deliveryFee: true, returnFee: true,
        deliveredAt: true, pickedUpAt: true, operationDate: true,
        validatedRevenue: true,
        deliveryCostApplied: true,
        returnCostApplied: true,
        withholdingTaxApplied: true,
        netProfit: true,
      },
    });

    console.log(`[orders GET] teamId=${teamId} provider=${providerFilter||"all"} status=${statusFilter||"all"} search="${search}" → ${orders.length} orders`);

    return NextResponse.json({ orders, total: orders.length });
  } catch (err) {
    console.error("[orders GET] Error:", err);
    return NextResponse.json({ orders: [], total: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerName, customerPhone, shippingAddress, shippingCity, shippingZip, revenue, productId, quantity } = body;

    const teamId = await getOrCreateDefaultTeamId();

    const order = await prisma.order.create({
      data: {
        teamId,
        status: "PENDING",
        revenue: revenue ?? 0,
        cost: 0,
        profit: 0,
        customerName,
        customerPhone,
        shippingAddress,
        shippingCity,
        shippingZip,
        productId: productId || null,
        quantity: quantity || 1,
      },
    });

    return NextResponse.json({ success: true, order });
  } catch (err) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id");

    if (!orderId) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    const body = await req.json();
    const { customerName, customerPhone, shippingAddress, shippingCity, shippingZip, revenue, status, productId, quantity } = body;

    const teamId = await getOrCreateDefaultTeamId();

    const order = await prisma.order.findFirst({
      where: { id: orderId, teamId },
    });

    if (!order) {
      return NextResponse.json({ error: "Commande non trouvée" }, { status: 404 });
    }

    const oldStatus = order.status;
    const newStatus = status || oldStatus;
    const parsedRevenue =
      revenue !== undefined && revenue !== null && revenue !== ""
        ? Number.parseFloat(String(revenue))
        : undefined;

    if (parsedRevenue !== undefined && !Number.isFinite(parsedRevenue)) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        ...(customerName !== undefined && { customerName }),
        ...(customerPhone !== undefined && { customerPhone }),
        ...(shippingAddress !== undefined && { shippingAddress }),
        ...(shippingCity !== undefined && { shippingCity }),
        ...(shippingZip !== undefined && { shippingZip }),
        ...(parsedRevenue !== undefined && {
          revenue: parsedRevenue,
          profit: parsedRevenue - order.cost,
        }),
        productId: productId !== undefined ? productId : order.productId,
        quantity: quantity !== undefined ? quantity || order.quantity || 1 : order.quantity || 1,
      },
    });

    if (newStatus !== oldStatus && order.productId) {
      const stockResult = await syncOrderStock(orderId, newStatus, oldStatus);
      console.log("[Order] Stock sync result:", stockResult);
    }

    return NextResponse.json({ success: true, order: updated });
  } catch (err) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    const teamId = await getOrCreateDefaultTeamId();

    const ids = idParam.split(",").filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "IDs invalides" }, { status: 400 });
    }

    // On vérifie que toutes les commandes appartiennent à l'équipe
    const count = await prisma.order.count({
      where: {
        id: { in: ids },
        teamId
      }
    });

    if (count === 0) {
      return NextResponse.json({ error: "Commandes non trouvées" }, { status: 404 });
    }

    // Suppression en bloc
    await prisma.order.deleteMany({
      where: {
        id: { in: ids },
        teamId
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `${count} commande(s) supprimée(s)` 
    });
  } catch (err) {
    console.error("[orders DELETE] Error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
