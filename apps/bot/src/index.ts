import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Bot, InlineKeyboard, type Context } from "grammy";
import { createUserRepository } from "@mcee77/db";
import { BTN, mainKeyboard } from "./keyboard.js";
import {
  airHockeyOpenMessage,
  leaderboardMessage,
  profileMessage,
  rocketBirdOpenMessage,
  welcomeMessage,
} from "./text.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error(
    "TELEGRAM_BOT_TOKEN is missing. Copy .env.example → .env and set the token from BotFather.",
  );
  process.exit(1);
}

const webAppUrl = process.env.WEBAPP_URL?.trim().replace(/\/?$/, "") ?? "";

function gameUrl(path: "rocket-bird" | "air-hockey"): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith(`/${path}`)) return `${webAppUrl}/`;
  return `${webAppUrl}/${path}/`;
}

const rocketBirdUrl = gameUrl("rocket-bird");
const airHockeyUrl = gameUrl("air-hockey");

const databasePath =
  process.env.DATABASE_PATH ?? resolve(process.cwd(), "../../data/gamebot.sqlite");
const users = createUserRepository(databasePath);

const bot = new Bot(token);

function displayNameFrom(ctx: Context): string {
  const from = ctx.from;
  if (!from) return "O‘yinchi";
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ");
  return full || from.username || "O‘yinchi";
}

function upsertFromContext(ctx: Context) {
  const from = ctx.from;
  if (!from) return null;
  return users.upsertByTelegramId({
    telegramId: from.id,
    username: from.username ?? null,
    displayName: displayNameFrom(ctx),
  });
}

function webAppKeyboard(label: string, url: string): InlineKeyboard | undefined {
  if (!url) return undefined;
  return new InlineKeyboard().webApp(label, url);
}

bot.command("start", async (ctx) => {
  const user = upsertFromContext(ctx);
  const name = user?.displayName ?? displayNameFrom(ctx);
  await ctx.reply(welcomeMessage(name), { reply_markup: mainKeyboard() });
});

bot.command("profile", async (ctx) => {
  const user = upsertFromContext(ctx);
  if (!user) {
    await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
    return;
  }
  await ctx.reply(profileMessage(user), { reply_markup: mainKeyboard() });
});

bot.command("rating", async (ctx) => {
  upsertFromContext(ctx);
  const board = users.getLeaderboard(10);
  await ctx.reply(leaderboardMessage(board), { reply_markup: mainKeyboard() });
});

bot.hears(BTN.rocketBird, async (ctx) => {
  upsertFromContext(ctx);
  const inline = webAppKeyboard("🚀 O‘ynash", rocketBirdUrl);
  await ctx.reply(rocketBirdOpenMessage(Boolean(inline)), {
    reply_markup: inline ?? mainKeyboard(),
  });
});

bot.hears(BTN.airHockey, async (ctx) => {
  upsertFromContext(ctx);
  const inline = webAppKeyboard("🏒 O‘ynash", airHockeyUrl);
  await ctx.reply(airHockeyOpenMessage(Boolean(inline)), {
    reply_markup: inline ?? mainKeyboard(),
  });
});

bot.hears(BTN.rating, async (ctx) => {
  upsertFromContext(ctx);
  const board = users.getLeaderboard(10);
  await ctx.reply(leaderboardMessage(board), { reply_markup: mainKeyboard() });
});

bot.hears(BTN.profile, async (ctx) => {
  const user = upsertFromContext(ctx);
  if (!user) {
    await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
    return;
  }
  await ctx.reply(profileMessage(user), { reply_markup: mainKeyboard() });
});

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

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
