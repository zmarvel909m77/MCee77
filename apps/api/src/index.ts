import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { webhookCallback } from "grammy";
import { createBot, resolveWebAppUrls } from "@mcee77/bot";
import { createUserRepository } from "@mcee77/db";
import {
  clampAirHockeyOfflinePoints,
  clampRocketBirdScore,
  displayNameFromTelegramUser,
  verifyTelegramInitData,
} from "@mcee77/shared";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerAirHockeyWs } from "./air-hockey/ws.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const databasePath =
  process.env.DATABASE_PATH ?? resolve(process.cwd(), "../../data/gamebot.sqlite");
const host = process.env.API_HOST ?? "0.0.0.0";
/** Railway / Render inject PORT; fall back to API_PORT for local. */
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const allowDevScoreSubmit = process.env.ALLOW_DEV_SCORE_SUBMIT === "true";

const webAppUrl =
  process.env.WEBAPP_URL?.trim().replace(/\/?$/, "") ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "");

const { rocketBirdUrl, airHockeyUrl } = resolveWebAppUrls(webAppUrl);

/**
 * Bot transport:
 * - webhook (default in production) — same HTTPS process as API
 * - long_polling — run `npm run start:bot` separately
 * - none — API only
 */
const botModeRaw = (process.env.BOT_MODE ?? "").trim().toLowerCase();
const botMode: "webhook" | "long_polling" | "none" =
  botModeRaw === "webhook" ||
  botModeRaw === "long_polling" ||
  botModeRaw === "none"
    ? botModeRaw
    : process.env.NODE_ENV === "production"
      ? "webhook"
      : "none";

const webhookPath =
  process.env.TELEGRAM_WEBHOOK_PATH?.trim() || "/telegram/webhook";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;

const users = createUserRepository(databasePath);
const app = Fastify({ logger: true });

await app.register(websocket);

const matchmaking = registerAirHockeyWs(app, {
  users,
  botToken,
  allowDevScoreSubmit,
});

app.get("/healthz", async () => ({
  ok: true,
  service: "game-bot-api",
  rocketBird: "/rocket-bird/",
  airHockey: "/air-hockey/",
  airHockeyWs: "/ws/air-hockey",
  botMode,
  webhookPath: botMode === "webhook" ? webhookPath : null,
  matchmaking: matchmaking.stats,
}));

app.get("/api/v1/leaderboard", async (request) => {
  const query = request.query as { limit?: string };
  const limit = Math.min(Math.max(Number(query.limit ?? 10) || 10, 1), 50);
  return { items: users.getLeaderboard(limit) };
});

app.get("/api/v1/me", async (request, reply) => {
  const query = request.query as { telegram_id?: string };
  const telegramId = Number(query.telegram_id);
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    return reply.code(400).send({ error: "telegram_id required" });
  }
  const user = users.findByTelegramId(telegramId);
  if (!user) {
    return reply.code(404).send({ error: "user not found" });
  }
  return { user };
});

interface ScoreBody {
  initData?: string;
  points?: number;
  game?: string;
  mode?: string;
  /** Dev-only when ALLOW_DEV_SCORE_SUBMIT=true and initData absent */
  devTelegramId?: number;
  meta?: Record<string, unknown>;
}

function resolveTelegramIdentity(
  body: ScoreBody,
  log: { warn: (obj: unknown, msg?: string) => void },
):
  | { ok: true; telegramId: number; username: string | null; displayName: string }
  | { ok: false; status: number; error: string } {
  if (body.initData?.trim()) {
    if (!botToken) {
      return {
        ok: false,
        status: 503,
        error: "TELEGRAM_BOT_TOKEN not configured; cannot verify initData",
      };
    }
    try {
      const verified = verifyTelegramInitData(body.initData, botToken);
      return {
        ok: true,
        telegramId: verified.user.id,
        username: verified.user.username ?? null,
        displayName: displayNameFromTelegramUser(verified.user),
      };
    } catch (err) {
      log.warn({ err }, "initData verification failed");
      return { ok: false, status: 401, error: "invalid initData" };
    }
  }

  if (allowDevScoreSubmit && body.devTelegramId) {
    const telegramId = Number(body.devTelegramId);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return { ok: false, status: 400, error: "devTelegramId invalid" };
    }
    log.warn({ telegramId }, "accepting unauthenticated dev score submit");
    return {
      ok: true,
      telegramId,
      username: null,
      displayName: `Dev ${telegramId}`,
    };
  }

  return {
    ok: false,
    status: 401,
    error: "initData required (or ALLOW_DEV_SCORE_SUBMIT with devTelegramId)",
  };
}

app.post("/api/v1/scores", async (request, reply) => {
  const body = (request.body ?? {}) as ScoreBody;
  const game = body.game ?? "rocket_bird";
  if (game !== "rocket_bird" && game !== "air_hockey") {
    return reply.code(400).send({ error: "unsupported game" });
  }

  const identity = resolveTelegramIdentity(body, request.log);
  if (!identity.ok) {
    return reply.code(identity.status).send({ error: identity.error });
  }

  const points =
    game === "air_hockey"
      ? clampAirHockeyOfflinePoints(Number(body.points))
      : clampRocketBirdScore(Number(body.points));

  const user = users.upsertByTelegramId({
    telegramId: identity.telegramId,
    username: identity.username,
    displayName: identity.displayName,
  });

  const mode =
    game === "air_hockey"
      ? body.mode === "online"
        ? "offline" // online results are server-written via matches — reject online client claims
        : "offline"
      : body.mode === "offline"
        ? "offline"
        : "solo";

  if (game === "air_hockey" && body.mode === "online") {
    return reply.code(400).send({
      error: "online air hockey results are server-authoritative",
    });
  }

  const result = users.submitScore({
    userId: user.id,
    game,
    mode,
    points,
    meta: body.meta ?? null,
  });

  return {
    ok: true,
    pointsAwarded: result.pointsAwarded,
    score: result.score,
    user: result.user,
  };
});

app.get("/api/v1/matches/:id", async (request, reply) => {
  const params = request.params as { id: string };
  const match = users.findMatchById(params.id);
  if (!match) {
    return reply.code(404).send({ error: "match not found" });
  }
  return { match };
});

app.get("/rocket-bird", async (_request, reply) =>
  reply.redirect("/rocket-bird/", 302),
);

app.get("/air-hockey", async (_request, reply) =>
  reply.redirect("/air-hockey/", 302),
);

registerAdminRoutes(app, { users, matchmaking });

let bot: ReturnType<typeof createBot> | null = null;

if (botMode === "webhook") {
  if (!botToken) {
    app.log.error(
      "BOT_MODE=webhook requires TELEGRAM_BOT_TOKEN — webhook not registered",
    );
  } else {
    bot = createBot({ token: botToken, users, webAppUrl });
    const handleUpdate = webhookCallback(bot, "fastify", {
      secretToken: webhookSecret,
    });
    app.post(webhookPath, async (request, reply) => {
      await handleUpdate(request, reply);
    });
    app.log.info(`Telegram webhook route ready at POST ${webhookPath}`);
  }
}

const publicRoot = resolve(__dirname, "../public");
if (existsSync(publicRoot)) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });
}

const shutdown = async () => {
  matchmaking.destroy();
  // Keep Telegram webhook registered across rolling restarts.
  await app.close();
  users.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host, port });
app.log.info(`Rocket Bird Mini App: http://${host}:${port}/rocket-bird/`);
app.log.info(`Air Hockey Mini App:  http://${host}:${port}/air-hockey/`);
app.log.info(`Air Hockey WS:        ws://${host}:${port}/ws/air-hockey`);

if (bot && botMode === "webhook") {
  if (!webAppUrl) {
    app.log.warn(
      "WEBAPP_URL (or RAILWAY_PUBLIC_DOMAIN) missing — cannot call setWebhook yet. Set WEBAPP_URL to your public HTTPS origin and redeploy.",
    );
  } else {
    const webhookUrl = `${webAppUrl}${webhookPath.startsWith("/") ? "" : "/"}${webhookPath}`;
    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: webhookSecret,
        drop_pending_updates: true,
      });
      const me = await bot.api.getMe();
      app.log.info(
        `Telegram webhook set for @${me.username}: ${webhookUrl}`,
      );
      if (rocketBirdUrl) app.log.info(`Rocket Bird WebApp: ${rocketBirdUrl}`);
      if (airHockeyUrl) app.log.info(`Air Hockey WebApp: ${airHockeyUrl}`);
    } catch (err) {
      app.log.error({ err }, `failed to setWebhook(${webhookUrl})`);
    }
  }
}
