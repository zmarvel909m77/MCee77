import { Bot, InlineKeyboard, type Context } from "grammy";
import type { createUserRepository } from "@mcee77/db";
import type { FeatureFlagKey } from "@mcee77/shared";
import { BTN, mainKeyboard } from "./keyboard.js";
import {
  airHockeyOpenMessage,
  leaderboardMessage,
  profileMessage,
  rocketBirdOpenMessage,
  sectionDisabledMessage,
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

  function flags() {
    return users.getFeatureFlags();
  }

  function replyMarkup() {
    return mainKeyboard(flags());
  }

  function webAppKeyboard(
    label: string,
    url: string,
  ): InlineKeyboard | undefined {
    if (!url) return undefined;
    return new InlineKeyboard().webApp(label, url);
  }

  async function refuseIfDisabled(
    ctx: Context,
    key: FeatureFlagKey,
  ): Promise<boolean> {
    if (flags()[key]) return false;
    await ctx.reply(sectionDisabledMessage(key), {
      reply_markup: replyMarkup(),
    });
    return true;
  }

  bot.command("start", async (ctx) => {
    const user = upsertFromContext(ctx);
    const name = user?.displayName ?? displayNameFrom(ctx);
    await ctx.reply(welcomeMessage(name), { reply_markup: replyMarkup() });
  });

  bot.command("profile", async (ctx) => {
    if (await refuseIfDisabled(ctx, "profile")) return;
    const user = upsertFromContext(ctx);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
      return;
    }
    await ctx.reply(profileMessage(user), { reply_markup: replyMarkup() });
  });

  bot.command("rating", async (ctx) => {
    if (await refuseIfDisabled(ctx, "rating")) return;
    upsertFromContext(ctx);
    const board = users.getLeaderboard(10);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: replyMarkup(),
    });
  });

  bot.hears(BTN.rocketBird, async (ctx) => {
    if (await refuseIfDisabled(ctx, "rocket_bird")) return;
    upsertFromContext(ctx);
    const inline = webAppKeyboard("🚀 O‘ynash", rocketBirdUrl);
    await ctx.reply(rocketBirdOpenMessage(Boolean(inline)), {
      reply_markup: inline ?? replyMarkup(),
    });
  });

  bot.hears(BTN.airHockey, async (ctx) => {
    if (await refuseIfDisabled(ctx, "air_hockey")) return;
    upsertFromContext(ctx);
    const inline = webAppKeyboard("🏒 O‘ynash", airHockeyUrl);
    await ctx.reply(airHockeyOpenMessage(Boolean(inline)), {
      reply_markup: inline ?? replyMarkup(),
    });
  });

  bot.hears(BTN.rating, async (ctx) => {
    if (await refuseIfDisabled(ctx, "rating")) return;
    upsertFromContext(ctx);
    const board = users.getLeaderboard(10);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: replyMarkup(),
    });
  });

  bot.hears(BTN.profile, async (ctx) => {
    if (await refuseIfDisabled(ctx, "profile")) return;
    const user = upsertFromContext(ctx);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
      return;
    }
    await ctx.reply(profileMessage(user), { reply_markup: replyMarkup() });
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
