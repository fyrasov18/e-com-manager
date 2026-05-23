"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function TogglePublishButton({
  productId,
  published,
}: {
  productId: string;
  published: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(published);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/admin/products/${productId}/publish`, {
      method: "PATCH",
    });
    const data = await res.json();
    setState(data.published);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
        state
          ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
          : "border-border text-muted-foreground hover:bg-secondary"
      }`}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state ? (
        <Eye size={12} />
      ) : (
        <EyeOff size={12} />
      )}
      {state ? "Publié" : "Masqué"}
    </button>
  );
}
