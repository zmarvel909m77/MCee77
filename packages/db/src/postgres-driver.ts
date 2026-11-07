import pg from "pg";
import { toPgPlaceholders, type SqlDriver } from "./driver.js";

const { Pool } = pg;

function normalizeRow<T>(row: Record<string, unknown> | undefined): T | undefined {
  if (!row) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // pg returns BIGINT as string; telegram_id / counters should be numbers in app code.
    if (typeof value === "string" && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
      // Only coerce columns that look like integer counters / ids we store as numbers.
      // UUIDs are hex+dashes and won't match; ISO timestamps contain non-digits.
      if (
        key === "telegram_id" ||
        key.endsWith("_points") ||
        key === "rating" ||
        key === "games_played" ||
        key === "points" ||
        key === "score_a" ||
        key === "score_b" ||
        key === "n"
      ) {
        out[key] = Number(value);
        continue;
      }
    }
    out[key] = value;
  }
  return out as T;
}

export class PostgresDriver implements SqlDriver {
  readonly kind = "postgres" as const;
  private readonly pool: pg.Pool;
  private txClient: pg.PoolClient | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      // Railway Postgres often needs SSL; pg enables it when sslmode is in URL.
      max: 10,
    });
  }

  private async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    const text = toPgPlaceholders(sql);
    if (this.txClient) {
      return this.txClient.query<T>(text, params);
    }
    return this.pool.query<T>(text, params);
  }

  async exec(sql: string): Promise<void> {
    await this.query(sql);
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const result = await this.query(sql, params);
    return normalizeRow<T>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.query(sql, params);
    return result.rows.map(
      (row) => normalizeRow<T>(row as Record<string, unknown>)!,
    );
  }

  async run(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ changes: number }> {
    const result = await this.query(sql, params);
    return { changes: result.rowCount ?? 0 };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txClient) {
      // Nested: reuse existing client (SQLite also nests poorly; keep simple).
      return fn();
    }
    const client = await this.pool.connect();
    this.txClient = client;
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      this.txClient = null;
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
