import { Api, InputFile } from "grammy";
import type { Message } from "@grammyjs/types";
import { isTelegramBlockedOrGone } from "./start-welcome.js";

const SEND_RATE_PER_SEC = 28;

export interface BroadcastMessageResult {
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

export interface RelayMessageOptions {
  /** Game bot API (@mcee77bot) — delivers to players. */
  deliveryApi: Api;
  /** Admin bot API that received the message. */
  sourceApi: Api;
  /** Admin bot token — required to download media for re-upload. */
  sourceBotToken: string;
  toChatId: number;
  message: Message;
}

/**
 * Re-send an admin-bot message via the game bot.
 * file_id is bot-specific, so media is downloaded from the admin bot and
 * uploaded again as @mcee77bot.
 */
export async function relayAdminMessage(
  opts: RelayMessageOptions,
): Promise<void> {
  const { deliveryApi, sourceApi, message, toChatId, sourceBotToken } = opts;
  const caption = message.caption;

  async function fileUrl(fileId: string): Promise<URL> {
    const file = await sourceApi.getFile(fileId);
    if (!file.file_path) throw new Error("Telegram file_path missing");
    return new URL(
      `https://api.telegram.org/file/bot${sourceBotToken}/${file.file_path}`,
    );
  }

  if (message.text) {
    await deliveryApi.sendMessage(toChatId, message.text);
    return;
  }
  if (message.photo?.length) {
    const best = message.photo[message.photo.length - 1]!;
    await deliveryApi.sendPhoto(
      toChatId,
      new InputFile(await fileUrl(best.file_id)),
      { caption },
    );
    return;
  }
  if (message.video) {
    await deliveryApi.sendVideo(
      toChatId,
      new InputFile(await fileUrl(message.video.file_id)),
      { caption },
    );
    return;
  }
  if (message.animation) {
    await deliveryApi.sendAnimation(
      toChatId,
      new InputFile(await fileUrl(message.animation.file_id)),
      { caption },
    );
    return;
  }
  if (message.document) {
    await deliveryApi.sendDocument(
      toChatId,
      new InputFile(await fileUrl(message.document.file_id)),
      { caption },
    );
    return;
  }
  if (message.audio) {
    await deliveryApi.sendAudio(
      toChatId,
      new InputFile(await fileUrl(message.audio.file_id)),
      { caption },
    );
    return;
  }
  if (message.voice) {
    await deliveryApi.sendVoice(
      toChatId,
      new InputFile(await fileUrl(message.voice.file_id)),
    );
    return;
  }
  if (message.video_note) {
    await deliveryApi.sendVideoNote(
      toChatId,
      new InputFile(await fileUrl(message.video_note.file_id)),
    );
    return;
  }
  if (message.sticker) {
    await deliveryApi.sendSticker(
      toChatId,
      new InputFile(await fileUrl(message.sticker.file_id)),
    );
    return;
  }

  throw new Error("unsupported message type for admin broadcast");
}

export interface BroadcastMessageOptions {
  deliveryApi: Api;
  sourceApi: Api;
  sourceBotToken: string;
  recipients: Array<{ telegramId: number }>;
  message: Message;
  /** Skip broadcasting back to the admin chat id(s). */
  skipTelegramIds?: Set<number>;
  ratePerSec?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Fan-out an admin message to every game user (rate-limited). */
export async function broadcastAdminMessage(
  opts: BroadcastMessageOptions,
): Promise<BroadcastMessageResult> {
  const rate = Math.max(1, Math.min(opts.ratePerSec ?? SEND_RATE_PER_SEC, 30));
  const gapMs = Math.ceil(1000 / rate);
  const started = Date.now();
  let sent = 0;
  let blocked = 0;
  let failed = 0;

  const targets = opts.recipients.filter(
    (r) => !opts.skipTelegramIds?.has(r.telegramId),
  );
  const total = targets.length;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]!;
    try {
      await relayAdminMessage({
        deliveryApi: opts.deliveryApi,
        sourceApi: opts.sourceApi,
        sourceBotToken: opts.sourceBotToken,
        toChatId: row.telegramId,
        message: opts.message,
      });
      sent += 1;
    } catch (err) {
      if (isTelegramBlockedOrGone(err)) {
        blocked += 1;
      } else {
        failed += 1;
        console.error(
          `broadcast message failed for ${row.telegramId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    opts.onProgress?.(i + 1, total);
    if (i + 1 < total) await sleep(gapMs);
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

export function messageLooksBroadcastable(message: Message): boolean {
  return Boolean(
    message.text ||
      message.photo ||
      message.video ||
      message.animation ||
      message.document ||
      message.audio ||
      message.voice ||
      message.video_note ||
      message.sticker,
  );
}
