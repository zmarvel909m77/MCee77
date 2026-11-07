import { Bot, InlineKeyboard, type Context } from "grammy";
import type { createUserRepository } from "@mcee77/db";
import { publicDisplayName, type FeatureFlagKey } from "@mcee77/shared";
import { BTN, mainKeyboard } from "./keyboard.js";
import {
  airHockeyOpenMessage,
  leaderboardMessage,
  profileMessage,
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

function appUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith("/app")) return `${webAppUrl}/`;
  return `${webAppUrl}/app/`;
}

function airHockeyGameUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith("/air-hockey")) return `${webAppUrl}/`;
  return `${webAppUrl}/air-hockey/`;
}

/**
 * Build the grammY bot with all MVP handlers. Used by long-polling entry
 * and by the API webhook adapter in production.
 */
export function createBot(options: CreateBotOptions): Bot {
  const { token, users } = options;
  const webAppUrl = options.webAppUrl?.trim().replace(/\/?$/, "") ?? "";
  const miniApp = appUrl(webAppUrl);

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
    return mainKeyboard({ flags: flags(), miniAppUrl: miniApp });
  }

  function openAppInline(label = "OCHISH"): InlineKeyboard | undefined {
    if (!miniApp) return undefined;
    return new InlineKeyboard().webApp(label, miniApp);
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
    const name = user ? publicDisplayName(user) : displayNameFrom(ctx);
    const inline = openAppInline("OCHISH");
    // Inline OCHISH for chat; also refresh reply keyboard with WebApp + shortcuts.
    await ctx.reply(welcomeMessage(name), {
      reply_markup: inline ?? replyMarkup(),
    });
    await ctx.reply("Menyu:", { reply_markup: replyMarkup() });
  });

  bot.command("profile", async (ctx) => {
    if (await refuseIfDisabled(ctx, "profile")) return;
    const user = upsertFromContext(ctx);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
      return;
    }
    await ctx.reply(profileMessage(user), {
      reply_markup: openAppInline("Profilni ochish") ?? replyMarkup(),
    });
  });

  bot.command("rating", async (ctx) => {
    if (await refuseIfDisabled(ctx, "rating")) return;
    upsertFromContext(ctx);
    const board = users.getLeaderboard(10);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: openAppInline("Reytingni ochish") ?? replyMarkup(),
    });
  });

  bot.hears(BTN.play, async (ctx) => {
    const f = flags();
    if (!f.mini_app && !f.air_hockey) {
      await ctx.reply(sectionDisabledMessage("mini_app"), {
        reply_markup: replyMarkup(),
      });
      return;
    }
    upsertFromContext(ctx);
    const inline = openAppInline("O‘ynash");
    await ctx.reply(airHockeyOpenMessage(Boolean(inline || miniApp)), {
      reply_markup: inline ?? replyMarkup(),
    });
  });

  bot.hears(BTN.rating, async (ctx) => {
    if (await refuseIfDisabled(ctx, "rating")) return;
    upsertFromContext(ctx);
    const board = users.getLeaderboard(10);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: openAppInline("Reytingni ochish") ?? replyMarkup(),
    });
  });

  bot.hears(BTN.profile, async (ctx) => {
    if (await refuseIfDisabled(ctx, "profile")) return;
    const user = upsertFromContext(ctx);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
      return;
    }
    await ctx.reply(profileMessage(user), {
      reply_markup: openAppInline("Profilni ochish") ?? replyMarkup(),
    });
  });

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}

export function resolveWebAppUrls(webAppUrlRaw: string | undefined): {
  webAppUrl: string;
  miniAppUrl: string;
  airHockeyUrl: string;
} {
  const webAppUrl = webAppUrlRaw?.trim().replace(/\/?$/, "") ?? "";
  return {
    webAppUrl,
    miniAppUrl: appUrl(webAppUrl),
    airHockeyUrl: airHockeyGameUrl(webAppUrl),
  };
}
