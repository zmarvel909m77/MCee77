# GAME BOT — single service: Fastify (API + static Mini Apps + WS) + grammY webhook
FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN npm ci

COPY apps ./apps
COPY packages ./packages

RUN npm run build \
  && npm prune --omit=dev

# --- runtime ---
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Prefer DATABASE_URL (Railway PostgreSQL) for persistence.
# SQLite fallback path /data is only used when DATABASE_URL is unset.
# Volumes are optional when Postgres is configured.
ENV NODE_ENV=production \
    ALLOW_DEV_SCORE_SUBMIT=false \
    BOT_MODE=webhook \
    API_HOST=0.0.0.0 \
    DATABASE_PATH=/data/gamebot.sqlite

RUN mkdir -p /data/avatars \
  && chown -R node:node /data

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/packages ./packages

USER node

# Railway / Render set PORT; default 3000 for local docker
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start:prod"]
