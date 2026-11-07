import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createUserRepository } from "@mcee77/db";
import { createBot, resolveWebAppUrls } from "./create-bot.js";

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

const { rocketBirdUrl, airHockeyUrl } = resolveWebAppUrls(webAppUrl);

const databasePath =
  process.env.DATABASE_PATH ?? resolve(process.cwd(), "../../data/gamebot.sqlite");
const users = createUserRepository(databasePath);

const bot = createBot({ token, users, webAppUrl });

const shutdown = () => {
  users.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("GAME BOT starting (long polling)…");
if (rocketBirdUrl) console.log(`Rocket Bird WebApp URL: ${rocketBirdUrl}`);
if (airHockeyUrl) console.log(`Air Hockey WebApp URL: ${airHockeyUrl}`);
if (!rocketBirdUrl && !airHockeyUrl) {
  console.log("WEBAPP_URL not set — game buttons will show setup hint.");
}

await bot.start({
  onStart: (info) => {
    console.log(`Bot @${info.username} is running`);
  },
});
