import type { LeaderboardEntry, User } from "@mcee77/shared";
import { publicDisplayName } from "@mcee77/shared";

/**
 * /start welcome — short Uzbek Latin (shared by /start + reset_start broadcast).
 */
export function welcomeMessage(_displayName: string): string {
  return [
    "🏙️ GAME BOT ga xush kelibsiz!",
    "",
    "City Strike o‘ynang, rekordingizni yangilang va reytingda yuqoriga chiqing.",
    "",
    "👇 Mini Appni ochish uchun tugmani bosing:",
  ].join("\n");
}

/** Do‘kon — resources not ready yet (literary, polite). */
export function shopUnavailableMessage(): string {
  return [
    "Magazin",
    "",
    "Hozircha resurslar yo‘q — omborimiz yangi imkoniyatlar bilan to‘ldirilmoqda.",
    "",
    "Tez orada bu yerda sovg‘alar paydo bo‘ladi. Sabr-toqatingiz uchun rahmat.",
  ].join("\n");
}

export function profileMessage(user: User): string {
  return [
    "👤 Profil",
    "",
    `Taxallus: ${publicDisplayName(user)}`,
    `O‘yin: City Strike`,
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
      "",
      "Hali hech kim rekord qo‘ymagan.",
      "City Strike o‘ynab birinchi bo‘ling!",
      "",
      "Reyting Mini App ichida ochiladi.",
    ].join("\n");
  }

  const lines = entries.map((e) => {
    return `${e.rank}. ${e.displayName} — ${e.totalPoints} ball`;
  });

  return [
    "🏆 Reyting (City Strike)",
    "",
    ...lines,
    "",
    "To‘liq reyting Mini App ichida.",
  ].join("\n");
}

export function miniAppOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "🏙️ GAME BOT",
      "",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      "Magazin · O‘yinlar · Reyting",
    ].join("\n");
  }
  return [
    "🏙️ GAME BOT",
    "",
    "WEBAPP_URL sozlanmagan.",
    "Serverda HTTPS Mini App URL ni `.env` ga qo‘ying.",
  ].join("\n");
}

export function airHockeyOpenMessage(hasWebApp: boolean): string {
  return miniAppOpenMessage(hasWebApp);
}
