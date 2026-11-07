import type { FeatureFlagKey, LeaderboardEntry, User } from "@mcee77/shared";
import { FEATURE_FLAG_LABELS } from "@mcee77/shared";

export function welcomeMessage(displayName: string): string {
  return [
    `Salom, ${displayName}! 👋`,
    "",
    "GAME BOT ga xush kelibsiz.",
    "O‘yin o‘ynang, ball to‘plang, reytingda ko‘tariling.",
    "",
    "Pastdagi tugmalardan birini tanlang.",
  ].join("\n");
}

/** Brief notice when a menu section is admin-disabled (Uzbek Latin). */
export function sectionDisabledMessage(key: FeatureFlagKey): string {
  const label = FEATURE_FLAG_LABELS[key];
  return [
    `${label}`,
    "",
    "Bu bo‘lim hozircha vaqtincha o‘chirilgan.",
    "Keyinroq qayta urinib ko‘ring.",
  ].join("\n");
}

export function profileMessage(user: User): string {
  const handle = user.username ? `@${user.username}` : "—";
  return [
    "👤 Profil",
    "",
    `Ism: ${user.displayName}`,
    `Username: ${handle}`,
    `Ball: ${user.totalPoints}`,
    `Reyting: ${user.rating}`,
    `O‘yinlar: ${user.gamesPlayed}`,
  ].join("\n");
}

export function leaderboardMessage(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return [
      "🏆 Reyting",
      "",
      "Hali hech kim ball yig‘magan.",
      "Rocket Bird yoki Air Hockey o‘ynab birinchi bo‘ling!",
    ].join("\n");
  }

  const lines = entries.map((e) => {
    const name = e.username ? `@${e.username}` : e.displayName;
    return `${e.rank}. ${name} — ${e.totalPoints} ball`;
  });

  return ["🏆 Reyting (top)", "", ...lines].join("\n");
}

export function rocketBirdOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "🚀 Rocket Bird",
      "",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      "Tegin — raketa uchadi, quvurlardan o‘ting, ball yig‘ing!",
    ].join("\n");
  }
  return [
    "🚀 Rocket Bird",
    "",
    "WEBAPP_URL sozlanmagan.",
    "Serverda HTTPS Mini App URL ni `.env` ga qo‘ying (masalan tunnel).",
    "Lokal: API ni ishga tushirib `/rocket-bird/` ni brauzerda oching.",
  ].join("\n");
}

export function airHockeyOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "🏒 Air Hockey",
      "",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      "Offline (AI / 2 o‘yinchi) yoki Online random matchmaking.",
    ].join("\n");
  }
  return [
    "🏒 Air Hockey",
    "",
    "WEBAPP_URL sozlanmagan.",
    "Serverda HTTPS Mini App URL ni `.env` ga qo‘ying (masalan tunnel).",
    "Lokal: API ni ishga tushirib `/air-hockey/` ni brauzerda oching.",
  ].join("\n");
}
