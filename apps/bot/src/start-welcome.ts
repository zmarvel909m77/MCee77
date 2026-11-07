import { Api, GrammyError } from "grammy";
import { publicDisplayName } from "@mcee77/shared";
import { REMOVE_REPLY_KEYBOARD, startInlineKeyboard } from "./keyboard.js";
import { welcomeMessage } from "./text.js";

/** Stay under Telegram’s ~30 msg/sec global send ceiling. */
const SEND_RATE_PER_SEC = 28;

export interface SendStartWelcomeOptions {
  api: Api;
  chatId: number;
  displayName: string;
  miniAppUrl?: string;
  /**
   * When true, append a brief note that only the user can Clear history
   * (bots cannot wipe private chat). Used for admin broadcast resets.
   */
  clearHistoryHint?: boolean;
}

export interface BroadcastRecipient {
  telegramId: number;
  displayName: string;
  nickname?: string | null;
}

export interface BroadcastStartResult {
  ok: true;
  total: number;
  sent: number;
  blocked: number;
  failed: number;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Welcome body shared by /start and admin broadcast. */
export function buildStartWelcomeText(
  displayName: string,
  opts?: { clearHistoryHint?: boolean },
): string {
  const base = welcomeMessage(displayName);
  if (!opts?.clearHistoryHint) return base;
  return [
    base,
    "",
    "Eski chatni tozalash uchun menyudan «Tozalash» (Clear history) ni tanlang — bot tarixni o‘zi o‘chira olmaydi.",
  ].join("\n");
}

export function isTelegramBlockedOrGone(err: unknown): boolean {
  if (!(err instanceof GrammyError)) return false;
  // 403: blocked / deactivated; 400: chat not found
  return err.error_code === 403 || err.error_code === 400;
}

/**
 * Same payload as /start: remove legacy reply keyboard, then welcome +
 * inline O‘ynash / Do‘kon. Safe to call from bot handlers or admin broadcast.
 */
export async function sendStartWelcome(
  opts: SendStartWelcomeOptions,
): Promise<void> {
  const miniAppUrl = opts.miniAppUrl?.trim() ?? "";
  const text = buildStartWelcomeText(opts.displayName, {
    clearHistoryHint: opts.clearHistoryHint,
  });

  try {
    const rm = await opts.api.sendMessage(opts.chatId, "\u2060", {
      reply_markup: REMOVE_REPLY_KEYBOARD,
    });
    await opts.api
      .deleteMessage(opts.chatId, rm.message_id)
      .catch(() => {});
  } catch {
    /* keyboard may already be gone, or chat unreachable — welcome still attempted */
  }

  await opts.api.sendMessage(opts.chatId, text, {
    reply_markup: startInlineKeyboard({ miniAppUrl }),
  });
}

export interface BroadcastStartOptions {
  api: Api;
  recipients: BroadcastRecipient[];
  miniAppUrl?: string;
  /** Messages per second (default ~28). */
  ratePerSec?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Fan out current /start to every known telegram id.
 * Rate-limited; blocked users counted separately and skipped quietly.
 */
export async function broadcastStartWelcome(
  opts: BroadcastStartOptions,
): Promise<BroadcastStartResult> {
  const rate = Math.max(1, Math.min(opts.ratePerSec ?? SEND_RATE_PER_SEC, 30));
  const gapMs = Math.ceil(1000 / rate);
  const started = Date.now();
  let sent = 0;
  let blocked = 0;
  let failed = 0;
  const total = opts.recipients.length;

  for (let i = 0; i < opts.recipients.length; i++) {
    const row = opts.recipients[i]!;
    const name = publicDisplayName({
      nickname: row.nickname ?? null,
      displayName: row.displayName,
    });

    try {
      await sendStartWelcome({
        api: opts.api,
        chatId: row.telegramId,
        displayName: name,
        miniAppUrl: opts.miniAppUrl,
        clearHistoryHint: true,
      });
      sent += 1;
    } catch (err) {
      if (isTelegramBlockedOrGone(err)) {
        blocked += 1;
      } else {
        failed += 1;
        console.error(
          `broadcast /start failed for ${row.telegramId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    opts.onProgress?.(i + 1, total);
    // Pace by outbound sendMessage (~2 per user); gap keeps peak ≤ rate.
    if (i + 1 < total) await sleep(gapMs * 2);
  }

  return {
    ok: true,
    total,
    sent,
    blocked,
    failed,
    durationMs: Date.now() - started,
  };
}
