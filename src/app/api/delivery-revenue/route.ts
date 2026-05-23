import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getDeliveryRevenueStats, getActiveProviders } from "@/lib/delivery-revenue";
import { prisma } from "@/lib/prisma";
import { calculateWithholdingTax, getFinanceSettings } from "@/lib/finance";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const url = new URL(req.url);

    const provider = url.searchParams.get("provider") ?? undefined;
    const paymentStatus = url.searchParams.get("paymentStatus") ?? undefined;
    const search = url.searchParams.get("search") ?? "";
    const statsOnly = url.searchParams.get("statsOnly") === "true";

    const providers = await getActiveProviders(teamId);
    const stats = await getDeliveryRevenueStats(teamId);

    if (statsOnly) {
      return NextResponse.json({ configured: stats.configured, providers, revenue: stats });
    }

    // New logic: Fetch Orders as the primary source for Finance
    const where: any = { 
      teamId,
      trackingNumber: { not: null } // Finance is about tracked orders
    };
    
    if (provider) where.shippingProvider = provider;
    
    if (search) {
      where.OR = [
        { trackingNumber: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
      ];
    }

    // We still use paymentStatus filter if provided
    if (paymentStatus) {
      where.deliveryRevenues = {
        some: { paymentStatus }
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        deliveryRevenues: {
          orderBy: { importedAt: "desc" },
          take: 1
        }
      },
      orderBy: { date: "desc" },
      take: 500,
    });

    // Map orders to a format compatible with the Finance UI
    const revenues = orders.map(order => {
      const rev = order.deliveryRevenues[0];
      const isValidated = Boolean(rev?.isValidated || order.financeStatus === "VALIDATED");
      const paymentStatus = rev?.paymentStatus || (isValidated ? "VALIDATED" : "PENDING");
      return {
        id: order.id, // We use order.id as the primary ID now
        orderId: order.id,
        orderStatus: order.status,
        revenueId: rev?.id || null,
        provider: order.shippingProvider || "AUTRE",
        trackingNumber: order.trackingNumber,
        reference: order.reference || "",
        customerName: order.customerName,
        amount: order.revenue,
        deliveryFee: order.deliveryCostApplied || rev?.deliveryFee || 0,
        returnFee: order.returnCostApplied || rev?.returnFee || 0,
        withholdingTaxApplied: order.withholdingTaxApplied || rev?.withholdingTaxApplied || 0,
        apiStatus: order.apiStatus || rev?.apiStatus || null,
        paymentNumber: order.paymentNumber || rev?.paymentNumber || null,
        paymentStatus,
        isValidated,
        importedAt: rev?.importedAt || order.date,
        validatedAt: rev?.validatedAt || null,
        operationDate: order.operationDate || null,
        netProfit: order.netProfit,
      };
    });

    return NextResponse.json({ configured: stats.configured, providers, revenue: stats, revenues });
  } catch (err) {
    console.error("[DeliveryRevenue] GET error:", err);
    return NextResponse.json({ success: false, revenues: [] }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const url = new URL(req.url);
    const id = url.searchParams.get("id"); // This is now orderId

    if (!id) {
      return NextResponse.json({ success: false, message: "id requis" }, { status: 400 });
    }

    const body = await req.json();
    const { amount, paymentStatus, reference, trackingNumber, customerName } = body;

    const order = await prisma.order.findFirst({ where: { id, teamId } });
    if (!order) {
      return NextResponse.json({ success: false, message: "Commande non trouvée" }, { status: 404 });
    }

    const parsedAmount = amount !== undefined ? parseFloat(amount) : undefined;
    const financeSettings =
      parsedAmount !== undefined ? await getFinanceSettings(teamId, order.shippingProvider) : null;
    const withholdingTaxApplied =
      parsedAmount !== undefined && financeSettings
        ? calculateWithholdingTax(parsedAmount, financeSettings.withholdingTaxPercent)
        : undefined;

    // Update order
    await prisma.order.update({
      where: { id },
      data: {
        ...(parsedAmount !== undefined && {
          revenue: parsedAmount,
          withholdingTaxApplied,
          netProfit:
            parsedAmount -
            (order.deliveryCostApplied || 0) -
            (order.returnCostApplied || 0) -
            (withholdingTaxApplied || 0) -
            (order.cost || 0),
        }),
        ...(reference && { reference }),
        ...(trackingNumber !== undefined && { trackingNumber }),
        ...(customerName !== undefined && { customerName }),
      },
    });

    // If there is a linked revenue, update it too
    const rev = await prisma.deliveryRevenue.findFirst({ where: { orderId: id, teamId } });
    if (rev) {
      await prisma.deliveryRevenue.update({
        where: { id: rev.id },
        data: {
          ...(parsedAmount !== undefined && {
            amount: parsedAmount,
            withholdingTaxApplied,
            netAmount:
              parsedAmount -
              (rev.deliveryFee || 0) -
              (rev.returnFee || 0) -
              (withholdingTaxApplied || 0),
          }),
          ...(paymentStatus && { paymentStatus }),
          ...(reference && { reference }),
          ...(trackingNumber !== undefined && { trackingNumber }),
          ...(customerName !== undefined && { customerName }),
        },
      });
    }

    return NextResponse.json({ success: true, message: "Mis à jour avec succès" });
  } catch {
    return NextResponse.json({ success: false, message: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { ids } = body; // Array of order IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, message: "IDs invalides" }, { status: 400 });
    }

    // Reset financial data for orders and delete linked revenues
    await prisma.$transaction([
      // Delete linked revenues
      prisma.deliveryRevenue.deleteMany({
        where: { 
          orderId: { in: ids },
          teamId 
        }
      }),
      // Reset financial fields on orders
      prisma.order.updateMany({
        where: { 
          id: { in: ids },
          teamId 
        },
        data: {
          deliveryCostApplied: 0,
          returnCostApplied: 0,
          withholdingTaxApplied: 0,
          validatedRevenue: 0,
          netProfit: 0,
          financeStatus: "EN_ATTENTE",
          paymentNumber: null
        }
      })
    ]);

    return NextResponse.json({ 
      success: true, 
      message: `${ids.length} paiement(s) réinitialisé(s) avec succès`,
      deletedCount: ids.length
    });
  } catch (err) {
    console.error("[Finance DELETE] error:", err);
    return NextResponse.json({ success: false, message: "Erreur lors de la suppression" }, { status: 500 });
  }
}
