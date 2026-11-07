import { randomUUID } from "node:crypto";
import type { WebSocket } from "@fastify/websocket";
import type { UserRepository } from "@mcee77/db";
import {
  AIR_HOCKEY_ONLINE_ABORT_POINTS,
  AIR_HOCKEY_ONLINE_LOSS_POINTS,
  AIR_HOCKEY_ONLINE_WIN_POINTS,
  AIR_HOCKEY_WIN_SCORE,
} from "@mcee77/shared";
import {
  clampPaddle,
  createInitialState,
  resetPuck,
  stepSim,
  TICK_HZ,
  type SimState,
} from "./physics.js";

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 15_000;
export const RECONNECT_GRACE_MS = 15_000;

export type Seat = 0 | 1;

export interface RoomPlayer {
  userId: string;
  telegramId: number;
  displayName: string;
  seat: Seat;
  roomToken: string;
  socket: WebSocket | null;
  lastSeenAt: number;
  inputX: number;
  inputY: number;
}

export type OutboundMessage =
  | {
      type: "match_found";
      roomId: string;
      matchId: string;
      seat: Seat;
      roomToken: string;
      you: { displayName: string };
      opponent: { displayName: string };
      winScore: number;
    }
  | {
      type: "snapshot";
      tick: number;
      puck: SimState["puck"];
      paddles: SimState["paddles"];
      score: SimState["score"];
    }
  | { type: "goal"; scorer: Seat; score: [number, number] }
  | {
      type: "match_over";
      winnerSeat: Seat | null;
      score: [number, number];
      status: "finished" | "aborted";
      pointsAwarded: number;
      reason?: string;
    }
  | { type: "opponent_disconnected"; graceMs: number }
  | { type: "opponent_reconnected" }
  | { type: "pong"; t: number }
  | { type: "error"; message: string };

function send(socket: WebSocket | null, msg: OutboundMessage): void {
  if (!socket || socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    /* ignore broken pipe */
  }
}

export class GameRoom {
  readonly roomId: string;
  readonly matchId: string;
  readonly players: [RoomPlayer, RoomPlayer];
  private state: SimState = createInitialState();
  private tick = 0;
  private loop: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private graceTimer: NodeJS.Timeout | null = null;
  private finished = false;
  private onEmpty: (room: GameRoom) => void;
  private users: UserRepository;

  constructor(opts: {
    matchId: string;
    players: [RoomPlayer, RoomPlayer];
    users: UserRepository;
    onEmpty: (room: GameRoom) => void;
  }) {
    this.roomId = randomUUID();
    this.matchId = opts.matchId;
    this.players = opts.players;
    this.users = opts.users;
    this.onEmpty = opts.onEmpty;
    for (const p of this.players) {
      p.roomToken = randomUUID();
      p.inputX = this.state.paddles[p.seat].x;
      p.inputY = this.state.paddles[p.seat].y;
    }
  }

  start(): void {
    for (const p of this.players) {
      const opp = this.players[p.seat === 0 ? 1 : 0];
      send(p.socket, {
        type: "match_found",
        roomId: this.roomId,
        matchId: this.matchId,
        seat: p.seat,
        roomToken: p.roomToken,
        you: { displayName: p.displayName },
        opponent: { displayName: opp.displayName },
        winScore: AIR_HOCKEY_WIN_SCORE,
      });
    }

    resetPuck(this.state, Math.random() < 0.5 ? 0 : 1);
    this.broadcastSnapshot();

    this.loop = setInterval(() => this.step(), 1000 / TICK_HZ);
    // Unref so open rooms alone do not keep the process alive forever in tests.
    this.loop.unref?.();

    this.heartbeat = setInterval(() => this.checkHeartbeats(), 1_000);
    this.heartbeat.unref?.();
  }

  attachSocket(seat: Seat, socket: WebSocket): void {
    const player = this.players[seat];
    player.socket = socket;
    player.lastSeenAt = Date.now();
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
      const other = this.players[seat === 0 ? 1 : 0];
      send(other.socket, { type: "opponent_reconnected" });
    }
  }

  handleMessage(seat: Seat, raw: string): void {
    const player = this.players[seat];
    player.lastSeenAt = Date.now();

    let msg: { type?: string; x?: number; y?: number; t?: number };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }

    if (msg.type === "ping") {
      send(player.socket, { type: "pong", t: Number(msg.t) || Date.now() });
      return;
    }

    if (msg.type === "input" && !this.finished) {
      if (typeof msg.x === "number" && typeof msg.y === "number") {
        player.inputX = msg.x;
        player.inputY = msg.y;
      }
    }
  }

  markDisconnected(seat: Seat): void {
    const player = this.players[seat];
    player.socket = null;
    if (this.finished) {
      this.maybeDestroy();
      return;
    }

    const other = this.players[seat === 0 ? 1 : 0];
    send(other.socket, {
      type: "opponent_disconnected",
      graceMs: RECONNECT_GRACE_MS,
    });

    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      if (!player.socket && !this.finished) {
        void this.endMatch("aborted", other.seat, "opponent_timeout");
      }
    }, RECONNECT_GRACE_MS);
    this.graceTimer.unref?.();
  }

  findByToken(token: string): RoomPlayer | undefined {
    return this.players.find((p) => p.roomToken === token);
  }

  private step(): void {
    if (this.finished) return;

    for (const p of this.players) {
      clampPaddle(this.state.paddles[p.seat], p.seat, p.inputX, p.inputY);
    }

    const scored = stepSim(this.state);
    this.tick += 1;

    if (scored !== null) {
      this.state.score[scored] += 1;
      this.broadcast({
        type: "goal",
        scorer: scored,
        score: [...this.state.score] as [number, number],
      });

      if (this.state.score[scored] >= AIR_HOCKEY_WIN_SCORE) {
        void this.endMatch("finished", scored);
        return;
      }
      resetPuck(this.state, scored === 0 ? 1 : 0);
    }

    if (this.tick % 1 === 0) {
      this.broadcastSnapshot();
    }
  }

  private checkHeartbeats(): void {
    if (this.finished) return;
    const now = Date.now();
    for (const p of this.players) {
      if (!p.socket) continue;
      if (now - p.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        try {
          p.socket.close();
        } catch {
          /* ignore */
        }
        this.markDisconnected(p.seat);
      }
    }

    // Both gone → abort immediately
    if (!this.players[0].socket && !this.players[1].socket) {
      void this.endMatch("aborted", null, "both_disconnected");
    }
  }

  private broadcastSnapshot(): void {
    this.broadcast({
      type: "snapshot",
      tick: this.tick,
      puck: { ...this.state.puck },
      paddles: [
        { ...this.state.paddles[0] },
        { ...this.state.paddles[1] },
      ],
      score: [...this.state.score] as [number, number],
    });
  }

  private broadcast(msg: OutboundMessage): void {
    for (const p of this.players) send(p.socket, msg);
  }

  private async endMatch(
    status: "finished" | "aborted",
    winnerSeat: Seat | null,
    reason?: string,
  ): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stopTimers();

    const winnerId =
      winnerSeat === null ? null : this.players[winnerSeat].userId;

    let pointsA = AIR_HOCKEY_ONLINE_ABORT_POINTS;
    let pointsB = AIR_HOCKEY_ONLINE_ABORT_POINTS;
    if (status === "finished" && winnerSeat !== null) {
      pointsA =
        winnerSeat === 0
          ? AIR_HOCKEY_ONLINE_WIN_POINTS
          : AIR_HOCKEY_ONLINE_LOSS_POINTS;
      pointsB =
        winnerSeat === 1
          ? AIR_HOCKEY_ONLINE_WIN_POINTS
          : AIR_HOCKEY_ONLINE_LOSS_POINTS;
    }

    try {
      this.users.finishMatch({
        matchId: this.matchId,
        scoreA: this.state.score[0],
        scoreB: this.state.score[1],
        winnerId,
        status,
        pointsA,
        pointsB,
      });
    } catch (err) {
      console.error("finishMatch failed", err);
    }

    for (const p of this.players) {
      const awarded =
        status === "aborted"
          ? 0
          : winnerSeat === p.seat
            ? AIR_HOCKEY_ONLINE_WIN_POINTS
            : AIR_HOCKEY_ONLINE_LOSS_POINTS;
      send(p.socket, {
        type: "match_over",
        winnerSeat,
        score: [...this.state.score] as [number, number],
        status,
        pointsAwarded: awarded,
        reason,
      });
    }

    this.maybeDestroy();
  }

  private stopTimers(): void {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  private maybeDestroy(): void {
    if (this.players.some((p) => p.socket)) return;
    this.stopTimers();
    this.onEmpty(this);
  }

  destroy(): void {
    this.stopTimers();
    for (const p of this.players) {
      try {
        p.socket?.close();
      } catch {
        /* ignore */
      }
      p.socket = null;
    }
  }
}
