/** Shared domain types for GAME BOT (Postgres-ready shape). */

export type GameId = "karate" | "rocket_bird";

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
  /**
   * City Strike high score (best run). Never decreases when a lower run is submitted.
   * Stored under legacy game id `karate` in the DB.
   */
  totalPoints: number;
  /** Mirror of best score for display / legacy leaderboard sorting. */
  rating: number;
  gamesPlayed: number;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of last /start, score, or Mini App open (best-effort activity). */
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
  /** Players with a City Strike best score &gt; 0. */
  karatePlayers: number;
  /** Highest stored City Strike best score. */
  topKarateScore: number;
  topRating: LeaderboardEntry[];
  generatedAt: string;
}

/** Bot main-menu / command feature toggles (admin-controlled). */
export type FeatureFlagKey = "karate" | "rating" | "profile" | "mini_app";

export interface FeatureFlags {
  karate: boolean;
  rating: boolean;
  profile: boolean;
  mini_app: boolean;
}

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  "karate",
  "rating",
  "profile",
  "mini_app",
] as const;

/** Defaults: every section ON. */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  karate: true,
  rating: true,
  profile: true,
  mini_app: true,
};

export const FEATURE_FLAG_LABELS: Record<FeatureFlagKey, string> = {
  karate: "City Strike",
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
  /** City Strike best score. */
  totalPoints: number;
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
  /** Points applied to the stored best (0 if run ≤ previous best). */
  pointsAwarded: number;
  /** True when this run set a new personal best. */
  isNewBest: boolean;
  previousBest: number;
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
  pointsA: number;
  pointsB: number;
}

export interface FinishMatchResult {
  match: MatchRecord;
  playerA: User;
  playerB: User | null;
}

/** Anti-cheat cap for a single City Strike run. */
export const MAX_KARATE_SCORE = 10_000;

/** Max accepted session score (legacy Rocket Bird). */
export const MAX_ROCKET_BIRD_SCORE = 500;

/** Avatar upload hard limit (bytes) after decode. */
export const MAX_AVATAR_BYTES = 512 * 1024;

/** Points added to total_points equal session score; rating += same for MVP. */
export function clampRocketBirdScore(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_ROCKET_BIRD_SCORE);
}

export function clampKarateScore(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_KARATE_SCORE);
}

export const DEFAULT_RATING = 0;
export const DEFAULT_TOTAL_POINTS = 0;

export {
  displayNameFromTelegramUser,
  verifyTelegramInitData,
  type TelegramWebAppUser,
  type VerifiedInitData,
} from "./init-data.js";
