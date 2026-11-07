import { Bot, InlineKeyboard, type Context } from "grammy";
import type { createUserRepository } from "@mcee77/db";
import { BTN, mainKeyboard } from "./keyboard.js";
import {
  airHockeyOpenMessage,
  leaderboardMessage,
  profileMessage,
  rocketBirdOpenMessage,
  welcomeMessage,
} from "./text.js";

export type UserRepository = ReturnType<typeof createUserRepository>;

export interface CreateBotOptions {
  token: string;
  users: UserRepository;
  /** Public HTTPS origin (no trailing slash). Used for Mini App WebApp buttons. */
  webAppUrl?: string;
}

function gameUrl(
  webAppUrl: string,
  path: "rocket-bird" | "air-hockey",
): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith(`/${path}`)) return `${webAppUrl}/`;
  return `${webAppUrl}/${path}/`;
}

/**
 * Build the grammY bot with all MVP handlers. Used by long-polling entry
 * and by the API webhook adapter in production.
 */
export function createBot(options: CreateBotOptions): Bot {
  const { token, users } = options;
  const webAppUrl = options.webAppUrl?.trim().replace(/\/?$/, "") ?? "";
  const rocketBirdUrl = gameUrl(webAppUrl, "rocket-bird");
  const airHockeyUrl = gameUrl(webAppUrl, "air-hockey");

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

  function webAppKeyboard(
    label: string,
    url: string,
  ): InlineKeyboard | undefined {
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
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: mainKeyboard(),
    });
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
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: mainKeyboard(),
    });
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

  return bot;
}

export function resolveWebAppUrls(webAppUrlRaw: string | undefined): {
  webAppUrl: string;
  rocketBirdUrl: string;
  airHockeyUrl: string;
} {
  const webAppUrl = webAppUrlRaw?.trim().replace(/\/?$/, "") ?? "";
  return {
    webAppUrl,
    rocketBirdUrl: gameUrl(webAppUrl, "rocket-bird"),
    airHockeyUrl: gameUrl(webAppUrl, "air-hockey"),
  };
}
