import Link from "next/link";
import { ShoppingBag } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  revenue: number;
  margin: number;
  category: { name: string } | null;
}

export default function FeaturedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null;

  return (
    <section style={{ padding: "80px 24px", background: "#FAF8F5" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: "48px",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "11px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#D85A30",
                margin: "0 0 12px",
              }}
            >
              ✦ Sélection vedette
            </p>
            <h2
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(32px, 3vw, 48px)",
                fontWeight: "700",
                color: "#1A1A1A",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Nos coups de cœur
            </h2>
          </div>
          <Link
            href="/catalogue"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#555",
              textDecoration: "none",
              borderBottom: "1px solid #555",
              paddingBottom: "2px",
            }}
          >
            Tout le catalogue →
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "24px",
          }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              style={{
                background: "#FFF",
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid #E8E4DC",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                style={{
                  padding: "24px 16px",
                  background: "linear-gradient(135deg, #F5EDE0, #E8D5BC)",
                  minHeight: "160px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#1A1A1A",
                    textAlign: "center",
                    margin: "0 0 8px",
                  }}
                >
                  {product.name}
                </p>
                <p
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "11px",
                    letterSpacing: "0.1em",
                    color: "#999",
                    textTransform: "uppercase",
                  }}
                >
                  SKU: {product.sku}
                </p>
              </div>
              <div style={{ padding: "16px" }}>
                <p
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#999",
                    margin: "0 0 4px",
                  }}
                >
                  {product.category?.name ?? "Non catégorisé"}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "18px",
                        fontWeight: "700",
                        color: "#D85A30",
                      }}
                    >
                      Stock: {product.stockQuantity}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: product.stockQuantity > 0 ? "#1A1A1A" : "#E8E4DC",
                      color: product.stockQuantity > 0 ? "#FAF8F5" : "#999",
                      border: "none",
                      borderRadius: "4px",
                      padding: "8px 14px",
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "11px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <ShoppingBag size={13} />
                    {product.stockQuantity > 0 ? "Ajouter" : "Épuisé"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
