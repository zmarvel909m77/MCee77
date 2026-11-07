import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
  DEFAULT_RATING,
  DEFAULT_TOTAL_POINTS,
  type GameId,
  type GameMode,
  type LeaderboardEntry,
  type ScoreRecord,
  type SubmitScoreInput,
  type SubmitScoreResult,
  type UpsertUserInput,
  type User,
} from "@mcee77/shared";

interface UserRow {
  id: string;
  telegram_id: number;
  username: string | null;
  display_name: string;
  total_points: number;
  rating: number;
  games_played: number;
  created_at: string;
  updated_at: string;
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

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    displayName: row.display_name,
    totalPoints: row.total_points,
    rating: row.rating,
    gamesPlayed: row.games_played,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export class UserRepository {
  private readonly db: Database.Database;

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
        total_points INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 1000,
        games_played INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
    `);
  }

  upsertByTelegramId(input: UpsertUserInput): User {
    const existing = this.findByTelegramId(input.telegramId);
    const now = new Date().toISOString();

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE users
        SET username = ?,
            display_name = ?,
            updated_at = ?
        WHERE telegram_id = ?
        RETURNING *
      `);
      const row = stmt.get(
        input.username ?? null,
        input.displayName,
        now,
        input.telegramId,
      ) as UserRow;
      return mapUser(row);
    }

    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, telegram_id, username, display_name,
        total_points, rating, games_played, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
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
    ) as UserRow;
    return mapUser(row);
  }

  findByTelegramId(telegramId: number): User | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE telegram_id = ?`)
      .get(telegramId) as UserRow | undefined;
    return row ? mapUser(row) : null;
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
        SELECT telegram_id, username, display_name, total_points, rating
        FROM users
        ORDER BY total_points DESC, rating DESC, created_at ASC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{
      telegram_id: number;
      username: string | null;
      display_name: string;
      total_points: number;
      rating: number;
    }>;

    return rows.map((row, index) => ({
      rank: index + 1,
      telegramId: row.telegram_id,
      displayName: row.display_name,
      username: row.username,
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
              updated_at = ?
          WHERE id = ?
          RETURNING *
        `,
        )
        .get(input.points, input.points, now, input.userId) as UserRow;

      return {
        score: mapScore(scoreRow),
        user: mapUser(updated),
        pointsAwarded: input.points,
      };
    });

    return tx();
  }

  close(): void {
    this.db.close();
  }
}

export function createUserRepository(databasePath: string): UserRepository {
  return new UserRepository(databasePath);
}
