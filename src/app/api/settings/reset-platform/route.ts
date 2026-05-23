import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.confirmationText !== "MISE A ZERO") {
      return NextResponse.json(
        {
          success: false,
          message: "Texte de confirmation incorrect.",
        },
        { status: 400 }
      );
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const result: Record<string, number> = {};

      // 1. Delete child models that reference Order, Product, etc.
      const dDeliveryRevenue = await tx.deliveryRevenue.deleteMany();
      result.deliveryRevenues = dDeliveryRevenue.count;

      const dStockMovement = await tx.stockMovement.deleteMany();
      result.stockMovements = dStockMovement.count;

      // 2. Delete main operational models
      const dOrder = await tx.order.deleteMany();
      result.orders = dOrder.count;

      const dDeliverySyncLog = await tx.deliverySyncLog.deleteMany();
      result.deliverySyncLogs = dDeliverySyncLog.count;

      const dDeliveryPayment = await tx.deliveryPayment.deleteMany();
      result.deliveryPayments = dDeliveryPayment.count;

      const dInstaDeliveryPayment = await tx.instaDeliveryPayment.deleteMany();
      result.instaDeliveryPayments = dInstaDeliveryPayment.count;

      const dTransaction = await tx.transaction.deleteMany();
      result.transactions = dTransaction.count;

      const dExpense = await tx.expense.deleteMany();
      result.expenses = dExpense.count;

      const dTask = await tx.task.deleteMany();
      result.tasks = dTask.count;

      const dGoal = await tx.goal.deleteMany();
      result.goals = dGoal.count;

      const dNotification = await tx.notification.deleteMany();
      result.notifications = dNotification.count;

      const dPurchaseInvoice = await tx.purchaseInvoice.deleteMany();
      result.purchaseInvoices = dPurchaseInvoice.count;

      const dDeliveryNote = await tx.deliveryNote.deleteMany();
      result.deliveryNotes = dDeliveryNote.count;

      // Reset product stats instead of deleting them (to keep the catalog)
      await tx.product.updateMany({
        data: {
          stockQuantity: 0,
          stockEnAttente: 0,
          salesCount: 0,
          revenue: 0,
        },
      });

      return result;
    });

    return NextResponse.json({
      success: true,
      message: "Plateforme remise à zéro avec succès.",
      deleted,
    });
  } catch (error) {
    console.error("Erreur reset plateforme:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Erreur lors de la mise à zéro de la plateforme.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
