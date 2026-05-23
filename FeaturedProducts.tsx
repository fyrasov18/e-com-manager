import Link from "next/link";
import { ShoppingBag } from "lucide-react";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  comparePrice: number | null;
  images: string[];
  stock: number;
  category: { name: string };
}

export default function FeaturedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null;

  return (
    <section style={{ padding: "80px 24px", background: "#FAF8F5" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Header */}
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

        {/* Grille produits */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "24px",
          }}
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ product }: { product: Product }) {
  const discount = product.comparePrice
    ? Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100)
    : null;

  return (
    <div
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
      {/* Image */}
      <Link href={`/produits/${product.slug}`} style={{ display: "block", textDecoration: "none" }}>
        <div
          style={{
            height: "300px",
            background: product.images[0]
              ? `url(${product.images[0]}) center/cover no-repeat`
              : "linear-gradient(135deg, #F5EDE0, #E8D5BC)",
            position: "relative",
          }}
        >
          {discount && (
            <span
              style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                background: "#D85A30",
                color: "#FAF8F5",
                fontFamily: "'DM Mono', monospace",
                fontSize: "11px",
                letterSpacing: "0.05em",
                padding: "4px 8px",
                borderRadius: "4px",
              }}
            >
              -{discount}%
            </span>
          )}
          {product.stock === 0 && (
            <span
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "#1A1A1A",
                color: "#FAF8F5",
                fontFamily: "'DM Mono', monospace",
                fontSize: "11px",
                letterSpacing: "0.05em",
                padding: "4px 8px",
                borderRadius: "4px",
              }}
            >
              Épuisé
            </span>
          )}
        </div>
      </Link>

      {/* Infos */}
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
          {product.category.name}
        </p>
        <Link
          href={`/produits/${product.slug}`}
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "16px",
            fontWeight: "600",
            color: "#1A1A1A",
            textDecoration: "none",
            display: "block",
            marginBottom: "12px",
          }}
        >
          {product.name}
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "18px",
                fontWeight: "700",
                color: "#D85A30",
              }}
            >
              {product.price.toFixed(0)} TND
            </span>
            {product.comparePrice && (
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "13px",
                  color: "#BBB",
                  textDecoration: "line-through",
                }}
              >
                {product.comparePrice.toFixed(0)}
              </span>
            )}
          </div>

          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: product.stock > 0 ? "#1A1A1A" : "#E8E4DC",
              color: product.stock > 0 ? "#FAF8F5" : "#999",
              border: "none",
              borderRadius: "4px",
              padding: "8px 14px",
              fontFamily: "'DM Mono', monospace",
              fontSize: "11px",
              letterSpacing: "0.06em",
              cursor: product.stock > 0 ? "pointer" : "not-allowed",
              transition: "background 0.2s",
            }}
            disabled={product.stock === 0}
          >
            <ShoppingBag size={13} />
            {product.stock > 0 ? "Ajouter" : "Épuisé"}
          </button>
        </div>
      </div>
    </div>
  );
}
