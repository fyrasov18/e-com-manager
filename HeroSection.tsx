import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "64px 24px 80px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "48px",
        alignItems: "center",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      {/* Texte gauche */}
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {/* Tag */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "'DM Mono', monospace",
            fontSize: "11px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#D85A30",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "24px",
              height: "1px",
              background: "#D85A30",
            }}
          />
          Nouvelle collection 2026
        </div>

        {/* Titre principal */}
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "clamp(48px, 5vw, 80px)",
            fontWeight: "700",
            lineHeight: "1.05",
            color: "#1A1A1A",
            letterSpacing: "-0.03em",
            margin: 0,
          }}
        >
          Style &<br />
          <span
            style={{
              fontStyle: "italic",
              color: "#D85A30",
            }}
          >
            élégance
          </span>
          <br />
          à portée.
        </h1>

        {/* Description */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "16px",
            lineHeight: "1.7",
            color: "#666",
            maxWidth: "420px",
            margin: 0,
          }}
        >
          Découvrez notre sélection de pièces tendance, livrées directement
          chez vous en Tunisie. Qualité premium, prix accessibles.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <Link
            href="/catalogue"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "13px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "#D85A30",
              color: "#FAF8F5",
              padding: "14px 32px",
              borderRadius: "4px",
              textDecoration: "none",
              transition: "transform 0.2s, background 0.2s",
              display: "inline-block",
            }}
          >
            Voir la collection →
          </Link>
          <Link
            href="/nouveautes"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#1A1A1A",
              textDecoration: "none",
              borderBottom: "1px solid #1A1A1A",
              paddingBottom: "2px",
            }}
          >
            Nouveautés
          </Link>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: "40px",
            paddingTop: "16px",
            borderTop: "1px solid #E8E4DC",
          }}
        >
          {[
            { value: "500+", label: "Produits" },
            { value: "4.8★", label: "Note moyenne" },
            { value: "48h", label: "Livraison" },
          ].map((stat) => (
            <div key={stat.label}>
              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "24px",
                  fontWeight: "700",
                  color: "#1A1A1A",
                  margin: 0,
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "11px",
                  letterSpacing: "0.1em",
                  color: "#999",
                  margin: "4px 0 0",
                  textTransform: "uppercase",
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Image droite */}
      <div
        style={{
          position: "relative",
          height: "600px",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* Fond décoratif */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #F5EDE0 0%, #E8D5BC 50%, #D4B896 100%)",
            borderRadius: "8px",
          }}
        />

        {/* Badge flottant */}
        <div
          style={{
            position: "absolute",
            top: "32px",
            right: "32px",
            background: "#D85A30",
            color: "#FAF8F5",
            borderRadius: "50%",
            width: "80px",
            height: "80px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Mono', monospace",
            fontSize: "11px",
            letterSpacing: "0.05em",
            textAlign: "center",
            lineHeight: "1.4",
            zIndex: 2,
            transform: "rotate(12deg)",
          }}
        >
          <span style={{ fontSize: "16px", fontWeight: "700" }}>-30%</span>
          <span>SOLDES</span>
        </div>

        {/* Texte décoratif centré */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Playfair Display', serif",
            fontSize: "80px",
            fontWeight: "700",
            color: "rgba(255,255,255,0.3)",
            userSelect: "none",
            letterSpacing: "-0.04em",
            fontStyle: "italic",
          }}
        >
          Jody
        </div>

        {/* Carte produit flottante */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            left: "32px",
            background: "#FAF8F5",
            borderRadius: "8px",
            padding: "16px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            minWidth: "200px",
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "#999",
              textTransform: "uppercase",
              margin: "0 0 4px",
            }}
          >
            Produit vedette
          </p>
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "16px",
              fontWeight: "600",
              color: "#1A1A1A",
              margin: "0 0 8px",
            }}
          >
            Collection Été 2026
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "18px",
                fontWeight: "700",
                color: "#D85A30",
              }}
            >
              89 TND
            </span>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "12px",
                color: "#999",
                textDecoration: "line-through",
              }}
            >
              129 TND
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
