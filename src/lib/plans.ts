import { prisma } from "./prisma";

export const FREE_PLAN_CODE = "free";

export const FREE_PLAN_LIMITS = {
  orders: 100,
  imports: 10,
  users: 3,
  apiRequests: 1000,
  analytics: "basic",
} as const;

export type UsageLimitKey = keyof Pick<
  typeof FREE_PLAN_LIMITS,
  "orders" | "imports" | "users" | "apiRequests"
>;

export async function ensureFreePlan() {
  return prisma.plan.upsert({
    where: { code: FREE_PLAN_CODE },
    update: {
      name: "Free",
      description: "Free workspace for early e-commerce operations.",
      priceMonthly: 0,
      priceYearly: 0,
      currency: "USD",
      limits: FREE_PLAN_LIMITS,
      features: [
        "Orders",
        "Payments",
        "Expenses",
        "Delivery integrations",
        "Basic analytics",
      ],
      isActive: true,
    },
    create: {
      code: FREE_PLAN_CODE,
      name: "Free",
      description: "Free workspace for early e-commerce operations.",
      priceMonthly: 0,
      priceYearly: 0,
      currency: "USD",
      limits: FREE_PLAN_LIMITS,
      features: [
        "Orders",
        "Payments",
        "Expenses",
        "Delivery integrations",
        "Basic analytics",
      ],
      isActive: true,
    },
  });
}
