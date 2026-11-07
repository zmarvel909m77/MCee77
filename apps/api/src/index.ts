import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { createUserRepository } from "@mcee77/db";
import {
  clampRocketBirdScore,
  displayNameFromTelegramUser,
  verifyTelegramInitData,
} from "@mcee77/shared";

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

app.get("/healthz", async () => ({
  ok: true,
  service: "game-bot-api",
  rocketBird: "/rocket-bird/",
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

app.post("/api/v1/scores", async (request, reply) => {
  const body = (request.body ?? {}) as ScoreBody;
  const game = body.game ?? "rocket_bird";
  if (game !== "rocket_bird") {
    return reply.code(400).send({ error: "unsupported game" });
  }

  const points = clampRocketBirdScore(Number(body.points));
  let telegramId: number;
  let username: string | null = null;
  let displayName: string;

  if (body.initData?.trim()) {
    if (!botToken) {
      // TODO: require TELEGRAM_BOT_TOKEN in production for initData HMAC verify
      return reply.code(503).send({
        error: "TELEGRAM_BOT_TOKEN not configured; cannot verify initData",
      });
    }
    try {
      const verified = verifyTelegramInitData(body.initData, botToken);
      telegramId = verified.user.id;
      username = verified.user.username ?? null;
      displayName = displayNameFromTelegramUser(verified.user);
    } catch (err) {
      request.log.warn({ err }, "initData verification failed");
      return reply.code(401).send({ error: "invalid initData" });
    }
  } else if (allowDevScoreSubmit && body.devTelegramId) {
    // TODO(MVP): remove or gate behind NODE_ENV=development only before public deploy
    telegramId = Number(body.devTelegramId);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return reply.code(400).send({ error: "devTelegramId invalid" });
    }
    displayName = `Dev ${telegramId}`;
    request.log.warn({ telegramId }, "accepting unauthenticated dev score submit");
  } else {
    return reply.code(401).send({
      error: "initData required (or ALLOW_DEV_SCORE_SUBMIT with devTelegramId)",
    });
  }

  const user = users.upsertByTelegramId({
    telegramId,
    username,
    displayName,
  });

  const result = users.submitScore({
    userId: user.id,
    game: "rocket_bird",
    mode: body.mode === "offline" ? "offline" : "solo",
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

app.get("/rocket-bird", async (_request, reply) =>
  reply.redirect("/rocket-bird/", 302),
);

const publicRoot = resolve(__dirname, "../public");
if (existsSync(publicRoot)) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });
}

const shutdown = async () => {
  await app.close();
  users.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host, port });
app.log.info(`Rocket Bird Mini App: http://${host}:${port}/rocket-bird/`);
