import { randomUUID } from "node:crypto";
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_RATING,
  DEFAULT_TOTAL_POINTS,
  FEATURE_FLAG_KEYS,
  publicDisplayName,
  type AdminStats,
  type CreateMatchInput,
  type FeatureFlagKey,
  type FeatureFlags,
  type FinishMatchInput,
  type FinishMatchResult,
  type GameId,
  type GameMode,
  type LeaderboardEntry,
  type MatchRecord,
  type MatchStatus,
  type ScoreRecord,
  type SubmitScoreInput,
  type SubmitScoreResult,
  type UpdateProfileInput,
  type UpsertUserInput,
  type User,
} from "@mcee77/shared";
import type { DatabaseDriverKind, SqlDriver } from "./driver.js";

const FEATURE_SETTING_PREFIX = "feature.";
/** Brief in-process cache so bot keyboard builds stay cheap. */
const FEATURE_CACHE_TTL_MS = 2000;

interface UserRow {
  id: string;
  telegram_id: number;
  username: string | null;
  display_name: string;
  nickname: string | null;
  avatar_url: string | null;
  total_points: number;
  rating: number;
  games_played: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

interface ScoreRow {
  id: string;
  user_id: string;
  game: GameId;
  mode: GameMode;
  points: number;
  meta: string | null;
  created_at: string;
}

interface MatchRow {
  id: string;
  game: string;
  mode: string;
  status: string;
  player_a_id: string;
  player_b_id: string | null;
  score_a: number;
  score_b: number;
  winner_id: string | null;
  room_id: string | null;
  started_at: string | null;
  ended_at: string | null;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    username: row.username,
    displayName: row.display_name,
    nickname: row.nickname ?? null,
    avatarUrl: row.avatar_url ?? null,
    totalPoints: Number(row.total_points),
    rating: Number(row.rating),
    gamesPlayed: Number(row.games_played),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at ?? null,
  };
}

function mapScore(row: ScoreRow): ScoreRecord {
  return {
    id: row.id,
    userId: row.user_id,
    game: row.game,
    mode: row.mode,
    points: Number(row.points),
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  };
}

function mapMatch(row: MatchRow): MatchRecord {
  return {
    id: row.id,
    game: row.game as GameId,
    mode: row.mode as Exclude<GameMode, "solo">,
    status: row.status as MatchStatus,
    playerAId: row.player_a_id,
    playerBId: row.player_b_id,
    scoreA: Number(row.score_a),
    scoreB: Number(row.score_b),
    winnerId: row.winner_id,
    roomId: row.room_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export class UserRepository {
  private featureCache: { flags: FeatureFlags; loadedAt: number } | null =
    null;

  constructor(private readonly db: SqlDriver) {}

  get driver(): DatabaseDriverKind {
    return this.db.kind;
  }

  async migrate(): Promise<void> {
    if (this.db.kind === "postgres") {
      await this.migratePostgres();
    } else {
      await this.migrateSqlite();
    }
  }

  private async migratePostgres(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_id BIGINT NOT NULL UNIQUE,
        username TEXT,
        display_name TEXT NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        total_points INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 0,
        games_played INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_users_total_points
        ON users(total_points DESC);

      CREATE INDEX IF NOT EXISTS idx_users_last_seen
        ON users(last_seen_at);

      CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        game TEXT NOT NULL,
        mode TEXT NOT NULL,
        points INTEGER NOT NULL,
        meta TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scores_user_created
        ON scores(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        game TEXT NOT NULL DEFAULT 'karate',
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        player_a_id TEXT NOT NULL REFERENCES users(id),
        player_b_id TEXT REFERENCES users(id),
        score_a INTEGER NOT NULL DEFAULT 0,
        score_b INTEGER NOT NULL DEFAULT 0,
        winner_id TEXT,
        room_id TEXT UNIQUE,
        started_at TEXT,
        ended_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_matches_status_started
        ON matches(status, started_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private async migrateSqlite(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_id INTEGER NOT NULL UNIQUE,
        username TEXT,
        display_name TEXT NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        total_points INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 0,
        games_played INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_users_total_points
        ON users(total_points DESC);

      CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        game TEXT NOT NULL,
        mode TEXT NOT NULL,
        points INTEGER NOT NULL,
        meta TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scores_user_created
        ON scores(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        game TEXT NOT NULL DEFAULT 'karate',
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        player_a_id TEXT NOT NULL REFERENCES users(id),
        player_b_id TEXT REFERENCES users(id),
        score_a INTEGER NOT NULL DEFAULT 0,
        score_b INTEGER NOT NULL DEFAULT 0,
        winner_id TEXT,
        room_id TEXT UNIQUE,
        started_at TEXT,
        ended_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_matches_status_started
        ON matches(status, started_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Migration-safe for existing SQLite DBs created before newer columns.
    const cols = await this.db.all<{ name: string }>(`PRAGMA table_info(users)`);
    if (!cols.some((c) => c.name === "last_seen_at")) {
      await this.db.exec(`ALTER TABLE users ADD COLUMN last_seen_at TEXT`);
      await this.db.exec(
        `UPDATE users SET last_seen_at = updated_at WHERE last_seen_at IS NULL`,
      );
    }
    if (!cols.some((c) => c.name === "nickname")) {
      await this.db.exec(`ALTER TABLE users ADD COLUMN nickname TEXT`);
    }
    if (!cols.some((c) => c.name === "avatar_url")) {
      await this.db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
    }

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_last_seen
        ON users(last_seen_at);
    `);
  }

  async upsertByTelegramId(input: UpsertUserInput): Promise<User> {
    const existing = await this.findByTelegramId(input.telegramId);
    const now = new Date().toISOString();

    if (existing) {
      const row = await this.db.get<UserRow>(
        `
        UPDATE users
        SET username = ?,
            display_name = ?,
            updated_at = ?,
            last_seen_at = ?
        WHERE telegram_id = ?
        RETURNING *
      `,
        [
          input.username ?? null,
          input.displayName,
          now,
          now,
          input.telegramId,
        ],
      );
      return mapUser(row!);
    }

    const id = randomUUID();
    const row = await this.db.get<UserRow>(
      `
      INSERT INTO users (
        id, telegram_id, username, display_name, nickname, avatar_url,
        total_points, rating, games_played, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 0, ?, ?, ?)
      RETURNING *
    `,
      [
        id,
        input.telegramId,
        input.username ?? null,
        input.displayName,
        DEFAULT_TOTAL_POINTS,
        DEFAULT_RATING,
        now,
        now,
        now,
      ],
    );
    return mapUser(row!);
  }

  async updateProfile(input: UpdateProfileInput): Promise<User> {
    const existing = await this.findById(input.userId);
    if (!existing) throw new Error("user not found");
    const now = new Date().toISOString();

    let nickname = existing.nickname;
    if (typeof input.nickname === "string") {
      const trimmed = input.nickname.trim().slice(0, 32);
      nickname = trimmed.length > 0 ? trimmed : null;
    }

    let avatarUrl = existing.avatarUrl;
    if (input.avatarUrl !== undefined) {
      avatarUrl = input.avatarUrl;
    }

    const row = await this.db.get<UserRow>(
      `
        UPDATE users
        SET nickname = ?,
            avatar_url = ?,
            updated_at = ?,
            last_seen_at = ?
        WHERE id = ?
        RETURNING *
      `,
      [nickname, avatarUrl, now, now, input.userId],
    );
    return mapUser(row!);
  }

  /** Bump last_seen_at without changing profile fields. */
  async touchLastSeen(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, userId],
    );
  }

  async findByTelegramId(telegramId: number): Promise<User | null> {
    const row = await this.db.get<UserRow>(
      `SELECT * FROM users WHERE telegram_id = ?`,
      [telegramId],
    );
    return row ? mapUser(row) : null;
  }

  /** Cheap total for boot logs / healthz (no secrets). */
  async countUsers(): Promise<number> {
    const row = await this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users`,
    );
    return Number(row?.n ?? 0);
  }

  /**
   * All known Telegram user ids for admin /start broadcast.
   * Ordered by first seen so delivery is stable across runs.
   */
  async listBroadcastRecipients(): Promise<
    Array<{
      telegramId: number;
      displayName: string;
      nickname: string | null;
    }>
  > {
    const rows = await this.db.all<{
      telegram_id: number;
      display_name: string;
      nickname: string | null;
    }>(
      `
        SELECT telegram_id, display_name, nickname
        FROM users
        ORDER BY created_at ASC
      `,
    );

    return rows.map((row) => ({
      telegramId: Number(row.telegram_id),
      displayName: row.display_name,
      nickname: row.nickname ?? null,
    }));
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [
      id,
    ]);
    return row ? mapUser(row) : null;
  }

  async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const rows = await this.db.all<{
      telegram_id: number;
      username: string | null;
      display_name: string;
      nickname: string | null;
      avatar_url: string | null;
      total_points: number;
      rating: number;
    }>(
      `
        SELECT telegram_id, username, display_name, nickname, avatar_url,
               total_points, rating
        FROM users
        WHERE total_points > 0
        ORDER BY total_points DESC, games_played ASC, created_at ASC
        LIMIT ?
      `,
      [limit],
    );

    return rows.map((row, index) => ({
      rank: index + 1,
      telegramId: Number(row.telegram_id),
      displayName: publicDisplayName({
        nickname: row.nickname,
        displayName: row.display_name,
      }),
      username: row.username,
      avatarUrl: row.avatar_url ?? null,
      totalPoints: Number(row.total_points),
      rating: Number(row.rating),
    }));
  }

  /**
   * Persist a City Strike run (game id `karate`). total_points / rating store the personal best only:
   * if run ≤ stored best, keep best; if higher, update.
   */
  async submitScore(input: SubmitScoreInput): Promise<SubmitScoreResult> {
    const now = new Date().toISOString();
    return this.db.transaction(async () => {
      const user = await this.findById(input.userId);
      if (!user) {
        throw new Error("user not found");
      }

      const previousBest = user.totalPoints;
      const isNewBest = input.points > previousBest;
      const nextBest = isNewBest ? input.points : previousBest;

      const scoreId = randomUUID();
      const metaJson = input.meta
        ? JSON.stringify({ ...input.meta, isNewBest, previousBest })
        : JSON.stringify({ isNewBest, previousBest });
      const scoreRow = await this.db.get<ScoreRow>(
        `
          INSERT INTO scores (id, user_id, game, mode, points, meta, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `,
        [
          scoreId,
          input.userId,
          input.game,
          input.mode,
          input.points,
          metaJson,
          now,
        ],
      );

      const updated = await this.db.get<UserRow>(
        `
          UPDATE users
          SET total_points = ?,
              rating = ?,
              games_played = games_played + 1,
              updated_at = ?,
              last_seen_at = ?
          WHERE id = ?
          RETURNING *
        `,
        [nextBest, nextBest, now, now, input.userId],
      );

      return {
        score: mapScore(scoreRow!),
        user: mapUser(updated!),
        pointsAwarded: isNewBest ? input.points - previousBest : 0,
        isNewBest,
        previousBest,
      };
    });
  }

  async createMatch(input: CreateMatchInput): Promise<MatchRecord> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const status = input.status ?? "active";
    const row = await this.db.get<MatchRow>(
      `
        INSERT INTO matches (
          id, game, mode, status, player_a_id, player_b_id,
          score_a, score_b, winner_id, room_id, started_at, ended_at
        ) VALUES (?, 'karate', ?, ?, ?, ?, 0, 0, NULL, ?, ?, NULL)
        RETURNING *
      `,
      [
        id,
        input.mode,
        status,
        input.playerAId,
        input.playerBId ?? null,
        input.roomId ?? null,
        status === "queued" ? null : now,
      ],
    );
    return mapMatch(row!);
  }

  async findMatchById(matchId: string): Promise<MatchRecord | null> {
    const row = await this.db.get<MatchRow>(
      `SELECT * FROM matches WHERE id = ?`,
      [matchId],
    );
    return row ? mapMatch(row) : null;
  }

  async findMatchByRoomId(roomId: string): Promise<MatchRecord | null> {
    const row = await this.db.get<MatchRow>(
      `SELECT * FROM matches WHERE room_id = ?`,
      [roomId],
    );
    return row ? mapMatch(row) : null;
  }

  async setMatchRoomId(matchId: string, roomId: string): Promise<void> {
    await this.db.run(`UPDATE matches SET room_id = ? WHERE id = ?`, [
      roomId,
      matchId,
    ]);
  }

  /**
   * Finalize a match and award points/rating to both players (if present).
   */
  async finishMatch(input: FinishMatchInput): Promise<FinishMatchResult> {
    const now = new Date().toISOString();
    return this.db.transaction(async () => {
      const existing = await this.findMatchById(input.matchId);
      if (!existing) {
        throw new Error("match not found");
      }
      if (existing.status === "finished" || existing.status === "aborted") {
        const playerA = await this.findById(existing.playerAId);
        const playerB = existing.playerBId
          ? await this.findById(existing.playerBId)
          : null;
        if (!playerA) throw new Error("player A not found");
        return { match: existing, playerA, playerB };
      }

      const status = input.status ?? "finished";
      const matchRow = await this.db.get<MatchRow>(
        `
          UPDATE matches
          SET status = ?,
              score_a = ?,
              score_b = ?,
              winner_id = ?,
              ended_at = ?,
              started_at = COALESCE(started_at, ?)
          WHERE id = ?
          RETURNING *
        `,
        [
          status,
          input.scoreA,
          input.scoreB,
          input.winnerId,
          now,
          now,
          input.matchId,
        ],
      );

      const applyPoints = async (
        userId: string,
        points: number,
        won: boolean,
      ): Promise<UserRow> => {
        if (points > 0) {
          await this.db.run(
            `
              INSERT INTO scores (id, user_id, game, mode, points, meta, created_at)
              VALUES (?, ?, 'karate', ?, ?, ?, ?)
            `,
            [
              randomUUID(),
              userId,
              matchRow!.mode,
              points,
              JSON.stringify({
                matchId: input.matchId,
                won,
                scoreA: input.scoreA,
                scoreB: input.scoreB,
              }),
              now,
            ],
          );
        }

        // Legacy match finish: treat awarded points as a candidate best score.
        const current = await this.findById(userId);
        const best = Math.max(current?.totalPoints ?? 0, points);
        const updated = await this.db.get<UserRow>(
          `
            UPDATE users
            SET total_points = ?,
                rating = ?,
                games_played = games_played + 1,
                updated_at = ?,
                last_seen_at = ?
            WHERE id = ?
            RETURNING *
          `,
          [best, best, now, now, userId],
        );
        return updated!;
      };

      const playerARow = await applyPoints(
        matchRow!.player_a_id,
        Math.max(0, Math.floor(input.pointsA)),
        input.winnerId === matchRow!.player_a_id,
      );
      let playerB: User | null = null;
      if (matchRow!.player_b_id) {
        playerB = mapUser(
          await applyPoints(
            matchRow!.player_b_id,
            Math.max(0, Math.floor(input.pointsB)),
            input.winnerId === matchRow!.player_b_id,
          ),
        );
      }

      return {
        match: mapMatch(matchRow!),
        playerA: mapUser(playerARow),
        playerB,
      };
    });
  }

  /**
   * Admin dashboard counters — DB users, City Strike runs, and high-score board.
   */
  async getAdminStats(opts?: { topLimit?: number }): Promise<AdminStats> {
    const now = new Date();
    const isoNow = now.toISOString();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayStartIso = dayStart.toISOString();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const totalUsers = await this.countUsers();

    const activeTodayRow = await this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE last_seen_at IS NOT NULL AND last_seen_at >= ?`,
      [dayStartIso],
    );
    const active24hRow = await this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE last_seen_at IS NOT NULL AND last_seen_at >= ?`,
      [ago24h],
    );

    const gamesTodayRow = await this.db.get<{ n: number }>(
      `
          SELECT COUNT(*) AS n FROM scores
          WHERE created_at >= ?
            AND game = 'karate'
        `,
      [dayStartIso],
    );

    const karatePlayersRow = await this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE total_points > 0`,
    );
    const topScoreRow = await this.db.get<{ n: number }>(
      `SELECT COALESCE(MAX(total_points), 0) AS n FROM users`,
    );

    const topLimit = Math.min(Math.max(opts?.topLimit ?? 5, 1), 20);

    return {
      totalUsers,
      activeToday: Number(activeTodayRow?.n ?? 0),
      active24h: Number(active24hRow?.n ?? 0),
      gamesToday: Number(gamesTodayRow?.n ?? 0),
      karatePlayers: Number(karatePlayersRow?.n ?? 0),
      topKarateScore: Number(topScoreRow?.n ?? 0),
      topRating: await this.getLeaderboard(topLimit),
      generatedAt: isoNow,
    };
  }

  async getFeatureFlags(opts?: {
    bypassCache?: boolean;
  }): Promise<FeatureFlags> {
    const now = Date.now();
    if (
      !opts?.bypassCache &&
      this.featureCache &&
      now - this.featureCache.loadedAt < FEATURE_CACHE_TTL_MS
    ) {
      return { ...this.featureCache.flags };
    }

    const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
    const rows = await this.db.all<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key LIKE ?`,
      [`${FEATURE_SETTING_PREFIX}%`],
    );

    for (const row of rows) {
      const raw = row.key.slice(FEATURE_SETTING_PREFIX.length);
      // Legacy Air Hockey toggle → City Strike (flag key still `karate`).
      const id = (raw === "air_hockey" ? "karate" : raw) as FeatureFlagKey;
      if (!(FEATURE_FLAG_KEYS as readonly string[]).includes(id)) continue;
      flags[id] = row.value === "1" || row.value === "true";
    }

    this.featureCache = { flags: { ...flags }, loadedAt: now };
    return { ...flags };
  }

  async setFeatureFlags(
    partial: Partial<FeatureFlags>,
  ): Promise<FeatureFlags> {
    const current = await this.getFeatureFlags({ bypassCache: true });
    const next: FeatureFlags = { ...current };

    return this.db.transaction(async () => {
      for (const key of FEATURE_FLAG_KEYS) {
        if (typeof partial[key] === "boolean") {
          next[key] = partial[key]!;
        }
        await this.db.run(
          `
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
          [`${FEATURE_SETTING_PREFIX}${key}`, next[key] ? "1" : "0"],
        );
      }

      this.featureCache = { flags: { ...next }, loadedAt: Date.now() };
      return { ...next };
    });
  }

  invalidateFeatureFlagsCache(): void {
    this.featureCache = null;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
