import type { LeaderboardEntry, User } from "@mcee77/shared";
import { publicDisplayName } from "@mcee77/shared";

/**
 * /start welcome — short Uzbek Latin (shared by /start + reset_start broadcast).
 */
export function welcomeMessage(_displayName: string): string {
  return [
    "MCee Game",
    "",

    "  Mini Appni ochish uchun tugmani bosing:",
  ].join("\n");
}

/** Do‘kon — resources not ready yet (literary, polite). */
export function shopUnavailableMessage(): string {
  return [
    "Magazin",
    "",
    "Hozircha resurslar yo‘q",
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

export function leaderboardMessage(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return [
      "🏆 Reyting",
    
    ].join("\n");
  }

  const lines = entries.map((e) => {
    return `${e.rank}. ${e.displayName} — ${e.totalPoints} ball`;
  });

  return [
    "🏆 Reyting (Kido Chop)",
    "",
    ...lines,
  ].join("\n");
}

export function miniAppOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "MCee Game",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      "Magazin · O‘yinlar · Reyting",
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
