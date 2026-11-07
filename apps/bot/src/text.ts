import type { LeaderboardEntry, User } from "@mcee77/shared";
import { publicDisplayName } from "@mcee77/shared";

/** /start welcome — Uzbek Latin, AIR HOCKEY brand first. */
export function welcomeMessage(displayName: string): string {
  return [
    `Assalomu alaykum, ${displayName}!`,
    "",
    "AIR HOCKEY ga xush kelibsiz.",
    "",
    "Do‘stlaringiz bilan stol ustida uchuvchi shaybani haydab o‘ynang, reytingingizni yuksaltiring yoki onlayn jangda kuchingizni sinang.",
    "",
    "O‘yinni boshlash uchun pastdagi tugmani bosing.",
  ].join("\n");
}

/** Do‘kon — resources not ready yet (literary, polite). */
export function shopUnavailableMessage(): string {
  return [
    "Do‘kon",
    "",
    "Hozircha do‘kon javonlari bo‘sh — omborimiz yangi resurslar bilan to‘ldirilmoqda.",
    "",
    "Tez orada bu yerda sovg‘alar va imkoniyatlar paydo bo‘ladi. Sabr-toqatingiz uchun rahmat.",
  ].join("\n");
}

export function profileMessage(user: User): string {
  const handle = user.username ? `@${user.username}` : "—";
  return [
    "👤 Profil",
    "",
    `Ism: ${publicDisplayName(user)}`,
    `Username: ${handle}`,
    `O‘yin: Air Hockey`,
    `Ball: ${user.totalPoints}`,
    `Reyting: ${user.rating}`,
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
      "Hali hech kim ball yig‘magan.",
      "Online Air Hockey o‘ynab birinchi bo‘ling!",
      "",
      "Reyting Mini App ichida ochiladi.",
    ].join("\n");
  }

  const lines = entries.map((e) => {
    const name = e.username ? `@${e.username}` : e.displayName;
    return `${e.rank}. ${name} — ${e.totalPoints} ball · ${e.rating}`;
  });

  return [
    "🏆 Reyting (top)",
    "",
    ...lines,
    "",
    "To‘liq reyting Mini App ichida.",
  ].join("\n");
}

export function miniAppOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "🏒 AIR HOCKEY",
      "",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      "Profil · O‘yin · Reyting — barchasi ichida.",
    ].join("\n");
  }
  return [
    "🏒 AIR HOCKEY",
    "",
    "WEBAPP_URL sozlanmagan.",
    "Serverda HTTPS Mini App URL ni `.env` ga qo‘ying.",
  ].join("\n");
}

export function airHockeyOpenMessage(hasWebApp: boolean): string {
  return miniAppOpenMessage(hasWebApp);
}
