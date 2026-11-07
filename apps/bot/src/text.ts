import type { LeaderboardEntry, User } from "@mcee77/shared";

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
      "O‘yinlar tez orada — birinchi bo‘ling!",
    ].join("\n");
  }

  const lines = entries.map((e) => {
    const name = e.username ? `@${e.username}` : e.displayName;
    return `${e.rank}. ${name} — ${e.totalPoints} ball`;
  });

  return ["🏆 Reyting (top)", "", ...lines].join("\n");
}

export const rocketBirdSoon = [
  "🚀 Rocket Bird",
  "",
  "O‘yin tez orada ochiladi!",
  "Mini App tayyorlanganda shu yerda deep-link paydo bo‘ladi.",
].join("\n");

export const airHockeySoon = [
  "🏒 Air Hockey",
  "",
  "O‘yin tez orada ochiladi!",
  "Offline va online rejimlar keyingi bosqichda.",
].join("\n");
