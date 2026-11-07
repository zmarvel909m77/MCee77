import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const ADMIN_COOKIE = "gb_admin";

/** Empty / missing ADMIN_SECRET → admin routes disabled. */
export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET?.trim() ?? "";
}

export function adminConfigured(): boolean {
  return getAdminSecret().length > 0;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Accept secret from `x-admin-secret` header, `?key=` query, or admin cookie.
 */
export function extractAdminSecret(request: FastifyRequest): string | null {
  const header = request.headers["x-admin-secret"];
  if (typeof header === "string" && header.trim()) return header.trim();

  const query = request.query as { key?: string };
  if (typeof query.key === "string" && query.key.trim()) return query.key.trim();

  const cookies = parseCookies(request.headers.cookie);
  const fromCookie = cookies[ADMIN_COOKIE];
  if (fromCookie?.trim()) return fromCookie.trim();

  return null;
}

export function isValidAdminSecret(candidate: string | null): boolean {
  const expected = getAdminSecret();
  if (!expected || !candidate) return false;
  return safeEqual(candidate, expected);
}

/**
 * Gate for admin HTML + JSON.
 * - ADMIN_SECRET unset → 404 (hide surface in prod / anywhere)
 * - wrong / missing key → 403
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!adminConfigured()) {
    void reply.code(404).send({ error: "not found" });
    return false;
  }
  if (!isValidAdminSecret(extractAdminSecret(request))) {
    void reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

export function adminCookieHeader(secret: string, secure: boolean): string {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(secret)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    // Session cookie — cleared when browser closes
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
