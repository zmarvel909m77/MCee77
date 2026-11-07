import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { createUserRepository } from "@mcee77/db";
import {
  clampAirHockeyOfflinePoints,
  clampRocketBirdScore,
  displayNameFromTelegramUser,
  verifyTelegramInitData,
} from "@mcee77/shared";
import { registerAirHockeyWs } from "./air-hockey/ws.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const databasePath =
  process.env.DATABASE_PATH ?? resolve(process.cwd(), "../../data/gamebot.sqlite");
const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const allowDevScoreSubmit = process.env.ALLOW_DEV_SCORE_SUBMIT === "true";

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

const publicRoot = resolve(__dirname, "../public");
if (existsSync(publicRoot)) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });
}

const shutdown = async () => {
  matchmaking.destroy();
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
