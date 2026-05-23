"use client";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface PaymentAlertProps {
  count: number;
  total: number;
}

export default function PaymentAlert({ count, total }: PaymentAlertProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300">
      <AlertTriangle size={15} className="flex-shrink-0" />
      <span>
        <strong>{count} paiement{count > 1 ? "s" : ""}</strong> saisi{count > 1 ? "s" : ""} non reçu{count > 1 ? "s" : ""} — montant total :{" "}
        <strong>{total.toFixed(0)} TND</strong>
      </span>
      <Link
        href="/admin/payments?filter=unpaid"
        className="ml-auto text-xs underline underline-offset-2 flex-shrink-0"
      >
        Voir les détails →
      </Link>
    </div>
  );
}
