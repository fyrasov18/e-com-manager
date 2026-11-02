// src/app/api/cosmos/orders/route.ts — Gestion des commandes Cosmos (GET list / POST create / DELETE cancel).
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { listCosmosOrders, createCosmosOrder, deleteCosmosOrder } from "@/lib/cosmos-api";
import { mapCosmosStatus, cosmosStatusLabel, type CosmosCity } from "@/lib/cosmos-domain";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 50;
    const barcode = searchParams.get("barcode") || undefined;
    const printedParam = searchParams.get("printed");
    const printed = printedParam !== null ? printedParam === "true" : undefined;

    const res = await listCosmosOrders(teamId, { page, limit, barcode, printed });
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
    }
    return NextResponse.json(res.data);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();

    const {
      name,
      phone,
      phone2,
      address,
      city,
      totalAmount,
      quantity,
      content,
      packageCount,
      note,
      options,
      source,
      externalBarcode,
      exchange,
    } = body;

    if (!name || !phone || !address || !city || totalAmount === undefined || !content) {
      return NextResponse.json(
        { success: false, message: "Champs requis manquants: name, phone, address, city, totalAmount, content." },
        { status: 400 }
      );
    }

    const payload = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      phone2: phone2 ? String(phone2).trim() : undefined,
      address: String(address).trim(),
      city: String(city).trim() as CosmosCity,
      totalAmount: Number(totalAmount) || 0,
      quantity: Number(quantity) || 1,
      packageCount: packageCount ? Number(packageCount) : 1,
      content: String(content).trim(),
      note: note ? String(note).trim() : undefined,
      options: options || { allowToOpen: true, isFragile: false },
      source: source || "jody-shop",
      externalBarcode: externalBarcode ? String(externalBarcode).trim() : undefined,
      exchange: Boolean(exchange),
    };

    const res = await createCosmosOrder(teamId, payload);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
    }

    const co = res.data.data;
    const cosmosId = String(co.id);
    const barcode = String(co.barcode || co.id);
    const mappedStatus = mapCosmosStatus(co.status);
    const statusLabel = cosmosStatusLabel(co.status);

    const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
    const settings = await getFinanceSettings(teamId, "COSMOS");
    const finance = calculateOrderFinance({
      totalAmount: Number(co.totalAmount) || payload.totalAmount,
      status: mappedStatus,
      settings,
    });

    // Enregistrer dans Order
    const order = await prisma.order.create({
      data: {
        teamId,
        status: mappedStatus,
        revenue: Number(co.totalAmount) || payload.totalAmount,
        cost: 0,
        profit: 0,
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        shippingProvider: "COSMOS",
        trackingNumber: barcode,
        reference: co.externalBarcode || co.integrationBarcode || payload.externalBarcode || undefined,
        customerName: co.name || payload.name,
        customerPhone: co.phone || payload.phone,
        shippingAddress: co.address || payload.address,
        shippingCity: payload.city,
        apiStatus: statusLabel,
        date: new Date(),
        importedAt: new Date(),
      },
    });

    // Enregistrer dans CosmosOrder
    await (prisma as any).cosmosOrder.upsert({
      where: { teamId_cosmosId: { teamId, cosmosId } },
      create: {
        teamId,
        orderId: order.id,
        cosmosId,
        barcode,
        name: co.name || payload.name,
        phone: co.phone || payload.phone,
        address: co.address || payload.address,
        city: payload.city,
        status: co.status,
        paymentStatus: co.paymentStatus,
        totalAmount: Number(co.totalAmount) || payload.totalAmount,
        quantity: payload.quantity,
        content: payload.content,
        printed: false,
        externalBarcode: co.externalBarcode,
        integrationBarcode: co.integrationBarcode,
        labelUrl: co.labelUrl,
        labelPdfUrl: co.labelPdfUrl,
        rawDetail: co,
        lastSyncAt: new Date(),
      },
      update: {
        orderId: order.id,
        barcode,
        status: co.status,
        paymentStatus: co.paymentStatus,
        labelUrl: co.labelUrl,
        labelPdfUrl: co.labelPdfUrl,
        rawDetail: co,
        lastSyncAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Commande créée avec succès chez Cosmos Delivery",
      data: co,
      orderId: order.id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get("barcode");
    if (!barcode) {
      return NextResponse.json({ success: false, message: "Code barre manquant" }, { status: 400 });
    }

    const res = await deleteCosmosOrder(teamId, barcode);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
    }

    // Mettre à jour l'ordre local si nécessaire
    await prisma.order.updateMany({
      where: { teamId, trackingNumber: barcode },
      data: { status: "CANCELLED", apiStatus: "Annulée" },
    });

    await (prisma as any).cosmosOrder.updateMany({
      where: { teamId, barcode },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ success: true, message: "Commande supprimée chez Cosmos" });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}
