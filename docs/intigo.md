# Intigo Partner V3 — Installation & dépannage (E-com Manager / Jody Shop)

Base URL: `https://api.intigo.net/api/v3` — Auth serveur: `X-API-Key`.

## 1. Variables d'environnement

```
INTIGO_API_BASE_URL=https://api.intigo.net/api/v3
INTIGO_API_KEY=            # fallback si pas de config DB (serveur uniquement)
INTIGO_PLATFORM=ecom_collab
INTIGO_PLATFORM_VERSION=
INTIGO_SHOP_URL=
INTIGO_DEFAULT_PICKUP_INDEX=
INTIGO_SECRET_KEY=         # chiffrement AES-256-GCM (fallback COLISSIMO_SECRET_KEY / AUTH_SECRET)
```

Ne jamais exposer `INTIGO_API_KEY` au frontend. L'UI n'affiche qu'une version masquée (`abcd••••1234`).

## 2. Base de données

Modèles Prisma: `IntigoIntegration` (clé chiffrée `enc:...`), `IntigoParcel` (NID, CID, statuts), `IntigoSyncHistory`.

Migration:

```bash
npx prisma db push
npx prisma generate
```

En production (Vercel): déjà couvert par `npx prisma db push --accept-data-loss && prisma db seed && npm run build`.

Rollback: `prisma migrate` / suppression des 3 modèles + routes `/api/intigo/*` + page `/shipping-providers/intigo`.

## 3. Configuration admin

Page: `/shipping-providers/intigo` (permission `delivery:read/write`).
1. Renseigner clé API + pickup_index défaut → Enregistrer (chiffré AES-256-GCM).
2. Tester → appelle `GET /pickup-addresses/` réel.
3. Géo: `GET /api/intigo/geo?kind=cities|districts&city_id|neighborhoods&district_id|pickups`.

## 4. Créer un colis depuis une commande

`POST /api/intigo/shipment`:
```json
{ "orderId": "<uuid>", "mode": "ids",
  "payload": { "destination_city_id": 1, "destination_district_id": 5, "pickup_index": 0 } }
```
- COD = `order.revenue`, 0 si prépayé (`paymentStatus` VALIDATED/RECEIVED).
- Jamais d'adresse inventée: 400 si champs manquants.
- Anti-doublon: 409 si NID déjà lié; `cid` stable `ECOM-<team>-<order>` (rapprochement, pas idempotence serveur).
- Timeout ambigu: ne pas réessayer aveuglément, vérifier côté Intigo.

Mode `by-name`: `{ "mode": "by-name", "payload": { "city_name": "Tunis", "district_name": "...", ... } }`.

## 5. Suivi / actions

- `GET /api/intigo/parcels?nid=...` détail, `POST /api/intigo/sync { nid | orderId }` sync → mappe code → statut plateforme (code original conservé).
- Actions: `POST /api/intigo/parcels { nid, action: change-address|change-phone|change-price|reroute|cancel|relance|report-delay, ...champs }`.
- `PATCH /api/intigo/parcels { nid, patch }`, échange: `{ action: "exchange", payload }`.
- Import de codes-barres tracking : `POST /api/intigo/import` ou `POST /api/orders/import-tracking` (avec `provider: "INTIGO"` ou `"AUTO"`).
  - Format supporté : codes-barres alphanumériques Intigo (ex. `8743434S8`).
  - Tolérance automatique : recherche avec le code-barres complet (`8743434S8`), avec repli automatique sur le NID numérique (`8743434`) si nécessaire.
  - Disponible sur l'UI : page Commandes (`/orders`), page Import (`/import`), et configuration Intigo (`/shipping-providers/intigo`).

## 6. Tests

```bash
npx tsx tests/intigo.test.ts
npm run typecheck
npm run build
```

Sans clé réelle, les tests utilisent validation/mapping/erreurs en local (aucun colis créé).

## 7. Dépannage

| Erreur | Cause |
|---|---|
| 401 | Clé absente/invalide → reconfigurer |
| 400 | Champs Intigo invalides (détail en `message`) |
| 402 | Solde insuffisant |
| 404 | NID/destination introuvable |
| 409 | Doublon ou conflit de statut |
| 500/503 | Intigo indisponible → réessayer |
| Timeout | Vérifier côté Intigo avant réessai |

Limites: pas de webhook documenté confirmé → sync manuelle/périodique; statuts mappés mais code original conservé; multi-tentatives historisées dans `IntigoSyncHistory`.
