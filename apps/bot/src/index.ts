import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Bot, type Context } from "grammy";
import { createUserRepository } from "@mcee77/db";
import { BTN, mainKeyboard } from "./keyboard.js";
import {
  airHockeySoon,
  leaderboardMessage,
  profileMessage,
  rocketBirdSoon,
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
  await ctx.reply(rocketBirdSoon, { reply_markup: mainKeyboard() });
});

bot.hears(BTN.airHockey, async (ctx) => {
  upsertFromContext(ctx);
  await ctx.reply(airHockeySoon, { reply_markup: mainKeyboard() });
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
await bot.start({
  onStart: (info) => {
    console.log(`Bot @${info.username} is running`);
  },
});
