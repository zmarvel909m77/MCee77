import type { UserRepository } from "@mcee77/db";
import {
  displayNameFromTelegramUser,
  verifyTelegramInitData,
} from "@mcee77/shared";

export interface IdentityBody {
  initData?: string;
  devTelegramId?: number;
  displayName?: string;
}

export type ResolvedIdentity =
  | {
      ok: true;
      telegramId: number;
      username: string | null;
      displayName: string;
    }
  | { ok: false; status: number; error: string };

export function resolveTelegramIdentity(
  body: IdentityBody,
  opts: {
    botToken: string;
    allowDevScoreSubmit: boolean;
    log?: { warn: (obj: unknown, msg?: string) => void };
  },
): ResolvedIdentity {
  if (body.initData?.trim()) {
    if (!opts.botToken) {
      return {
        ok: false,
        status: 503,
        error: "TELEGRAM_BOT_TOKEN not configured; cannot verify initData",
      };
    }
    try {
      const verified = verifyTelegramInitData(body.initData, opts.botToken);
      return {
        ok: true,
        telegramId: verified.user.id,
        username: verified.user.username ?? null,
        displayName: displayNameFromTelegramUser(verified.user),
      };
    } catch (err) {
      opts.log?.warn({ err }, "initData verification failed");
      return { ok: false, status: 401, error: "invalid initData" };
    }
  }

  if (opts.allowDevScoreSubmit && body.devTelegramId) {
    const telegramId = Number(body.devTelegramId);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return { ok: false, status: 400, error: "devTelegramId invalid" };
    }
    opts.log?.warn({ telegramId }, "accepting unauthenticated dev identity");
    return {
      ok: true,
      telegramId,
      username: null,
      displayName:
        body.displayName?.trim() || `Dev ${telegramId}`,
    };
  }

  return {
    ok: false,
    status: 401,
    error: "initData required (or ALLOW_DEV_SCORE_SUBMIT with devTelegramId)",
  };
}

export function upsertFromIdentity(
  users: UserRepository,
  identity: Extract<ResolvedIdentity, { ok: true }>,
) {
  return users.upsertByTelegramId({
    telegramId: identity.telegramId,
    username: identity.username,
    displayName: identity.displayName,
  });
}
