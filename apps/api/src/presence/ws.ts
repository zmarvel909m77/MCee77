import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { UserRepository } from "@mcee77/db";
import {
  displayNameFromTelegramUser,
  publicDisplayName,
  verifyTelegramInitData,
} from "@mcee77/shared";
import { PresenceService } from "./presence.js";

interface PresenceHello {
  type: "hello" | "heartbeat" | "invite" | "invite_response" | "refresh";
  initData?: string;
  devTelegramId?: number;
  displayName?: string;
  toTelegramId?: number;
  inviteId?: string;
  accept?: boolean;
}

export function registerPresenceWs(
  app: FastifyInstance,
  opts: {
    users: UserRepository;
    botToken: string;
    allowDevScoreSubmit: boolean;
  },
): PresenceService {
  const presence = new PresenceService(opts.users);

  app.get(
    "/ws/presence",
    { websocket: true },
    (socket: WebSocket, _request) => {
      let telegramId: number | null = null;

      socket.on("message", (buf: Buffer | ArrayBuffer | Buffer[]) => {
        const raw = Buffer.isBuffer(buf)
          ? buf.toString()
          : Array.isArray(buf)
            ? Buffer.concat(buf).toString()
            : Buffer.from(buf).toString();

        let msg: PresenceHello;
        try {
          msg = JSON.parse(raw) as PresenceHello;
        } catch {
          safeSend(socket, { type: "error", message: "Noto‘g‘ri JSON" });
          return;
        }

        if (msg.type === "hello") {
          void (async () => {
            try {
              const authed = await authenticatePresence(msg, opts);
              telegramId = authed.telegramId;
              presence.connect(socket, authed);
              safeSend(socket, {
                type: "welcome",
                telegramId: authed.telegramId,
                displayName: authed.displayName,
                users: presence.listOnline(authed.telegramId),
              });
            } catch (err) {
              safeSend(socket, {
                type: "error",
                message: err instanceof Error ? err.message : "Auth xato",
              });
              socket.close();
            }
          })();
          return;
        }

        if (telegramId === null) {
          safeSend(socket, { type: "error", message: "Avval hello yuboring" });
          return;
        }

        if (msg.type === "heartbeat") {
          presence.heartbeat(telegramId);
          safeSend(socket, { type: "pong", t: Date.now() });
          return;
        }

        if (msg.type === "refresh") {
          void presence.refreshProfile(telegramId);
          return;
        }

        if (msg.type === "invite" && typeof msg.toTelegramId === "number") {
          presence.sendInvite(telegramId, msg.toTelegramId);
          return;
        }

        if (
          msg.type === "invite_response" &&
          typeof msg.inviteId === "string" &&
          typeof msg.accept === "boolean"
        ) {
          presence.respondInvite(telegramId, msg.inviteId, msg.accept);
          return;
        }
      });

      socket.on("close", () => {
        presence.disconnect(socket);
      });

      socket.on("error", () => {
        presence.disconnect(socket);
      });
    },
  );

  return presence;
}

async function authenticatePresence(
  msg: PresenceHello,
  opts: {
    users: UserRepository;
    botToken: string;
    allowDevScoreSubmit: boolean;
  },
): Promise<{
  userId: string;
  telegramId: number;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
}> {
  let telegramId: number;
  let username: string | null = null;
  let displayName: string;

  if (msg.initData?.trim()) {
    if (!opts.botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
    }
    const verified = verifyTelegramInitData(msg.initData, opts.botToken);
    telegramId = verified.user.id;
    username = verified.user.username ?? null;
    displayName = displayNameFromTelegramUser(verified.user);
  } else if (opts.allowDevScoreSubmit && msg.devTelegramId) {
    telegramId = Number(msg.devTelegramId);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      throw new Error("devTelegramId noto‘g‘ri");
    }
    displayName = msg.displayName?.trim() || `Dev ${telegramId}`;
  } else {
    throw new Error("initData kerak (yoki ALLOW_DEV_SCORE_SUBMIT)");
  }

  const user = await opts.users.upsertByTelegramId({
    telegramId,
    username,
    displayName,
  });

  return {
    userId: user.id,
    telegramId,
    displayName: publicDisplayName(user),
    avatarUrl: user.avatarUrl,
    rating: user.rating,
  };
}

function safeSend(socket: WebSocket, msg: Record<string, unknown>): void {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}
