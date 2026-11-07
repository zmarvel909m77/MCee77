# GAME BOT (`@mcee77bot`)

Telegram orqali Rocket Bird va Air Hockey o‘yinlari, ball va reyting.

Telegram games bot with points and a leaderboard. Account = Telegram (`telegram_id`).

## Stack (MVP)

- **Bot:** Node.js + TypeScript + [grammY](https://grammy.dev)
- **API + Mini App:** Fastify (`/api/v1/*` + static `/rocket-bird/`)
- **DB:** SQLite via `better-sqlite3` (Postgres-ready schema)
- **Layout:** npm workspaces — `apps/bot`, `apps/api`, `packages/db`, `packages/shared`

## Setup / O‘rnatish

1. **Token** — [BotFather](https://t.me/BotFather) dan `@mcee77bot` tokenini oling.
2. Copy env file:

```bash
cp .env.example .env
```

3. `.env` ni to‘ldiring (real tokenni gitga commit qilmang):

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
WEBAPP_URL=https://<your-https-tunnel>
ALLOW_DEV_SCORE_SUBMIT=true
```

4. Install & run:

```bash
npm install
npm run build
npm run dev:api    # http://127.0.0.1:3000/rocket-bird/
npm run dev:bot    # long polling
```

Telegram Mini App uchun HTTPS kerak — lokalda `ngrok` / `cloudflared` bilan `WEBAPP_URL` ni tunnel qiling. BotFather da Menu Button / Web App URL ni ham shu origin ga qo‘yishingiz mumkin.

## Rocket Bird ni sinash / Testing the game

### Brauzerda (dev)

1. `ALLOW_DEV_SCORE_SUBMIT=true` bo‘lsin (`.env.example` dagi default).
2. `npm run dev:api`
3. Oching: [http://127.0.0.1:3000/rocket-bird/](http://127.0.0.1:3000/rocket-bird/)
4. **Boshlash** → tap / Space bilan uching → o‘yin tugagach ball `POST /api/v1/scores` ga ketadi (dev `telegram_id=900001`).
5. Reyting: [http://127.0.0.1:3000/api/v1/leaderboard](http://127.0.0.1:3000/api/v1/leaderboard)

### Telegram ichida

1. HTTPS tunnel → `WEBAPP_URL`
2. Botni ishga tushiring → **🚀 Rocket Bird** → **O‘ynash** (Web App)
3. Score `initData` HMAC bilan verify qilinadi (`TELEGRAM_BOT_TOKEN` kerak)

## Bot menyusi

| Tugma | Holat |
|-------|--------|
| 🚀 Rocket Bird | Mini App (`WEBAPP_URL/rocket-bird/`) |
| 🏒 Air Hockey | Stub — “tez orada” |
| 🏆 Reyting | Leaderboard |
| 👤 Profil | Ball, reyting, o‘yinlar soni |

Commands: `/start`, `/profile`, `/rating`

## Folder layout

```text
apps/bot/                     grammY Telegram bot
apps/api/                     Fastify REST + static Mini App
apps/api/public/rocket-bird/  canvas Rocket Bird game
packages/db/                  SQLite users + scores
packages/shared/              types + initData verify
data/                         Local SQLite file (gitignored)
```

## Notes

- Do not commit `.env` or real tokens.
- Air Hockey gameplay is out of scope for this slice.
- `ALLOW_DEV_SCORE_SUBMIT` is for local browser tests only — disable in production.
