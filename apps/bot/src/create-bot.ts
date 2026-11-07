import { Bot, InlineKeyboard, type Context } from "grammy";
import type { UserRepository } from "@mcee77/db";
import { publicDisplayName } from "@mcee77/shared";
import { BTN, CB } from "./keyboard.js";
import {
  airHockeyOpenMessage,
  leaderboardMessage,
  profileMessage,
  shopUnavailableMessage,
} from "./text.js";
import { sendStartWelcome } from "./start-welcome.js";
import { appUrl, shopUrl } from "./urls.js";

export {
  broadcastStartWelcome,
  buildStartWelcomeText,
  sendStartWelcome,
  type BroadcastRecipient,
  type BroadcastStartResult,
} from "./start-welcome.js";
export {
  createAdminBot,
  parseAdminTelegramIds,
  type CreateAdminBotOptions,
} from "./create-admin-bot.js";
export { resolveWebAppUrls } from "./urls.js";
export {
  broadcastAdminMessage,
  type BroadcastMessageResult,
} from "./broadcast-message.js";

export type { UserRepository };

export interface CreateBotOptions {
  token: string;
  users: UserRepository;
  /** Public HTTPS origin (no trailing slash). Used for Mini App WebApp buttons. */
  webAppUrl?: string;
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

  async function upsertFromContext(ctx: Context) {
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

  bot.command("start", async (ctx) => {
    const user = await upsertFromContext(ctx);
    const name = user ? publicDisplayName(user) : displayNameFrom(ctx);
    if (!ctx.chat) return;

    await sendStartWelcome({
      api: ctx.api,
      chatId: ctx.chat.id,
      displayName: name,
      miniAppUrl: miniApp,
    });
  });

  bot.callbackQuery(CB.shop, async (ctx) => {
    await ctx.answerCallbackQuery();
    await upsertFromContext(ctx);
    const inline = shopApp
      ? new InlineKeyboard().webApp("Magazin", shopApp)
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
    const user = await upsertFromContext(ctx);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start ni bosing.");
      return;
    }
    await ctx.reply(profileMessage(user), {
      reply_markup: openAppInline("Profilni ochish"),
    });
  });

  bot.command("rating", async (ctx) => {
    await upsertFromContext(ctx);
    const board = await users.getLeaderboard(10);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: openAppInline("Reytingni ochish"),
    });
  });

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}
