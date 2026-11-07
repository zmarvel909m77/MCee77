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
packages/db/                  SQLite users + scores + matches
packages/shared/              types + initData verify
data/                         Local SQLite file (gitignored)
```

## Notes

- Do not commit `.env` or real tokens.
- `ALLOW_DEV_SCORE_SUBMIT` is for local browser tests only — disable in production.
- Online Air Hockey results are server-authoritative (`finishMatch`); offline scores are clamped.
