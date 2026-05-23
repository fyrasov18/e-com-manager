# Rate Limiting

The app includes a reusable server-side rate limiter in `src/lib/rate-limit.ts`.

## Storage

- Local development uses an in-memory store.
- Production should use Upstash Redis REST:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

If Redis is not configured in production, the app falls back to memory and logs a warning. Set `RATE_LIMIT_STRICT_MODE=true` to fail closed when the configured store cannot be reached.

## Environment Variables

```env
RATE_LIMIT_ENABLED="true"
RATE_LIMIT_STRICT_MODE="false"
TRUST_PROXY_HEADERS=""
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

Use `TRUST_PROXY_HEADERS=true` only when the deployment platform provides trusted `x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip` headers. Vercel, Cloudflare Pages, and Render are trusted automatically.

## Protected Routes

- Login:
  - `POST /api/login`
  - `POST /api/auth/callback/credentials`
  - `POST /api/auth/login`
  - `POST /auth/login`
- Public form:
  - `POST /api/setup`
- General API:
  - `100 requests / minute` per authenticated user, falling back to IP.
- Sensitive write API:
  - `20 requests / minute` per authenticated user, falling back to IP.
  - Covers orders, expenses, settings, imports/uploads, notifications, delivery, finance writes, goals, tasks, products, and related write-heavy routes.

Login requests are additionally limited by IP plus normalized email in the login route and Auth.js credentials flow. Passwords and raw secrets are never used in rate limit keys.

## Local Testing

```bash
npm run test:rate-limit
```

To manually test login limits, submit an invalid login more than five times within fifteen minutes from the same IP/email pair. The API returns HTTP `429` with:

```json
{ "error": "Too many attempts. Please try again later." }
```

Responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
