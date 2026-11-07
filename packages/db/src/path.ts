import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { DatabaseDriverKind } from "./driver.js";

/** Canonical SQLite path inside Docker / Railway (volume mount point). */
export const PROD_DATABASE_PATH = "/data/gamebot.sqlite";

/** Expected Railway Volume mount directory (parent of the SQLite file). */
export const PROD_DATA_DIR = "/data";

export interface ResolveDatabasePathOptions {
  /**
   * Explicit `DATABASE_PATH` (env). Empty/whitespace → ignored.
   */
  envPath?: string | null;
  /**
   * Fallback when not in production-like host.
   * Default: `<cwd>/../../data/gamebot.sqlite` (monorepo apps/* cwd).
   */
  localFallback?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DatabasePersistenceInfo {
  /** Absolute resolved SQLite path (null when using Postgres). */
  absolutePath: string | null;
  /** Parent directory of the SQLite file (null when using Postgres). */
  dataDir: string | null;
  /** True when running on Railway (any RAILWAY_* marker). */
  onRailway: boolean;
  /**
   * Railway-injected mount path (`RAILWAY_VOLUME_MOUNT_PATH`), or null
   * when no volume is attached.
   */
  volumeMountPath: string | null;
  /** Volume name from `RAILWAY_VOLUME_NAME`, if any. */
  volumeName: string | null;
  /**
   * True when data survives redeploys: Postgres via DATABASE_URL, or
   * SQLite under a mounted Railway Volume.
   */
  persistent: boolean;
  /** Human-readable warning when data will not survive redeploys. */
  warning: string | null;
  /** Active driver. */
  driver: DatabaseDriverKind;
  /**
   * True when DATABASE_URL is set (Postgres preferred).
   * URL itself is never exposed (secrets).
   */
  hasDatabaseUrl: boolean;
}

export interface ResolveDatabaseConfigOptions {
  env?: NodeJS.ProcessEnv;
  envPath?: string | null;
  databaseUrl?: string | null;
  localFallback?: string;
}

export interface DatabaseConfig {
  driver: DatabaseDriverKind;
  /** Postgres connection string when driver=postgres (do not log). */
  databaseUrl: string | null;
  /** SQLite file path when driver=sqlite. */
  databasePath: string | null;
  persistence: DatabasePersistenceInfo;
}

function looksProductionLike(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_ID) return true;
  if (env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID) return true;
  try {
    if (existsSync("/.dockerenv")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Resolve the SQLite file path used when DATABASE_URL is unset.
 * Production / Railway / Docker default to `/data/gamebot.sqlite`.
 */
export function resolveDatabasePath(
  options: ResolveDatabasePathOptions = {},
): string {
  const env = options.env ?? process.env;
  const fromEnv = options.envPath?.trim() || env.DATABASE_PATH?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }

  if (looksProductionLike(env)) {
    return PROD_DATABASE_PATH;
  }

  return (
    options.localFallback ??
    resolve(process.cwd(), "../../data/gamebot.sqlite")
  );
}

/**
 * Prefer `DATABASE_URL` (Postgres). Fall back to SQLite via DATABASE_PATH.
 */
export function resolveDatabaseConfig(
  options: ResolveDatabaseConfigOptions = {},
): DatabaseConfig {
  const env = options.env ?? process.env;
  const databaseUrl =
    options.databaseUrl?.trim() || env.DATABASE_URL?.trim() || null;

  if (databaseUrl) {
    const persistence = inspectDatabasePersistence(null, env, {
      driver: "postgres",
      hasDatabaseUrl: true,
    });
    return {
      driver: "postgres",
      databaseUrl,
      databasePath: null,
      persistence,
    };
  }

  const databasePath = resolveDatabasePath({
    env,
    envPath: options.envPath,
    localFallback: options.localFallback,
  });
  const persistence = inspectDatabasePersistence(databasePath, env, {
    driver: "sqlite",
    hasDatabaseUrl: false,
  });
  return {
    driver: "sqlite",
    databaseUrl: null,
    databasePath,
    persistence,
  };
}

/**
 * Diagnose whether the resolved DB will survive Railway redeploys.
 * No secrets — only driver, paths, and Railway volume env markers.
 */
export function inspectDatabasePersistence(
  databasePath: string | null,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { driver?: DatabaseDriverKind; hasDatabaseUrl?: boolean },
): DatabasePersistenceInfo {
  const hasDatabaseUrl =
    opts?.hasDatabaseUrl ?? Boolean(env.DATABASE_URL?.trim());
  const driver: DatabaseDriverKind =
    opts?.driver ?? (hasDatabaseUrl ? "postgres" : "sqlite");

  const onRailway = Boolean(
    env.RAILWAY_ENVIRONMENT ||
      env.RAILWAY_ENVIRONMENT_ID ||
      env.RAILWAY_PROJECT_ID ||
      env.RAILWAY_SERVICE_ID,
  );
  const volumeMountPath = env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || null;
  const volumeName = env.RAILWAY_VOLUME_NAME?.trim() || null;

  if (driver === "postgres") {
    return {
      absolutePath: null,
      dataDir: null,
      onRailway,
      volumeMountPath,
      volumeName,
      persistent: true,
      warning: null,
      driver,
      hasDatabaseUrl: true,
    };
  }

  const absolutePath = databasePath
    ? isAbsolute(databasePath)
      ? databasePath
      : resolve(databasePath)
    : PROD_DATABASE_PATH;
  const dataDir = dirname(absolutePath);

  let persistent = !onRailway;
  let warning: string | null = null;

  if (onRailway) {
    if (!volumeMountPath) {
      persistent = false;
      warning =
        "SQLite on Railway without a Volume is wiped every deploy. " +
        "Prefer Railway PostgreSQL (DATABASE_URL). " +
        `Or attach a Volume at /data (code default ${PROD_DATABASE_PATH}).`;
    } else {
      const mount = volumeMountPath.replace(/\/$/, "") || "/";
      const underMount =
        dataDir === mount ||
        dataDir.startsWith(mount.endsWith("/") ? mount : `${mount}/`);
      if (!underMount) {
        persistent = false;
        warning =
          `Railway Volume is mounted at ${volumeMountPath} but DATABASE_PATH ` +
          `is ${absolutePath} — remount the Volume at ${PROD_DATA_DIR} ` +
          `(or set DATABASE_PATH under the mount), or switch to PostgreSQL.`;
      } else {
        persistent = true;
      }
    }
  } else if (looksProductionLike(env) && dataDir === PROD_DATA_DIR) {
    warning =
      `Using ${absolutePath}; ensure the host mounts a persistent volume at ${PROD_DATA_DIR}, ` +
      `or set DATABASE_URL for PostgreSQL.`;
  }

  return {
    absolutePath,
    dataDir,
    onRailway,
    volumeMountPath,
    volumeName,
    persistent,
    warning,
    driver,
    hasDatabaseUrl: false,
  };
}

/**
 * Default avatar directory. With SQLite: sibling of the DB file.
 * With Postgres: `/data/avatars` in prod-like hosts, else local `data/avatars`.
 * Avatars are still ephemeral on Railway Trial without a Volume — users/ratings
 * live in Postgres.
 */
export function resolveAvatarDir(
  config: DatabaseConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.AVATAR_DIR?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  }
  if (config.driver === "sqlite" && config.databasePath) {
    return resolve(dirname(config.databasePath), "avatars");
  }
  if (looksProductionLike(env)) {
    return resolve(PROD_DATA_DIR, "avatars");
  }
  return resolve(process.cwd(), "../../data/avatars");
}
