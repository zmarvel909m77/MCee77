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

export const DEFAULT_RATING = 1000;
export const DEFAULT_TOTAL_POINTS = 0;
