# CORRECTIONS — Jody Shop

## Fichiers renommés (CRITIQUE)

| Fichier uploadé (incorrect) | Fichier corrigé |
|---|---|
| `_env` | `.env` |
| `_gitignore` | `.gitignore` |
| `next_config.ts` | `next.config.ts` |
| `postcss_config.mjs` | `postcss.config.mjs` |
| `eslint_config.mjs` | `eslint.config.mjs` |
| `next-env_d.ts` | `next-env.d.ts` (généré auto) |
| `prisma_config.ts` | `prisma.config.ts` |

## Modifications apportées

### .env
- DB renommée `ecompro` → `jodyshop`
- NEXTAUTH_SECRET renforcé (placeholder)
- Ajout variables Stripe, Cloudinary, app publique

### .gitignore
- Ajout `.env.example` (à commiter, pas `.env`)
- Ajout `/prisma/generated`

### next.config.ts
- Ajout `images.remotePatterns` pour Cloudinary + Unsplash

### eslint.config.mjs
- Ajout ignore `src/generated/**` (client Prisma)

### prisma/schema.prisma (NOUVEAU)
- Schéma complet e-commerce avec : User, Category, Product, ProductVariant, CartItem, Order, OrderItem, Address, Review, Coupon

## Prochaines étapes

1. Renommer tous les fichiers sur votre machine
2. Remplacer `.env` par les vraies valeurs
3. `npx prisma migrate dev --name init`
4. Créer `src/lib/prisma.ts` (singleton client)
5. Configurer NextAuth dans `src/app/api/auth/[...nextauth]/route.ts`
