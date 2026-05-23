# Import automatique des commandes

L'import manuel Excel reste disponible. L'import automatique utilise la meme logique d'upsert que l'import manuel pour garder le meme format de commande.

Pour eviter les doublons, chaque commande automatique doit fournir au moins `trackingNumber` ou `reference` (`id`, `number`, `name` et `order_number` sont convertis en `reference` selon le provider).

## Variables d'environnement

```bash
AUTO_ORDER_IMPORT_ENABLED="true"
AUTO_ORDER_IMPORT_PROVIDER="GENERIC"
AUTO_ORDER_IMPORT_URL="https://votre-boutique.example/api/orders"
AUTO_ORDER_IMPORT_INTERVAL_MINUTES="15"
CRON_SECRET="un-secret-long"
```

Providers supportes :

- `GENERIC` : tableau JSON direct ou objet avec `orders`, `data`, `items` ou `results`.
- `SHOPIFY` : mapping des champs Shopify courants.
- `WOOCOMMERCE` : mapping des champs WooCommerce courants.

Options utiles :

- `AUTO_ORDER_IMPORT_SINCE_PARAM` : ajoute une date ISO dans l'URL, par exemple `updated_after` ou `created_at_min`.
- `AUTO_ORDER_IMPORT_LIMIT_PARAM` : ajoute la limite configuree par `AUTO_ORDER_IMPORT_LIMIT`.
- `AUTO_ORDER_IMPORT_AUTH_HEADER` : header libre, par exemple `Authorization: Bearer xxx`.
- `AUTO_ORDER_IMPORT_BEARER_TOKEN` : ajoute automatiquement `Authorization: Bearer ...`.
- `AUTO_ORDER_IMPORT_API_KEY_HEADER` et `AUTO_ORDER_IMPORT_API_KEY` : pour les APIs a cle.
- `AUTO_ORDER_IMPORT_REQUIRE_PHONE="false"` : autorise les commandes sans telephone client.

## Planification

`vercel.json` declenche deja :

```json
{
  "crons": [
    { "path": "/api/cron/import-orders", "schedule": "*/15 * * * *" }
  ]
}
```

Pour un cron externe, appeler :

```bash
GET /api/cron/import-orders
```

avec l'un des secrets suivants :

- header `x-cron-secret: <CRON_SECRET>`
- header `Authorization: Bearer <CRON_SECRET>`
- query `?secret=<CRON_SECRET>`

Pour tester immediatement sans attendre l'intervalle :

```bash
POST /api/cron/import-orders?force=true
```

Chaque execution est journalisee dans `DeliverySyncLog` avec le provider `ORDER_IMPORT`.
