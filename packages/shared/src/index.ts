/** Shared domain types for GAME BOT (Postgres-ready shape). */

export type GameId = "rocket_bird" | "air_hockey";

export type GameMode = "solo" | "offline" | "online";

export type MatchStatus = "queued" | "active" | "finished" | "aborted";

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  /** Telegram-derived name (first/last); may be overridden in UI by nickname. */
  displayName: string;
  /** Editable Mini App nickname; when set, preferred over displayName. */
  nickname: string | null;
  /** Public path or URL for profile photo (e.g. /avatars/<id>.jpg). */
  avatarUrl: string | null;
  totalPoints: number;
  rating: number;
  gamesPlayed: number;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of last /start, score, or WS join (best-effort activity). */
  lastSeenAt: string | null;
}

/** Prefer editable nickname when present. */
export function publicDisplayName(user: Pick<User, "nickname" | "displayName">): string {
  const nick = user.nickname?.trim();
  return nick || user.displayName;
}

export interface AdminStats {
  totalUsers: number;
  activeToday: number;
  active24h: number;
  gamesToday: number;
  airHockey: {
    activeRooms: number;
    approxPlayers: number;
    queueDepth: number;
  };
  topRating: LeaderboardEntry[];
  generatedAt: string;
}

/** Bot main-menu / command feature toggles (admin-controlled). */
export type FeatureFlagKey = "air_hockey" | "rating" | "profile" | "mini_app";

export interface FeatureFlags {
  air_hockey: boolean;
  rating: boolean;
  profile: boolean;
  mini_app: boolean;
}

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  "air_hockey",
  "rating",
  "profile",
  "mini_app",
] as const;

/** Defaults: every section ON. */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  air_hockey: true,
  rating: true,
  profile: true,
  mini_app: true,
};

export const FEATURE_FLAG_LABELS: Record<FeatureFlagKey, string> = {
  air_hockey: "Air Hockey",
  rating: "Reyting",
  profile: "Profil",
  mini_app: "Mini App",
};

export interface LeaderboardEntry {
  rank: number;
  telegramId: number;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  rating: number;
}

export interface OnlineUser {
  telegramId: number;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
}

export interface UpdateProfileInput {
  userId: string;
  nickname?: string;
  avatarUrl?: string | null;
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

export interface MatchRecord {
  id: string;
  game: GameId;
  mode: Exclude<GameMode, "solo">;
  status: MatchStatus;
  playerAId: string;
  playerBId: string | null;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  roomId: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface CreateMatchInput {
  mode: Exclude<GameMode, "solo">;
  playerAId: string;
  playerBId?: string | null;
  roomId?: string | null;
  status?: MatchStatus;
}

export interface FinishMatchInput {
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  status?: Extract<MatchStatus, "finished" | "aborted">;
  /** Points awarded to player A / B (rating + total_points). */
  pointsA: number;
  pointsB: number;
}

export interface FinishMatchResult {
  match: MatchRecord;
  playerA: User;
  playerB: User | null;
}

/** Max accepted session score (anti-cheat cap for MVP). */
export const MAX_ROCKET_BIRD_SCORE = 500;

/**
 * Offline never awards rating/points (product rule).
 * Cap kept at 0 so legacy client submits are clamped to zero.
 */
export const MAX_AIR_HOCKEY_OFFLINE_POINTS = 0;

/** Online match point deltas (server-authoritative). */
export const AIR_HOCKEY_ONLINE_WIN_POINTS = 25;
export const AIR_HOCKEY_ONLINE_LOSS_POINTS = 8;
export const AIR_HOCKEY_ONLINE_ABORT_POINTS = 0;

/** Offline: no points (win or lose). */
export const AIR_HOCKEY_OFFLINE_WIN_POINTS = 0;
export const AIR_HOCKEY_OFFLINE_LOSS_POINTS = 0;

/** Avatar upload hard limit (bytes) after decode. */
export const MAX_AVATAR_BYTES = 512 * 1024;

export const AIR_HOCKEY_WIN_SCORE = 5;

/** Points added to total_points equal session score; rating += same for MVP. */
export function clampRocketBirdScore(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_ROCKET_BIRD_SCORE);
}

export function clampAirHockeyOfflinePoints(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_AIR_HOCKEY_OFFLINE_POINTS);
}

export const DEFAULT_RATING = 1000;
export const DEFAULT_TOTAL_POINTS = 0;

export {
  displayNameFromTelegramUser,
  verifyTelegramInitData,
  type TelegramWebAppUser,
  type VerifiedInitData,
} from "./init-data.js";
