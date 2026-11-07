import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import { createUserRepository } from "@mcee77/db";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const databasePath =
  process.env.DATABASE_PATH ?? resolve(process.cwd(), "../../data/gamebot.sqlite");
const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);

const users = createUserRepository(databasePath);
const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ ok: true, service: "game-bot-api" }));

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

const shutdown = async () => {
  await app.close();
  users.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host, port });
