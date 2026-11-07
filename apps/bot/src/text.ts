import type { FeatureFlagKey, LeaderboardEntry, User } from "@mcee77/shared";
import { FEATURE_FLAG_LABELS, publicDisplayName } from "@mcee77/shared";

export function welcomeMessage(displayName: string): string {
  return [
    `Salom, ${displayName}! 👋`,
    "",
    "GAME BOT ga xush kelibsiz.",
    "Air Hockey o‘ynang, online o‘yinlarda ball to‘plang, reytingda ko‘tariling.",
    "",
    "Pastdagi OCHISH / O‘ynash tugmasi orqali Mini App ni oching.",
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
    `Ism: ${publicDisplayName(user)}`,
    `Username: ${handle}`,
    `O‘yin: Air Hockey`,
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
      "Online Air Hockey o‘ynab birinchi bo‘ling!",
    ].join("\n");
  }

  const lines = entries.map((e) => {
    const name = e.username ? `@${e.username}` : e.displayName;
    return `${e.rank}. ${name} — ${e.totalPoints} ball · ${e.rating}`;
  });

  return ["🏆 Reyting (top)", "", ...lines].join("\n");
}

export function miniAppOpenMessage(hasWebApp: boolean): string {
  if (hasWebApp) {
    return [
      "🏒 GAME BOT — Air Hockey",
      "",
      "Mini App ochish uchun pastdagi tugmani bosing.",
      "Profil · O‘yin · Reyting — barchasi ichida.",
      "",
      "Online g‘alaba/mag‘lubiyat ball beradi.",
      "Offline o‘yin ball bermaydi.",
    ].join("\n");
  }
  return [
    "🏒 GAME BOT",
    "",
    "WEBAPP_URL sozlanmagan.",
    "Serverda HTTPS Mini App URL ni `.env` ga qo‘ying.",
    "Lokal: API ni ishga tushirib `/app/` ni brauzerda oching.",
  ].join("\n");
}

export function airHockeyOpenMessage(hasWebApp: boolean): string {
  return miniAppOpenMessage(hasWebApp);
}
