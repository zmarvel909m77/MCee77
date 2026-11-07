# GAME BOT (`@mcee77bot`)

Telegram orqali Rocket Bird va Air Hockey o‘yinlari, ball va reyting.

Telegram games bot with points and a leaderboard. Account = Telegram (`telegram_id`).

## Stack (MVP scaffold)

- **Bot:** Node.js + TypeScript + [grammY](https://grammy.dev)
- **API:** Fastify (`/healthz`, `/api/v1/leaderboard`, `/api/v1/me`)
- **DB:** SQLite via `better-sqlite3` (Postgres-ready schema)
- **Layout:** npm workspaces — `apps/bot`, `apps/api`, `packages/db`, `packages/shared`

## Setup / O‘rnatish

1. **Token** — [BotFather](https://t.me/BotFather) dan `@mcee77bot` tokenini oling.
2. Copy env file:

```bash
cp .env.example .env
```

3. `.env` ichida faqat shu qatorni to‘ldiring (real tokenni gitga commit qilmang):

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
```

4. Install & run:

```bash
npm install
npm run build
npm run dev:bot
```

API (ixtiyoriy / optional):

```bash
npm run dev:api
```

- Bot: long polling
- API default: `http://127.0.0.1:3000`

## Bot menyusi

| Tugma | Holat |
|-------|--------|
| 🚀 Rocket Bird | Stub — “tez orada” |
| 🏒 Air Hockey | Stub — “tez orada” |
| 🏆 Reyting | Leaderboard (ball; default 0) |
| 👤 Profil | Ball, reyting, o‘yinlar soni |

Commands: `/start`, `/profile`, `/rating`

## Folder layout

```text
apps/bot/          grammY Telegram bot
apps/api/          Fastify REST (score/leaderboard foundation)
packages/db/       SQLite user repository (upsert by telegram_id)
packages/shared/   Shared types
data/              Local SQLite file (gitignored)
```

## Notes

- Do not commit `.env` or real tokens.
- Full Rocket Bird / Air Hockey gameplay comes in later PRs.
