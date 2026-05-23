"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function PromoBar() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div
      style={{
        background: "#1A1A1A",
        color: "#FAF8F5",
        fontFamily: "'DM Mono', monospace",
        fontSize: "12px",
        letterSpacing: "0.08em",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "32px",
        position: "relative",
      }}
    >
      <span>✦ LIVRAISON GRATUITE DÈS 150 TND</span>
      <span style={{ color: "#D85A30" }}>|</span>
      <span>✦ RETOURS SOUS 14 JOURS</span>
      <span style={{ color: "#D85A30" }}>|</span>
      <span>✦ PAIEMENT À LA LIVRAISON DISPONIBLE</span>
      <button
        onClick={() => setVisible(false)}
        style={{
          position: "absolute",
          right: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "#999",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
