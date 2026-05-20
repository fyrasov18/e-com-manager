import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{ background: "#1A1A1A", color: "#FAF8F5", padding: "64px 24px 32px" }}>
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: "48px",
          marginBottom: "48px",
        }}
      >
        {/* Brand */}
        <div>
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "28px",
              fontWeight: "700",
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
            }}
          >
            JODY<span style={{ color: "#D85A30" }}>.</span>
          </p>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "14px",
              lineHeight: "1.7",
              color: "#888",
              maxWidth: "280px",
              margin: "0 0 24px",
            }}
          >
            Votre boutique de mode en Tunisie. Style, qualité et livraison rapide partout dans le pays.
          </p>
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "12px",
              color: "#D85A30",
              letterSpacing: "0.05em",
            }}
          >
            ✦ Livraison via Colissimo Tunisie
          </p>
        </div>

        {/* Boutique */}
        <div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "20px" }}>
            Boutique
          </p>
          {["Catalogue", "Nouveautés", "Promotions", "Produits vedettes"].map((item) => (
            <Link
              key={item}
              href={`/${item.toLowerCase().replace(/ /g, "-")}`}
              style={{
                display: "block",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "14px",
                color: "#888",
                textDecoration: "none",
                marginBottom: "10px",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#FAF8F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
            >
              {item}
            </Link>
          ))}
        </div>

        {/* Aide */}
        <div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "20px" }}>
            Aide
          </p>
          {["Suivi de commande", "Retours & échanges", "Livraison", "Contact"].map((item) => (
            <Link
              key={item}
              href="#"
              style={{
                display: "block",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "14px",
                color: "#888",
                textDecoration: "none",
                marginBottom: "10px",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#FAF8F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
            >
              {item}
            </Link>
          ))}
        </div>

        {/* Contact */}
        <div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "20px" }}>
            Contact
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#888", marginBottom: "10px" }}>
            Tunis, Tunisie
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#888", marginBottom: "10px" }}>
            contact@jodyshop.tn
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#888" }}>
            +216 XX XXX XXX
          </p>
        </div>
      </div>

      {/* Bottom */}
      <div
        style={{
          borderTop: "1px solid #2A2A2A",
          paddingTop: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#555", letterSpacing: "0.08em" }}>
          © 2026 JODY SHOP. TOUS DROITS RÉSERVÉS.
        </p>
        <div style={{ display: "flex", gap: "24px" }}>
          {["CGV", "Confidentialité", "Mentions légales"].map((item) => (
            <Link
              key={item}
              href="#"
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "11px",
                letterSpacing: "0.08em",
                color: "#555",
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#FAF8F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              {item}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
