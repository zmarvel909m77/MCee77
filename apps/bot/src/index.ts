import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { openDatabase } from "@mcee77/db";
import { createBot } from "./create-bot.js";
import { resolveWebAppUrls } from "./urls.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error(
    "TELEGRAM_BOT_TOKEN is missing. Copy .env.example → .env and set the token from BotFather.",
  );
  process.exit(1);
}

const webAppUrl =
  process.env.WEBAPP_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "");

const { miniAppUrl, karateUrl } = resolveWebAppUrls(webAppUrl);

const { users, config: dbConfig } = await openDatabase();
const dbPersistence = dbConfig.persistence;
const userCount = await users.countUsers();
console.log(
  `[db] driver=${dbPersistence.driver}` +
    (dbPersistence.absolutePath
      ? ` path=${dbPersistence.absolutePath}`
      : " path=(postgres)") +
    ` users=${userCount}` +
    ` persistent=${dbPersistence.persistent}`,
);
if (dbPersistence.warning) {
  console.warn(`[db] WARNING: ${dbPersistence.warning}`);
}

const bot = createBot({ token, users, webAppUrl });

const shutdown = () => {
  void users.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("GAME BOT starting (long polling)…");
if (miniAppUrl) console.log(`Mini App Menu Button URL: ${miniAppUrl}`);
if (karateUrl) console.log(`Karate Strike WebApp URL: ${karateUrl}`);
if (!miniAppUrl) {
  console.log("WEBAPP_URL not set — Mini App buttons will show setup hint.");
}

await bot.start({
  onStart: (info) => {
    console.log(`Bot @${info.username} is running`);
  },
});
