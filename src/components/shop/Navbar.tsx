"use client";
import Link from "next/link";
import { ShoppingBag, Search, Menu, X, User } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/nouveautes", label: "Nouveautés" },
  { href: "/promotions", label: "Promotions" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav
        style={{
          background: "#FAF8F5",
          borderBottom: "1px solid #E8E4DC",
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 24px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Link
            href="/"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "24px",
              fontWeight: "700",
              color: "#1A1A1A",
              textDecoration: "none",
              letterSpacing: "-0.02em",
            }}
          >
            JODY<span style={{ color: "#D85A30" }}>.</span>
          </Link>

          {/* Links desktop */}
          <div
            style={{
              display: "flex",
              gap: "32px",
              alignItems: "center",
            }}
            className="hidden md:flex"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#555",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#D85A30")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", color: "#1A1A1A", padding: "4px" }}
            >
              <Search size={18} />
            </button>
            <Link href="/account" style={{ color: "#1A1A1A" }}>
              <User size={18} />
            </Link>
            <Link
              href="/panier"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#1A1A1A",
                color: "#FAF8F5",
                padding: "8px 16px",
                borderRadius: "4px",
                fontFamily: "'DM Mono', monospace",
                fontSize: "12px",
                letterSpacing: "0.08em",
                textDecoration: "none",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#D85A30")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#1A1A1A")}
            >
              <ShoppingBag size={14} />
              PANIER
            </Link>

            {/* Menu mobile */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#1A1A1A" }}
              className="md:hidden"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Menu mobile */}
      {menuOpen && (
        <div
          style={{
            position: "fixed",
            top: "64px",
            left: 0,
            right: 0,
            background: "#FAF8F5",
            borderBottom: "1px solid #E8E4DC",
            zIndex: 40,
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "14px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#1A1A1A",
                textDecoration: "none",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
