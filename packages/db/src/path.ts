import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

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
  /** Absolute resolved SQLite path. */
  absolutePath: string;
  /** Parent directory of the SQLite file. */
  dataDir: string;
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
   * True when the SQLite parent dir is under the mounted volume
   * (or equal to it). False when on Railway with no/mismatched volume.
   */
  persistent: boolean;
  /** Human-readable warning when data will not survive redeploys. */
  warning: string | null;
}

function looksProductionLike(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_ID) return true;
  if (env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID) return true;
  // Docker runtime image sets this via Dockerfile; also detect /.dockerenv.
  try {
    if (existsSync("/.dockerenv")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Resolve the SQLite file path used by API + bot (+ admin bot).
 * Production / Railway / Docker default to `/data/gamebot.sqlite` so a
 * single Volume mount at `/data` persists users across deploys.
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
 * Diagnose whether the resolved DB path will survive Railway redeploys.
 * No secrets — only paths and Railway volume env markers.
 */
export function inspectDatabasePersistence(
  databasePath: string,
  env: NodeJS.ProcessEnv = process.env,
): DatabasePersistenceInfo {
  const absolutePath = isAbsolute(databasePath)
    ? databasePath
    : resolve(databasePath);
  const dataDir = dirname(absolutePath);
  const onRailway = Boolean(
    env.RAILWAY_ENVIRONMENT ||
      env.RAILWAY_ENVIRONMENT_ID ||
      env.RAILWAY_PROJECT_ID ||
      env.RAILWAY_SERVICE_ID,
  );
  const volumeMountPath = env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || null;
  const volumeName = env.RAILWAY_VOLUME_NAME?.trim() || null;

  let persistent = !onRailway;
  let warning: string | null = null;

  if (onRailway) {
    if (!volumeMountPath) {
      persistent = false;
      warning =
        "Railway Volume missing: attach a Volume with mount path /data " +
        `(code uses ${PROD_DATABASE_PATH}). Without it, SQLite is wiped on every deploy.`;
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
          `(or set DATABASE_PATH under the mount).`;
      } else {
        persistent = true;
      }
    }
  } else if (looksProductionLike(env) && dataDir === PROD_DATA_DIR) {
    // Docker without Railway volume markers — still ephemeral unless host-mounted.
    warning =
      `Using ${absolutePath}; ensure the host mounts a persistent volume at ${PROD_DATA_DIR}.`;
  }

  return {
    absolutePath,
    dataDir,
    onRailway,
    volumeMountPath,
    volumeName,
    persistent,
    warning,
  };
}
