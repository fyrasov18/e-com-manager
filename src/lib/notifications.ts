import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function logNotification(params: {
  userId?: string;
  type: "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "STOCK_ALERT" | "PASSWORD_RESET" | "ACCOUNT_CREATED";
  channel: "EMAIL" | "SMS" | "PUSH" | "IN_APP";
  recipient: string;
  subject: string;
  status: "PENDING" | "SENT" | "FAILED";
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        channel: params.channel,
        recipient: params.recipient,
        subject: params.subject,
        status: params.status,
        metadata: params.metadata ?? {},
      },
    });
    return { success: true, id: notification.id };
  } catch {
    return { success: false };
  }
}

export async function getNotifications(userId?: string, limit = 50) {
  return prisma.notification.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}