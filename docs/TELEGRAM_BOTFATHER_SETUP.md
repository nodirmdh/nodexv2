# Telegram Bot Setup (Free)

Use this checklist to connect Client and Vendor mini apps to two Telegram bots.

## 1) Create two bots in BotFather
1. Open `@BotFather`
2. Run `/newbot`
3. Create `Client Bot` and save token as `TELEGRAM_CLIENT_BOT_TOKEN`
4. Create `Vendor Bot` and save token as `TELEGRAM_VENDOR_BOT_TOKEN`

## 2) Configure menu button (mini app launcher)
1. In `@BotFather` run `/mybots`
2. Choose `Client Bot` -> `Bot Settings` -> `Menu Button`
3. Set menu button URL to your **Client Mini App** URL
4. Repeat for `Vendor Bot` with **Vendor Mini App** URL

## 3) Configure domains for mini apps
1. In `@BotFather` run `/setdomain`
2. Select `Client Bot`, add client mini app domain
3. Repeat for `Vendor Bot`, add vendor mini app domain
4. Domain format (no path), for example:
   - `example.pages.dev`
   - `your-subdomain.trycloudflare.com`

## 4) Set project env
In root `.env`:

```env
TELEGRAM_CLIENT_BOT_TOKEN=123456:ABC...
TELEGRAM_VENDOR_BOT_TOKEN=654321:CBA...
TELEGRAM_CLIENT_WEBAPP_URL=https://client.example/pages
TELEGRAM_VENDOR_WEBAPP_URL=https://vendor.example/pages
TELEGRAM_ADMIN_URL=https://admin.example/pages
TELEGRAM_INITDATA_MAX_AGE_SEC=86400
```

## 5) Run
1. API: `npm run dev:api`
2. Client bot: `npm run dev:bot:client`
3. Vendor bot: `npm run dev:bot:vendor`
4. In Telegram chats with both bots use `/start`

Client bot shows:
- `Open Client App`
- `Open Admin Panel` (if configured)

Vendor bot shows:
- `Open Vendor App`
- `Open Admin Panel` (if configured)

## 6) Vendor account link flow
1. Open `Vendor App` from Telegram bot button
2. Login with vendor `login/password` inside mini app once
3. API links this vendor account to current Telegram user id
4. Next openings use auto-login via `/vendor/auth/telegram`

## 7) Free hosting note
For zero-cost testing:
- run API locally
- expose HTTPS with Cloudflare Tunnel
- use that HTTPS domain in BotFather `/setdomain` and env URLs
