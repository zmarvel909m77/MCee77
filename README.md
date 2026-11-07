# GAME BOT (`@mcee77bot`)

Telegram orqali Rocket Bird va Air Hockey o‘yinlari, ball va reyting.

Telegram games bot with points and a leaderboard. Account = Telegram (`telegram_id`).

## Stack (MVP)

- **Bot:** Node.js + TypeScript + [grammY](https://grammy.dev)
- **API + Mini App:** Fastify (`/api/v1/*` + static games + WebSocket)
- **Realtime:** `@fastify/websocket` — in-memory matchmaking + authoritative rooms (Redis optional later)
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
npm run dev:api    # http://127.0.0.1:3000/rocket-bird/  +  /air-hockey/
npm run dev:bot    # long polling
```

Telegram Mini App uchun HTTPS kerak — lokalda `ngrok` / `cloudflared` bilan `WEBAPP_URL` ni tunnel qiling. BotFather da Menu Button / Web App URL ni ham shu origin ga qo‘yishingiz mumkin.

## Rocket Bird ni sinash / Testing the game

### Brauzerda (dev)

1. `ALLOW_DEV_SCORE_SUBMIT=true` bo‘lsin (`.env.example` dagi default).
2. `npm run dev:api`
3. Oching: [http://127.0.0.1:3000/rocket-bird/](http://127.0.0.1:3000/rocket-bird/)
4. **Boshlash** → tap / Space bilan uching → o‘yin tugagach ball `POST /api/v1/scores` ga ketadi (dev `telegram_id`).
5. Reyting: [http://127.0.0.1:3000/api/v1/leaderboard](http://127.0.0.1:3000/api/v1/leaderboard)

### Telegram ichida

1. HTTPS tunnel → `WEBAPP_URL`
2. Botni ishga tushiring → **🚀 Rocket Bird** → **O‘ynash** (Web App)
3. Score `initData` HMAC bilan verify qilinadi (`TELEGRAM_BOT_TOKEN` kerak)

## Air Hockey ni sinash / Testing Air Hockey

### Offline (brauzer)

1. `ALLOW_DEV_SCORE_SUBMIT=true`
2. `npm run dev:api`
3. Oching: [http://127.0.0.1:3000/air-hockey/](http://127.0.0.1:3000/air-hockey/)
4. **Offline — vs AI** yoki **Offline — 2 o‘yinchi**
5. Pastki paddle — barmoq / sichqich; AI yuqorida (yoki lokal 2P da yuqori yarim maydon).
6. First to **5** — natija `POST /api/v1/scores` (`game=air_hockey`, `mode=offline`).

### Online matchmaking (ikki brauzer / ikki qurilma)

1. API ishlayotgan bo‘lsin (`ALLOW_DEV_SCORE_SUBMIT=true` lokalda).
2. Ikki oynada `/air-hockey/` oching (har biri alohida `sessionStorage` → turli `devTelegramId`).
3. Ikkalasida **Online — random** bosing → juftlashadi → server-authoritative o‘yin (`ws://…/ws/air-hockey`).
4. G‘olib/mag‘lub ballari server tomonidan `matches` + `scores` ga yoziladi.
5. Heartbeat ~5s; 15s jimlik → disconnect; reconnect grace ~15s; keyin forfeit.
6. Holat: [http://127.0.0.1:3000/healthz](http://127.0.0.1:3000/healthz) (`matchmaking.queueDepth`, `activeRooms`).

### Telegram ichida

1. HTTPS tunnel → `WEBAPP_URL` (WS ham shu host: `wss://`)
2. Bot → **🏒 Air Hockey** → **O‘ynash**
3. Online natija faqat serverdan; client online score yubora olmaydi.

### Scale notes (MVP)

In-memory queue + rooms — bitta Node jarayoni uchun yetarli. Keyinroq: Redis queue (`ZADD`), sticky LB by `room_id`, Redis pub/sub fan-out. Room ticklari `setInterval` + non-blocking; bitta client event-loopni “muzlatmaydi”.

## Bot menyusi

| Tugma | Holat |
|-------|--------|
| 🚀 Rocket Bird | Mini App (`WEBAPP_URL/rocket-bird/`) |
| 🏒 Air Hockey | Mini App (`WEBAPP_URL/air-hockey/`) |
| 🏆 Reyting | Leaderboard |
| 👤 Profil | Ball, reyting, o‘yinlar soni |

Commands: `/start`, `/profile`, `/rating`

## Folder layout

```text
apps/bot/                     grammY Telegram bot
apps/api/                     Fastify REST + WS + static Mini Apps
apps/api/public/rocket-bird/  canvas Rocket Bird
apps/api/public/air-hockey/   canvas Air Hockey
apps/api/src/air-hockey/      matchmaking + authoritative rooms
apps/api/src/admin/           /admin stats panel + secret gate
packages/db/                  SQLite users + scores + matches
packages/shared/              types + initData verify
data/                         Local SQLite file (gitignored)
```

## Deploy (Railway) / Deploy qilish

Bitta servis: Fastify (REST + static Mini Apps + Air Hockey WebSocket) **va** grammY bot (webhook, xuddi shu HTTPS).

One service runs the API + Mini Apps + WS **and** the Telegram bot (webhook on the same HTTPS origin).

### Env variables / O‘zgaruvchilar

| Variable | Required | Prod value |
|----------|----------|------------|
| `TELEGRAM_BOT_TOKEN` | **yes** | BotFather token for `@mcee77bot` (dashboard secret — **never commit**) |
| `WEBAPP_URL` | **yes** (after URL known) | `https://<your-app>.up.railway.app` (no trailing slash) |
| `ALLOW_DEV_SCORE_SUBMIT` | yes | `false` |
| `ADMIN_SECRET` | recommended | random long string for `/admin` (never commit) |
| `PORT` | set by host | Railway/Render inject this; app binds `PORT` then `API_PORT` |
| `BOT_MODE` | optional | `webhook` (Dockerfile default) |
| `DATABASE_PATH` | optional | `/data/gamebot.sqlite` in Docker |
| `TELEGRAM_WEBHOOK_SECRET` | optional | random string; also sent to `setWebhook` |
| `NODE_ENV` | optional | `production` |

## Admin statistika / Admin stats

Oddiy o‘qiladigan admin panel (o‘zbekcha lotin UI): jami foydalanuvchilar, bugun/24 soat aktiv, hozir Air Hockey o‘yinida (xonalar + navbat), bugungi o‘yinlar, qisqa top reyting.

Readable admin panel (Uzbek Latin UI): total users, active today/24h, live Air Hockey rooms + queue, games today, short top rating.

1. Railway **Variables** ga `ADMIN_SECRET` qo‘shing (uzun tasodifiy satr; gitga yozmang).
2. Ochish: `https://<WEBAPP_URL-host>/admin?key=SECRET` — cookie saqlanadi, keyin `/admin` yetarli.
3. JSON: `GET /api/v1/admin/stats` — header `x-admin-secret: SECRET` yoki cookie/`?key=`.
4. `ADMIN_SECRET` bo‘lmasa admin **404** qaytaradi.

```bash
# misol / example
curl -H "x-admin-secret: $ADMIN_SECRET" https://<host>/api/v1/admin/stats
```

### Railway (dashboard) — qadamma-qadam / step-by-step

**O‘zbekcha**

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → `zmarvel909m77/MCee77` (branch `main` merge dan keyin).
2. Railway `Dockerfile` + `railway.toml` ni o‘qiydi.
3. **Variables** → qo‘shing:
   - `TELEGRAM_BOT_TOKEN` = BotFather dagi token (hech qachon chat/README/git ga yozmang)
   - `ALLOW_DEV_SCORE_SUBMIT` = `false`
   - `NODE_ENV` = `production`
   - `ADMIN_SECRET` = uzun tasodifiy satr (`/admin` paneli uchun)
4. **Settings → Networking → Generate Domain** → public HTTPS URL chiqadi.
5. `WEBAPP_URL` = shu URL (masalan `https://xxxx.up.railway.app`) ni Variables ga qo‘shing → redeploy.
6. Ixtiyoriy: **Volumes** → `/data` mount (SQLite saqlansin).
7. Deploy logda `Telegram webhook set for @mcee77bot` va `/healthz` → `ok: true` bo‘lishi kerak.

**English**

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → this repo.
2. Builder uses `Dockerfile` / `railway.toml`.
3. Add Variables: `TELEGRAM_BOT_TOKEN`, `ALLOW_DEV_SCORE_SUBMIT=false`, `NODE_ENV=production`, `ADMIN_SECRET=<long random>`.
4. Generate a public domain, then set `WEBAPP_URL` to that `https://…` origin and redeploy.
5. Optional volume at `/data` so SQLite survives restarts.
6. Confirm logs show webhook set and `GET /healthz` returns ok.
7. Open `/admin?key=<ADMIN_SECRET>` after deploy.

### BotFather Menu Button / Web App URL

After `WEBAPP_URL` is live:

1. Open [@BotFather](https://t.me/BotFather) → `/mybots` → `@mcee77bot`
2. **Bot Settings → Menu Button** (or **Configure Mini App**): set URL to  
   `https://<WEBAPP_URL-host>/rocket-bird/`  
   (or leave menu on bot reply keyboard; inline **O‘ynash** buttons already open the games)
3. Deep paths used by the bot:
   - Rocket Bird: `${WEBAPP_URL}/rocket-bird/`
   - Air Hockey: `${WEBAPP_URL}/air-hockey/`
   - WebSocket: `wss://<same-host>/ws/air-hockey`
   - Telegram webhook: `${WEBAPP_URL}/telegram/webhook`

### Docker (local prod-like)

```bash
cp .env.example .env   # set TELEGRAM_BOT_TOKEN + WEBAPP_URL (public HTTPS tunnel)
docker compose up --build
```

`npm run start:prod` starts the API process with `BOT_MODE=webhook` in the image.

### Render (fallback)

If Railway is unavailable: new **Web Service** from the GitHub repo, Dockerfile runtime, same env vars, set `PORT` automatically. Health check path: `/healthz`.

### Secret missing? / Token yo‘qmi?

Deploy CLI cannot invent a BotFather token. In Railway:

1. Project → your service → **Variables**
2. **+ New Variable** → name `TELEGRAM_BOT_TOKEN`
3. Paste the token from BotFather (`/token` or API Token field)
4. Save → wait for redeploy

Never paste the token into git, PR comments, or chat.

## Notes

- Do not commit `.env` or real tokens.
- `ALLOW_DEV_SCORE_SUBMIT` is for local browser tests only — disable in production.
- Online Air Hockey results are server-authoritative (`finishMatch`); offline scores are clamped.
- Production default: one process, Telegram **webhook** on the same HTTPS URL as the Mini Apps.
