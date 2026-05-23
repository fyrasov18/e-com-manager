import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendOrderConfirmation,
  sendShipmentNotification,
  sendDeliveryNotification,
  sendStockAlert,
  sendWelcomeEmail,
} from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "send_confirmation" | "send_shipment" | "send_delivery" | "send_stock_alert" | "send_welcome";
      [key: string]: unknown;
    };

    const { action, ...params } = body;

    switch (action) {
      case "send_confirmation": {
        const p = params as {
          to: string;
          orderRef: string;
          customerName: string;
          total: number;
          items: { name: string; quantity: number; price: number }[];
        };
        await sendOrderConfirmation(p);
        break;
      }

      case "send_shipment": {
        const p = params as {
          to: string;
          orderRef: string;
          customerName: string;
          trackingNumber: string;
          carrier: string;
          estimatedDelivery?: string;
        };
        await sendShipmentNotification(p);
        break;
      }

      case "send_delivery": {
        const p = params as {
          to: string;
          orderRef: string;
          customerName: string;
        };
        await sendDeliveryNotification(p);
        break;
      }

      case "send_stock_alert": {
        const p = params as {
          to: string;
          productName: string;
          sku: string;
          currentStock: number;
        };
        await sendStockAlert(p);
        break;
      }

      case "send_welcome": {
        const p = params as { to: string; name: string };
        await sendWelcomeEmail(p);
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, action });
  } catch {
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(notifications);
  } catch {
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}