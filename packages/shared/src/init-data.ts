import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface VerifiedInitData {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  raw: Record<string, string>;
}

/**
 * Verify Telegram WebApp `initData` (HMAC-SHA256).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options?: { maxAgeSeconds?: number },
): VerifiedInitData {
  if (!initData?.trim()) {
    throw new Error("initData is empty");
  }
  if (!botToken?.trim()) {
    throw new Error("bot token is required for initData verification");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("initData missing hash");
  }

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("initData signature invalid");
  }

  const authDateRaw = params.get("auth_date");
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new Error("initData missing auth_date");
  }

  const maxAge = options?.maxAgeSeconds ?? 86_400;
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > maxAge) {
    throw new Error("initData expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new Error("initData missing user");
  }

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new Error("initData user is not valid JSON");
  }

  if (!user?.id || !Number.isFinite(user.id)) {
    throw new Error("initData user.id invalid");
  }

  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    raw[key] = value;
  }

  return {
    user,
    authDate,
    queryId: params.get("query_id") ?? undefined,
    raw,
  };
}

export function displayNameFromTelegramUser(user: TelegramWebAppUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return full || user.username || "O‘yinchi";
}
