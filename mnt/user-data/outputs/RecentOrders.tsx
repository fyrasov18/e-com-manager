import { OrderStatus } from "@/generated/prisma";

const statusLabel: Record<OrderStatus, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  PROCESSING: "En cours",
  SHIPPED: "Expédié",
  DELIVERED: "Livré",
  CANCELLED: "Annulé",
  REFUNDED: "Remboursé",
};

const statusColor: Record<OrderStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-700",
};

interface Order {
  id: string;
  total: number;
  status: OrderStatus;
  user: { name: string | null; email: string };
  createdAt: Date;
}

export default function RecentOrders({ orders }: { orders: Order[] }) {
  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <h2 className="text-sm font-medium mb-4">Dernières commandes</h2>
      <div className="flex flex-col gap-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between px-3 py-2 bg-secondary rounded-lg text-sm"
          >
            <div>
              <p className="font-medium text-sm">
                {order.user.name ?? order.user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                #{order.id.slice(-6).toUpperCase()}
              </p>
            </div>
            <span className="font-medium">{order.total.toFixed(0)} TND</span>
            <span
              className={`text-xs px-2 py-1 rounded-md ${statusColor[order.status]}`}
            >
              {statusLabel[order.status]}
            </span>
          </div>
        ))}
        {orders.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune commande
          </p>
        )}
      </div>
    </div>
  );
}
