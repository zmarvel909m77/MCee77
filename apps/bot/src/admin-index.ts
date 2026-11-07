/**
 * Standalone long-polling entry for the separate admin bot.
 * Prefer starting via the API process when ADMIN_BOT_TOKEN is set;
 * this script is for local/dev if you want the admin bot alone.
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createUserRepository } from "@mcee77/db";
import { parseAdminTelegramIds } from "./admin-config.js";
import { createAdminBot } from "./create-admin-bot.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const adminToken = process.env.ADMIN_BOT_TOKEN?.trim();
const deliveryToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
const adminIdsRaw = process.env.ADMIN_TELEGRAM_IDS?.trim() ?? "";

if (!adminToken) {
  console.error("ADMIN_BOT_TOKEN is missing.");
  process.exit(1);
}
if (!deliveryToken) {
  console.error(
    "TELEGRAM_BOT_TOKEN is missing (needed to deliver broadcasts to game users).",
  );
  process.exit(1);
}

const adminIds = parseAdminTelegramIds(adminIdsRaw);
if (adminIds.size === 0) {
  console.error(
    "ADMIN_TELEGRAM_IDS is empty — set your numeric Telegram user id (comma-separated OK).",
  );
  process.exit(1);
}

const webAppUrl =
  process.env.WEBAPP_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "");

const databasePath =
  process.env.DATABASE_PATH ??
  resolve(process.cwd(), "../../data/gamebot.sqlite");
const users = createUserRepository(databasePath);

const bot = createAdminBot({
  adminToken,
  deliveryToken,
  users,
  adminTelegramIds: adminIds,
  webAppUrl,
  getLiveStats: () => ({
    onlineCount: 0,
    activeRooms: 0,
    queueDepth: 0,
  }),
});

const shutdown = () => {
  users.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("GAME BOT admin bot starting (long polling)…");
console.log(`Allowlisted admin ids: ${[...adminIds].join(", ")}`);

await bot.start({
  onStart: (info) => {
    console.log(`Admin bot @${info.username} is running`);
  },
});
