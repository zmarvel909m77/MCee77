export type DatabaseDriverKind = "sqlite" | "postgres";

/**
 * Minimal SQL facade shared by SQLite (better-sqlite3) and Postgres (pg).
 * Callers use `?` placeholders; the Postgres driver rewrites them to `$1…$n`.
 */
export interface SqlDriver {
  readonly kind: DatabaseDriverKind;
  exec(sql: string): Promise<void>;
  get<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined>;
  all<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Rewrite `?` placeholders to Postgres `$1…$n` (no `?` inside string literals in our SQL). */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
