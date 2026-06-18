# AGENTS.md — Jody Shop (ecom-manager)

## Quick Start

```bash
# Dev
npm run dev

# Build (runs prisma generate automatically via postinstall)
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Tests (must run sequentially — they share state)
npm run test:auth && npm run test:expenses && npm run test:rate-limit && npm run test:insta-delivery

# Single test
npx tsx tests/insta-delivery.test.ts

# Database
npx prisma db push
npx prisma db seed
npx prisma generate
```

## Architecture

**Multi-tenant SaaS e-commerce management platform** (Tunisian market). NOT a storefront — it manages orders, deliveries, inventory, and finance for online shops.

### Tech Stack
- Next.js 16 (App Router, React 19)
- PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- NextAuth v5 (JWT, Credentials provider)
- Tailwind CSS 4, Radix UI, shadcn components
- Zustand for state, Framer Motion for animation
- Zod for validation

### Key Directories
```
src/
├── app/
│   ├── api/              # REST API routes (29+ route groups)
│   ├── admin/            # Platform super-admin
│   ├── dashboard/        # Main dashboard (reuses root page-client.tsx)
│   ├── orders/           # Order management
│   ├── finance/          # Delivery revenue / finance
│   ├── shipping-providers/
│   │   └── insta-delivery/  # InstaDelivery config page
│   └── settings/         # Settings + user management
├── lib/
│   ├── instavia-delivery.ts  # InstaDelivery API client (1065 lines)
│   ├── colissimo.ts          # Colissimo TN API client (1055 lines)
│   ├── sync-delivery.ts      # Central delivery sync orchestrator
│   ├── delivery-status.ts    # Status mapping + business rules
│   ├── finance.ts            # Finance calculation engine
│   ├── stock-sync.ts         # Stock movement sync from orders
│   ├── tracking-utils.ts     # Tracking code utilities
│   └── prisma.ts             # Prisma client singleton
├── components/
│   └── ui/               # Shared UI components (shadcn)
└── types/
    └── next-auth.d.ts    # NextAuth type augmentation
```

### Database
- 35+ models in `prisma/schema.prisma` (741 lines)
- Key models: Order (40+ fields), Product, Team, DeliveryRevenue, InstaDeliveryConfig, ColissimoIntegration
- All business data scoped to `teamId` (multi-tenant)

### Delivery Integration (Critical)
Two Tunisian delivery providers run in parallel:
- **InstaDelivery** (`src/lib/instavia-delivery.ts`) — base URL: `https://app.insta-delivery.com/API`
- **Colissimo TN** (`src/lib/colissimo.ts`) — REST v1/v2 + SOAP fallback

### Environment Variables (required)
```
DATABASE_URL          # PostgreSQL connection string
NEXTAUTH_SECRET       # NextAuth JWT secret
AUTH_SECRET           # Auth secret
INSTAVIA_LOGIN        # InstaDelivery API login
INSTAVIA_PASSWORD     # InstaDelivery API password
COLISSIMO_SECRET_KEY  # AES-256-GCM key for Colissimo credentials
```

## Conventions

### Language
- UI is in **French** (all user-facing text)
- Code comments in English
- Status badges use French labels (see `delivery-status.ts`)

### Shipping Provider Names
**ALWAYS use `"INSTADELIVERY"` (not `"INSTAVIA_DELIVERY"`)** as the canonical provider string. Historical inconsistency exists — some older routes use `"INSTAVIA_DELIVERY"`. New code must use `"INSTADELIVERY"`.

Query pattern for matching both:
```ts
shippingProvider: { in: ["INSTAVIA_DELIVERY", "INSTADELIVERY"] }
```

### InstaDelivery API
- **Tracking endpoint**: `GET /API/tracking/{barcode}` (barcode only, no auth in URL)
- **Add parcel**: `POST /API/add` (login + password in JSON body)
- **State list**: `GET /API/state_list`
- **Modalite list**: `GET /API/modalite_liste`
- **Postal codes**: `GET /API/code_postal`
- **No `/paiements` endpoint exists** — do not call it

### Status Flow
Order statuses follow a pipeline: `PENDING → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`
Returns: `RETURN_PENDING → RETURN_IN_TRANSIT → RETURN_RECEIVED → RETURNED`
See `delivery-status.ts` for the full mapping.

### Finance Rules
- Delivery cost applied on SHIPPED+
- Return cost applied on any RETURN status
- Withholding tax calculated as percentage of revenue
- See `finance.ts:calculateOrderFinance()`

## Gotchas

1. **Next.js 16 breaking changes** — Check `node_modules/next/dist/docs/` before writing Next.js code
2. **Prisma generate** runs automatically on `npm install` (postinstall script)
3. **Cron sync** runs daily at 2 AM via Vercel (`/api/cron/sync`). Anti-concurrency lock prevents overlapping runs.
4. **Stock movements** are automatically triggered by order status changes — do not manually create stock movements from delivery sync code without going through `stock-sync.ts`
5. **Orders page** reuses `page-client.tsx` from root for the dashboard — the actual orders UI is at `src/app/orders/page-client.tsx`
6. **Vercel deploy** runs `prisma db push --accept-data-loss && prisma db seed && npm run build` (see `vercel.json`)

## InstaDelivery Tracking Import Flow

The import flow has multiple entry points that all converge:
1. `POST /api/insta-delivery/import` — UI import (accepts text, arrays)
2. `POST /api/delivery/instadelivery/import` — Bulk import (array only)
3. `POST /api/delivery/instadelivery/sync-tracking` — Bulk sync (array only)

All call `syncInstaDeliveryPayments()` → `syncInstaDeliveryTracking()` → `trackInstaDeliveryParcel()`.

**The tracking URL must be**: `https://app.insta-delivery.com/API/tracking/{barcode}` (barcode only — no credentials in URL).
