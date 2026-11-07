import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { UserRepository } from "@mcee77/db";
import {
  displayNameFromTelegramUser,
  publicDisplayName,
  verifyTelegramInitData,
} from "@mcee77/shared";
import { MatchmakingService } from "./matchmaking.js";

interface HelloMessage {
  type: "hello" | "queue" | "reconnect" | "cancel_queue" | "join_invite";
  initData?: string;
  devTelegramId?: number;
  displayName?: string;
  roomToken?: string;
  inviteKey?: string;
}

export function registerAirHockeyWs(
  app: FastifyInstance,
  opts: {
    users: UserRepository;
    botToken: string;
    allowDevScoreSubmit: boolean;
  },
): MatchmakingService {
  const matchmaking = new MatchmakingService(opts.users);

  app.get(
    "/ws/air-hockey",
    { websocket: true },
    (socket: WebSocket, _request) => {
      let authed:
        | {
            userId: string;
            telegramId: number;
            displayName: string;
          }
        | null = null;
      let helloDone = false;

      socket.on("message", (buf: Buffer | ArrayBuffer | Buffer[]) => {
        const raw = Buffer.isBuffer(buf)
          ? buf.toString()
          : Array.isArray(buf)
            ? Buffer.concat(buf).toString()
            : Buffer.from(buf).toString();

        // After hello, non-control messages go to the room (input/ping)
        if (helloDone && authed) {
          let parsed: { type?: string } | null = null;
          try {
            parsed = JSON.parse(raw) as { type?: string };
          } catch {
            return;
          }

          if (parsed?.type === "queue") {
            matchmaking.enqueue({
              userId: authed.userId,
              telegramId: authed.telegramId,
              displayName: authed.displayName,
              socket,
            });
            return;
          }

          if (
            parsed?.type === "join_invite" &&
            typeof (parsed as HelloMessage).inviteKey === "string"
          ) {
            matchmaking.joinInvite({
              userId: authed.userId,
              telegramId: authed.telegramId,
              displayName: authed.displayName,
              socket,
              inviteKey: (parsed as HelloMessage).inviteKey!,
            });
            return;
          }

          if (parsed?.type === "cancel_queue") {
            matchmaking.cancelQueue(authed.telegramId);
            safeSend(socket, { type: "queue_cancelled" });
            return;
          }

          if (parsed?.type === "reconnect" && typeof (parsed as HelloMessage).roomToken === "string") {
            const ok = matchmaking.reconnect({
              roomToken: (parsed as HelloMessage).roomToken!,
              socket,
              telegramId: authed.telegramId,
            });
            if (!ok) {
              safeSend(socket, { type: "error", message: "Qayta ulanish muvaffaqiyatsiz" });
            }
            return;
          }

          matchmaking.routeMessage(socket, raw);
          return;
        }

        // First message must authenticate
        let msg: HelloMessage;
        try {
          msg = JSON.parse(raw) as HelloMessage;
        } catch {
          safeSend(socket, { type: "error", message: "Noto‘g‘ri JSON" });
          return;
        }

        if (msg.type !== "hello") {
          safeSend(socket, { type: "error", message: "Avval hello yuboring" });
          return;
        }

        try {
          authed = authenticate(msg, opts);
        } catch (err) {
          safeSend(socket, {
            type: "error",
            message: err instanceof Error ? err.message : "Auth xato",
          });
          socket.close();
          return;
        }

        helloDone = true;
        safeSend(socket, {
          type: "welcome",
          telegramId: authed.telegramId,
          displayName: authed.displayName,
        });

        if (msg.roomToken) {
          const ok = matchmaking.reconnect({
            roomToken: msg.roomToken,
            socket,
            telegramId: authed.telegramId,
          });
          if (!ok) {
            safeSend(socket, {
              type: "error",
              message: "Xona topilmadi — navbatga qo‘shiling",
            });
          }
        }
      });

      socket.on("close", () => {
        matchmaking.handleDisconnect(socket);
      });

      socket.on("error", () => {
        matchmaking.handleDisconnect(socket);
      });
    },
  );

  return matchmaking;
}

function authenticate(
  msg: HelloMessage,
  opts: {
    users: UserRepository;
    botToken: string;
    allowDevScoreSubmit: boolean;
  },
): { userId: string; telegramId: number; displayName: string } {
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

  const user = opts.users.upsertByTelegramId({
    telegramId,
    username,
    displayName,
  });

  return {
    userId: user.id,
    telegramId,
    displayName: publicDisplayName(user),
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
