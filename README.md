# GAME BOT (`@mcee77bot`)

Telegram Mini App — **GAMEE-style shell** + **City Strike** (urban chop arcade), ball va ochiq reyting.

Primary entry = Mini App shell at `${WEBAPP_URL}/app/` (Magazin · O‘yinlar · Reyting). Account = Telegram (`telegram_id`).

**Live:** https://web-production-05946.up.railway.app · **Bot:** [@mcee77bot](https://t.me/mcee77bot)

## Stack (MVP)

- **Bot:** Node.js + TypeScript + [grammY](https://grammy.dev)
- **API + Mini App:** Fastify (`/api/v1/*` + static shell/game)
- **DB:** shared `@mcee77/db` — **PostgreSQL** when `DATABASE_URL` is set, else **SQLite** (`better-sqlite3`) for local/dev
- **Layout:** npm workspaces — `apps/bot`, `apps/api`, `packages/db`, `packages/shared`

## Scoring / Ball qoidalari

| Natija | Ball |
|--------|------|
| 1 muvaffaqiyatli chop | **1 ball** (shu run ichida) |
| Run tugaganda | Faqat **eng yuqori** natija saqlanadi (`total_points` = best). Pastroq run rekordni pasaytirmaydi. |

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
npm run dev:api    # http://127.0.0.1:3000/app/  +  /city-strike/
npm run dev:bot    # long polling
```

Telegram Mini App uchun HTTPS kerak — lokalda `ngrok` / `cloudflared` bilan `WEBAPP_URL` ni tunnel qiling.

## Mini App shell (`/app/`)

- **Yuqorida chapda:** profil (avatar + taxallus, `@username` yo‘q) — bosilsa tahrir
- **Pastki menyu (3):** Magazin · O‘yinlar · Reyting
- **Ochilganda:** O‘yinlar tab
- **Magazin:** «Resurslar yo‘q» placeholder
- **Reyting:** City Strike eng yaxshi ballari (public)

Vertical swipe/pull-to-close o‘chirilgan (`Telegram.WebApp.disableVerticalSwipes` + `overscroll-behavior: none`); yopish faqat Telegram header **X** orqali.

### Brauzerda (dev)

1. `ALLOW_DEV_SCORE_SUBMIT=true`
2. `npm run dev:api`
3. [http://127.0.0.1:3000/app/](http://127.0.0.1:3000/app/)

## City Strike

`/city-strike/` — po‘lat minora, chap/o‘ng zarba. Noto‘g‘ri tomondagi to‘siq (balkon / konditsioner / iskala) = game over. Energiya/timer bosimi bor. Original canvas art (shahar skyline, quruvchi qahramon).

## Layout

```
apps/bot/                     grammY bot + admin bot
apps/api/public/app/          Mini App shell
apps/api/public/city-strike/  City Strike canvas
apps/api/src/                 Fastify API
packages/db/                  Postgres / SQLite repository
packages/shared/              types + initData verify
```

## Admin

- Web: `/admin?key=ADMIN_SECRET`
- Telegram admin bot: `@MCee_adminbot` (`ADMIN_BOT_TOKEN` + `ADMIN_TELEGRAM_IDS`)
- Statistika: DB foydalanuvchilar, bugungi City Strike runlar, top rekordlar (online presence yo‘q)

## Deploy (Railway)

`Dockerfile` + `railway.toml`. Set `TELEGRAM_BOT_TOKEN`, `WEBAPP_URL` (yoki `RAILWAY_PUBLIC_DOMAIN`), `DATABASE_URL`, optional admin secrets.
Menu Button / OCHISH → `${WEBAPP_URL}/app/`.
