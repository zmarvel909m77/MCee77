import { Bot, InlineKeyboard, type Context } from "grammy";
import type { createUserRepository } from "@mcee77/db";
import { publicDisplayName } from "@mcee77/shared";
import {
  BTN,
  CB,
  REMOVE_REPLY_KEYBOARD,
  startInlineKeyboard,
} from "./keyboard.js";
import {
  airHockeyOpenMessage,
  leaderboardMessage,
  profileMessage,
  shopUnavailableMessage,
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

function shopUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  const base = appUrl(webAppUrl);
  return base ? `${base}shop/` : "";
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
  const shopApp = shopUrl(webAppUrl);

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

  function openAppInline(label: string = BTN.open): InlineKeyboard | undefined {
    if (!miniApp) return undefined;
    return new InlineKeyboard().webApp(label, miniApp);
  }

  /** Clear legacy reply keyboard without leaving a visible spam message. */
  async function clearReplyKeyboard(ctx: Context): Promise<void> {
    try {
      const rm = await ctx.reply("\u2060", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      if (ctx.chat) {
        await ctx.api.deleteMessage(ctx.chat.id, rm.message_id).catch(() => {});
      }
    } catch {
      /* ignore — keyboard may already be gone */
    }
  }

  bot.command("start", async (ctx) => {
    const user = upsertFromContext(ctx);
    const name = user ? publicDisplayName(user) : displayNameFrom(ctx);

    await clearReplyKeyboard(ctx);

    await ctx.reply(welcomeMessage(name), {
      reply_markup: startInlineKeyboard({
        miniAppUrl: miniApp,
        // Shop stays a chat callback (polished literary reply); page exists as stub.
      }),
    });
  });

  bot.callbackQuery(CB.shop, async (ctx) => {
    await ctx.answerCallbackQuery();
    upsertFromContext(ctx);
    const inline = shopApp
      ? new InlineKeyboard().webApp("Do‘kon sahifasi", shopApp)
      : undefined;
    await ctx.reply(shopUnavailableMessage(), {
      reply_markup: inline,
    });
  });

  bot.callbackQuery("play_no_webapp", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "WEBAPP_URL sozlanmagan",
      show_alert: true,
    });
    await ctx.reply(airHockeyOpenMessage(false));
  });

  bot.command("profile", async (ctx) => {
    const user = upsertFromContext(ctx);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
      return;
    }
    await ctx.reply(profileMessage(user), {
      reply_markup: openAppInline("Profilni ochish"),
    });
  });

  bot.command("rating", async (ctx) => {
    upsertFromContext(ctx);
    const board = users.getLeaderboard(10);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: openAppInline("Reytingni ochish"),
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
  shopUrl: string;
} {
  const webAppUrl = webAppUrlRaw?.trim().replace(/\/?$/, "") ?? "";
  return {
    webAppUrl,
    miniAppUrl: appUrl(webAppUrl),
    airHockeyUrl: airHockeyGameUrl(webAppUrl),
    shopUrl: shopUrl(webAppUrl),
  };
}
