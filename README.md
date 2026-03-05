# Nodex Delivery Platform

## What this project is
Nodex is a unified delivery platform with a single backend and single database supporting four interfaces:
- **Admin Panel (Web)**: Browser-based admin console.
- **Client App (Telegram Mini App)**: Customer ordering and tracking.
- **Vendorka (Vendor Cabinet, Telegram Mini App)**: Vendor operations for a single physical point.

The platform supports food, retail, pharmacy, and market categories, with delivery and restricted pickup rules defined in the requirements.

## Interfaces
- **Admin WEB**: Vendor onboarding, promo codes, promotions, catalog governance, and operations oversight.
- **Client Mini App**: Browsing, ordering, promo codes, checkout, and vendor delivery tracking by order status.
- **Vendorka Mini App**: Orders, menu CRUD, promotions, finance, statistics, and profile.
- **Shared Navigation Module**: In-app map with pickup/dropoff markers used by mini apps.

## Quick start (placeholder)
### Monorepo setup
1. `npm install`

### API (Fastify)
1. Create `.env` (see `.env.example` for required keys)
2. `npm run dev:api`
2. API runs on `http://HOST:PORT` from `.env` (defaults: `0.0.0.0:3000`)

### Admin Web (React + Vite)
1. Set `VITE_API_URL` in `apps/admin-web/.env` (defaults to `http://localhost:3000`)
2. `npm run dev:admin`
2. Admin runs on `http://localhost:5173`

### Client Mini App (React + Vite)
1. Set `VITE_API_URL`, `VITE_DEV_MODE`, `VITE_DEV_CLIENT_ID`, `VITE_SUPPORT_TG_USERNAME` in `apps/client-miniapp/.env`
2. `npm run dev:client`
3. Client app runs on `http://localhost:5174`

### Vendor Web (React + Vite)
1. Set `VITE_API_URL`, `VITE_DEV_MODE`, `VITE_DEV_VENDOR_ID` in `apps/vendor-web/.env`
2. `npm run dev:vendor`
3. Vendor web runs on `http://localhost:5176`

### Telegram Bot (Client + Vendor Mini Apps)
1. For one bot set `TELEGRAM_BOT_TOKEN`; for two bots set `TELEGRAM_CLIENT_BOT_TOKEN` and `TELEGRAM_VENDOR_BOT_TOKEN`
2. Set `TELEGRAM_CLIENT_WEBAPP_URL`, `TELEGRAM_VENDOR_WEBAPP_URL` in root `.env`
3. Optional: set `TELEGRAM_ADMIN_URL`
4. Run one bot: `npm run dev:bot`
5. Run separate bots: `npm run dev:bot:client` and `npm run dev:bot:vendor`
6. In Telegram use `/start` to open button(s) for mini app
7. Full BotFather setup checklist: `docs/TELEGRAM_BOTFATHER_SETUP.md`

### i18n
- Supported languages: `ru`, `uz`, `kaa`, `en`.
- Language detection: Telegram user language → browser language → fallback `ru`.
- Selection persists in localStorage and can be changed in the app UI.

### Tests
1. `npm test`

### Database & Prisma
1. `docker compose up -d`
2. `npm -w apps/api exec prisma generate`
3. `npm -w apps/api exec prisma migrate dev`
4. `npm run seed`
5. Production-style migration: `npm -w apps/api exec prisma migrate deploy`

### DEV headers (local)
- Set `DEV_MODE=1` in `apps/api/.env`.
- Mini apps can send `x-dev-user: client|vendor`.
- Vendor web also needs `x-vendor-id: <vendor_uuid>` to scope vendor data.

### Telegram initData verification
- API verifies Telegram Mini App `initData` signature when `TELEGRAM_BOT_TOKEN` is configured.
- Allowed max age is controlled by `TELEGRAM_INITDATA_MAX_AGE_SEC` (default `86400`).
- In local DEV without bot token, parser fallback is enabled only in `DEV_MODE`.

## Repository structure
- `docs/`: Product requirements, architecture, domains, plans, and status.
- `README.md`: High-level overview and contributor guidance.
- `AGENTS.md`: Operating rules for future agents and contributors.

## Contributing (docs-first)
1. Read `docs/requirements.md`, `docs/architecture.md`, `docs/domains.md`, and `docs/PLANS.md` before making changes.
2. Update documentation alongside any code changes.
3. Keep changes small and focused; prefer PR-sized increments.
4. Add or update tests for pricing and promotions logic.

## Core concept
Read `docs/PROJECT_OVERVIEW.md` — it defines the single-backend single-DB core and how all apps share the same Order lifecycle.
