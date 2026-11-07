import { randomUUID } from "node:crypto";
import type { WebSocket } from "@fastify/websocket";
import type { UserRepository } from "@mcee77/db";
import { publicDisplayName, type OnlineUser } from "@mcee77/shared";

interface PresenceClient {
  userId: string;
  telegramId: number;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  /** WebSocket when connected; null for HTTP-only presence pings. */
  socket: WebSocket | null;
  lastHeartbeat: number;
}

interface PendingInvite {
  id: string;
  fromTelegramId: number;
  toTelegramId: number;
  createdAt: number;
  inviteKey: string;
}

const HEARTBEAT_STALE_MS = 45_000;
const INVITE_TTL_MS = 60_000;

/**
 * Mini App presence: who has the shell open + invite handshake.
 * Invite key is consumed by Air Hockey matchmaking (`join_invite`).
 */
export class PresenceService {
  private clients = new Map<number, PresenceClient>();
  private invites = new Map<string, PendingInvite>();
  private users: UserRepository;
  private sweepTimer: NodeJS.Timeout;

  constructor(users: UserRepository) {
    this.users = users;
    this.sweepTimer = setInterval(() => this.sweep(), 10_000);
    this.sweepTimer.unref?.();
  }

  listOnline(excludeTelegramId?: number): OnlineUser[] {
    const items: OnlineUser[] = [];
    for (const c of this.clients.values()) {
      if (excludeTelegramId !== undefined && c.telegramId === excludeTelegramId) {
        continue;
      }
      items.push({
        telegramId: c.telegramId,
        displayName: c.displayName,
        avatarUrl: c.avatarUrl,
        rating: c.rating,
      });
    }
    items.sort((a, b) => a.displayName.localeCompare(b.displayName, "uz"));
    return items;
  }

  connect(
    socket: WebSocket,
    opts: {
      userId: string;
      telegramId: number;
      displayName: string;
      avatarUrl: string | null;
      rating: number;
    },
  ): void {
    const prev = this.clients.get(opts.telegramId);
    if (prev?.socket && prev.socket !== socket) {
      try {
        prev.socket.close();
      } catch {
        /* ignore */
      }
    }

    this.clients.set(opts.telegramId, {
      ...opts,
      socket,
      lastHeartbeat: Date.now(),
    });
    void this.users.touchLastSeen(opts.userId);
    this.broadcastOnline();
  }

  /**
   * HTTP keepalive so Mini App still registers as online when the presence
   * WebSocket is slow to auth, blocked, or silently dropped by a WebView.
   */
  touchHttp(opts: {
    userId: string;
    telegramId: number;
    displayName: string;
    avatarUrl: string | null;
    rating: number;
  }): void {
    const prev = this.clients.get(opts.telegramId);
    this.clients.set(opts.telegramId, {
      ...opts,
      socket: prev?.socket ?? null,
      lastHeartbeat: Date.now(),
    });
    void this.users.touchLastSeen(opts.userId);
    this.broadcastOnline();
  }

  heartbeat(telegramId: number): void {
    const c = this.clients.get(telegramId);
    if (!c) return;
    c.lastHeartbeat = Date.now();
    void this.users.touchLastSeen(c.userId);
  }

  /** Total connected Mini App sessions (includes the viewer). */
  onlineCount(): number {
    return this.clients.size;
  }

  async refreshProfile(telegramId: number): Promise<void> {
    const c = this.clients.get(telegramId);
    if (!c) return;
    const user = await this.users.findByTelegramId(telegramId);
    if (!user) return;
    c.displayName = publicDisplayName(user);
    c.avatarUrl = user.avatarUrl;
    c.rating = user.rating;
    this.broadcastOnline();
  }

  disconnect(socket: WebSocket): void {
    for (const [, c] of this.clients) {
      if (c.socket === socket) {
        // Drop the socket; HTTP /api/v1/presence/ping may keep them online.
        // Do not refresh lastHeartbeat — sweep removes if pings stop.
        c.socket = null;
        this.broadcastOnline();
        return;
      }
    }
  }

  sendInvite(fromTelegramId: number, toTelegramId: number): void {
    const from = this.clients.get(fromTelegramId);
    const to = this.clients.get(toTelegramId);
    if (!from?.socket) return;
    if (!to?.socket) {
      this.send(from.socket, {
        type: "invite_error",
        message: "O‘yinchi onlayn emas",
      });
      return;
    }
    if (fromTelegramId === toTelegramId) {
      this.send(from.socket, {
        type: "invite_error",
        message: "O‘zingizni taklif qila olmaysiz",
      });
      return;
    }

    // Drop older invites involving these two
    for (const [id, inv] of this.invites) {
      if (
        (inv.fromTelegramId === fromTelegramId &&
          inv.toTelegramId === toTelegramId) ||
        (inv.fromTelegramId === toTelegramId &&
          inv.toTelegramId === fromTelegramId)
      ) {
        this.invites.delete(id);
      }
    }

    const invite: PendingInvite = {
      id: randomUUID(),
      fromTelegramId,
      toTelegramId,
      createdAt: Date.now(),
      inviteKey: randomUUID().replace(/-/g, "").slice(0, 16),
    };
    this.invites.set(invite.id, invite);

    this.send(to.socket, {
      type: "invite",
      inviteId: invite.id,
      from: {
        telegramId: from.telegramId,
        displayName: from.displayName,
        avatarUrl: from.avatarUrl,
        rating: from.rating,
      },
    });
    this.send(from.socket, {
      type: "invite_sent",
      inviteId: invite.id,
      toTelegramId,
    });
  }

  respondInvite(
    responderTelegramId: number,
    inviteId: string,
    accept: boolean,
  ): void {
    const invite = this.invites.get(inviteId);
    if (!invite) {
      const responder = this.clients.get(responderTelegramId);
      if (responder) {
        this.send(responder.socket, {
          type: "invite_error",
          message: "Taklif topilmadi yoki muddati o‘tgan",
        });
      }
      return;
    }
    if (invite.toTelegramId !== responderTelegramId) {
      return;
    }
    this.invites.delete(inviteId);

    const from = this.clients.get(invite.fromTelegramId);
    const to = this.clients.get(invite.toTelegramId);

    if (!accept) {
      if (from) {
        this.send(from.socket, {
          type: "invite_declined",
          inviteId,
          byTelegramId: responderTelegramId,
        });
      }
      if (to) {
        this.send(to.socket, { type: "invite_declined_ack", inviteId });
      }
      return;
    }

    const payload = {
      type: "invite_accepted" as const,
      inviteId,
      inviteKey: invite.inviteKey,
      playUrl: `/air-hockey/?mode=online&invite=${encodeURIComponent(invite.inviteKey)}`,
      fromTelegramId: invite.fromTelegramId,
      toTelegramId: invite.toTelegramId,
    };
    if (from) this.send(from.socket, payload);
    if (to) this.send(to.socket, payload);
  }

  destroy(): void {
    clearInterval(this.sweepTimer);
    this.clients.clear();
    this.invites.clear();
  }

  private sweep(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, c] of this.clients) {
      if (now - c.lastHeartbeat > HEARTBEAT_STALE_MS) {
        this.clients.delete(id);
        changed = true;
        if (c.socket) {
          try {
            c.socket.close();
          } catch {
            /* ignore */
          }
        }
      }
    }
    for (const [id, inv] of this.invites) {
      if (now - inv.createdAt > INVITE_TTL_MS) this.invites.delete(id);
    }
    if (changed) this.broadcastOnline();
  }

  private broadcastOnline(): void {
    const total = this.clients.size;
    for (const c of this.clients.values()) {
      if (!c.socket) continue;
      this.send(c.socket, {
        type: "online",
        onlineCount: total,
        users: this.listOnline(c.telegramId),
      });
    }
  }

  private send(socket: WebSocket | null, msg: Record<string, unknown>): void {
    if (!socket || socket.readyState !== socket.OPEN) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }
}
