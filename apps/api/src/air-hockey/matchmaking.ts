import type { WebSocket } from "@fastify/websocket";
import type { UserRepository } from "@mcee77/db";
import { GameRoom, type RoomPlayer, type Seat } from "./room.js";
import { RINK_H, RINK_W } from "./physics.js";

export const QUEUE_TIMEOUT_MS = 30_000;

interface QueueEntry {
  userId: string;
  telegramId: number;
  displayName: string;
  socket: WebSocket;
  enqueuedAt: number;
  timer: NodeJS.Timeout;
}

/**
 * In-memory matchmaking + room registry.
 *
 * Scale notes (MVP):
 * - Single Node process keeps queue + rooms in RAM — fine until ~hundreds of concurrent matches.
 * - For horizontal scale: move queue to Redis (ZADD), room ownership to Redis + sticky LB by room_id,
 *   and fan-out via Redis pub/sub. Heartbeats / presence already isolate rooms so one stalling
 *   client cannot freeze the event loop (non-blocking ticks + unref timers).
 */
interface InviteWaiter {
  inviteKey: string;
  userId: string;
  telegramId: number;
  displayName: string;
  socket: WebSocket;
  enqueuedAt: number;
  timer: NodeJS.Timeout;
}

export class MatchmakingService {
  private queue: QueueEntry[] = [];
  private inviteWaiters = new Map<string, InviteWaiter>();
  private rooms = new Map<string, GameRoom>();
  private roomsByToken = new Map<string, GameRoom>();
  private users: UserRepository;

  constructor(users: UserRepository) {
    this.users = users;
  }

  get stats() {
    return {
      queueDepth: this.queue.length,
      activeRooms: this.rooms.size,
      inviteWaiters: this.inviteWaiters.size,
    };
  }

  enqueue(player: Omit<QueueEntry, "enqueuedAt" | "timer">): void {
    this.removeFromQueue(player.telegramId);

    // Already in an active room? reject
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.telegramId === player.telegramId && p.socket)) {
        this.send(player.socket, {
          type: "error",
          message: "Siz allaqachon o‘yindasiz",
        });
        return;
      }
    }

    const entry: QueueEntry = {
      ...player,
      enqueuedAt: Date.now(),
      timer: setTimeout(() => {
        this.removeFromQueue(player.telegramId);
        this.send(player.socket, {
          type: "queue_timeout",
          message: "Raqib topilmadi. Offline rejimni sinab ko‘ring.",
        });
      }, QUEUE_TIMEOUT_MS),
    };
    entry.timer.unref?.();
    this.queue.push(entry);
    this.send(player.socket, {
      type: "queued",
      position: this.queue.length,
      timeoutMs: QUEUE_TIMEOUT_MS,
    });
    void this.tryPair();
  }

  cancelQueue(telegramId: number): void {
    this.removeFromQueue(telegramId);
    this.removeInviteWaiter(telegramId);
  }

  /**
   * Pair two players who accepted a Mini App invite (same inviteKey).
   * First waiter parks; second creates the room.
   */
  joinInvite(
    player: Omit<QueueEntry, "enqueuedAt" | "timer"> & { inviteKey: string },
  ): void {
    this.removeFromQueue(player.telegramId);
    this.removeInviteWaiter(player.telegramId);

    const key = player.inviteKey.trim();
    if (!key) {
      this.send(player.socket, { type: "error", message: "inviteKey kerak" });
      return;
    }

    const existing = this.inviteWaiters.get(key);
    if (!existing) {
      const waiter: InviteWaiter = {
        inviteKey: key,
        userId: player.userId,
        telegramId: player.telegramId,
        displayName: player.displayName,
        socket: player.socket,
        enqueuedAt: Date.now(),
        timer: setTimeout(() => {
          this.inviteWaiters.delete(key);
          this.send(player.socket, {
            type: "queue_timeout",
            message: "Raqib ulanmadi. Qayta taklif qiling.",
          });
        }, QUEUE_TIMEOUT_MS),
      };
      waiter.timer.unref?.();
      this.inviteWaiters.set(key, waiter);
      this.send(player.socket, {
        type: "queued",
        position: 1,
        timeoutMs: QUEUE_TIMEOUT_MS,
        invite: true,
      });
      return;
    }

    if (existing.telegramId === player.telegramId) {
      this.send(player.socket, {
        type: "error",
        message: "Taklifga allaqachon qo‘shilgansiz",
      });
      return;
    }

    clearTimeout(existing.timer);
    this.inviteWaiters.delete(key);
    void this.createRoomFromPair(
      {
        userId: existing.userId,
        telegramId: existing.telegramId,
        displayName: existing.displayName,
        socket: existing.socket,
        enqueuedAt: existing.enqueuedAt,
        timer: existing.timer,
      },
      {
        userId: player.userId,
        telegramId: player.telegramId,
        displayName: player.displayName,
        socket: player.socket,
        enqueuedAt: Date.now(),
        timer: setTimeout(() => {}, 0),
      },
    );
  }

  handleDisconnect(socket: WebSocket): void {
    const q = this.queue.find((e) => e.socket === socket);
    if (q) {
      this.removeFromQueue(q.telegramId);
      return;
    }

    for (const [key, w] of this.inviteWaiters) {
      if (w.socket === socket) {
        clearTimeout(w.timer);
        this.inviteWaiters.delete(key);
        return;
      }
    }

    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.socket === socket);
      if (player) {
        room.markDisconnected(player.seat);
        return;
      }
    }
  }

  reconnect(opts: {
    roomToken: string;
    socket: WebSocket;
    telegramId: number;
  }): boolean {
    const room = this.roomsByToken.get(opts.roomToken);
    if (!room) return false;
    const player = room.findByToken(opts.roomToken);
    if (!player || player.telegramId !== opts.telegramId) return false;
    room.attachSocket(player.seat, opts.socket);
    this.send(opts.socket, {
      type: "reconnected",
      roomId: room.roomId,
      seat: player.seat,
    });
    return true;
  }

  routeMessage(socket: WebSocket, raw: string): void {
    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.socket === socket);
      if (player) {
        room.handleMessage(player.seat, raw);
        return;
      }
    }
  }

  destroy(): void {
    for (const e of this.queue) clearTimeout(e.timer);
    this.queue = [];
    for (const w of this.inviteWaiters.values()) clearTimeout(w.timer);
    this.inviteWaiters.clear();
    for (const room of this.rooms.values()) room.destroy();
    this.rooms.clear();
    this.roomsByToken.clear();
  }

  private async tryPair(): Promise<void> {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      clearTimeout(a.timer);
      clearTimeout(b.timer);

      // Avoid matching the same telegram twice (shouldn't happen)
      if (a.telegramId === b.telegramId) {
        this.queue.unshift(b);
        continue;
      }

      await this.createRoomFromPair(a, b);
    }
  }

  private async createRoomFromPair(
    a: QueueEntry,
    b: QueueEntry,
  ): Promise<void> {
    let match;
    try {
      match = await this.users.createMatch({
        mode: "online",
        playerAId: a.userId,
        playerBId: b.userId,
        status: "active",
      });
    } catch (err) {
      console.error("createMatch failed", err);
      this.send(a.socket, {
        type: "error",
        message: "Match yaratib bo‘lmadi",
      });
      this.send(b.socket, {
        type: "error",
        message: "Match yaratib bo‘lmadi",
      });
      return;
    }

    const makePlayer = (entry: QueueEntry, seat: Seat): RoomPlayer => ({
      userId: entry.userId,
      telegramId: entry.telegramId,
      displayName: entry.displayName,
      seat,
      roomToken: "",
      socket: entry.socket,
      lastSeenAt: Date.now(),
      inputX: RINK_W / 2,
      inputY: seat === 0 ? RINK_H * 0.78 : RINK_H * 0.22,
    });

    const room = new GameRoom({
      matchId: match.id,
      players: [makePlayer(a, 0), makePlayer(b, 1)],
      users: this.users,
      onEmpty: (r) => this.removeRoom(r),
    });

    this.rooms.set(room.roomId, room);
    for (const p of room.players) {
      this.roomsByToken.set(p.roomToken, room);
    }

    try {
      await this.users.setMatchRoomId(match.id, room.roomId);
    } catch (err) {
      console.error("setMatchRoomId failed", err);
    }

    room.start();
  }

  private removeInviteWaiter(telegramId: number): void {
    for (const [key, w] of this.inviteWaiters) {
      if (w.telegramId === telegramId) {
        clearTimeout(w.timer);
        this.inviteWaiters.delete(key);
        return;
      }
    }
  }

  private removeRoom(room: GameRoom): void {
    this.rooms.delete(room.roomId);
    for (const p of room.players) {
      this.roomsByToken.delete(p.roomToken);
    }
  }

  private removeFromQueue(telegramId: number): void {
    const idx = this.queue.findIndex((e) => e.telegramId === telegramId);
    if (idx < 0) return;
    const entry = this.queue[idx];
    if (entry) clearTimeout(entry.timer);
    this.queue.splice(idx, 1);
  }

  private send(socket: WebSocket, msg: Record<string, unknown>): void {
    if (socket.readyState !== socket.OPEN) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }
}
