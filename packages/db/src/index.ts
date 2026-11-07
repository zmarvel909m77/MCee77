import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
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
    telegramId: row.telegram_id,
    username: row.username,
    displayName: row.display_name,
    nickname: row.nickname ?? null,
    avatarUrl: row.avatar_url ?? null,
    totalPoints: row.total_points,
    rating: row.rating,
    gamesPlayed: row.games_played,
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
    points: row.points,
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
    scoreA: row.score_a,
    scoreB: row.score_b,
    winnerId: row.winner_id,
    roomId: row.room_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export class UserRepository {
  private readonly db: Database.Database;
  private featureCache: { flags: FeatureFlags; loadedAt: number } | null =
    null;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_id INTEGER NOT NULL UNIQUE,
        username TEXT,
        display_name TEXT NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        total_points INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 1000,
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
        game TEXT NOT NULL DEFAULT 'air_hockey',
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
    const cols = this.db
      .prepare(`PRAGMA table_info(users)`)
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "last_seen_at")) {
      this.db.exec(`ALTER TABLE users ADD COLUMN last_seen_at TEXT`);
      // Best-effort backfill from updated_at so active counts are not empty.
      this.db.exec(
        `UPDATE users SET last_seen_at = updated_at WHERE last_seen_at IS NULL`,
      );
    }
    if (!cols.some((c) => c.name === "nickname")) {
      this.db.exec(`ALTER TABLE users ADD COLUMN nickname TEXT`);
    }
    if (!cols.some((c) => c.name === "avatar_url")) {
      this.db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_last_seen
        ON users(last_seen_at);
    `);
  }

  upsertByTelegramId(input: UpsertUserInput): User {
    const existing = this.findByTelegramId(input.telegramId);
    const now = new Date().toISOString();

    if (existing) {
      // Keep editable nickname/avatar; only refresh Telegram identity fields.
      const stmt = this.db.prepare(`
        UPDATE users
        SET username = ?,
            display_name = ?,
            updated_at = ?,
            last_seen_at = ?
        WHERE telegram_id = ?
        RETURNING *
      `);
      const row = stmt.get(
        input.username ?? null,
        input.displayName,
        now,
        now,
        input.telegramId,
      ) as UserRow;
      return mapUser(row);
    }

    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, telegram_id, username, display_name, nickname, avatar_url,
        total_points, rating, games_played, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 0, ?, ?, ?)
      RETURNING *
    `);
    const row = stmt.get(
      id,
      input.telegramId,
      input.username ?? null,
      input.displayName,
      DEFAULT_TOTAL_POINTS,
      DEFAULT_RATING,
      now,
      now,
      now,
    ) as UserRow;
    return mapUser(row);
  }

  updateProfile(input: UpdateProfileInput): User {
    const existing = this.findById(input.userId);
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

    const row = this.db
      .prepare(
        `
        UPDATE users
        SET nickname = ?,
            avatar_url = ?,
            updated_at = ?,
            last_seen_at = ?
        WHERE id = ?
        RETURNING *
      `,
      )
      .get(nickname, avatarUrl, now, now, input.userId) as UserRow;
    return mapUser(row);
  }

  /** Bump last_seen_at without changing profile fields. */
  touchLastSeen(userId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(now, now, userId);
  }

  findByTelegramId(telegramId: number): User | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE telegram_id = ?`)
      .get(telegramId) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  /** Cheap total for boot logs / healthz (no secrets). */
  countUsers(): number {
    return (
      this.db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }
    ).n;
  }

  /**
   * All known Telegram user ids for admin /start broadcast.
   * Ordered by first seen so delivery is stable across runs.
   * No extra filters — empty result means empty `users` table.
   */
  listBroadcastRecipients(): Array<{
    telegramId: number;
    displayName: string;
    nickname: string | null;
  }> {
    const rows = this.db
      .prepare(
        `
        SELECT telegram_id, display_name, nickname
        FROM users
        ORDER BY created_at ASC
      `,
      )
      .all() as Array<{
      telegram_id: number;
      display_name: string;
      nickname: string | null;
    }>;

    return rows.map((row) => ({
      telegramId: row.telegram_id,
      displayName: row.display_name,
      nickname: row.nickname ?? null,
    }));
  }

  findById(id: string): User | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  getLeaderboard(limit = 10): LeaderboardEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT telegram_id, username, display_name, nickname, avatar_url,
               total_points, rating
        FROM users
        ORDER BY total_points DESC, rating DESC, created_at ASC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{
      telegram_id: number;
      username: string | null;
      display_name: string;
      nickname: string | null;
      avatar_url: string | null;
      total_points: number;
      rating: number;
    }>;

    return rows.map((row, index) => ({
      rank: index + 1,
      telegramId: row.telegram_id,
      displayName: publicDisplayName({
        nickname: row.nickname,
        displayName: row.display_name,
      }),
      username: row.username,
      avatarUrl: row.avatar_url ?? null,
      totalPoints: row.total_points,
      rating: row.rating,
    }));
  }

  /**
   * Persist a session score and bump user total_points, rating, games_played.
   * MVP: points awarded = session points (already clamped by caller).
   */
  submitScore(input: SubmitScoreInput): SubmitScoreResult {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const user = this.findById(input.userId);
      if (!user) {
        throw new Error("user not found");
      }

      const scoreId = randomUUID();
      const metaJson = input.meta ? JSON.stringify(input.meta) : null;
      const scoreRow = this.db
        .prepare(
          `
          INSERT INTO scores (id, user_id, game, mode, points, meta, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `,
        )
        .get(
          scoreId,
          input.userId,
          input.game,
          input.mode,
          input.points,
          metaJson,
          now,
        ) as ScoreRow;

      const updated = this.db
        .prepare(
          `
          UPDATE users
          SET total_points = total_points + ?,
              rating = rating + ?,
              games_played = games_played + 1,
              updated_at = ?,
              last_seen_at = ?
          WHERE id = ?
          RETURNING *
        `,
        )
        .get(input.points, input.points, now, now, input.userId) as UserRow;

      return {
        score: mapScore(scoreRow),
        user: mapUser(updated),
        pointsAwarded: input.points,
      };
    });

    return tx();
  }

  createMatch(input: CreateMatchInput): MatchRecord {
    const now = new Date().toISOString();
    const id = randomUUID();
    const status = input.status ?? "active";
    const row = this.db
      .prepare(
        `
        INSERT INTO matches (
          id, game, mode, status, player_a_id, player_b_id,
          score_a, score_b, winner_id, room_id, started_at, ended_at
        ) VALUES (?, 'air_hockey', ?, ?, ?, ?, 0, 0, NULL, ?, ?, NULL)
        RETURNING *
      `,
      )
      .get(
        id,
        input.mode,
        status,
        input.playerAId,
        input.playerBId ?? null,
        input.roomId ?? null,
        status === "queued" ? null : now,
      ) as MatchRow;
    return mapMatch(row);
  }

  findMatchById(matchId: string): MatchRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM matches WHERE id = ?`)
      .get(matchId) as MatchRow | undefined;
    return row ? mapMatch(row) : null;
  }

  findMatchByRoomId(roomId: string): MatchRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM matches WHERE room_id = ?`)
      .get(roomId) as MatchRow | undefined;
    return row ? mapMatch(row) : null;
  }

  setMatchRoomId(matchId: string, roomId: string): void {
    this.db
      .prepare(`UPDATE matches SET room_id = ? WHERE id = ?`)
      .run(roomId, matchId);
  }

  /**
   * Finalize a match and award points/rating to both players (if present).
   * Also writes score rows for audit / leaderboard rebuild.
   */
  finishMatch(input: FinishMatchInput): FinishMatchResult {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const existing = this.findMatchById(input.matchId);
      if (!existing) {
        throw new Error("match not found");
      }
      if (existing.status === "finished" || existing.status === "aborted") {
        const playerA = this.findById(existing.playerAId);
        const playerB = existing.playerBId
          ? this.findById(existing.playerBId)
          : null;
        if (!playerA) throw new Error("player A not found");
        return { match: existing, playerA, playerB };
      }

      const status = input.status ?? "finished";
      const matchRow = this.db
        .prepare(
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
        )
        .get(
          status,
          input.scoreA,
          input.scoreB,
          input.winnerId,
          now,
          now,
          input.matchId,
        ) as MatchRow;

      const applyPoints = (userId: string, points: number, won: boolean) => {
        if (points > 0) {
          this.db
            .prepare(
              `
              INSERT INTO scores (id, user_id, game, mode, points, meta, created_at)
              VALUES (?, ?, 'air_hockey', ?, ?, ?, ?)
            `,
            )
            .run(
              randomUUID(),
              userId,
              matchRow.mode,
              points,
              JSON.stringify({
                matchId: input.matchId,
                won,
                scoreA: input.scoreA,
                scoreB: input.scoreB,
              }),
              now,
            );
        }

        return this.db
          .prepare(
            `
            UPDATE users
            SET total_points = total_points + ?,
                rating = rating + ?,
                games_played = games_played + 1,
                updated_at = ?,
                last_seen_at = ?
            WHERE id = ?
            RETURNING *
          `,
          )
          .get(points, points, now, now, userId) as UserRow;
      };

      const playerARow = applyPoints(
        matchRow.player_a_id,
        Math.max(0, Math.floor(input.pointsA)),
        input.winnerId === matchRow.player_a_id,
      );
      let playerB: User | null = null;
      if (matchRow.player_b_id) {
        playerB = mapUser(
          applyPoints(
            matchRow.player_b_id,
            Math.max(0, Math.floor(input.pointsB)),
            input.winnerId === matchRow.player_b_id,
          ),
        );
      }

      return {
        match: mapMatch(matchRow),
        playerA: mapUser(playerARow),
        playerB,
      };
    });

    return tx();
  }

  /**
   * Admin dashboard counters. Live Air Hockey rooms/queue come from the
   * in-memory matchmaking service and are merged by the API layer.
   */
  getAdminStats(opts?: {
    airHockey?: { activeRooms: number; queueDepth: number };
    topLimit?: number;
  }): AdminStats {
    const now = new Date();
    const isoNow = now.toISOString();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayStartIso = dayStart.toISOString();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const totalUsers = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }
    ).n;

    const activeToday = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM users WHERE last_seen_at IS NOT NULL AND last_seen_at >= ?`,
        )
        .get(dayStartIso) as { n: number }
    ).n;

    const active24h = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM users WHERE last_seen_at IS NOT NULL AND last_seen_at >= ?`,
        )
        .get(ago24h) as { n: number }
    ).n;

    // Session-ish count: solo/offline score rows + online matches (avoid double-count;
    // finishMatch also writes per-player score rows for online).
    const soloOfflineToday = (
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS n FROM scores
          WHERE created_at >= ?
            AND mode IN ('solo', 'offline')
        `,
        )
        .get(dayStartIso) as { n: number }
    ).n;

    const matchesToday = (
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS n FROM matches
          WHERE status IN ('finished', 'aborted')
            AND COALESCE(ended_at, started_at) >= ?
        `,
        )
        .get(dayStartIso) as { n: number }
    ).n;

    const activeRooms = opts?.airHockey?.activeRooms ?? 0;
    const queueDepth = opts?.airHockey?.queueDepth ?? 0;
    const topLimit = Math.min(Math.max(opts?.topLimit ?? 5, 1), 20);

    return {
      totalUsers,
      activeToday,
      active24h,
      gamesToday: soloOfflineToday + matchesToday,
      airHockey: {
        activeRooms,
        approxPlayers: activeRooms * 2,
        queueDepth,
      },
      topRating: this.getLeaderboard(topLimit),
      generatedAt: isoNow,
    };
  }

  /**
   * Read bot section feature flags from `settings`. Missing keys default ON.
   * Short in-process cache; cleared on setFeatureFlags.
   */
  getFeatureFlags(opts?: { bypassCache?: boolean }): FeatureFlags {
    const now = Date.now();
    if (
      !opts?.bypassCache &&
      this.featureCache &&
      now - this.featureCache.loadedAt < FEATURE_CACHE_TTL_MS
    ) {
      return { ...this.featureCache.flags };
    }

    const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
    const rows = this.db
      .prepare(
        `SELECT key, value FROM settings WHERE key LIKE ?`,
      )
      .all(`${FEATURE_SETTING_PREFIX}%`) as Array<{
      key: string;
      value: string;
    }>;

    for (const row of rows) {
      const id = row.key.slice(FEATURE_SETTING_PREFIX.length) as FeatureFlagKey;
      if (!(FEATURE_FLAG_KEYS as readonly string[]).includes(id)) continue;
      flags[id] = row.value === "1" || row.value === "true";
    }

    this.featureCache = { flags: { ...flags }, loadedAt: now };
    return { ...flags };
  }

  /**
   * Persist feature flags (partial update OK). Returns the full merged flags.
   */
  setFeatureFlags(partial: Partial<FeatureFlags>): FeatureFlags {
    const current = this.getFeatureFlags({ bypassCache: true });
    const next: FeatureFlags = { ...current };

    const upsert = this.db.prepare(
      `
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    );

    const tx = this.db.transaction(() => {
      for (const key of FEATURE_FLAG_KEYS) {
        if (typeof partial[key] === "boolean") {
          next[key] = partial[key]!;
        }
        upsert.run(
          `${FEATURE_SETTING_PREFIX}${key}`,
          next[key] ? "1" : "0",
        );
      }
    });
    tx();

    this.featureCache = { flags: { ...next }, loadedAt: Date.now() };
    return { ...next };
  }

  /** Drop the brief feature-flag cache (e.g. after external DB edit). */
  invalidateFeatureFlagsCache(): void {
    this.featureCache = null;
  }

  close(): void {
    this.db.close();
  }
}

export function createUserRepository(databasePath: string): UserRepository {
  return new UserRepository(databasePath);
}

export {
  PROD_DATABASE_PATH,
  PROD_DATA_DIR,
  inspectDatabasePersistence,
  resolveDatabasePath,
  type DatabasePersistenceInfo,
  type ResolveDatabasePathOptions,
} from "./path.js";
