import { Api, Bot, type Context } from "grammy";
import type { createUserRepository } from "@mcee77/db";
import { publicDisplayName } from "@mcee77/shared";
import {
  isAdminTelegramId,
  parseAdminTelegramIds,
} from "./admin-config.js";
import {
  ADMIN_BTN,
  adminBroadcastKeyboard,
  adminKeyboard,
} from "./admin-keyboard.js";
import {
  broadcastAdminMessage,
  messageLooksBroadcastable,
} from "./broadcast-message.js";
import { broadcastStartWelcome } from "./start-welcome.js";
import { leaderboardMessage } from "./text.js";
import { resolveWebAppUrls } from "./urls.js";

export type UserRepository = ReturnType<typeof createUserRepository>;

export interface LiveAdminStats {
  onlineCount: number;
  activeRooms: number;
  queueDepth: number;
}

export interface CreateAdminBotOptions {
  /** BotFather token for the separate admin bot. */
  adminToken: string;
  /**
   * Game bot token (@mcee77bot). Used to deliver broadcasts and /start
   * resets to players — admin-bot file_ids cannot be sent as the game bot.
   */
  deliveryToken: string;
  users: UserRepository;
  /** Comma-separated or pre-parsed allowlist. */
  adminTelegramIds: string | Set<number>;
  webAppUrl?: string;
  getLiveStats?: () => LiveAdminStats;
}

/** Admins waiting to send the next message as a fan-out broadcast. */
const pendingBroadcast = new Set<number>();
let resetInFlight = false;
let messageBroadcastInFlight = false;

function formatCounts(result: {
  total: number;
  sent: number;
  blocked: number;
  failed: number;
  durationMs: number;
}): string {
  const sec = Math.round(result.durationMs / 1000);
  return [
    `Yuborildi: ${result.sent}`,
    `Bloklagan: ${result.blocked}`,
    `Xato: ${result.failed}`,
    `Jami: ${result.total}`,
    `Vaqt: ${sec} s`,
  ].join(" · ");
}

/**
 * Separate Telegram admin bot (not the game bot).
 * Only `ADMIN_TELEGRAM_IDS` may use commands/keyboard.
 */
export function createAdminBot(options: CreateAdminBotOptions): Bot {
  const adminIds =
    options.adminTelegramIds instanceof Set
      ? options.adminTelegramIds
      : parseAdminTelegramIds(options.adminTelegramIds);

  const { miniAppUrl } = resolveWebAppUrls(options.webAppUrl);
  const deliveryApi = new Api(options.deliveryToken);
  const bot = new Bot(options.adminToken);

  function isAdmin(ctx: Context): boolean {
    return isAdminTelegramId(adminIds, ctx.from?.id);
  }

  async function deny(ctx: Context): Promise<void> {
    await ctx.reply(
      "Bu bot faqat adminlar uchun. Agar admin bo‘lsangiz, ADMIN_TELEGRAM_IDS ga Telegram id ingizni qo‘shing.",
    );
  }

  function live(): LiveAdminStats {
    return (
      options.getLiveStats?.() ?? {
        onlineCount: 0,
        activeRooms: 0,
        queueDepth: 0,
      }
    );
  }

  function statsText(): string {
    const s = options.users.getAdminStats({
      airHockey: {
        activeRooms: live().activeRooms,
        queueDepth: live().queueDepth,
      },
      topLimit: 5,
    });
    const online = live().onlineCount;
    return [
      "📊 Statistika",
      "",
      `Jami foydalanuvchilar: ${s.totalUsers}`,
      `Online (Mini App): ${online}`,
      `Bugun aktiv: ${s.activeToday}`,
      `24 soatda: ${s.active24h}`,
      `Bugungi o‘yinlar: ${s.gamesToday}`,
      `Air Hockey xonalari: ${s.airHockey.activeRooms}`,
      `Navbat: ${s.airHockey.queueDepth}`,
      "",
      `Yangilangan: ${new Date(s.generatedAt).toLocaleString("uz-UZ")}`,
    ].join("\n");
  }

  async function sendAdminMenu(ctx: Context, preface?: string): Promise<void> {
    const lines = [
      preface,
      "GAME BOT — Admin",
      "",
      "Menyu:",
      `• ${ADMIN_BTN.stats}`,
      `• ${ADMIN_BTN.rating}`,
      `• ${ADMIN_BTN.broadcast} — keyingi matn/media hammaga`,
      `• ${ADMIN_BTN.resetStart} — ReplyKeyboardRemove + yangi /start`,
      "",
      "Buyruqlar: /stats /rating /broadcast /reset_start /cancel",
    ].filter(Boolean) as string[];
    await ctx.reply(lines.join("\n"), { reply_markup: adminKeyboard() });
  }

  async function runResetStart(ctx: Context): Promise<void> {
    if (resetInFlight) {
      await ctx.reply("Yangi /start allaqachon yuborilmoqda — kuting.");
      return;
    }
    resetInFlight = true;
    pendingBroadcast.delete(ctx.from!.id);
    await ctx.reply("Yangi /start yuborilmoqda…");
    try {
      const recipients = options.users.listBroadcastRecipients();
      const result = await broadcastStartWelcome({
        api: deliveryApi,
        recipients,
        miniAppUrl,
      });
      await ctx.reply(`Tayyor.\n${formatCounts(result)}`, {
        reply_markup: adminKeyboard(),
      });
    } catch (err) {
      await ctx.reply(
        `Xato: ${err instanceof Error ? err.message : "yuborish"}`,
        { reply_markup: adminKeyboard() },
      );
    } finally {
      resetInFlight = false;
    }
  }

  bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    if (!isAdmin(ctx)) {
      if (ctx.message || ctx.callbackQuery) await deny(ctx);
      return;
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    pendingBroadcast.delete(ctx.from!.id);
    await sendAdminMenu(ctx, `Salom, admin (id: ${ctx.from!.id}).`);
  });

  bot.command("admin", async (ctx) => {
    pendingBroadcast.delete(ctx.from!.id);
    await sendAdminMenu(ctx);
  });

  bot.command("stats", async (ctx) => {
    await ctx.reply(statsText(), { reply_markup: adminKeyboard() });
  });

  bot.command("rating", async (ctx) => {
    const board = options.users.getLeaderboard(15);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: adminKeyboard(),
    });
  });

  bot.command("broadcast", async (ctx) => {
    pendingBroadcast.add(ctx.from!.id);
    await ctx.reply(
      [
        "📢 Broadcast rejimi",
        "",
        "Keyingi xabaringiz (matn yoki media) barcha o‘yin bot foydalanuvchilariga yuboriladi.",
        "Bekor: /cancel yoki «Bekor qilish».",
      ].join("\n"),
      { reply_markup: adminBroadcastKeyboard() },
    );
  });

  bot.command("reset_start", async (ctx) => {
    await runResetStart(ctx);
  });

  bot.command("cancel", async (ctx) => {
    pendingBroadcast.delete(ctx.from!.id);
    await ctx.reply("Bekor qilindi.", { reply_markup: adminKeyboard() });
  });

  bot.hears(ADMIN_BTN.stats, async (ctx) => {
    await ctx.reply(statsText(), { reply_markup: adminKeyboard() });
  });

  bot.hears(ADMIN_BTN.rating, async (ctx) => {
    const board = options.users.getLeaderboard(15);
    await ctx.reply(leaderboardMessage(board), {
      reply_markup: adminKeyboard(),
    });
  });

  bot.hears(ADMIN_BTN.broadcast, async (ctx) => {
    pendingBroadcast.add(ctx.from!.id);
    await ctx.reply(
      [
        "📢 Broadcast rejimi",
        "",
        "Keyingi xabaringiz (matn yoki media) hammaga yuboriladi.",
        "Bekor: «Bekor qilish» yoki /cancel.",
      ].join("\n"),
      { reply_markup: adminBroadcastKeyboard() },
    );
  });

  bot.hears(ADMIN_BTN.resetStart, async (ctx) => {
    await runResetStart(ctx);
  });

  bot.hears(ADMIN_BTN.cancel, async (ctx) => {
    pendingBroadcast.delete(ctx.from!.id);
    await ctx.reply("Bekor qilindi.", { reply_markup: adminKeyboard() });
  });

  bot.on("message", async (ctx) => {
    const adminId = ctx.from?.id;
    if (!adminId || !pendingBroadcast.has(adminId)) return;

    const msg = ctx.message;
    if (!messageLooksBroadcastable(msg)) {
      await ctx.reply(
        "Bu xabar turini yuborib bo‘lmaydi. Matn, rasm, video, hujjat, ovoz yoki sticker yuboring — yoki /cancel.",
        { reply_markup: adminBroadcastKeyboard() },
      );
      return;
    }

    if (messageBroadcastInFlight) {
      await ctx.reply("Boshqa broadcast hali ketmoqda — kuting.");
      return;
    }

    pendingBroadcast.delete(adminId);
    messageBroadcastInFlight = true;
    await ctx.reply("Hammaga yuborilmoqda…");

    try {
      const recipients = options.users.listBroadcastRecipients();
      const result = await broadcastAdminMessage({
        deliveryApi,
        sourceApi: ctx.api,
        sourceBotToken: options.adminToken,
        recipients,
        message: msg,
        skipTelegramIds: adminIds,
      });
      const top = recipients
        .slice(0, 3)
        .map((r) =>
          publicDisplayName({
            nickname: r.nickname,
            displayName: r.displayName,
          }),
        )
        .join(", ");
      await ctx.reply(
        [
          "Broadcast tayyor.",
          formatCounts(result),
          top ? `Namuna: ${top}${recipients.length > 3 ? "…" : ""}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        { reply_markup: adminKeyboard() },
      );
    } catch (err) {
      await ctx.reply(
        `Xato: ${err instanceof Error ? err.message : "yuborish"}`,
        { reply_markup: adminKeyboard() },
      );
    } finally {
      messageBroadcastInFlight = false;
    }
  });

  bot.catch((err) => {
    console.error("Admin bot error:", err.error);
  });

  return bot;
}

export { parseAdminTelegramIds, isAdminTelegramId } from "./admin-config.js";
