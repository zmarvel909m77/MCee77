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
  firstError?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Welcome body shared by /start and admin broadcast. */
export function buildStartWelcomeText(displayName: string): string {
  return welcomeMessage(displayName);
}

export function isTelegramBlockedOrGone(err: unknown): boolean {
  if (!(err instanceof GrammyError)) return false;
  // 403: blocked / user deactivated
  if (err.error_code === 403) return true;
  // Narrow 400s — do not treat every Bad Request as "blocked"
  if (err.error_code !== 400) return false;
  const desc = (err.description ?? err.message).toLowerCase();
  return (
    desc.includes("chat not found") ||
    desc.includes("user is deactivated") ||
    desc.includes("peer_id_invalid")
  );
}

function telegramErrorDetail(err: unknown): string {
  if (err instanceof GrammyError) {
    const desc = err.description?.trim();
    if (desc) return `Telegram ${err.error_code}: ${desc}`;
    return `Telegram ${err.error_code}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Same payload as /start: remove legacy reply keyboard, then welcome +
 * inline O‘ynash / Do‘kon. Safe to call from bot handlers or admin broadcast.
 */
export async function sendStartWelcome(
  opts: SendStartWelcomeOptions,
): Promise<void> {
  const miniAppUrl = opts.miniAppUrl?.trim() ?? "";
  const text = buildStartWelcomeText(opts.displayName);

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
  let firstError: string | undefined;
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
      });
      sent += 1;
    } catch (err) {
      if (isTelegramBlockedOrGone(err)) {
        blocked += 1;
      } else {
        failed += 1;
        const detail = telegramErrorDetail(err);
        if (!firstError) firstError = detail;
        console.error(
          `broadcast /start failed for ${row.telegramId}: ${detail}`,
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
    firstError,
  };
}
