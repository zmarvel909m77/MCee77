/** Shared domain types for GAME BOT (Postgres-ready shape). */

export type GameId = "rocket_bird" | "air_hockey";

export type GameMode = "solo" | "offline" | "online";

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  displayName: string;
  totalPoints: number;
  rating: number;
  gamesPlayed: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  telegramId: number;
  displayName: string;
  username: string | null;
  totalPoints: number;
  rating: number;
}

export interface UpsertUserInput {
  telegramId: number;
  username?: string | null;
  displayName: string;
}

export interface ScoreRecord {
  id: string;
  userId: string;
  game: GameId;
  mode: GameMode;
  points: number;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface SubmitScoreInput {
  userId: string;
  game: GameId;
  mode: GameMode;
  points: number;
  meta?: Record<string, unknown> | null;
}

export interface SubmitScoreResult {
  score: ScoreRecord;
  user: User;
  pointsAwarded: number;
}

/** Max accepted session score (anti-cheat cap for MVP). */
export const MAX_ROCKET_BIRD_SCORE = 500;

/** Points added to total_points equal session score; rating += same for MVP. */
export function clampRocketBirdScore(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_ROCKET_BIRD_SCORE);
}

export const DEFAULT_RATING = 1000;
export const DEFAULT_TOTAL_POINTS = 0;

export {
  displayNameFromTelegramUser,
  verifyTelegramInitData,
  type TelegramWebAppUser,
  type VerifiedInitData,
} from "./init-data.js";
