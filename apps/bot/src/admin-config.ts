/** Parse `ADMIN_TELEGRAM_IDS` — comma/space/semicolon separated numeric ids. */
export function parseAdminTelegramIds(
  raw: string | undefined | null,
): Set<number> {
  const ids = new Set<number>();
  if (!raw?.trim()) return ids;
  for (const part of raw.split(/[,;\s]+/)) {
    const n = Number(part.trim());
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }
  return ids;
}

export function isAdminTelegramId(
  adminIds: Set<number>,
  telegramId: number | undefined | null,
): boolean {
  if (!telegramId || adminIds.size === 0) return false;
  return adminIds.has(telegramId);
}
