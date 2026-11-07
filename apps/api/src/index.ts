import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, createReadStream } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { webhookCallback } from "grammy";
import {
  createAdminBot,
  createBot,
  parseAdminTelegramIds,
  resolveWebAppUrls,
} from "@mcee77/bot";
import {
  createUserRepository,
  inspectDatabasePersistence,
  resolveDatabasePath,
} from "@mcee77/db";
import { MAX_AVATAR_BYTES, publicDisplayName } from "@mcee77/shared";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerAirHockeyWs } from "./air-hockey/ws.js";
import {
  resolveTelegramIdentity,
  upsertFromIdentity,
  type IdentityBody,
} from "./auth-identity.js";
import { registerPresenceWs } from "./presence/ws.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const databasePath = resolveDatabasePath();
const dbPersistence = inspectDatabasePersistence(databasePath);
const host = process.env.API_HOST ?? "0.0.0.0";
/** Railway / Render inject PORT; fall back to API_PORT for local. */
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const adminBotToken = process.env.ADMIN_BOT_TOKEN?.trim() ?? "";
const adminTelegramIds = parseAdminTelegramIds(
  process.env.ADMIN_TELEGRAM_IDS,
);
const allowDevScoreSubmit = process.env.ALLOW_DEV_SCORE_SUBMIT === "true";

const webAppUrl =
  process.env.WEBAPP_URL?.trim().replace(/\/?$/, "") ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "");

const { miniAppUrl, airHockeyUrl } = resolveWebAppUrls(webAppUrl);

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
const userCountAtBoot = users.countUsers();
const avatarRoot =
  process.env.AVATAR_DIR?.trim() ||
  resolve(dirname(databasePath), "avatars");
mkdirSync(avatarRoot, { recursive: true });

console.log(
  `[db] path=${dbPersistence.absolutePath} users=${userCountAtBoot}` +
    ` persistent=${dbPersistence.persistent}` +
    (dbPersistence.volumeMountPath
      ? ` volumeMount=${dbPersistence.volumeMountPath}`
      : " volumeMount=(none)"),
);
if (dbPersistence.warning) {
  console.warn(`[db] WARNING: ${dbPersistence.warning}`);
}

const app = Fastify({ logger: true, bodyLimit: MAX_AVATAR_BYTES + 64_000 });

await app.register(websocket);

const matchmaking = registerAirHockeyWs(app, {
  users,
  botToken,
  allowDevScoreSubmit,
});

const presence = registerPresenceWs(app, {
  users,
  botToken,
  allowDevScoreSubmit,
});

app.get("/healthz", async () => ({
  ok: true,
  service: "game-bot-api",
  miniApp: "/app/",
  airHockey: "/air-hockey/",
  airHockeyWs: "/ws/air-hockey",
  presenceWs: "/ws/presence",
  botMode,
  webhookPath: botMode === "webhook" ? webhookPath : null,
  adminBot: Boolean(adminBotToken && adminTelegramIds.size > 0 && botToken),
  adminIdsConfigured: adminTelegramIds.size,
  /** Absolute SQLite path (no secrets). */
  databasePath: dbPersistence.absolutePath,
  users: users.countUsers(),
  dbPersistent: dbPersistence.persistent,
  volumeMount: dbPersistence.volumeMountPath,
  matchmaking: matchmaking.stats,
  online: presence.listOnline().length,
}));

app.get("/api/v1/leaderboard", async (request) => {
  const query = request.query as { limit?: string };
  const limit = Math.min(Math.max(Number(query.limit ?? 10) || 10, 1), 50);
  return { items: users.getLeaderboard(limit) };
});

app.get("/api/v1/online", async () => ({
  users: presence.listOnline(),
}));

/** Authenticated profile bootstrap (initData or dev). */
app.post("/api/v1/me", async (request, reply) => {
  const body = (request.body ?? {}) as IdentityBody;
  const identity = resolveTelegramIdentity(body, {
    botToken,
    allowDevScoreSubmit,
    log: request.log,
  });
  if (!identity.ok) {
    return reply.code(identity.status).send({ error: identity.error });
  }
  const user = upsertFromIdentity(users, identity);
  return {
    user: {
      ...user,
      publicName: publicDisplayName(user),
      game: "Air Hockey",
    },
  };
});

/** Legacy query lookup still used by older clients. */
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
  return {
    user: {
      ...user,
      publicName: publicDisplayName(user),
      game: "Air Hockey",
    },
  };
});

app.patch("/api/v1/me", async (request, reply) => {
  const body = (request.body ?? {}) as IdentityBody & { nickname?: string };
  const identity = resolveTelegramIdentity(body, {
    botToken,
    allowDevScoreSubmit,
    log: request.log,
  });
  if (!identity.ok) {
    return reply.code(identity.status).send({ error: identity.error });
  }
  const user = upsertFromIdentity(users, identity);
  if (typeof body.nickname !== "string") {
    return reply.code(400).send({ error: "nickname required" });
  }
  const updated = users.updateProfile({
    userId: user.id,
    nickname: body.nickname,
  });
  presence.refreshProfile(updated.telegramId);
  return {
    user: {
      ...updated,
      publicName: publicDisplayName(updated),
      game: "Air Hockey",
    },
  };
});

interface AvatarBody extends IdentityBody {
  /** data URL or raw base64 */
  imageBase64?: string;
  mime?: string;
}

app.post("/api/v1/me/avatar", async (request, reply) => {
  const body = (request.body ?? {}) as AvatarBody;
  const identity = resolveTelegramIdentity(body, {
    botToken,
    allowDevScoreSubmit,
    log: request.log,
  });
  if (!identity.ok) {
    return reply.code(identity.status).send({ error: identity.error });
  }
  if (!body.imageBase64?.trim()) {
    return reply.code(400).send({ error: "imageBase64 required" });
  }

  const parsed = parseAvatarPayload(body.imageBase64, body.mime);
  if (!parsed.ok) {
    return reply.code(400).send({ error: parsed.error });
  }

  const user = upsertFromIdentity(users, identity);
  const fileName = `${user.id}.${parsed.ext}`;
  const abs = join(avatarRoot, fileName);
  writeFileSync(abs, parsed.buffer);
  const avatarUrl = `/avatars/${fileName}?v=${createHash("sha1").update(parsed.buffer).digest("hex").slice(0, 8)}`;
  const updated = users.updateProfile({
    userId: user.id,
    avatarUrl: `/avatars/${fileName}`,
  });
  presence.refreshProfile(updated.telegramId);
  return {
    user: {
      ...updated,
      publicName: publicDisplayName(updated),
      game: "Air Hockey",
      avatarUrl,
    },
  };
});

app.get("/avatars/:file", async (request, reply) => {
  const params = request.params as { file: string };
  const file = params.file;
  if (!/^[a-zA-Z0-9._-]+$/.test(file) || file.includes("..")) {
    return reply.code(400).send({ error: "invalid file" });
  }
  const abs = join(avatarRoot, file);
  if (!existsSync(abs)) {
    return reply.code(404).send({ error: "not found" });
  }
  const ext = extname(file).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  return reply
    .type(type)
    .header("Cache-Control", "public, max-age=86400")
    .send(createReadStream(abs));
});

interface ScoreBody extends IdentityBody {
  points?: number;
  game?: string;
  mode?: string;
  meta?: Record<string, unknown>;
}

app.post("/api/v1/scores", async (request, reply) => {
  const body = (request.body ?? {}) as ScoreBody;
  const game = body.game ?? "air_hockey";
  if (game !== "air_hockey") {
    return reply.code(400).send({
      error: "faqat air_hockey qo‘llab-quvvatlanadi",
    });
  }

  const identity = resolveTelegramIdentity(body, {
    botToken,
    allowDevScoreSubmit,
    log: request.log,
  });
  if (!identity.ok) {
    return reply.code(identity.status).send({ error: identity.error });
  }

  if (body.mode === "online") {
    return reply.code(400).send({
      error: "online air hockey results are server-authoritative",
    });
  }

  // Offline never awards points (product rule) — do not mutate rating/totals.
  const user = upsertFromIdentity(users, identity);
  users.touchLastSeen(user.id);

  return {
    ok: true,
    pointsAwarded: 0,
    score: null,
    user,
    note: "Offline o‘yin ball bermaydi",
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

app.get("/", async (_request, reply) => reply.redirect("/app/", 302));
app.get("/app", async (_request, reply) => reply.redirect("/app/", 302));
app.get("/app/shop", async (_request, reply) =>
  reply.redirect("/app/shop/", 302),
);
app.get("/air-hockey", async (_request, reply) =>
  reply.redirect("/air-hockey/", 302),
);

let bot: ReturnType<typeof createBot> | null = null;

// Bot instance is needed for webhook handling and admin /start broadcast.
if (botToken) {
  bot = createBot({ token: botToken, users, webAppUrl });
} else if (botMode === "webhook") {
  app.log.error(
    "BOT_MODE=webhook requires TELEGRAM_BOT_TOKEN — webhook not registered",
  );
}

if (botMode === "webhook" && bot) {
  const handleUpdate = webhookCallback(bot, "fastify", {
    secretToken: webhookSecret,
  });
  app.post(webhookPath, async (request, reply) => {
    await handleUpdate(request, reply);
  });
  app.log.info(`Telegram webhook route ready at POST ${webhookPath}`);
}

registerAdminRoutes(app, { users, matchmaking, bot, webAppUrl });

/** Separate admin bot (long polling). Delivers to players via TELEGRAM_BOT_TOKEN. */
let adminBot: ReturnType<typeof createAdminBot> | null = null;
if (adminBotToken && botToken && adminTelegramIds.size > 0) {
  adminBot = createAdminBot({
    adminToken: adminBotToken,
    deliveryToken: botToken,
    users,
    adminTelegramIds,
    webAppUrl,
    getLiveStats: () => ({
      onlineCount: presence.listOnline().length,
      activeRooms: matchmaking.stats.activeRooms,
      queueDepth: matchmaking.stats.queueDepth,
    }),
  });
  app.log.info(
    `Admin bot configured for ids: ${[...adminTelegramIds].join(", ")}`,
  );
} else if (adminBotToken && adminTelegramIds.size === 0) {
  app.log.warn(
    "ADMIN_BOT_TOKEN set but ADMIN_TELEGRAM_IDS empty — admin bot not started. Add your numeric Telegram id.",
  );
} else if (adminBotToken && !botToken) {
  app.log.warn(
    "ADMIN_BOT_TOKEN set but TELEGRAM_BOT_TOKEN missing — cannot deliver broadcasts.",
  );
}

const publicRoot = resolve(__dirname, "../public");
if (existsSync(publicRoot)) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });
}

const shutdown = async () => {
  try {
    if (adminBot) await adminBot.stop();
  } catch {
    /* ignore */
  }
  presence.destroy();
  matchmaking.destroy();
  await app.close();
  users.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host, port });
app.log.info(`Mini App shell:       http://${host}:${port}/app/`);
app.log.info(`Air Hockey Mini App:  http://${host}:${port}/air-hockey/`);
app.log.info(`Air Hockey WS:        ws://${host}:${port}/ws/air-hockey`);
app.log.info(`Presence WS:          ws://${host}:${port}/ws/presence`);
app.log.info(
  `SQLite: ${dbPersistence.absolutePath} · users=${users.countUsers()} · persistent=${dbPersistence.persistent}`,
);
if (dbPersistence.warning) {
  app.log.warn(dbPersistence.warning);
}
app.log.info(`Avatars dir:          ${avatarRoot}`);

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
      if (miniAppUrl) app.log.info(`Mini App Menu Button URL: ${miniAppUrl}`);
      if (airHockeyUrl) app.log.info(`Air Hockey WebApp: ${airHockeyUrl}`);
    } catch (err) {
      app.log.error({ err }, `failed to setWebhook(${webhookUrl})`);
    }
  }
}

if (adminBot) {
  // Drop any stale webhook so long polling can run beside the game webhook bot.
  try {
    await adminBot.api.deleteWebhook({ drop_pending_updates: false });
  } catch (err) {
    app.log.warn({ err }, "admin bot deleteWebhook failed (continuing)");
  }
  void adminBot.start({
    onStart: (info) => {
      app.log.info(`Admin bot @${info.username} long-polling`);
    },
  });
}

function parseAvatarPayload(
  raw: string,
  mimeHint?: string,
):
  | { ok: true; buffer: Buffer; ext: string }
  | { ok: false; error: string } {
  let mime = mimeHint?.trim() || "image/jpeg";
  let b64 = raw.trim();
  const dataUrl = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(b64);
  if (dataUrl) {
    mime = dataUrl[1]!.toLowerCase();
    b64 = dataUrl[2]!;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "base64 decode failed" };
  }
  if (!buffer.length) return { ok: false, error: "empty image" };
  if (buffer.length > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: `rasm juda katta (max ${Math.floor(MAX_AVATAR_BYTES / 1024)}KB)`,
    };
  }
  const ext =
    mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : "jpg";
  return { ok: true, buffer, ext };
}
