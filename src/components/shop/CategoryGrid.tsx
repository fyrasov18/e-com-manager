import Link from "next/link";

interface Category {
  id: string;
  name: string;
  _count: { products: number };
}

export default function CategoryGrid({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;

  return (
    <section
      style={{
        background: "#1A1A1A",
        padding: "80px 24px",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: "48px",
            flexWrap: "wrap",
            gap: "16px",
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
              ✦ Nos catégories
            </p>
            <h2
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(32px, 3vw, 48px)",
                fontWeight: "700",
                color: "#FAF8F5",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Explorez notre univers
            </h2>
          </div>
          <Link
            href="/catalogue"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#999",
              textDecoration: "none",
              borderBottom: "1px solid #555",
              paddingBottom: "2px",
            }}
          >
            Tout voir →
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {categories.map((cat, i) => (
            <div
              key={cat.id}
              style={{
                display: "block",
                background: i === 0 ? "#D85A30" : "#2A2A2A",
                borderRadius: "8px",
                padding: "32px 24px",
                transition: "transform 0.2s, background 0.2s",
                border: "1px solid #333",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "48px",
                  fontWeight: "700",
                  color: "rgba(255,255,255,0.06)",
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "22px",
                  fontWeight: "600",
                  color: "#FAF8F5",
                  margin: "0 0 8px",
                  letterSpacing: "-0.01em",
                }}
              >
                {cat.name}
              </p>
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "11px",
                  letterSpacing: "0.1em",
                  color: i === 0 ? "rgba(255,255,255,0.7)" : "#666",
                  margin: 0,
                  textTransform: "uppercase",
                }}
              >
                {cat._count.products} produit{cat._count.products > 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
