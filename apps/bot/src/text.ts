import type { LeaderboardEntry, User } from "@mcee77/shared";
import { publicDisplayName } from "@mcee77/shared";

/**
 * /start welcome — short Uzbek Latin (shared by /start + reset_start broadcast).
 */
export function welcomeMessage(_displayName: string): string {
  return [
    "MCee Game",
    "",

      "MINI APPNI OCHISH UCHUN TUGMANI BOSING:",
  ].join("\n");
}

/** Do‘kon — resources not ready yet (literary, polite). */
export function shopUnavailableMessage(): string {
  return [
    "SHOP:",
    "",
    "Ho'zircha resurslar yo'q",
  ].join("\n");
}

export function profileMessage(user: User): string {
  return [
    "👤 Profil",
    "",
    `Taxallus: ${publicDisplayName(user)}`,
    `O‘yin: Kido Chop`,
    `Eng yaxshi ball: ${user.totalPoints}`,
    `O‘yinlar: ${user.gamesPlayed}`,
    "",
    "Profil Mini App ichida ochiladi.",
  ].join("\n");
}

function ratingPosition(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}

function ratingPlayerName(displayName: string, username: string | null): string {
  return username ? `${displayName} (@${username})` : displayName;
}

export function ratingMenuMessage(): string {
  return ["🏆 RATING", "", "Qaysi o‘yin reytingini ko‘rmoqchisiz?"].join("\n");
}

export function kidoLeaderboardMessage(entries: LeaderboardEntry[]): string {
  if (!entries.length) return "🏆 KIDO CHOP TOP 7\n\nHozircha natijalar yo‘q.";
  return [
    "🏆 KIDO CHOP TOP 7",
    "",
    ...entries.slice(0, 7).map((entry) =>
      `${ratingPosition(entry.rank)} ${ratingPlayerName(entry.displayName, entry.username)} — ${entry.totalPoints} ball`
    ),
  ].join("\n");
}

export function game2048LeaderboardMessage(
  entries: Array<{ rank: number; displayName: string; username: string | null; bestScore: number }>,
): string {
  if (!entries.length) return "🏆 2048 GAME TOP 7\n\nHozircha natijalar yo‘q.";
  return [
    "🏆 2048 GAME TOP 7",
    "",
    ...entries.slice(0, 7).map((entry) =>
      `${ratingPosition(entry.rank)} ${ratingPlayerName(entry.displayName, entry.username)} — ${entry.bestScore} ball`
    ),
  ].join("\n");
}

/** Backward-compatible alias for the admin bot's existing Kido Chop output. */
export function leaderboardMessage(entries: LeaderboardEntry[]): string {
  return kidoLeaderboardMessage(entries);
}

export function miniAppOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "MCee Game",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      " SHOP · GAMES · RANKING",
    ].join("\n");
  }
  return [
    "MCee Game",
    "",
    "WEBAPP_URL sozlanmagan.",
    "Serverda HTTPS Mini App URL ni `.env` ga qo‘ying.",
  ].join("\n");
}

export function airHockeyOpenMessage(hasWebApp: boolean): string {
  return miniAppOpenMessage(hasWebApp);
}
