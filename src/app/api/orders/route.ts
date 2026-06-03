import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { requirePermission, type CurrentUser } from "@/lib/api-auth";
import { isDeliveredStatus, isReturnStatus } from "@/lib/delivery-status";
import { syncOrderStock } from "@/lib/stock-sync";

const MANUAL_DELIVERY_TYPE = "MANUAL_SENDER";
const MANUAL_PROVIDER = "MANUAL_SENDER";

const manualStatuses = [
  "PENDING",
  "CONFIRMED",
  "DELIVERED_BY_SENDER",
  "CANCELLED",
  "RETURNED",
] as const;

const paymentStatuses = ["PENDING", "RECEIVED", "VALIDATED"] as const;

const manualOrderSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required.").max(160),
  customerPhone: z.string().trim().min(1, "Customer phone is required.").max(60),
  customerAddress: z.string().trim().min(1, "Customer address is required.").max(500),
  productName: z.string().trim().min(1, "Product name is required.").max(180),
  quantity: z.coerce.number().int().min(1).max(10_000),
  orderAmount: z.coerce.number().min(0),
  deliveryFee: z.coerce.number().min(0).default(0),
  paymentStatus: z.enum(paymentStatuses).default("PENDING"),
  orderStatus: z.enum(manualStatuses).default("PENDING"),
  notes: z.string().trim().max(1000).optional().default(""),
});

const patchOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(160).optional(),
  customerPhone: z.string().trim().min(1).max(60).optional(),
  customerAddress: z.string().trim().min(1).max(500).optional(),
  productName: z.string().trim().min(1).max(180).optional(),
  quantity: z.coerce.number().int().min(1).max(10_000).optional(),
  orderAmount: z.coerce.number().min(0).optional(),
  deliveryFee: z.coerce.number().min(0).optional(),
  paymentStatus: z.enum(paymentStatuses).optional(),
  orderStatus: z.enum(manualStatuses).optional(),
  status: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
  action: z.enum(["VALIDATE_PAYMENT"]).optional(),
});

type ManualOrderInput = z.infer<typeof manualOrderSchema>;

async function getTeamId(user: CurrentUser) {
  return user.teamId ?? getOrCreateDefaultTeamId();
}

function validationError(error: z.ZodError) {
  return NextResponse.json(
    {
      success: false,
      error: "Validation failed.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 }
  );
}

function calculateManualFinance(input: {
  amount: number;
  deliveryFee: number;
  status: string;
  paymentStatus: string;
}) {
  const amount = Math.max(0, input.amount);
  const deliveryFee = Math.max(0, input.deliveryFee);
  const delivered = isDeliveredStatus(input.status);
  const returned = isReturnStatus(input.status);
  const cancelled = input.status === "CANCELLED";
  const paymentValidated = input.paymentStatus === "VALIDATED";

  if (delivered) {
    return {
      validatedRevenue: paymentValidated ? amount : 0,
      deliveryCostApplied: deliveryFee,
      returnCostApplied: 0,
      withholdingTaxApplied: 0,
      netProfit: amount - deliveryFee,
      profit: amount - deliveryFee,
      deliveryFee,
      returnFee: 0,
    };
  }

  if (returned) {
    return {
      validatedRevenue: 0,
      deliveryCostApplied: 0,
      returnCostApplied: deliveryFee,
      withholdingTaxApplied: 0,
      netProfit: -deliveryFee,
      profit: -deliveryFee,
      deliveryFee: 0,
      returnFee: deliveryFee,
    };
  }

  return {
    validatedRevenue: 0,
    deliveryCostApplied: 0,
    returnCostApplied: 0,
    withholdingTaxApplied: 0,
    netProfit: cancelled ? 0 : 0,
    profit: cancelled ? 0 : 0,
    deliveryFee: 0,
    returnFee: 0,
  };
}

async function upsertManualDeliveryRevenue(input: {
  teamId: string;
  orderId: string;
  customerName: string | null;
  amount: number;
  deliveryFee: number;
  returnFee: number;
  netAmount: number;
  status: string;
  paymentStatus: string;
  notes: string | null;
}) {
  const isValidated = input.paymentStatus === "VALIDATED";
  const existing = await prisma.deliveryRevenue.findFirst({
    where: {
      teamId: input.teamId,
      orderId: input.orderId,
      provider: MANUAL_PROVIDER,
    },
    select: { id: true },
  });

  const data = {
    provider: MANUAL_PROVIDER,
    source: "MANUAL",
    orderId: input.orderId,
    customerName: input.customerName,
    amount: input.amount,
    deliveryFee: input.deliveryFee,
    returnFee: input.returnFee,
    withholdingTaxApplied: 0,
    netAmount: input.netAmount,
    apiStatus: input.status,
    paymentStatus: input.paymentStatus,
    isValidated,
    validatedAt: isValidated ? new Date() : null,
    rawData: {
      deliveryType: MANUAL_DELIVERY_TYPE,
      notes: input.notes,
    },
    teamId: input.teamId,
  };

  if (existing) {
    await prisma.deliveryRevenue.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.deliveryRevenue.create({ data });
}

function mapManualPayload(input: ManualOrderInput, teamId: string, userId: string) {
  const finance = calculateManualFinance({
    amount: input.orderAmount,
    deliveryFee: input.deliveryFee,
    status: input.orderStatus,
    paymentStatus: input.paymentStatus,
  });

  const operationDate = isDeliveredStatus(input.orderStatus) || isReturnStatus(input.orderStatus)
    ? new Date()
    : null;

  return {
    data: {
      teamId,
      workspaceId: teamId,
      createdByUserId: userId,
      isManualOrder: true,
      deliveryType: MANUAL_DELIVERY_TYPE,
      shippingProvider: MANUAL_PROVIDER,
      status: input.orderStatus,
      paymentStatus: input.paymentStatus,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      shippingAddress: input.customerAddress,
      productName: input.productName,
      quantity: input.quantity,
      revenue: input.orderAmount,
      cost: 0,
      profit: finance.profit,
      deliveryFee: finance.deliveryFee,
      returnFee: finance.returnFee,
      deliveryCostApplied: finance.deliveryCostApplied,
      returnCostApplied: finance.returnCostApplied,
      withholdingTaxApplied: finance.withholdingTaxApplied,
      validatedRevenue: finance.validatedRevenue,
      netProfit: finance.netProfit,
      financeStatus: input.paymentStatus === "VALIDATED" ? "VALIDATED" : null,
      operationDate,
      deliveredAt: isDeliveredStatus(input.orderStatus) ? operationDate : null,
      returnedAt: isReturnStatus(input.orderStatus) ? operationDate : null,
      notes: input.notes || null,
    },
    finance,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("orders:read");
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id")?.trim() ?? "";
    const providerFilter = searchParams.get("provider") ?? "";
    const statusFilter = searchParams.get("status") ?? "";
    const search = searchParams.get("search")?.trim() ?? "";
    const teamId = await getTeamId(auth.user);

    const where = {
      teamId,
      ...(orderId ? { id: orderId } : {}),
      ...(providerFilter ? { shippingProvider: providerFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: "insensitive" as const } },
              { trackingNumber: { contains: search, mode: "insensitive" as const } },
              { reference: { contains: search, mode: "insensitive" as const } },
              { customerPhone: { contains: search, mode: "insensitive" as const } },
              { shippingCity: { contains: search, mode: "insensitive" as const } },
              { shippingAddress: { contains: search, mode: "insensitive" as const } },
              { productName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      orderBy: { date: "desc" },
      take: 500,
      select: {
        id: true,
        status: true,
        revenue: true,
        date: true,
        workspaceId: true,
        createdByUserId: true,
        isManualOrder: true,
        deliveryType: true,
        paymentStatus: true,
        notes: true,
        productName: true,
        customerName: true,
        customerPhone: true,
        shippingAddress: true,
        shippingCity: true,
        shippingZip: true,
        trackingNumber: true,
        reference: true,
        shippingProvider: true,
        apiStatus: true,
        paymentNumber: true,
        deliveryFee: true,
        returnFee: true,
        deliveredAt: true,
        pickedUpAt: true,
        operationDate: true,
        validatedRevenue: true,
        deliveryCostApplied: true,
        returnCostApplied: true,
        withholdingTaxApplied: true,
        netProfit: true,
        quantity: true,
      },
    });

    return NextResponse.json({ success: true, orders, total: orders.length });
  } catch (err) {
    console.error("[orders GET] Error:", err);
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("orders:write");
    if (auth.response) return auth.response;

    const parsed = manualOrderSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const teamId = await getTeamId(auth.user);
    const mapped = mapManualPayload(parsed.data, teamId, auth.user.id);

    const order = await prisma.order.create({
      data: mapped.data,
    });

    await upsertManualDeliveryRevenue({
      teamId,
      orderId: order.id,
      customerName: order.customerName,
      amount: order.revenue,
      deliveryFee: mapped.finance.deliveryFee,
      returnFee: mapped.finance.returnFee,
      netAmount: mapped.finance.netProfit,
      status: order.status,
      paymentStatus: order.paymentStatus,
      notes: order.notes,
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (err) {
    console.error("[orders POST] Error:", err);
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("orders:write");
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id");

    if (!orderId) {
      return NextResponse.json({ success: false, error: "ID requis" }, { status: 400 });
    }

    const parsed = patchOrderSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const teamId = await getTeamId(auth.user);
    const order = await prisma.order.findFirst({
      where: { id: orderId, teamId },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Commande non trouvée" }, { status: 404 });
    }

    const oldStatus = order.status;
    const isManual = order.isManualOrder || order.deliveryType === MANUAL_DELIVERY_TYPE;

    if (!isManual) {
      const newStatus = parsed.data.status || oldStatus;
      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { status: newStatus },
      });

      if (newStatus !== oldStatus && order.productId) {
        await syncOrderStock(orderId, newStatus, oldStatus);
      }

      return NextResponse.json({ success: true, order: updated });
    }

    const nextPaymentStatus = parsed.data.action === "VALIDATE_PAYMENT"
      ? "VALIDATED"
      : parsed.data.paymentStatus ?? order.paymentStatus;
    const nextStatus = parsed.data.orderStatus ?? parsed.data.status ?? order.status;
    const nextAmount = parsed.data.orderAmount ?? order.revenue;
    const nextDeliveryFee =
      parsed.data.deliveryFee ??
      order.deliveryFee ??
      order.deliveryCostApplied ??
      order.returnCostApplied ??
      0;

    const finance = calculateManualFinance({
      amount: nextAmount,
      deliveryFee: nextDeliveryFee,
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
    });

    const operationDate = isDeliveredStatus(nextStatus) || isReturnStatus(nextStatus)
      ? order.operationDate ?? new Date()
      : order.operationDate;

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        ...(parsed.data.customerName !== undefined && { customerName: parsed.data.customerName }),
        ...(parsed.data.customerPhone !== undefined && { customerPhone: parsed.data.customerPhone }),
        ...(parsed.data.customerAddress !== undefined && { shippingAddress: parsed.data.customerAddress }),
        ...(parsed.data.productName !== undefined && { productName: parsed.data.productName }),
        ...(parsed.data.quantity !== undefined && { quantity: parsed.data.quantity }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes || null }),
        revenue: nextAmount,
        profit: finance.profit,
        deliveryFee: finance.deliveryFee,
        returnFee: finance.returnFee,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        validatedRevenue: finance.validatedRevenue,
        netProfit: finance.netProfit,
        financeStatus: nextPaymentStatus === "VALIDATED" ? "VALIDATED" : null,
        operationDate,
        deliveredAt: isDeliveredStatus(nextStatus) ? operationDate : null,
        returnedAt: isReturnStatus(nextStatus) ? operationDate : null,
      },
    });

    await upsertManualDeliveryRevenue({
      teamId,
      orderId: updated.id,
      customerName: updated.customerName,
      amount: updated.revenue,
      deliveryFee: finance.deliveryFee,
      returnFee: finance.returnFee,
      netAmount: finance.netProfit,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      notes: updated.notes,
    });

    return NextResponse.json({ success: true, order: updated });
  } catch (err) {
    console.error("[orders PATCH] Error:", err);
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePermission("orders:write");
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json({ success: false, error: "ID requis" }, { status: 400 });
    }

    const teamId = await getTeamId(auth.user);
    const ids = idParam.split(",").map((id) => id.trim()).filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "IDs invalides" }, { status: 400 });
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, teamId },
      select: { id: true },
    });

    if (orders.length === 0) {
      return NextResponse.json({ success: false, error: "Commandes non trouvées" }, { status: 404 });
    }

    const allowedIds = orders.map((order) => order.id);

    await prisma.$transaction([
      prisma.deliveryRevenue.deleteMany({
        where: { orderId: { in: allowedIds }, teamId },
      }),
      prisma.order.deleteMany({
        where: { id: { in: allowedIds }, teamId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `${allowedIds.length} commande(s) supprimée(s)`,
    });
  } catch (err) {
    console.error("[orders DELETE] Error:", err);
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
}
