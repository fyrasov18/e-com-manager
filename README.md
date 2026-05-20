# 🛍️ Jody Shop — E-commerce Next.js

Plateforme e-commerce moderne construite avec **Next.js 16**, **Prisma 7**, **PostgreSQL**, **Tailwind CSS v4** et **shadcn/ui**.

---

## 🚀 Stack technique

| Outil | Version | Rôle |
|---|---|---|
| Next.js | 16.2.4 | Framework React (App Router) |
| React | 19.2.4 | UI |
| Prisma | 7.7.0 | ORM + migrations |
| PostgreSQL | — | Base de données |
| Tailwind CSS | v4 | Styles |
| shadcn/ui | 4.x | Composants UI |
| Zustand | 5.x | État global (panier) |
| Recharts | 3.x | Dashboard admin |
| Stripe | — | Paiements |

---

## ⚙️ Installation

```bash
# 1. Cloner le projet
git clone <repo>
cd jody-shop

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Remplir les variables dans .env

# 4. Générer le client Prisma et appliquer les migrations
npx prisma migrate dev --name init

# 5. (Optionnel) Seed de données de test
npx prisma db seed

# 6. Lancer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

---

## 📁 Structure du projet

```
src/
├── app/
│   ├── (shop)/          # Pages boutique (catalogue, produit, panier)
│   ├── (auth)/          # Connexion, inscription
│   ├── account/         # Espace client
│   ├── admin/           # Dashboard admin
│   └── api/             # Routes API
├── components/
│   ├── ui/              # Composants shadcn/ui
│   ├── shop/            # Composants boutique
│   └── admin/           # Composants admin
├── lib/
│   ├── prisma.ts        # Client Prisma singleton
│   ├── auth.ts          # Configuration NextAuth
│   └── utils.ts         # Utilitaires
└── hooks/               # Hooks React custom
```

---

## 🗃️ Base de données

Modèles Prisma :
- **User** — clients et admins
- **Category** — catégories imbriquées
- **Product** — produits avec variantes
- **CartItem** — panier persistant
- **Order / OrderItem** — commandes
- **Address** — adresses de livraison
- **Review** — avis produits
- **Coupon** — codes promo

---

## ⚠️ Points importants

> Ce projet utilise **Next.js 16** et **Prisma 7** — ces versions peuvent avoir des breaking changes par rapport à vos connaissances antérieures. Toujours consulter `node_modules/next/dist/docs/` avant de coder.

---

## 📦 Déploiement

Déployer facilement sur [Vercel](https://vercel.com). Ajouter les variables d'environnement dans le dashboard Vercel.
